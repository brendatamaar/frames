import { expect, test } from "bun:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
test("CLI subprocess preserves version and reports invalid input without a stack trace", async () => {
  const version = await run(
    "bun",
    ["run", "packages/daemon/src/cli.ts", "version"],
    { windowsHide: true, env: { ...process.env, NODE_ENV: "production" } },
  );
  expect(version.stdout.trim()).toBe("frames 0.0.0");
  for (const args of [
    [],
    ["proxy", "file:///bad"],
    ["proxy", "http://localhost:5173"],
  ]) {
    try {
      await run("bun", ["run", "packages/daemon/src/cli.ts", ...args], {
        windowsHide: true,
        env: { ...process.env, NODE_ENV: "production" },
      });
      throw new Error("Invalid command unexpectedly succeeded");
    } catch (error) {
      expect(error).toMatchObject({ code: 1 });
      expect(String((error as { stderr: unknown }).stderr)).not.toContain(
        "at <anonymous>",
      );
    }
  }
}, 15_000);
