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
