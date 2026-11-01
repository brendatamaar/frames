# S2 inspector — Model Functional Effect design

Profile: service

Scope: M1 S2 only. Add hover, selection and a local information readout to the
injected entry. No annotations, screenshots, source stamping or canvas UI.
Use plain TypeScript capabilities, without Effect or a UI framework at runtime.

## State map

- `disabled`: inspect mode off; no hover or selected targets.
- `inspecting { hover, selected }`: optional hovered snapshot and ordered, unique
  selected snapshots.
- `disposed`: terminal; listeners, observers and overlay released.

A TargetSnapshot contains a session-local TargetId, tag, classes, selector, key
computed styles and bounding box. It contains only data, never a DOM node.
The shell owns element references and snapshot validation. This internal model
does not introduce a wire protocol or duplicate the annotation schema.

## Inputs

`Enable`, `Disable`, `Hover { target }`, `Pick { target, shift }`,
`TargetsRemoved { ids }`, `Refreshed { targets }`, `Dispose`.
The shell supplies target snapshots and modifier keys; no browser reads in core.

## Transition table

| From                | Input          | Guard                        | To                            | Commands           |
| ------------------- | -------------- | ---------------------------- | ----------------------------- | ------------------ |
| disabled            | Enable         | always                       | inspecting, empty             | Render             |
| inspecting          | Disable        | always                       | disabled                      | Render             |
| inspecting          | Hover          | always                       | update hover                  | Render             |
| inspecting          | Pick           | shift false                  | replace selection with target | BlockClick, Render |
| inspecting          | Pick           | shift true, already selected | remove target                 | BlockClick, Render |
| inspecting          | Pick           | shift true, new target       | append target                 | BlockClick, Render |
| inspecting          | TargetsRemoved | known IDs                    | remove hover/selection IDs    | Render             |
| inspecting          | Refreshed      | existing target IDs only     | update their snapshots        | Render             |
| disabled/inspecting | Dispose        | always                       | disposed                      | ReleaseOverlay     |

Any other (state, input) pair: no change, no commands.

## Invariants

- `disabledPassesClicks`: disabled never emits BlockClick or retains targets.
- `uniqueSelection`: selected TargetIds are unique after every input sequence.
- `plainClickReplaces`: unmodified Pick produces exactly its one target.
- `shiftClickToggles`: shift Pick toggles that target, preserving the other order.
- `removedTargetsDisappear`: removed targets are absent from hover and selection.
- `refreshNeverSelects`: Refreshed cannot introduce a new selected ID.
- `disposedIsQuiet`: disposed emits no further commands.
- `isolatedOverlay`: styles and UI are inside Shadow DOM; highlight rectangles
  ignore pointer events; browser tests verify host styles are unchanged.
- `singleInstallation`: repeated initialization or host restoration does not
  accumulate listeners/observers (browser lifecycle test).

## Commands

| Command        | Cardinality               | Idempotent         | Produces |
| -------------- | ------------------------- | ------------------ | -------- |
| Render         | one DOM update            | yes for same state | none     |
| BlockClick     | one current capture event | yes                | none     |
| ReleaseOverlay | one cleanup               | yes                | none     |

BlockClick must run synchronously during capture: preventDefault and
stopImmediatePropagation. No asynchronous scheduling between decision and block.

## Call graph

```ts
// Production: dev-only proxy injection
inspector entry → install DOM runtime (shell)
  → attach Shadow DOM toolbar, highlights and readout
  → capture pointer/click → parse snapshot (boundary)
  → step (core) → interpret synchronous commands
    → current event blocker
    → Shadow DOM renderer
  → scroll/resize/DOM replacement → refreshed snapshots/removals → step
  → host removed by HMR → restore single overlay and refresh snapshots
  → document reload → proxy reinjects fresh disabled runtime
  → document teardown → Dispose → release listeners/observers

// Tests
generated inputs with shrinking → step/run (pure core)
snapshot/selector contracts → controlled DOM fixture in real browser
runtime → real click handlers, Shadow DOM, mutations and frame reload in Playwright
six-frame Vue/React HMR probe → inspector asset remains functional
```

## Failures

| Node                 | Failure                             | Class          | Handling                                                                |
| -------------------- | ----------------------------------- | -------------- | ----------------------------------------------------------------------- |
| target boundary      | detached node or non-element target | domain outcome | ignore event or feed TargetsRemoved                                     |
| snapshot boundary    | invalid/non-finite geometry         | domain outcome | reject target without changing selection                                |
| selector boundary    | stale or ambiguous selector         | domain outcome | generate escaped ancestry selector; reject if it cannot identify target |
| DOM adapter          | host replaced during HMR            | escape hatch   | restore overlay and refresh known targets                               |
| script delivery      | restrictive CSP blocks script       | escape hatch   | retain documented S1 limitation; never disable CSP                      |
| renderer/interpreter | impossible command or DOM invariant | die            | surface error and fail browser test                                     |

## Requirements

| Capability       | Live                            | Test                           | Contract                                                                                                                 |
| ---------------- | ------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| target reader    | DOM and computed styles         | real browser fixture           | tag/classes, unique selector, finite box, allowlisted styles, detached-node outcome                                      |
| overlay renderer | Shadow DOM                      | real browser fixture           | hover and selected rectangles, readout, style isolation, no blocked pointer hit testing                                  |
| event runtime    | capture listeners and observers | browser app with real handlers | inspect-off pass-through, inspect-on blocking, modifier selection, scrolling, target removal, host replacement, teardown |

Use narrow plain TypeScript interfaces for shell capabilities. Core properties
need no fakes; DOM contracts use the actual browser APIs instead of DOM mocks.
No dependency is planned for this task. Runtime imports from Effect or
protocol/schema remain forbidden in the inspector.

## Boundary

| Source            | Parser                                   | Produces                 | Rejects                                                 |
| ----------------- | ---------------------------------------- | ------------------------ | ------------------------------------------------------- |
| native event      | composed-path/target and modifier reader | Hover or Pick            | overlay UI events, non-elements, disconnected targets   |
| DOM snapshot      | validated snapshot builder               | TargetSnapshot           | non-finite/negative dimensions or unresolvable selector |
| toolbar           | local toggle action                      | Enable/Disable           | unrelated controls                                      |
| observers         | connected-node and geometry reader       | TargetsRemoved/Refreshed | unknown target IDs                                      |
| document teardown | fixed lifecycle action                   | Dispose                  | unrelated events                                        |

Boundary tests assert accepted-implies-valid, selector round trips and every
rejection. The local toolbar is sufficient for S2; no postMessage listener is
introduced. A future message boundary must have origin and Schema parity tests.

## Files

- `packages/inspector/src/core/inspection.ts`: state, inputs, commands, step/run.
- `packages/inspector/src/shell/inspection.test.ts`: generated properties and
  mutation proof; tests stay outside the scanned functional core.
- `packages/inspector/src/shell/targets.ts`: snapshot, identity and selector adapter.
- `packages/inspector/src/shell/overlay.ts`: isolated renderer and event runtime.
- Existing inspector entry: initialize the dev-only runtime once.
- `spike/playwright/inspector.pw.ts`: real DOM contracts and lifecycle checks.
- `spike/results.md`: evidence and limitations; keep the 50 KiB gzip check green.

## Open questions

Approve before implementation. Proposed simple UI: a fixed Inspect toggle and
readout inside the overlay; ordinary click selects one, Shift-click toggles a
target in the ordered selection, disabling clears selection. Source resolution
remains S4. Capturing at window blocks downstream app handlers; handlers that
already ran earlier on the same capture target cannot be retroactively blocked.
