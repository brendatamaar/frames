import { expect, test } from "bun:test";
import { makeContext } from "../core/inspection";
import { parseStamp } from "./source";

test("generated validPositions round trips and boundedHtml properties", () => {
  let seed = 717;
  for (let index = 0; index < 300; index++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const source = {
      file: `src/part-${seed}.vue`,
      line: seed + 1,
      column: index + 1,
    };
    const stamp = parseStamp({
      file: source.file,
      line: String(source.line),
      column: String(source.column),
    });
    expect(stamp).toEqual({ tag: "valid", source });
    const html = `  <button>${"a".repeat(seed % 6000)}</button>  `;
    const context = makeContext(stamp, html);
    expect(context.html.length).toBeLessThanOrEqual(4096);
    if (html.trim().length <= 4096) expect(context.html).toBe(html.trim());
    else {
      expect(context.html.endsWith("…")).toBe(true);
      expect(html.trim().startsWith(context.html.slice(0, -1))).toBe(true);
    }
  }
});
test("fallbackKeepsContext and malformed attributes are explicit", () => {
  expect(parseStamp({})).toEqual({ tag: "missing" });
  for (const file of [
    "/etc/a",
    "C:/a",
    "../a",
    "a/../b",
    "a\\b",
    "node_modules/a",
    "\0a",
    "",
  ])
    expect(parseStamp({ file, line: "1", column: "1" }).tag).toBe("invalid");
  for (const value of [
    null,
    "0",
    "-1",
    "1.5",
    "NaN",
    "Infinity",
    "9007199254740992",
    "01",
    " 1",
    "1e2",
    1,
  ]) {
    for (const key of ["line", "column"])
      expect(
        parseStamp({ file: "src/a.tsx", line: "1", column: "1", [key]: value })
          .tag,
      ).toBe("invalid");
  }
  for (const stamp of [{ tag: "missing" }, { tag: "invalid" }] as const)
    expect(makeContext(stamp, " <span>keep</span> ")).toEqual({
      tag: "domOnly",
      reason: stamp.tag,
      html: "<span>keep</span>",
    });
});
