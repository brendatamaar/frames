import { expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Effect, Layer } from "effect";
import {
  InspectorAssetError,
  InspectorAssetService,
  inspectorAssetFile,
  parseInspectorScript,
} from "./inspector-asset";

test("asset boundary preserves nonempty script and rejects invalid data", () => {
  for (const value of ["/* built entry */", "window.ready=true;\n"])
    expect<string>(parseInspectorScript(parseInspectorScript(value))).toBe(
      value,
    );
  for (const value of [undefined, null, 1, {}, "", " \n\t"])
    expect(() => parseInspectorScript(value)).toThrow("run bun run build");
});

for (const adapter of ["file", "Layer fake"] as const) {
  for (const outcome of [
    "success",
    "missing",
    "empty",
    "unreadable",
  ] as const) {
    test(`asset contract ${adapter}: ${outcome}`, async () => {
      const source = outcome === "success" ? "window.loaded=true;" : "";
      await mkdir(resolve(".frames/dist"), { recursive: true });
      const directory = await mkdtemp(resolve(".frames/dist/asset-contract-"));
      const file = pathToFileURL(`${directory}/inspector.js`);
      if (outcome === "success" || outcome === "empty")
        await writeFile(file, source);
      if (outcome === "unreadable") await mkdir(file);
      const layer =
        adapter === "file"
          ? inspectorAssetFile(file)
          : Layer.succeed(InspectorAssetService, {
              load:
                outcome === "success"
                  ? Effect.succeed(parseInspectorScript(source))
                  : Effect.fail(
                      new InspectorAssetError({
                        reason: "Missing asset; run bun run build",
                      }),
                    ),
            });
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const assets = yield* InspectorAssetService;
          return yield* assets.load;
        }).pipe(Effect.provide(layer), Effect.result),
      );
      expect(result._tag).toBe(outcome === "success" ? "Success" : "Failure");
      if (result._tag === "Success")
        expect<string>(result.success).toBe(source);
    });
  }
}
