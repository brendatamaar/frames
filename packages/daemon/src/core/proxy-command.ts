import type { Origin } from "./proxy-policy";

export type InspectorScript = string & {
  readonly __inspectorScript: unique symbol;
};
export type State =
  | { readonly tag: "idle" }
  | { readonly tag: "loading" | "starting"; readonly upstream: Origin }
  | { readonly tag: "serving"; readonly origin: Origin }
  | { readonly tag: "stopped" }
  | { readonly tag: "failed"; readonly reason: string };
export type Input =
  | { readonly tag: "Start"; readonly upstream: Origin }
  | { readonly tag: "AssetLoaded"; readonly script: InspectorScript }
  | { readonly tag: "Started"; readonly origin: Origin }
  | { readonly tag: "StopRequested" }
  | { readonly tag: "Failed"; readonly reason: string };
export type Command =
  | { readonly tag: "LoadInspector" }
  | {
      readonly tag: "StartProxy";
      readonly upstream: Origin;
      readonly script: InspectorScript;
    }
  | { readonly tag: "AnnounceOrigin"; readonly origin: Origin }
  | { readonly tag: "ReportError"; readonly reason: string }
  | { readonly tag: "ReleaseScope" };

export function step(
  state: State,
  input: Input,
): readonly [State, readonly Command[]] {
  if (state.tag === "stopped" || state.tag === "failed") return [state, []];
  switch (input.tag) {
    case "Start":
      if (state.tag === "idle")
        return [
          { tag: "loading", upstream: input.upstream },
          [{ tag: "LoadInspector" }],
        ];
      break;
    case "AssetLoaded":
      if (state.tag === "loading")
        return [
          { tag: "starting", upstream: state.upstream },
          [
            {
              tag: "StartProxy",
              upstream: state.upstream,
              script: input.script,
            },
          ],
        ];
      break;
    case "Started":
      if (state.tag === "starting")
        return [
          { tag: "serving", origin: input.origin },
          [{ tag: "AnnounceOrigin", origin: input.origin }],
        ];
      break;
    case "StopRequested":
      return [{ tag: "stopped" }, [{ tag: "ReleaseScope" }]];
    case "Failed":
      if (state.tag !== "idle")
        return [
          { tag: "failed", reason: input.reason },
          [
            { tag: "ReportError", reason: input.reason },
            { tag: "ReleaseScope" },
          ],
        ];
      break;
  }
  return [state, []];
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
