import { createServer, type Server } from "node:http";
import { expect, test } from "@playwright/test";

let server: Server;
let origin: string;
test.beforeAll(async () => {
  server = createServer((_request, response) => {
    response.setHeader("content-type", "text/html");
    response.end(
      "<!doctype html><button onclick=\"this.textContent='clicked'\">ready</button>",
    );
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing test server port");
  origin = `http://127.0.0.1:${address.port}`;
});
test.afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

test("Node worker can drive a local browser, click and assert DOM updates", async ({
  page,
}) => {
  expect(process.versions.bun).toBeUndefined();
  expect(typeof process.versions.node).toBe("string");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin);
  await page.getByRole("button", { name: "ready" }).click();
  await expect(page.getByRole("button")).toHaveText("clicked");
  expect(errors).toEqual([]);
  console.log(
    `Playwright worker Node ${process.versions.node}; browser ${page.context().browser()?.version()}`,
  );
});
