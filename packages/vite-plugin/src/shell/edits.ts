import MagicString from "magic-string";
import type { Edit, ModuleSource } from "../core/stamping";

export function applyEdits(
  module: ModuleSource,
  edits: readonly Edit[],
  sourceId: string = module.file,
) {
  const source = new MagicString(module.code);
  for (const edit of edits) source.appendLeft(edit.offset, edit.text);
  return {
    code: source.toString(),
    map: source.generateMap({
      hires: true,
      source: sourceId,
      includeContent: true,
    }),
  };
}
