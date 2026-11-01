import assert from "node:assert/strict";
import { resolve } from "node:path";
import { Annotation } from "@frames/protocol/schema";
import * as types from "@frames/protocol/types";
import frames from "@frames/vite-plugin";

assert.equal(frames().apply, "serve");
const invoke = (hook, ...args) =>
  (typeof hook === "function" ? hook : hook.handler).call(
    {
      warn: (message) => {
        throw new Error(message);
      },
      error: (message) => {
        throw new Error(message.message);
      },
    },
    ...args,
  );
for (const production of [false, true]) {
  const plugin = frames();
  invoke(plugin.configResolved, {
    root: process.cwd(),
    command: "serve",
    isProduction: production,
  });
  for (const [file, code] of [
    ["App.tsx", "const app = <main><button /></main>;"],
    ["App.vue", "<template><main><button /></main></template>"],
  ]) {
    const result = await invoke(plugin.transform, code, resolve(file), {
      ssr: false,
    });
    if (production) assert.equal(result, undefined);
    else {
      assert.ok(result.code.includes("data-frames-file"));
      assert.ok(result.code.includes(file));
      assert.deepEqual(result.map.sourcesContent, [code]);
    }
    assert.equal(
      await invoke(plugin.transform, code, resolve(file), { ssr: true }),
      undefined,
    );
  }
}
assert.ok(Annotation);
assert.deepEqual(Object.keys(types), []);
console.log("Node compatibility passed");
