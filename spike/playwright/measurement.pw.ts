import { type ChildProcess, spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";

const resources: { server: ViteDevServer; child?: ChildProcess }[] = [];
const origins = new Map<string, string>();
test.beforeAll(async () => {
  for (const app of ["vue", "react"]) {
    const server = await createServer({
      root: resolve(`examples/${app}-app`),
      server: { host: "127.0.0.1", port: 0 },
      logLevel: "error",
    });
    const resource: (typeof resources)[number] = { server };
    resources.push(resource);
    await server.listen();
    const address = server.httpServer?.address();
    if (!address || typeof address === "string")
      throw new Error("Missing fixture port");
    const child = spawn(
      "bun",
      [
        "run",
        "packages/daemon/dist/cli.js",
        "proxy",
        `http://127.0.0.1:${address.port}`,
      ],
      {
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, NODE_ENV: "development" },
      },
    );
    resource.child = child;
    const origin = await new Promise<string>((done, fail) => {
      let output = "";
      const timer = setTimeout(
        () => fail(new Error(`Proxy timeout: ${output}`)),
        10000,
      );
      child.on("error", (error) => {
        clearTimeout(timer);
        fail(error);
      });
      child.on("exit", (code) => {
        clearTimeout(timer);
        fail(new Error(`Proxy exited ${code}: ${output}`));
      });
      child.stdout?.on("data", (bytes) => {
        output += bytes.toString();
        const url = output
          .split(/\r?\n/)
          .find((line) => /^http:\/\/127\.0\.0\.1:\d+$/.test(line));
        if (url) {
          clearTimeout(timer);
          done(url);
        }
      });
      child.stderr?.on("data", (bytes) => {
        output += bytes.toString();
      });
    });
    origins.set(app, origin);
  }
});
test.afterAll(async () => {
  for (const { child, server } of resources.reverse()) {
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = new Promise<void>((done) =>
        child.once("exit", () => done()),
      );
      child.kill("SIGTERM");
      await exited;
    }
    await server.close();
  }
});

test("measure twenty distinct pointer clicks per app against independent source anchors", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const reports = [];
  for (const app of ["vue", "react"]) {
    const main = app === "vue" ? "src/App.vue" : "src/main.tsx";
    const card = app === "vue" ? "src/Card.vue" : main;
    const details = app === "vue" ? "src/Details.vue" : "src/Details.tsx";
    const cases = [
      ["main", main, "<main>"],
      ["h1", main, "<h1>"],
      ["article", card, "<article>"],
      ["h2", card, "<h2>"],
      ["article button", main, "<button "],
      ["article ul", main, app === "vue" ? "<ul v-if=" : "<ul>"],
      ...[1, 2, 3].map((index) => [
        `article li:nth-child(${index})`,
        main,
        "<li ",
      ]),
      ["#review", details, '<section id="review">'],
      ["#review h3", details, "<h3>"],
      ["#review p", details, "<p>"],
      ["#review strong", details, "<strong>"],
      ["#review dl", details, "<dl>"],
      ["#review dt:nth-of-type(1)", details, "<dt>Owner"],
      ["#review dd:nth-of-type(1)", details, "<dd>Design"],
      ["#review dt:nth-of-type(2)", details, "<dt>Milestone"],
      ["#review dd:nth-of-type(2)", details, "<dd>Prototype"],
      ["#review footer", details, "<footer>"],
      ["#review a", details, "<a href="],
    ];
    expect(cases.length).toBe(20);
    expect(new Set(cases.map(([selector]) => selector)).size).toBe(20);
    await page.goto(origins.get(app) ?? "");
    const host = page.locator("frames-inspector");
    await host.getByRole("button", { name: "Inspect", exact: true }).click();
    const rows = [];
    for (const [selector, file, token] of cases) {
      const source = await readFile(`examples/${app}-app/${file}`, "utf8");
      const offset = source.indexOf(token);
      if (offset < 0 || source.indexOf(token, offset + 1) !== -1)
        throw new Error(`Ambiguous/missing source anchor: ${file} ${token}`);
      const prefix = source.slice(0, offset);
      const expected = {
        file,
        line: prefix.split("\n").length,
        column: offset - prefix.lastIndexOf("\n"),
      };
      const target = page.locator(selector);
      await target.scrollIntoViewIfNeeded();
      const point = await target.evaluate((element) => {
        const box = element.getBoundingClientRect();
        for (
          let y = Math.max(0, box.top) + 1;
          y < Math.min(innerHeight, box.bottom);
          y += 3
        )
          for (
            let x = Math.max(0, box.left) + 1;
            x < Math.min(innerWidth, box.right);
            x += 5
          )
            if (document.elementFromPoint(x, y) === element) return { x, y };
        return null;
      });
      let actual: { file: string; line: number; column: number } | null = null;
      if (point) {
        await page.mouse.click(point.x, point.y);
        const context = JSON.parse(
          (await host.locator("li pre").textContent()) ?? "null",
        );
        if (context?.source && typeof context.source === "object")
          actual = context.source;
      }
      rows.push({
        selector,
        expected,
        actual,
        correct:
          actual?.file === expected.file && actual?.line === expected.line,
        columnCorrect: actual?.column === expected.column,
        failure: point
          ? actual
            ? null
            : "No source resolved"
          : "No exposed click point",
      });
    }
    reports.push({
      app,
      total: rows.length,
      correct: rows.filter((row) => row.correct).length,
      rows,
    });
  }
  await mkdir(".frames/dist", { recursive: true });
  await writeFile(
    ".frames/dist/source-measurement.json",
    `${JSON.stringify(reports, null, 2)}\n`,
  );
  for (const report of reports) {
    console.log(
      `${report.app}: ${report.correct}/${report.total} correct file:line`,
    );
    expect(report.correct).toBeGreaterThanOrEqual(18);
  }
});
