import { type ChildProcess, spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import { expect, test } from "@playwright/test";

let server: Server;
let cli: ChildProcess;
let origin: string;
const upstreamRequests: string[] = [];
test.beforeAll(async () => {
  server = createServer((request, response) => {
    upstreamRequests.push(request.url ?? "");
    response.setHeader("content-type", "text/html");
    response.setHeader("x-frame-options", "DENY");
    response.setHeader(
      "content-security-policy",
      "default-src 'self'; script-src 'self'; frame-ancestors 'none'",
    );
    response.end(
      request.url === "/frames"
        ? '<!doctype html><iframe src="/app"></iframe>'
        : "<!doctype html><h1>Framed app</h1>",
    );
  });
  await new Promise<void>((done, fail) => {
    server.once("error", fail);
    server.listen(0, "127.0.0.1", done);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing fixture port");
  cli = spawn(
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
  origin = await new Promise<string>((done, fail) => {
    let output = "";
    const timeout = setTimeout(
      () => fail(new Error(`CLI startup timeout: ${output}`)),
      10_000,
    );
    cli.on("error", (error) => {
      clearTimeout(timeout);
      fail(error);
    });
    cli.on("exit", (code) => {
      clearTimeout(timeout);
      fail(new Error(`CLI exited ${code}: ${output}`));
    });
    cli.stdout?.on("data", (bytes) => {
      output += bytes.toString();
      const url = output
        .split(/\r?\n/)
        .find((line) => /^http:\/\/127\.0\.0\.1:\d+$/.test(line));
      if (url) {
        clearTimeout(timeout);
        done(url);
      }
    });
    cli.stderr?.on("data", (bytes) => {
      output += bytes.toString();
    });
  });
});
test.afterAll(async () => {
  if (cli && cli.exitCode === null && cli.signalCode === null) {
    const exited = new Promise<void>((done) => cli.once("exit", () => done()));
    cli.kill("SIGTERM");
    await exited;
  }
  if (server)
    await new Promise<void>((done, fail) =>
      server.close((error) => (error ? fail(error) : done())),
    );
});

test("built CLI serves inspector in a frame with same-origin CSP", async ({
  page,
}) => {
  const assets: number[] = [];
  const failures: string[] = [];
  page.on("response", (response) => {
    if (new URL(response.url()).pathname === "/__frames/inspector.js")
      assets.push(response.status());
  });
  page.on("pageerror", (error) => failures.push(error.message));
  const response = await page.goto(`${origin}/frames`);
  expect(response?.headers()["x-frame-options"]).toBeUndefined();
  expect(response?.headers()["content-security-policy"]).toBe(
    "default-src 'self'; script-src 'self'",
  );
  await expect(page.frameLocator("iframe").getByRole("heading")).toHaveText(
    "Framed app",
  );
  await expect.poll(() => assets.length).toBe(2);
  expect(assets).toEqual([200, 200]);
  expect(upstreamRequests).not.toContain("/__frames/inspector.js");
  expect(failures).toEqual([]);
});
