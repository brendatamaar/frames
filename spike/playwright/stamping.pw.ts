import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";

const servers = new Map<string, ViteDevServer>();
const origins = new Map<string, string>();
test.beforeAll(async () => {
  for (const app of ["vue", "react"]) {
    const server = await createServer({
      root: resolve(`examples/${app}-app`),
      server: { host: "127.0.0.1", port: 0 },
      logLevel: "error",
    });
    servers.set(app, server);
    await server.listen();
    const address = server.httpServer?.address();
    if (!address || typeof address === "string")
      throw new Error("Missing Vite port");
    origins.set(app, `http://127.0.0.1:${address.port}`);
  }
});
test.afterAll(async () => {
  await Promise.all([...servers.values()].map((server) => server.close()));
});

for (const app of ["vue", "react"]) {
  test(`${app}: native DOM stamps refer to original source without adding an inspector client`, async ({
    page,
  }) => {
    const origin = origins.get(app);
    if (!origin) throw new Error("Missing fixture origin");
    const samples =
      app === "vue"
        ? [
            ["main", "src/App.vue", "<main>"],
            ["h1", "src/App.vue", "<h1>"],
            ["article", "src/Card.vue", "<article>"],
            ["h2", "src/Card.vue", "<h2>"],
            ["button", "src/App.vue", "<button "],
            ["li", "src/App.vue", "<li "],
          ]
        : [
            ["main", "src/main.tsx", "<main>"],
            ["h1", "src/main.tsx", "<h1>"],
            ["article", "src/main.tsx", "<article>"],
            ["h2", "src/main.tsx", "<h2>"],
            ["button", "src/main.tsx", "<button "],
            ["li", "src/main.tsx", "<li "],
          ];
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(origin);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Project dashboard",
    );
    for (const [selector, file, token] of samples) {
      const source = await readFile(`examples/${app}-app/${file}`, "utf8");
      const offset = source.indexOf(token);
      expect(offset).toBeGreaterThanOrEqual(0);
      const prefix = source.slice(0, offset);
      const element = page.locator(selector).first();
      await expect(element).toHaveAttribute("data-frames-file", file);
      await expect(element).toHaveAttribute(
        "data-frames-line",
        String(prefix.split("\n").length),
      );
      await expect(element).toHaveAttribute(
        "data-frames-column",
        String(offset - prefix.lastIndexOf("\n")),
      );
    }
    await expect(page.locator("frames-inspector")).toHaveCount(0);
    expect(await page.locator('script[src*="inspector"]').count()).toBe(0);
    await page.getByRole("button", { name: "Toggle tasks" }).click();
    await expect(page.locator("li")).toHaveCount(0);
    await page.getByRole("button", { name: "Toggle tasks" }).click();
    await expect(page.locator("li")).toHaveCount(3);
    expect(errors).toEqual([]);
  });
  test(`${app}: production bundle has no source stamps or inspector code`, async () => {
    const folder = resolve(`examples/${app}-app/dist`);
    const inspect = async (directory: string): Promise<void> => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = resolve(directory, entry.name);
        if (entry.isDirectory()) await inspect(path);
        else if (/\.(js|html|css)$/.test(entry.name)) {
          const content = await readFile(path, "utf8");
          expect(content).not.toContain("data-frames-");
          expect(content).not.toContain("frames-inspector");
          expect(content).not.toContain("/__frames/");
        }
      }
    };
    await inspect(folder);
  });
}
