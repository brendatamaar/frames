import { expect, test } from "bun:test";
import { Schema } from "effect";
import { parseStamp } from "../../inspector/src/shell/source";
import { Annotation } from "./schema";

test("accepted inspector source contexts fit the protocol annotation", () => {
  const decode = Schema.decodeUnknownSync(Annotation);
  for (let line = 1; line <= 100; line++) {
    const stamp = parseStamp({
      file: "src/App.vue",
      line: String(line),
      column: "2",
    });
    if (stamp.tag !== "valid") throw new Error("Valid stamp rejected");
    const target = {
      selector: "main",
      source: stamp.source,
      html: "<main></main>",
      styles: {},
      box: { x: 0, y: 0, w: 100, h: 100 },
    };
    expect(
      decode({
        version: 1,
        id: "ann",
        status: "pending",
        comment: "",
        route: "/",
        viewport: { width: 100, height: 100 },
        target,
        createdAt: "2026-11-01T00:00:00Z",
        replies: [],
      }).target.source,
    ).toEqual(stamp.source);
  }
});
