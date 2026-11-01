import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { expect, test } from "@playwright/test";

let server: Server;
let origin: string;
const html = `<!doctype html><html><head><style>
  body { margin: 24px; font: 16px sans-serif; min-height: 1800px; }
  button { background: rgb(12, 34, 56); color: white; padding: 13px; }
  .card { margin-top: 30px; width: 300px; padding: 16px; border: 1px solid; }
</style><script defer src="/inspector.js"></script></head><body>
  <h1>Inspector fixture</h1><button id="first" class="primary padded">First</button>
  <button id="second">Second</button><p id="count">0</p>
  <section class="card"><span id="special:id">Escaped id</span><ul><li id="duplicate">One</li><li id="duplicate">Two</li></ul></section>
  <script>document.querySelectorAll('button').forEach(button => button.addEventListener('click', () => {
    const count = document.querySelector('#count'); count.textContent = String(Number(count.textContent) + 1);
  })); document.addEventListener('click', event => { if (event.target.closest('#first,#second')) document.body.dataset.appBubble = 'received'; });
  </script></body></html>`;

test.beforeAll(async () => {
  execFileSync(
    "bun",
    [
      "build",
      "packages/inspector/src/shell/targets.ts",
      "--target=browser",
      "--format=esm",
      "--outfile=.frames/dist/inspector-contract/targets.js",
    ],
    { windowsHide: true, stdio: "pipe" },
  );
  const inspector = await readFile(
    "packages/inspector/dist/inspector.js",
    "utf8",
  );
  const targets = await readFile(
    ".frames/dist/inspector-contract/targets.js",
    "utf8",
  );
  server = createServer((request, response) => {
    const script =
      request.url === "/inspector.js"
        ? inspector
        : request.url === "/targets.js"
          ? targets
          : null;
    response.setHeader(
      "content-type",
      script ? "text/javascript; charset=utf-8" : "text/html; charset=utf-8",
    );
    response.end(script ?? html);
  });
  await new Promise<void>((done, fail) => {
    server.once("error", fail);
    server.listen(0, "127.0.0.1", done);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing fixture port");
  origin = `http://127.0.0.1:${address.port}`;
});
test.afterAll(async () => {
  if (server)
    await new Promise<void>((done, fail) =>
      server.close((error) => (error ? fail(error) : done())),
    );
});

test("hover, click and shift-click use an isolated overlay and block app handlers only while inspecting", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin);
  const host = page.locator("frames-inspector");
  const toggle = host.getByRole("button", { name: "Inspect", exact: true });
  const first = page.locator("#first");
  const second = page.locator("#second");
  const before = await first.evaluate((element) => ({
    color: getComputedStyle(element).backgroundColor,
    padding: getComputedStyle(element).padding,
    box: element.getBoundingClientRect().toJSON(),
  }));
  await first.click();
  await expect(page.locator("#count")).toHaveText("1");
  await page.evaluate(() => {
    delete document.body.dataset.appBubble;
  });
  await toggle.click();
  await first.hover();
  await expect(host.locator('[data-kind="hover"]')).toHaveCount(1);
  const hoverBox = await host.locator('[data-kind="hover"]').boundingBox();
  const appBox = await first.boundingBox();
  expect(hoverBox?.x).toBeCloseTo(appBox?.x ?? 0, 1);
  expect(hoverBox?.width).toBeCloseTo(appBox?.width ?? 0, 1);
  await first.click();
  await expect(host.getByRole("status")).toContainText("1 selected");
  await expect(host.locator("li pre")).toContainText('"selector": "#first"');
  const snapshot = JSON.parse(
    (await host.locator("li pre").textContent()) ?? "null",
  );
  expect(snapshot.tag).toBe("button");
  expect(snapshot.classes).toEqual(["primary", "padded"]);
  expect(snapshot.styles.padding).toBe("13px");
  expect(snapshot.box.w).toBeGreaterThan(0);
  await second.click({ modifiers: ["Shift"] });
  await expect(host.getByRole("status")).toContainText("2 selected");
  await first.click({ modifiers: ["Shift"] });
  await expect(host.getByRole("status")).toContainText("1 selected");
  await expect(host.locator("li pre")).toContainText('"selector": "#second"');
  await first.click();
  await expect(host.locator("li pre")).toContainText('"selector": "#first"');
  await expect(page.locator("#count")).toHaveText("1");
  expect(
    await page.evaluate(() => document.body.dataset.appBubble),
  ).toBeUndefined();
  expect(
    await first.evaluate((element) => ({
      color: getComputedStyle(element).backgroundColor,
      padding: getComputedStyle(element).padding,
      box: element.getBoundingClientRect().toJSON(),
    })),
  ).toEqual(before);
  expect(
    await host
      .locator('[data-kind="selected"]')
      .evaluate((element) => getComputedStyle(element).pointerEvents),
  ).toBe("none");
  await page.screenshot({ path: ".frames/dist/inspector-preview.png" });
  await toggle.click();
  await expect(host.locator(".box")).toHaveCount(0);
  await first.click();
  await expect(page.locator("#count")).toHaveText("2");
  expect(errors).toEqual([]);
});

test("target boundaries round-trip selectors and reject disconnected nodes and invalid geometry", async ({
  page,
}) => {
  await page.goto(origin);
  const results = await page.evaluate(async () => {
    const modulePath = "/targets.js";
    const { createTargetReader } = (await import(
      modulePath
    )) as typeof import("../../packages/inspector/src/shell/targets");
    const reader = createTargetReader(document, window);
    const snapshots = [
      ...document.querySelectorAll("button, li, section, #special\\:id"),
    ].map((element) => {
      const snapshot = reader.read(element);
      return {
        valid:
          !!snapshot &&
          Object.values(snapshot.box).every(Number.isFinite) &&
          snapshot.box.w >= 0 &&
          snapshot.box.h >= 0,
        roundTrip:
          !!snapshot && document.querySelector(snapshot.selector) === element,
      };
    });
    const first = document.querySelector("#first");
    if (!first) throw new Error("Missing target");
    const initial = reader.read(first);
    const repeated = reader.read(first);
    const identity =
      initial !== null && repeated !== null && initial.id === repeated.id;
    const disconnected = reader.read(document.createElement("button"));
    const getRect = first.getBoundingClientRect;
    first.getBoundingClientRect = () => ({
      ...getRect.call(first).toJSON(),
      x: Number.NaN,
    });
    const invalid = reader.read(first);
    first.getBoundingClientRect = () => ({
      ...getRect.call(first).toJSON(),
      width: -1,
    });
    const negative = reader.read(first);
    first.getBoundingClientRect = getRect;
    const selected = reader.read(first);
    reader.retain([]);
    const released = selected && reader.element(selected.id) === undefined;
    const shadowHost = document.createElement("div");
    document.body.append(shadowHost);
    const shadow = shadowHost.attachShadow({ mode: "open" });
    const nested = document.createElement("button");
    shadow.append(nested);
    return {
      snapshots,
      identity,
      disconnected,
      invalid,
      negative,
      released,
      shadow: reader.read(nested),
    };
  });
  expect(results.snapshots.length).toBe(6);
  expect(
    results.snapshots.every((entry) => entry.valid && entry.roundTrip),
  ).toBe(true);
  expect(results.identity).toBe(true);
  expect(results.disconnected).toBeNull();
  expect(results.invalid).toBeNull();
  expect(results.negative).toBeNull();
  expect(results.released).toBe(true);
  expect(results.shadow).toBeNull();
});

test("source readout uses only direct valid stamps and retains bounded DOM fallback", async ({
  page,
}) => {
  await page.goto(origin);
  const host = page.locator("frames-inspector");
  await host.getByRole("button", { name: "Inspect", exact: true }).click();
  await page.locator("#first").evaluate((element) => {
    element.setAttribute("data-frames-file", "src/Fixture.tsx");
    element.setAttribute("data-frames-line", "12");
    element.setAttribute("data-frames-column", "4");
  });
  await page.locator("#first").click();
  const context = async () =>
    JSON.parse((await host.locator("li pre").textContent()) ?? "null");
  expect((await context()).source).toEqual({
    file: "src/Fixture.tsx",
    line: 12,
    column: 4,
  });
  await page.locator("#first").evaluate((element) => {
    element.setAttribute("data-frames-line", "0");
  });
  await expect
    .poll(async () => (await context()).source)
    .toBe("Source unavailable");
  expect((await context()).html).toContain('<button id="first"');
  await page.locator("#first").evaluate((element) => {
    for (const name of ["file", "line", "column"])
      element.removeAttribute(`data-frames-${name}`);
    const parent = element.parentElement;
    parent?.setAttribute("data-frames-file", "src/Ancestor.vue");
    parent?.setAttribute("data-frames-line", "1");
    parent?.setAttribute("data-frames-column", "1");
    element.textContent = "x".repeat(7000);
  });
  await expect.poll(async () => (await context()).html.length).toBe(4096);
  expect((await context()).source).toBe("Source unavailable");
  expect((await context()).selector).toBe("#first");
  await expect(host.locator("pre button")).toHaveCount(0);
});

test("scroll, mutation, repeated injection and teardown preserve one installation", async ({
  page,
}) => {
  await page.goto(origin);
  const host = page.locator("frames-inspector");
  const toggle = host.getByRole("button", { name: "Inspect", exact: true });
  await toggle.click();
  await page.locator("#first").click();
  await page.evaluate(() => window.scrollTo(0, 100));
  await expect
    .poll(async () => {
      const overlay = await host
        .locator('[data-kind="selected"]')
        .boundingBox();
      const target = await page.locator("#first").boundingBox();
      return Math.abs((overlay?.y ?? 1000) - (target?.y ?? 0));
    })
    .toBeLessThan(1);
  await page.evaluate(() => document.querySelector("#first")?.remove());
  await expect(host.getByRole("status")).toContainText("0 selected");
  await page.evaluate(() =>
    document.querySelector("frames-inspector")?.remove(),
  );
  await expect(host).toHaveCount(1);
  await page.addScriptTag({ url: `${origin}/inspector.js` });
  await expect(host).toHaveCount(1);
  await page.evaluate(() => window.scrollTo(0, 0));
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await page.locator("#second").click();
  await expect(page.locator("#count")).toHaveText("1");
  await page.reload();
  await expect(host).toHaveCount(1);
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await page.evaluate(() =>
    window.dispatchEvent(
      new PageTransitionEvent("pagehide", { persisted: false }),
    ),
  );
  await expect(host).toHaveCount(0);
  await page.locator("#first").click();
  await expect(page.locator("#count")).toHaveText("1");
});
