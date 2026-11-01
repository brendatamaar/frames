export type ProjectRoot = string & { readonly __projectRoot: unique symbol };
export type SourceFile = string & { readonly __sourceFile: unique symbol };
export type Kind = "vue" | "jsx";
export interface ModuleSource {
  readonly file: SourceFile;
  readonly code: string;
  readonly kind: Kind;
}
export interface ElementSite {
  readonly start: number;
  readonly insert: number;
  readonly native: boolean;
  readonly stamped: boolean;
}
export interface Edit {
  readonly offset: number;
  readonly text: string;
}
export type State =
  | { readonly tag: "unconfigured" }
  | { readonly tag: "enabled"; readonly root: ProjectRoot }
  | { readonly tag: "disabled" };
export type Input =
  | {
      readonly tag: "Configured";
      readonly root: ProjectRoot;
      readonly command: "serve" | "build";
      readonly production: boolean;
    }
  | { readonly tag: "TransformRequested"; readonly module: ModuleSource }
  | {
      readonly tag: "Parsed";
      readonly module: ModuleSource;
      readonly sites: readonly ElementSite[];
    };
export type Command =
  | { readonly tag: "ParseSource"; readonly module: ModuleSource }
  | {
      readonly tag: "ApplyEdits";
      readonly module: ModuleSource;
      readonly edits: readonly Edit[];
    };

function escapeAttribute(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\n", "&#10;")
    .replaceAll("\r", "&#13;")
    .replaceAll("\t", "&#9;");
}
export function planEdits(
  module: ModuleSource,
  sites: readonly ElementSite[],
): readonly Edit[] {
  const offsets = new Set<number>();
  return sites
    .filter((site) => site.native && !site.stamped)
    .map((site) => {
      if (
        !Number.isSafeInteger(site.start) ||
        !Number.isSafeInteger(site.insert) ||
        site.start < 0 ||
        site.insert <= site.start ||
        site.insert > module.code.length ||
        module.code[site.start] !== "<" ||
        offsets.has(site.insert)
      )
        throw new Error("Invalid source stamp insertion plan");
      offsets.add(site.insert);
      const lines = module.code.slice(0, site.start).split("\n");
      const line = lines.length;
      const column = lines[lines.length - 1].length + 1;
      const text =
        module.kind === "vue"
          ? ` data-frames-file="${escapeAttribute(module.file)}" data-frames-line="${line}" data-frames-column="${column}"`
          : ` data-frames-file={${JSON.stringify(module.file)}} data-frames-line={${line}} data-frames-column={${column}}`;
      return { offset: site.insert, text };
    });
}
export function step(
  state: State,
  input: Input,
): readonly [State, readonly Command[]] {
  switch (input.tag) {
    case "Configured":
      if (state.tag !== "unconfigured") return [state, []];
      return [
        input.command === "serve" && !input.production
          ? { tag: "enabled", root: input.root }
          : { tag: "disabled" },
        [],
      ];
    case "TransformRequested":
      return [
        state,
        state.tag === "enabled"
          ? [{ tag: "ParseSource", module: input.module }]
          : [],
      ];
    case "Parsed": {
      if (state.tag !== "enabled") return [state, []];
      const edits = planEdits(input.module, input.sites);
      return [
        state,
        edits.length
          ? [{ tag: "ApplyEdits", module: input.module, edits }]
          : [],
      ];
    }
  }
}
export function run(state: State, inputs: readonly Input[]) {
  return inputs.reduce<readonly [State, readonly Command[]]>(
    ([previous, commands], input) => {
      const [next, emitted] = step(previous, input);
      return [next, [...commands, ...emitted]];
    },
    [state, []],
  );
}
