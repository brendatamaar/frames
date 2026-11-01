import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer as createHttp, type Server } from "node:http";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";

let assets: Server;
let assetOrigin: string;
const servers = new Map<string, ViteDevServer>();
const origins = new Map<string, string>();
test.beforeAll(async () => {
  await mkdir(".frames/dist/capture", { recursive: true });
  execFileSync(
    "bun",
    [
      "build",
      "spike/screenshot-entry.ts",
      "--target=browser",
      "--format=esm",
      "--splitting",
      "--outdir=.frames/dist/capture",
    ],
    { windowsHide: true, stdio: "pipe" },
  );
  assets = createHttp((request, response) => {
    if (request.url?.startsWith("/cors.svg"))
      response.setHeader("access-control-allow-origin", "*");
    response.setHeader("content-type", "image/svg+xml");
    response.end(
      '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="60"><rect width="80" height="60" fill="#e11d48"/><circle cx="40" cy="30" r="20" fill="#2563eb"/></svg>',
    );
  });
  await new Promise<void>((done) => assets.listen(0, "127.0.0.1", done));
  const address = assets.address();
  if (!address || typeof address === "string")
    throw new Error("Missing asset port");
  assetOrigin = `http://127.0.0.1:${address.port}`;
  for (const app of ["vue", "react"]) {
    const server = await createServer({
      root: resolve(`examples/${app}-app`),
      server: { host: "127.0.0.1", port: 0 },
      logLevel: "error",
      plugins: [
        {
          name: "capture-test-assets",
          configureServer(instance) {
            instance.middlewares.use("/capture/", (request, response, next) => {
              const filename = request.url?.split("?")[0].slice(1);
              if (!filename || !/^[\w.-]+\.js$/.test(filename)) return next();
              readFile(`.frames/dist/capture/${filename}`).then(
                (code) => {
                  response.setHeader(
                    "content-type",
                    "text/javascript; charset=utf-8",
                  );
                  response.end(code);
                },
                () => {
                  response.statusCode = 404;
                  response.end("Capture module not found");
                },
              );
            });
          },
        },
      ],
    });
    servers.set(app, server);
    await server.listen();
    const port = server.httpServer?.address();
    if (!port || typeof port === "string") throw new Error("Missing app port");
    origins.set(app, `http://127.0.0.1:${port.port}`);
  }
});
test.afterAll(async () => {
  for (const server of servers.values()) await server.close();
  if (assets)
    await new Promise<void>((done, fail) =>
      assets.close((error) => (error ? fail(error) : done())),
    );
});

test("compare PNG fidelity, timing and CORS behavior on both apps", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.context().route("**/*", (route) => {
    const url = new URL(route.request().url());
    return ["127.0.0.1", "localhost"].includes(url.hostname) ||
      ["data:", "blob:"].includes(url.protocol)
      ? route.continue()
      : route.abort();
  });
  await page.setViewportSize({ width: 1100, height: 1100 });
  const rows = [];
  for (const app of ["vue", "react"]) {
    await page.goto(origins.get(app) ?? "");
    await expect(page.locator("h1")).toHaveText("Project dashboard");
    await page.addStyleTag({
      content:
        "main{box-sizing:border-box;width:720px;padding:16px;border:2px solid #334155;border-radius:12px;background:white;color:#0f172a;font:16px/1.4 Arial,sans-serif}article{background:linear-gradient(120deg,#eff6ff,#f0fdf4);padding:12px;border:1px solid #cbd5e1}#review{padding:12px;background:#fff7ed}button{padding:8px;border-radius:6px;background:#1d4ed8;color:white}h1{font-size:28px}",
    });
    for (const scene of ["base", "cors", "no-cors"]) {
      await page.evaluate(
        async ({ scene, assetOrigin }) => {
          document.querySelector("#capture-image")?.remove();
          if (scene === "base") return;
          const image = document.createElement("img");
          image.id = "capture-image";
          image.width = 80;
          image.height = 60;
          if (scene === "cors") image.crossOrigin = "anonymous";
          image.src = `${assetOrigin}/${scene === "cors" ? "cors" : "opaque"}.svg`;
          document.querySelector("main")?.append(image);
          await image.decode();
        },
        { scene, assetOrigin },
      );
      const reference = await page.locator("main").screenshot({
        path: `.frames/dist/capture/${app}-${scene}-reference.png`,
      });
      const referenceUrl = `data:image/png;base64,${reference.toString("base64")}`;
      const imagePoint = await page.evaluate(() => {
        const image = document
          .querySelector("#capture-image")
          ?.getBoundingClientRect();
        const root = document.querySelector("main")?.getBoundingClientRect();
        return image && root
          ? {
              x: Math.round(image.left - root.left + 40),
              y: Math.round(image.top - root.top + 30),
            }
          : null;
      });
      const order =
        app === "vue"
          ? (["modern", "snapdom"] as const)
          : (["snapdom", "modern"] as const);
      for (const library of order) {
        const measured = await page.evaluate(
          async ({ library }) => {
            const modulePath = "/capture/screenshot-entry.js";
            const { capture } = (await import(
              modulePath
            )) as typeof import("../screenshot-entry");
            const target = document.querySelector("main");
            if (!target) throw new Error("Missing capture root");
            const times: number[] = [];
            let png = "";
            try {
              for (let i = 0; i < 3; i++) {
                const start = performance.now();
                png = await capture(library, target);
                times.push(performance.now() - start);
              }
              return { png, times, error: null };
            } catch (error) {
              return {
                png: "",
                times,
                error: error instanceof Error ? error.message : String(error),
              };
            }
          },
          { library },
        );
        let comparison = null;
        if (measured.png) {
          const encoded = measured.png.split(",")[1];
          await writeFile(
            `.frames/dist/capture/${app}-${scene}-${library}.png`,
            Buffer.from(encoded, "base64"),
          );
          comparison = await page.evaluate(
            async ({ actual, reference, imagePoint }) => {
              const pixels = async (url: string) => {
                const image = new Image();
                image.src = url;
                await image.decode();
                const canvas = document.createElement("canvas");
                canvas.width = image.naturalWidth;
                canvas.height = image.naturalHeight;
                const context = canvas.getContext("2d");
                if (!context) throw new Error("Missing canvas context");
                context.drawImage(image, 0, 0);
                return {
                  width: canvas.width,
                  height: canvas.height,
                  data: context.getImageData(0, 0, canvas.width, canvas.height)
                    .data,
                };
              };
              const a = await pixels(actual);
              const b = await pixels(reference);
              let difference = 0;
              const width = Math.min(a.width, b.width),
                height = Math.min(a.height, b.height);
              for (let y = 0; y < height; y++)
                for (let x = 0; x < width; x++)
                  for (let channel = 0; channel < 3; channel++)
                    difference += Math.abs(
                      a.data[(y * a.width + x) * 4 + channel] -
                        b.data[(y * b.width + x) * 4 + channel],
                    );
              return {
                width: a.width,
                height: a.height,
                referenceWidth: b.width,
                referenceHeight: b.height,
                meanChannelError: difference / (width * height * 3),
                imageMatches: imagePoint
                  ? [0, 1, 2].every(
                      (channel) =>
                        a.data[
                          (imagePoint.y * a.width + imagePoint.x) * 4 + channel
                        ] ===
                        b.data[
                          (imagePoint.y * b.width + imagePoint.x) * 4 + channel
                        ],
                    )
                  : null,
              };
            },
            { actual: measured.png, reference: referenceUrl, imagePoint },
          );
        }
        const sorted = [...measured.times].sort((a, b) => a - b);
        const row = {
          app,
          scene,
          library,
          firstMs: measured.times[0] ?? null,
          medianMs: sorted[Math.floor(sorted.length / 2)] ?? null,
          comparison,
          error: measured.error,
        };
        rows.push(row);
        console.log(JSON.stringify(row));
      }
    }
  }
  await writeFile(
    ".frames/dist/screenshot-results.json",
    `${JSON.stringify(rows, null, 2)}\n`,
  );
  for (const row of rows.filter((row) => row.scene !== "no-cors"))
    expect(row.error).toBeNull();
  for (const row of rows.filter((row) => row.scene === "cors"))
    expect(row.comparison?.imageMatches).toBe(true);
});
