# Annotation format v1

M1 retains the M0 annotation shape as the v1 spike contract. The canonical
definition is `src/schema.ts`; `annotationJsonSchema` exports its JSON Schema.
The `types` entry emits no runtime imports. The `schema` entry requires Effect.

Required fields are version (1), id, status, comment, route, viewport, target,
createdAt and replies. Status is pending, sent, applied or resolved. Replies hold
id, comment and createdAt. Screenshot is an optional project-relative path.

Target contains selector, HTML, computed-style name/value strings and box
coordinates x/y/w/h. Optional source contains file, line and column. Frames'
inspector produces root-relative source paths and positive, one-based safe-integer
line/column values; its boundary validation is stricter than the broad numeric
and string fields of this schema. Missing source is represented by omission,
while selector/HTML/styles/box remain available. The local UI's source-unavailable
label is not a wire value.

Annotation data is plain JSON, without DOM objects or Effect values. HTML is
inert text for consumers, not markup to execute. CreatedAt values conventionally use ISO timestamps.
Screenshot storage, annotation persistence and agent delivery remain M2 work;
they were not implemented by the spike. Future wire-shape changes must be explicit
and retain a version/migration decision, rather than silently redefining v1.
