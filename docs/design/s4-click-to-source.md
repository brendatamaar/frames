# S4 click to source — Model Functional Effect design

Profile: service

Scope: M1 S4 only. Enrich the existing inspector snapshots/readout with source
locations and bounded DOM snippets. S5 owns the full accuracy measurement.

## State map

Existing `disabled`, `inspecting { hover, selected }` and `disposed` states remain.
Each target snapshot gains a context value:

- `stamped { source, html }`: complete, valid stamp on this exact element.
- `domOnly { reason, html }`: missing or invalid stamp, with DOM context retained.

SourceLocation is a type-only alias of the protocol Annotation target source;
do not redefine the wire shape or import Schema/Effect into the inspector.

## Inputs

The existing Hover, Pick and Refreshed inputs carry enriched TargetSnapshots.
The shell reads the three stamp attributes and outerHTML at capture/refresh time.
Its parsed StampResult is valid, missing or invalid; the pure context projection
combines that result with bounded HTML. DOM references never enter core state.

## Transition table

| Existing input  | Context outcome       | State change                             | Commands                   |
| --------------- | --------------------- | ---------------------------------------- | -------------------------- |
| Hover/Pick      | valid direct stamp    | existing transition with stamped context | existing Render/BlockClick |
| Hover/Pick      | missing/invalid stamp | existing transition with domOnly context | existing Render/BlockClick |
| Refreshed       | updated stamp or HTML | replace context for known target IDs     | existing Render            |
| TargetsRemoved  | any                   | remove the target as in S2               | existing Render            |
| Disable/Dispose | any                   | clear targets/release resources as in S2 | existing commands          |

The existing transition guards remain unchanged. Unhandled (state, input) pairs
produce no change and no commands. No new lifecycle, timer or persistent cache.

## Invariants

- `directStampOnly`: never inherit a source from an ancestor or framework internals.
- `validPositions`: stamped line/column are positive safe integers; file is a
  nonempty root-relative path without traversal, absolute prefix or NUL.
- `fallbackKeepsContext`: missing or malformed stamps do not reject an otherwise
  valid target, clear selection, or lose selector/styles/box/HTML.
- `boundedHtml`: HTML is at most 4,096 characters, trimmed and marked with an
  ellipsis when truncated; short snippets retain their original content.
- `freshContext`: refresh uses current attributes and HTML, including transitions
  between stamped and DOM-only after an HMR update or attribute removal.
- `textOnlyReadout`: HTML and source strings render as text; never execute markup.
- `protocolCompatible`: every successfully parsed source is accepted by the
  existing annotation Schema. The parser is intentionally stricter about paths
  and positive positions than the M0 draft Schema.

Add generated boundary/context properties with shrinking and mutation proof;
retain all S2 selection invariants with enriched snapshots.

## Commands

No new core command variants. DOM reads happen in the target-reader capability;
the pure projection produces context data for existing Render commands.
Capture is one value per read; observer refresh remains the existing event stream.
No writes, network, retries, file reads or cache are introduced.

## Call graph

```ts
// Production: existing injected inspector
capture event/observer
  → target reader → geometry/selector validation (existing boundary)
  → read direct data-frames-file/line/column and outerHTML
  → stamp parser (boundary) → valid/missing/invalid
  → bounded context projection (core)
  → existing inspection step → Render enriched snapshot as text

// Tests
generated stamps/snippets → boundary/context properties and mutation proof
valid source results → protocol Schema compatibility test outside inspector package
real Vue/React plugin + proxy → click stamped DOM → inspector file/line/column
unstamped/malformed/third-party-like DOM → click → retained snippet fallback
HMR → moved source positions/changed HTML → refreshed readout
```

## Failures

| Node               | Failure                                | Class          | Handling                               |
| ------------------ | -------------------------------------- | -------------- | -------------------------------------- |
| stamp parser       | absent attributes                      | domain outcome | domOnly, reason missing                |
| stamp parser       | partial/invalid path or position       | domain outcome | domOnly, reason invalid                |
| target reader      | detached/unresolvable/invalid geometry | domain outcome | preserve S2 rejection/removal behavior |
| context projection | oversized HTML                         | domain outcome | bounded prefix and ellipsis            |
| renderer           | impossible context                     | die            | surface defect; fail browser test      |

No guessing from a nearby component: a missing direct source remains explicitly
unavailable. This makes the S5 failure count meaningful.

## Requirements

| Capability             | Live                                    | Test                        | Contract                                                                                        |
| ---------------------- | --------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------- |
| stamp reader/parser    | direct DOM attributes and strict parser | generated values + real DOM | complete/partial/missing attributes, positive integers, safe relative paths, ancestor exclusion |
| HTML reader            | element.outerHTML                       | real DOM fixture            | short/long/text-sensitive markup, refresh after mutation                                        |
| renderer               | existing Shadow DOM                     | real browser                | source readout, snippet fallback, no HTML execution, unchanged app styles/click behavior        |
| protocol compatibility | existing Schema in test only            | real Schema decode          | every accepted inspector source fits the annotation target shape                                |

No new dependency. Inspector runtime remains vanilla TypeScript with only
type-only protocol imports. New tests retain the bundle-size guard.

## Boundary

| Source                     | Parser                                   | Produces             | Rejects                                                                                 |
| -------------------------- | ---------------------------------------- | -------------------- | --------------------------------------------------------------------------------------- |
| three DOM stamp attributes | strict stamp parser                      | StampResult          | partial attributes, non-decimal/fractional/unsafe/zero/negative positions, unsafe paths |
| outerHTML                  | existing DOM read + pure size projection | bounded snippet      | no executable interpretation; long content is truncated                                 |
| protocol type              | type-only import                         | SourceLocation alias | runtime Schema imports into inspector                                                   |

Boundary properties cover valid round trips, accepted-implies-valid and each
rejection. Schema compatibility tests belong outside the inspector package to
respect its runtime-import lint rule. No postMessage listener is introduced.

## Files

- Existing inspector core snapshot: add the context union and pure bounded projection.
- `packages/inspector/src/shell/source.ts`: strict attribute parser/DOM reader.
- Inspector target reader/overlay: enrich and display without changing selection rules.
- Inspector shell tests: generated boundary/context properties, S2 regression tests.
- Protocol test: successful-source compatibility with the unchanged Schema.
- Browser tests/probe: clicked Vue/React source, explicit fallback and HMR refresh.
- docs/source-mapping.md and spike/results.md: observed results and limitations.

## Open questions

Approve before implementation. Proposed policy: exact-element stamps only;
always retain a bounded HTML snippet; show source unavailable for missing/invalid
stamps. No ancestor inference, source-file reading or new messaging API. The M0
annotation Schema remains unchanged; this reader validates a stricter subset.
