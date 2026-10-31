import { expect, test } from "bun:test";
import { Schema } from "effect";
import { Annotation, annotationJsonSchema } from "./schema";

const draft = {
  version: 1 as const,
  id: "ann_01",
  status: "pending" as const,
  comment: "Less padding",
  route: "/dashboard",
  viewport: { width: 1440, height: 900 },
  target: {
    selector: ".card",
    html: '<div class="card"></div>',
    styles: { padding: "32px" },
    box: { x: 0, y: 0, w: 480, h: 160 },
  },
  createdAt: "2026-10-31T00:00:00Z",
  replies: [],
};
test("draft accepts DOM-only context and rejects malformed annotations", () => {
  const decode = Schema.decodeUnknownSync(Annotation);
  expect(decode(draft)).toEqual(draft);
  for (const change of [
    { version: 2 },
    { status: "unknown" },
    { viewport: { width: "wide", height: 900 } },
    { target: {} },
  ])
    expect(() => decode({ ...draft, ...change })).toThrow();
  expect(annotationJsonSchema).toBeDefined();
});
