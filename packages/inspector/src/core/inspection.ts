export type TargetId = number & { readonly __targetId: unique symbol };
export interface TargetSnapshot {
  readonly id: TargetId;
  readonly tag: string;
  readonly classes: readonly string[];
  readonly selector: string;
  readonly styles: Readonly<Record<string, string>>;
  readonly box: {
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
  };
}
export type State =
  | { readonly tag: "disabled" }
  | {
      readonly tag: "inspecting";
      readonly hover: TargetSnapshot | null;
      readonly selected: readonly TargetSnapshot[];
    }
  | { readonly tag: "disposed" };
export type Input =
  | { readonly tag: "Enable" }
  | { readonly tag: "Disable" }
  | { readonly tag: "Hover"; readonly target: TargetSnapshot | null }
  | {
      readonly tag: "Pick";
      readonly target: TargetSnapshot;
      readonly shift: boolean;
    }
  | { readonly tag: "TargetsRemoved"; readonly ids: readonly TargetId[] }
  | { readonly tag: "Refreshed"; readonly targets: readonly TargetSnapshot[] }
  | { readonly tag: "Dispose" };
export type Command =
  | { readonly tag: "Render"; readonly state: State }
  | { readonly tag: "BlockClick" }
  | { readonly tag: "ReleaseOverlay" };

export function step(
  state: State,
  input: Input,
): readonly [State, readonly Command[]] {
  if (state.tag === "disposed") return [state, []];
  if (input.tag === "Dispose")
    return [{ tag: "disposed" }, [{ tag: "ReleaseOverlay" }]];
  if (state.tag === "disabled") {
    if (input.tag === "Enable") {
      const next: State = { tag: "inspecting", hover: null, selected: [] };
      return [next, [{ tag: "Render", state: next }]];
    }
    return [state, []];
  }
  let next: State;
  switch (input.tag) {
    case "Enable":
      return [state, []];
    case "Disable":
      next = { tag: "disabled" };
      break;
    case "Hover":
      next = { ...state, hover: input.target };
      break;
    case "Pick": {
      const selected = input.shift
        ? state.selected.some((target) => target.id === input.target.id)
          ? state.selected.filter((target) => target.id !== input.target.id)
          : [...state.selected, input.target]
        : [input.target];
      next = { ...state, selected };
      return [next, [{ tag: "BlockClick" }, { tag: "Render", state: next }]];
    }
    case "TargetsRemoved":
      next = {
        ...state,
        hover:
          state.hover && !input.ids.includes(state.hover.id)
            ? state.hover
            : null,
        selected: state.selected.filter(
          (target) => !input.ids.includes(target.id),
        ),
      };
      break;
    case "Refreshed": {
      const refresh = (target: TargetSnapshot) =>
        input.targets.find((snapshot) => snapshot.id === target.id) ?? target;
      next = {
        ...state,
        hover: state.hover ? refresh(state.hover) : null,
        selected: state.selected.map(refresh),
      };
      break;
    }
  }
  return [next, [{ tag: "Render", state: next }]];
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
