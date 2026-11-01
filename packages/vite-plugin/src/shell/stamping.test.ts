import { expect, test } from "bun:test";
import { resolve } from "node:path";
import {
  type ElementSite,
  type Input,
  type ModuleSource,
  planEdits,
  run,
  type State,
  step,
} from "../core/stamping";
import { parseFile, parseModule, parseRoot } from "./boundary";

const root = parseRoot(resolve("examples/react-app"));
const module: ModuleSource = {
  file: parseFile("src/App.tsx"),
  kind: "jsx",
  code: "<main>\r\n  <button />\r\n</main>",
};
const sites: ElementSite[] = [
  { start: 0, insert: 5, native: true, stamped: false },
  { start: 10, insert: 17, native: true, stamped: false },
];
const configure: Input = {
  tag: "Configured",
  root,
  command: "serve",
  production: false,
};
test("generated lifecycle devOnly and nativeOnly properties with shrinking", () => {
  let seed = 123;
  const domain: Input[] = [
    configure,
    { ...configure, production: true },
    { ...configure, command: "build" },
    { tag: "TransformRequested", module },
    ...[true, false].flatMap((native) =>
      [true, false].map(
        (stamped): Input => ({
          tag: "Parsed",
          module,
          sites: sites.map((site) => ({ ...site, native, stamped })),
        }),
      ),
    ),
  ];
  const check = (inputs: Input[]) => {
    let state: State = { tag: "unconfigured" };
    for (const input of inputs) {
      const [next, commands] = step(state, input);
      if (state.tag !== "enabled") expect(commands).toEqual([]);
      if (
        input.tag === "Parsed" &&
        input.sites.every((site) => !site.native || site.stamped)
      )
        expect(commands).toEqual([]);
      state = next;
    }
    expect(run({ tag: "unconfigured" }, inputs)[0]).toEqual(state);
  };
  for (let round = 0; round < 150; round++) {
    let inputs = Array.from({ length: 40 }, () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return domain[seed % domain.length];
    });
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
test("originalPositions and preserveSource for generated indentation and line endings", () => {
  for (const newline of ["\n", "\r\n"])
    for (let indent = 0; indent < 30; indent++) {
      const prefix = `const app = (${newline}${" ".repeat(indent)}`;
      const code = `${prefix}<main><button /></main>);`;
      const input = { ...module, code };
      const edits = planEdits(input, [
        { ...sites[0], start: prefix.length, insert: prefix.length + 5 },
        { ...sites[0], start: prefix.length + 6, insert: prefix.length + 13 },
      ]);
      expect(edits[0].text).toContain(
        `data-frames-line={2} data-frames-column={${indent + 1}}`,
      );
      expect(edits[1].text).toContain(`data-frames-column={${indent + 7}}`);
      let rendered = code;
      for (const edit of [...edits].sort((a, b) => b.offset - a.offset))
        rendered =
          rendered.slice(0, edit.offset) +
          edit.text +
          rendered.slice(edit.offset);
      for (const edit of edits) rendered = rendered.replace(edit.text, "");
      expect(rendered).toBe(code);
    }
});
test("boundary round trips and noAbsolutePaths reject traversal, dependencies and non-dev requests", () => {
  for (const file of ["src/App.tsx", 'src/quote"&.vue', "src/unicode-🌿.jsx"])
    expect<string>(parseFile(parseFile(file))).toBe(file);
  for (const file of [
    "/etc/App.tsx",
    "C:/App.tsx",
    "../App.tsx",
    "src/../App.tsx",
    "node_modules/a.tsx",
    "src\\App.tsx",
    "src//a.tsx",
    "\0virtual",
  ])
    expect(() => parseFile(file)).toThrow();
  expect(parseModule(root, "", resolve(root, "src/App.tsx"), false)?.file).toBe(
    parseFile("src/App.tsx"),
  );
  for (const id of [
    "virtual:App.tsx",
    resolve(root, "../outside.tsx"),
    resolve(root, "src/App.tsx?raw"),
    resolve(root, "node_modules/a.tsx"),
    resolve(root, "src/App.css"),
  ])
    expect(parseModule(root, "", id, false)).toBeNull();
  expect(parseModule(root, "", resolve(root, "src/App.tsx"), true)).toBeNull();
  expect(() => parseRoot("relative")).toThrow();
});
test("idempotentStamping skips any reserved site; malformed plans surface defects", () => {
  expect(
    planEdits(
      module,
      sites.map((site) => ({ ...site, stamped: true })),
    ),
  ).toEqual([]);
  for (const insert of [-1, 0, 100, 1.5])
    expect(() => planEdits(module, [{ ...sites[0], insert }])).toThrow();
  expect(() => planEdits(module, [sites[0], sites[0]])).toThrow();
});
