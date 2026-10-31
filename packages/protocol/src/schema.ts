import { Schema } from "effect";

const Point = Schema.Struct({
  x: Schema.Number,
  y: Schema.Number,
  w: Schema.Number,
  h: Schema.Number,
});
export const Annotation = Schema.Struct({
  version: Schema.Literal(1),
  id: Schema.String,
  status: Schema.Literals(["pending", "sent", "applied", "resolved"]),
  comment: Schema.String,
  route: Schema.String,
  viewport: Schema.Struct({ width: Schema.Number, height: Schema.Number }),
  target: Schema.Struct({
    selector: Schema.String,
    source: Schema.optional(
      Schema.Struct({
        file: Schema.String,
        line: Schema.Number,
        column: Schema.Number,
      }),
    ),
    html: Schema.String,
    styles: Schema.Record(Schema.String, Schema.String),
    box: Point,
  }),
  screenshot: Schema.optional(Schema.String),
  createdAt: Schema.String,
  replies: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      comment: Schema.String,
      createdAt: Schema.String,
    }),
  ),
});
export const annotationJsonSchema = Schema.toJsonSchemaDocument(Annotation);
