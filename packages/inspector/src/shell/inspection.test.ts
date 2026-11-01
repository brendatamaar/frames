import { expect, test } from "bun:test";
import {
  type Input,
  run,
  type State,
  step,
  type TargetId,
  type TargetSnapshot,
} from "../core/inspection";

const targets: TargetSnapshot[] = [1, 2, 3].map((id) => ({
  id: id as TargetId,
  tag: "button",
  classes: [],
  selector: `#button-${id}`,
  styles: {},
  box: { x: id, y: 0, w: 10, h: 10 },
}));
const domain: Input[] = [
  { tag: "Enable" },
  { tag: "Disable" },
  { tag: "Dispose" },
  { tag: "Hover", target: null },
  ...targets.flatMap((target): Input[] => [
    { tag: "Hover", target },
    { tag: "Pick", target, shift: false },
    { tag: "Pick", target, shift: true },
    { tag: "TargetsRemoved", ids: [target.id] },
    {
      tag: "Refreshed",
      targets: [{ ...target, box: { ...target.box, x: 100 } }],
    },
  ]),
];
type Assertion = (
  before: State,
  input: Input,
  result: ReturnType<typeof step>,
) => void;
function property(name: string, assert: Assertion) {
  test(name, () => {
    let seed = 0x12345;
    const check = (inputs: readonly Input[]) => {
      let state: State = { tag: "disabled" };
      for (const input of inputs) {
        const result = step(state, input);
        assert(state, input, result);
        state = result[0];
      }
      expect(run({ tag: "disabled" }, inputs)[0]).toEqual(state);
    };
    for (let round = 0; round < 150; round++) {
      let inputs: Input[] = [
        { tag: "Enable" },
        ...Array.from({ length: 60 }, () => {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          return domain[seed % domain.length];
        }),
      ];
      try {
        check(inputs);
      } catch {
        for (let index = inputs.length - 1; index >= 0; index--) {
          const smaller = inputs.filter((_, i) => i !== index);
          try {
            check(smaller);
          } catch {
            inputs = smaller;
          }
        }
        check(inputs);
      }
    }
  });
}
property("disabledPassesClicks", (before, _input, [after, commands]) => {
  if (before.tag === "disabled")
    expect(commands.some((command) => command.tag === "BlockClick")).toBe(
      false,
    );
  if (after.tag === "disabled") expect(after).toEqual({ tag: "disabled" });
});
property("uniqueSelection", (_before, _input, [after]) => {
  if (after.tag === "inspecting")
    expect(new Set(after.selected.map((target) => target.id)).size).toBe(
      after.selected.length,
    );
});
property("plainClickReplaces", (before, input, [after, commands]) => {
  if (before.tag === "inspecting" && input.tag === "Pick" && !input.shift) {
    expect(after.tag === "inspecting" && after.selected).toEqual([
      input.target,
    ]);
    expect(commands[0].tag).toBe("BlockClick");
  }
});
property("shiftClickToggles", (before, input, [after]) => {
  if (
    before.tag === "inspecting" &&
    input.tag === "Pick" &&
    input.shift &&
    after.tag === "inspecting"
  ) {
    const others = before.selected.filter(
      (target) => target.id !== input.target.id,
    );
    expect(after.selected).toEqual(
      before.selected.length === others.length
        ? [...others, input.target]
        : others,
    );
  }
});
property("removedTargetsDisappear", (before, input, [after]) => {
  if (
    before.tag === "inspecting" &&
    input.tag === "TargetsRemoved" &&
    after.tag === "inspecting"
  ) {
    expect(after.selected.some((target) => input.ids.includes(target.id))).toBe(
      false,
    );
    expect(after.hover && input.ids.includes(after.hover.id)).toBeFalsy();
  }
});
property("refreshNeverSelects", (before, input, [after]) => {
  if (
    before.tag === "inspecting" &&
    input.tag === "Refreshed" &&
    after.tag === "inspecting"
  )
    expect(after.selected.map((target) => target.id)).toEqual(
      before.selected.map((target) => target.id),
    );
});
property("disposedIsQuiet", (before, _input, result) => {
  if (before.tag === "disposed") expect(result).toEqual([before, []]);
});
test("refresh updates selected and hovered data; disable clears selection", () => {
  const initial: State = {
    tag: "inspecting",
    hover: targets[0],
    selected: targets.slice(0, 2),
  };
  const changed = { ...targets[0], box: { x: 50, y: 60, w: 100, h: 20 } };
  expect(step(initial, { tag: "Refreshed", targets: [changed] })[0]).toEqual({
    ...initial,
    hover: changed,
    selected: [changed, targets[1]],
  });
  expect(step(initial, { tag: "Disable" })[0]).toEqual({ tag: "disabled" });
});
