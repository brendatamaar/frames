# M1 spike results

## S0 — Bun proxy

Measured 2026-11-01 on Windows, Bun 1.3.14, Node 22.22.3 and
Microsoft Edge 156.0.4314.50. No new dependency added for S0.

| Criterion                        | Evidence                                                                                                                                            | Result |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Vue HMR through a framed proxy   | Six frames receive a source edit over proxy WebSockets; heading updates and document identity stays unchanged                                       | PASS   |
| React HMR through a framed proxy | Same six-frame check using Fast Refresh; no direct-to-Vite WebSocket fallback                                                                       | PASS   |
| Compressed HTML injection        | Real HTTP fixture with gzip, zlib deflate, brotli and identity; injected marker and stale encoding/validator removal asserted                       | PASS   |
| Redirects and cookies            | Absolute upstream redirect points back to proxy; separate Set-Cookie values, HttpOnly, Secure and SameSite flags preserved; upstream Domain removed | PASS   |
| Six concurrent frames            | Six fully rendered, connected frames in each app, followed by HMR in every frame                                                                    | PASS   |

Reproduce:

```sh
bun test packages/daemon/src/shell/proxy-policy.test.ts packages/daemon/src/shell/bun-proxy.test.ts
node spike/proxy-gate.mjs
make check
```

The browser harness defaults to installed Edge on Windows. Set FRAMES_BROWSER
to a local Chromium executable on other platforms. Browser profiles are local
generated artifacts under `.frames/dist/`; child process trees are stopped and
all temporary source edits are restored in finally blocks.

### Findings and limits

- Bun HTTP fetch and WebSocket bridging pass the S0 gate; no Node proxy fallback
  is needed. Bun's node:zlib compatibility module handles standard HTTP deflate:
  Bun.inflateSync rejected the zlib-wrapped test payload with `invalid stored
  block lengths`. gzip and brotli also have real-response coverage.
- The React scaffold entry exports no components, so editing it normally causes
  a Vite document reload. The browser probe temporarily exports App before startup
  to exercise Fast Refresh, then restores the exact original file.
- Additional integration coverage checks binary compressed passthrough, POST
  forwarding without replay, invalid compressed bodies returning 502, the Vite
  subprotocol, ordered text/binary socket messages and scoped server/socket cleanup.
- S0 injects a marker, not the inspector. HTML is treated as UTF-8. Inline-script
  CSP restrictions and non-UTF-8 documents are not proven by this spike; S1 must
  account for its actual inspector delivery. Default listener is loopback only.
- S0 browser probing uses Node CDP with the installed browser; S0b records its
  separate Playwright compatibility decision below. Source accuracy is not measured
  until S5. The overall M1 gate remains pending.

## S0b — Playwright compatibility

Measured 2026-11-01 with @playwright/test 1.64.1 and the same local Edge browser.

- `bun --bun node_modules/@playwright/test/cli.js test --config spike/playwright.config.ts`
  failed before test collection: `AggregateError: 2 errors building` the test
  module, then `No tests found`. Direct Bun compilation of the module succeeded;
  this is a runner compatibility observation, not a TypeScript syntax failure.
- Running the same Playwright runner through Node 22.22.3 passed: one test starts
  a loopback HTTP fixture, opens its page, clicks a button, checks the changed DOM
  and verifies there were no page errors. The test asserts it runs in Node.
- Decision: keep Node as the test-only Playwright runtime, as permitted by S0b.
  Run `bun run e2e`. S0's six-frame probe remains reproducible through CDP.
- Added exact @playwright/test 1.64.1 dev dependency. Registry metadata for it,
  playwright and playwright-core reports Apache-2.0, compatible with MIT. Use
  installed Edge (or FRAMES_BROWSER); no browser download is needed.

## S1 — Proxy command and injector

Measured 2026-11-01 with the S0 runtime/browser versions.

```sh
bun run build
bun run packages/daemon/src/cli.ts proxy http://127.0.0.1:5173
# Or: bun run packages/daemon/dist/cli.js proxy http://127.0.0.1:5173
bun run e2e
```

- The command prints an OS-allocated loopback URL and serves the built inspector
  at `/__frames/inspector.js`. Only HTML receives the external script reference.
  GET/HEAD work on the asset; other methods get 405 and unknown reserved paths
  get 404. No general-purpose filesystem serving is introduced.
- Playwright verifies the bundled CLI and asset path: both a parent document and
  its iframe load the inspector with HTTP 200 under `script-src 'self'`. Upstream
  X-Frame-Options and CSP frame-ancestors are removed while the other CSP rules
  survive; the inspector request does not reach the upstream server.
- Lifecycle property tests cover single startup, announcement only after
  acquisition, and quiet terminal states. Removing the terminal guard made its
  property fail; the restored implementation passes. Layer tests cover missing
  assets, startup failure, normal shutdown, cancellation during startup and signal
  subscription cleanup. Real HTTP/WS contracts remain green.
- `make check` passes (36 tests and all builds); `bun run e2e` passes two browser
  tests. The explicit Functional Effect scan reports the new lifecycle core pure.
- With FRAMES_GATE_CLI=1, `node spike/proxy-gate.mjs` starts the built CLI instead
  of the S0 test host. Six Vue frames and six React frames each load the local
  inspector asset, use only proxied WebSockets, receive HMR edits and retain their
  document identities. Both app probes pass; temporary source edits are restored.
- No new dependencies. The inspector still contains the M0 stub: hover and click
  behavior belong to S2. Production NODE_ENV is rejected. Restrictive script CSP
  policies remain enforced; non-UTF-8 HTML is still unproven. Binary embedding is
  deliberately left for M2.

## S2 — Inspector

Measured 2026-11-01 with the S0 runtime/browser versions. No new dependencies.

- Inspect toggles a Shadow DOM overlay. Hover shows an outline; clicking selects
  one element and Shift-click toggles additional elements. The readout reports
  tag, classes, selector, key computed styles and bounding box. Disabling clears
  targets and restores ordinary app clicks.
- The pure inspection model has generated sequence tests with shrinking for
  disabled click pass-through, unique selections, ordinary/modified clicks,
  removal, snapshot refresh and terminal disposal. Removing the disposal guard
  made the tests fail; restoring it passed. The explicit purity scan passes.
- Real-browser tests verify selector round trips (including escaped and duplicate
  IDs), stable node identity, rejected detached/shadow-root targets and invalid
  geometry. They verify capture-phase click blocking, unchanged host styles,
  pointer-transparent highlights, scroll refresh, target removal, host restoration,
  duplicate script injection, full reload and teardown. Rendered preview inspected
  locally at `.frames/dist/inspector-preview.png`.
- `make check` passes 44 tests, all builds and the inspector size gate. Inspector
  bundle is 2,954 bytes gzip against the 51,200-byte limit. `bun run e2e` passes
  five real-browser tests.
- FRAMES_GATE_CLI=1 with `node spike/proxy-gate.mjs` passes for Vue and React:
  six frames per app retain one enabled inspector and working selection after
  HMR, with unchanged document identities and no direct Vite WebSocket fallback.
- No postMessage surface is introduced. App-owned shadow-root targets, restrictive
  style CSP and capture handlers that ran before the inspector on the same window
  remain limitations. Source lookup and screenshots remain S4 and S6; the overall
  M1 source-accuracy gate is still pending.

## S3 — Source stamping

Measured 2026-11-01 with the S0 runtime/browser versions. The chosen original AST
transforms and candidate review are documented in docs/source-mapping.md.

- Dev Vue/React native elements receive root-relative data-frames-file and
  one-based data-frames-line / data-frames-column attributes. Component wrappers
  are skipped to preserve native descendants' actual locations. No inspector
  client, editor middleware or agent integration is added to the Vite plugin.
- Compiler contracts cover LF/CRLF, nested/list/conditional/slot/fragment content,
  native/component distinctions, existing marker attributes, escaping, rejected
  syntax and source-map positions after insertion. Removing the native-tag guard
  made the property test fail; restored code and explicit purity scan pass.
- `make check` passes 54 tests and all builds. `bun run e2e` passes nine tests,
  including six sampled native nodes per app and scans showing no stamps or
  inspector code in production bundles. `node scripts/node-smoke.mjs` exercises
  the compiled Vue/React transforms, disabled production mode and SSR exclusion.
- FRAMES_GATE_CLI=1 with `node spike/proxy-gate.mjs` passes: six frames per app
  receive HMR edits that move a heading onto a new line, update its file/line/column
  stamps, preserve document identities and retain working inspector selection.
- Direct dependencies: @vue/compiler-sfc and @vue/compiler-dom 3.5.44 (MIT),
  magic-string 0.30.21 (MIT), TypeScript 5.9.3 (Apache-2.0). Test-only source-map-js
  1.2.2 is BSD-3-Clause. All were already installed transitively and checked for
  compatible licenses before direct declaration; Effect is unchanged.
- Unsupported/external Vue templates emit diagnostics; dependencies, outside-root
  modules, SSR, query/raw modules and non-JSX render functions are not stamped.
  DOM fallback consumption belongs to S4. These S3 samples do not replace S5's
  20-click-per-app measurement; the overall M1 source-accuracy gate remains pending.

## S4 — Clicked source and DOM fallback

- Inspector snapshots/readout now include validated direct-element source stamps
  and HTML trimmed to at most 4,096 characters. Missing, partial or malformed
  stamps retain DOM context and report source unavailable; ancestors are not used.
- `make check` passed 57 tests and all builds; `bun run e2e` passed ten browser
  tests. Attribute mutation refresh, bounded fallback, ancestor exclusion and
  text-only rendering are covered. Successful sources fit the unchanged protocol
  Schema; no Effect runtime enters the inspector.
- The HTML-bound mutation was caught; restored tests and core purity scan pass.
  Inspector gzip is 3,391 bytes. No dependency added.
- Six-frame Vue/React HMR probes verify the inspector readout, updated source
  positions and changed HTML after HMR. S5 remains the full accuracy measurement.

<!-- source-measurement:start -->
## S5 — Source accuracy measurement

Measured 2026-11-01 using Playwright, real pointer clicks, the built CLI proxy and the current Vue/React fixtures. Added static Details components so each app has 20 distinct native targets. Expected locations use fixed source anchors, not DOM stamp values. All failures remain in the denominator.

### vue: 20/20 (100%)

| Target                      | Expected file:line:column | Resolved file:line:column | Result |
| --------------------------- | ------------------------- | ------------------------- | ------ |
| `main`                      | src/App.vue:9:11          | src/App.vue:9:11          | PASS   |
| `h1`                        | src/App.vue:9:17          | src/App.vue:9:17          | PASS   |
| `article`                   | src/Card.vue:1:11         | src/Card.vue:1:11         | PASS   |
| `h2`                        | src/Card.vue:1:20         | src/Card.vue:1:20         | PASS   |
| `article button`            | src/App.vue:9:49          | src/App.vue:9:49          | PASS   |
| `article ul`                | src/App.vue:9:106         | src/App.vue:9:106         | PASS   |
| `article li:nth-child(1)`   | src/App.vue:9:125         | src/App.vue:9:125         | PASS   |
| `article li:nth-child(2)`   | src/App.vue:9:125         | src/App.vue:9:125         | PASS   |
| `article li:nth-child(3)`   | src/App.vue:9:125         | src/App.vue:9:125         | PASS   |
| `#review`                   | src/Details.vue:2:3       | src/Details.vue:2:3       | PASS   |
| `#review h3`                | src/Details.vue:3:5       | src/Details.vue:3:5       | PASS   |
| `#review p`                 | src/Details.vue:4:5       | src/Details.vue:4:5       | PASS   |
| `#review strong`            | src/Details.vue:4:24      | src/Details.vue:4:24      | PASS   |
| `#review dl`                | src/Details.vue:5:5       | src/Details.vue:5:5       | PASS   |
| `#review dt:nth-of-type(1)` | src/Details.vue:6:7       | src/Details.vue:6:7       | PASS   |
| `#review dd:nth-of-type(1)` | src/Details.vue:7:7       | src/Details.vue:7:7       | PASS   |
| `#review dt:nth-of-type(2)` | src/Details.vue:8:7       | src/Details.vue:8:7       | PASS   |
| `#review dd:nth-of-type(2)` | src/Details.vue:9:7       | src/Details.vue:9:7       | PASS   |
| `#review footer`            | src/Details.vue:11:5      | src/Details.vue:11:5      | PASS   |
| `#review a`                 | src/Details.vue:11:13     | src/Details.vue:11:13     | PASS   |

### react: 20/20 (100%)

| Target                      | Expected file:line:column | Resolved file:line:column | Result |
| --------------------------- | ------------------------- | ------------------------- | ------ |
| `main`                      | src/main.tsx:18:5         | src/main.tsx:18:5         | PASS   |
| `h1`                        | src/main.tsx:19:7         | src/main.tsx:19:7         | PASS   |
| `article`                   | src/main.tsx:9:5          | src/main.tsx:9:5          | PASS   |
| `h2`                        | src/main.tsx:10:7         | src/main.tsx:10:7         | PASS   |
| `article button`            | src/main.tsx:22:11        | src/main.tsx:22:11        | PASS   |
| `article ul`                | src/main.tsx:27:11        | src/main.tsx:27:11        | PASS   |
| `article li:nth-child(1)`   | src/main.tsx:30:17        | src/main.tsx:30:17        | PASS   |
| `article li:nth-child(2)`   | src/main.tsx:30:17        | src/main.tsx:30:17        | PASS   |
| `article li:nth-child(3)`   | src/main.tsx:30:17        | src/main.tsx:30:17        | PASS   |
| `#review`                   | src/Details.tsx:3:5       | src/Details.tsx:3:5       | PASS   |
| `#review h3`                | src/Details.tsx:4:7       | src/Details.tsx:4:7       | PASS   |
| `#review p`                 | src/Details.tsx:5:7       | src/Details.tsx:5:7       | PASS   |
| `#review strong`            | src/Details.tsx:6:25      | src/Details.tsx:6:25      | PASS   |
| `#review dl`                | src/Details.tsx:8:7       | src/Details.tsx:8:7       | PASS   |
| `#review dt:nth-of-type(1)` | src/Details.tsx:9:9       | src/Details.tsx:9:9       | PASS   |
| `#review dd:nth-of-type(1)` | src/Details.tsx:10:9      | src/Details.tsx:10:9      | PASS   |
| `#review dt:nth-of-type(2)` | src/Details.tsx:11:9      | src/Details.tsx:11:9      | PASS   |
| `#review dd:nth-of-type(2)` | src/Details.tsx:12:9      | src/Details.tsx:12:9      | PASS   |
| `#review footer`            | src/Details.tsx:14:7      | src/Details.tsx:14:7      | PASS   |
| `#review a`                 | src/Details.tsx:15:9      | src/Details.tsx:15:9      | PASS   |

Reproduce: `bun run e2e`, then `node spike/render-measurement.mjs`. Raw expected/actual rows are in spike/source-results.json. The initial measurement harness used an ambiguous button selector that also matched the inspector toggle; it was corrected to article button before recording these results. No resolution failure was filtered out.

The file:line gate passes in each app separately. This measures these fixtures, not arbitrary repositories, unsupported frameworks or third-party internals.

<!-- source-measurement:end -->
