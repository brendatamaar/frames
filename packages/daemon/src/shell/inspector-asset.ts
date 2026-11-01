import { readFile } from "node:fs/promises";
import { Context, Data, Effect, Layer } from "effect";
import type { InspectorScript } from "../core/proxy-command";

export class InspectorAssetError extends Data.TaggedError(
  "InspectorAssetError",
)<{ readonly reason: string }> {
  override get message() {
    return this.reason;
  }
}
export function parseInspectorScript(value: unknown): InspectorScript {
  if (typeof value !== "string" || value.trim().length === 0)
    throw new InspectorAssetError({
      reason: "Inspector build is empty; run bun run build",
    });
  return value as InspectorScript;
}
export class InspectorAssetService extends Context.Service<
  InspectorAssetService,
  {
    readonly load: Effect.Effect<InspectorScript, InspectorAssetError>;
  }
>()("frames/InspectorAssetService") {}
// Works from both src/shell/inspector-asset.ts and the bundled dist/cli.js.
const builtAsset = new URL(
  import.meta.url.endsWith("/cli.js")
    ? "../../inspector/dist/inspector.js"
    : "../../../inspector/dist/inspector.js",
  import.meta.url,
);
export const inspectorAssetFile = (path: URL) =>
  Layer.succeed(InspectorAssetService, {
    load: Effect.tryPromise({
      try: (signal) =>
        readFile(path, { encoding: "utf8", signal }).then(parseInspectorScript),
      catch: () =>
        new InspectorAssetError({
          reason:
            "Inspector build is missing, unreadable or empty; run bun run build",
        }),
    }),
  });
export const InspectorAssetLive = inspectorAssetFile(builtAsset);
