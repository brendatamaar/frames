# S5 source measurement

Profile: service. Approved under the user's standing M1 approval.

State map: starting local servers → ready → measuring 20 cases per app → reported;
startup/browser failures → failed. Test hooks release every server/process on exit.
No production lifecycle or domain logic is introduced.

Inputs: fixed case manifest, independent original source text, real pointer hits,
and the inspector's rendered context. Commands: start Vite/proxy, click, read
readout, write local report, close resources. Each command returns one value;
browser events form a stream. No retries of source edits or result filtering.

The existing fixtures have nine native nodes each. Add one static nested details
component per app, yielding 20 distinct targets including slot/Radix children,
conditional lists and nested typography/definition-list/footer nodes.

Invariants: exactly 20 distinct cases per app; expected locations come from a
fixed source-token manifest, never stamp attributes; only actual pointer clicks
count; missing/incorrect resolutions stay in the denominator. Gate requires at
least 18 correct file/line pairs in each app separately. Record columns as well.

```ts
// Real test harness
manifest + original files → expected file/line/column
  → Vite + built CLI proxy → browser → enable inspector
  → locate exposed point on each exact target → pointer click
  → rendered inspector JSON → compare expected/actual
  → ignored JSON artifact → reviewed table in spike/results.md
  → afterAll → close Vite servers and proxy processes
```

Capabilities/contracts: real Vite and proxy startup/shutdown; real browser click
hit testing; source-token lookup rejects absent/ambiguous anchors; report retains
every failure. Startup errors fail the run, unclickable or unresolved cases are
recorded failures, and mismatches fail the gate only after all cases are reported.
Only loopback fixtures are used; no new dependency or external service.

Boundary: fixed selector/file/token manifest; source files read by Node; browser
readout parsed as JSON and checked for a source object. Reports are generated under
.frames/dist and copied into tracked evidence only after review. No M2 work.

Files: Vue/React Details components and imports, Playwright measurement spec,
spike/source-results.json, and results/progress documentation.
