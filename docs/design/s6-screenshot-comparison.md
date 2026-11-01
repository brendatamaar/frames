# S6 screenshot comparison

Profile: service. Approved under standing M1 approval.

State map: start local fixtures → load capture adapters → capture → score →
reported; capture failure → recorded failure. Test teardown closes local servers.
No production screenshot workflow or annotation UI is added.

Inputs: Vue/React rendered apps, library/version, browser reference PNG, timing,
PNG output/error and CORS policy. Commands: load library lazily, capture one DOM
root, decode images, compare pixels, record report, release servers. Three timed
runs per library/scene; retain first-run and median times separately.

Invariants: same root/viewport/scale for each pair; no inspector overlay in the
scene; browser reference uses the same root bounds; errors remain visible; no
external asset/proxy service. Use local cross-origin image servers with and
without Access-Control-Allow-Origin. Never disable browser security or use a
third-party CORS proxy.

```ts
real Vite example apps + local asset server
  → browser reference screenshot of capture root
  → lazy modern-screenshot or SnapDOM adapter → PNG and elapsed time
  → canvas-decode reference/output → dimensions and mean pixel error
  → local PNG/JSON artifacts → inspected evidence and choice in spike/results.md
  → teardown → stop all servers
```

Requirements/contracts: each adapter produces an image or explicit failure;
same-origin and CORS-enabled scenes should succeed; no-CORS behavior is measured,
not assumed. Browser canvas decoding supplies image dimensions and pixel error
without adding another image-processing dependency. File artifacts stay local.

Boundary: fixed library enum, browser DOM root, decoded PNG dimensions/pixels and
explicit errors; no executable interpretation of result strings. Expected library
licenses are MIT from registry metadata and must be verified before installation.
Add exact dev-only versions, retaining the inspector's small initial bundle.

Files: test-only lazy capture entry, Playwright comparison spec, tracked numeric
results and documentation. Production integration remains the M2 screenshot task.
