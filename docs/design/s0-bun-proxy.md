# S0 Bun proxy — Model Functional Effect design

Profile: service

Scope: only M1 S0. Prove Bun proxying before the CLI and full inspector in S1.
M0 gate evidence: PLAN.md M0-gate records clean-clone checks and all example servers.

## State map

Request policy is stateless: `ProxyState = { tag: "ready" }`.
Connection and server lifetimes belong to scoped shell resources.
Failed startup, cancellation, partial upstream bodies and closed sockets release
their resources; they do not create persistent domain states.

## Inputs

`HttpRequest`: validated method, path, headers and configured upstream origin.
`HttpResponse`: status, headers and proxy origin, without consuming its body.
`UpgradeRequest`: validated WebSocket protocols, path and origin.
Untrusted wire values are parsed in the shell before entering the core.

## Transition table

| From state | Input          | Guard              | To state | Commands        |
| ---------- | -------------- | ------------------ | -------- | --------------- |
| ready      | HttpRequest    | valid request      | ready    | ForwardHttp     |
| ready      | HttpResponse   | HTML content type  | ready    | InjectHtml      |
| ready      | HttpResponse   | other content type | ready    | StreamBody      |
| ready      | UpgradeRequest | valid upgrade      | ready    | BridgeWebSocket |

Any other (state, input) pair: no change, no commands.
Pure policy calculates header edits, upstream URLs and response plans;
commands describe work, never perform IO.

## Invariants

- `htmlOnly`: injection is selected only for HTML responses with a body.
- `sameOriginRedirect`: upstream-origin redirects map to proxy origin; external redirects stay intact.
- `cookieIsolation`: cookie rewriting preserves values and security flags, removes upstream Domain, and preserves separate Set-Cookie fields.
- `websocketProtocols`: requested protocol order and upstream-selected protocol survive the bridge.
- `noHopHeaders`: connection-specific headers are excluded from forwarded HTTP traffic.
- `stableState`: arbitrary valid input sequences preserve ready state.

Each named invariant gets a property test using generated combinations;
socket ordering, cleanup and browser behavior get integration tests.

## Commands

| Command         | Cardinality                     | Idempotent                | Produces                        |
| --------------- | ------------------------------- | ------------------------- | ------------------------------- |
| ForwardHttp     | one response per request        | no (method dependent)     | HttpResponse or ProxyFailure    |
| InjectHtml      | one body                        | yes for one supplied body | response bytes or ProxyFailure  |
| StreamBody      | stream                          | no (consumes body)        | completion or ProxyFailure      |
| BridgeWebSocket | stream until either peer closes | no                        | messages, close or ProxyFailure |

No automatic retries or caches. A POST must never be replayed on transport failure.

## Call graph

```ts
// Spike harness (production adapter)
scoped harness
  → ProxyService.bun.start (bind 127.0.0.1, port allocated by OS)
    → parse request → pure policy
    → forward fetch with manual redirects
    → parse response → pure response policy
      → decode compressed HTML → inject marker script → repair body headers
      → stream non-HTML unchanged
    → WebSocket bridge → upstream socket → downstream socket
  → scope close → abort fetches, close both socket peers, stop server

// Tests
policy properties → pure policy
ProxyService contract → Layer fake + real Bun adapter against local HTTP/WS fixture
browser harness → Vue/React Vite servers → real proxy → six framed apps
```

## Failures

| Node       | Failure                                          | Class          | Handling                                                                    |
| ---------- | ------------------------------------------------ | -------------- | --------------------------------------------------------------------------- |
| boundary   | invalid URL, method or upgrade                   | domain outcome | explicit 400; startup config error                                          |
| listener   | port unavailable                                 | escape hatch   | tagged ProxyStartError, close partial resources                             |
| fetch/body | upstream unavailable, disconnect, decode error   | escape hatch   | tagged ProxyUpstreamError; 502 before headers, terminate body after headers |
| WebSocket  | handshake failure, protocol mismatch, peer close | escape hatch   | fail handshake or close both peers with explicit reason                     |
| scope      | interruption                                     | domain outcome | guaranteed cleanup without retry                                            |
| policy     | impossible internal value                        | die            | surface defect and fail test                                                |

Lower-level errors become tagged service errors; logs must omit cookie values.
Timeouts are bounded shell configuration and close resources, without retries.

## Requirements

| Capability    | Live                                           | Test                              | Contract                                                                                                                                                                     |
| ------------- | ---------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ProxyService  | scoped Bun primitives behind service interface | Layer fake and real local fixture | HTML gzip/brotli/deflate injection, binary passthrough, redirects, duplicate cookies, headers, upstream failure, WebSocket protocol/message ordering/close, shutdown cleanup |
| DevServer     | scoped child processes                         | Layer fixture                     | start ready, startup failure, stop child tree on interruption                                                                                                                |
| Browser probe | local browser driver                           | real browser                      | six concurrent frames, rendered app readiness, Vue and React HMR without frame reload                                                                                        |

Contracts run locally without credentials or external targets. Bun APIs appear
only in daemon shell platform adapters. Check installed Effect typings before
implementing service and Scope calls. No new dependency without license review.

## Boundary

| Source              | Parser                              | Produces                  | Rejects                                           |
| ------------------- | ----------------------------------- | ------------------------- | ------------------------------------------------- |
| config URL          | URL parser + http(s) protocol check | validated upstream origin | credentials, non-http schemes, malformed URL      |
| HTTP request        | method/path/header parser           | HttpRequest               | malformed target and invalid headers              |
| upstream response   | status/content-type/header parser   | HttpResponse              | malformed encoding or unsupported compressed HTML |
| WebSocket handshake | header/token parser                 | UpgradeRequest            | invalid protocol tokens or malformed upgrade      |
| probe output        | explicit result validation          | gate result               | missing assertions or unfinished browser run      |

Parser tests cover valid round trips, accepted-implies-valid and each rejection.
Use synthetic local fixtures for compression and cookie tests. Strip X-Frame-Options
and CSP frame-ancestors for framed dev responses while preserving other CSP directives.
Decode HTML exactly once (verify Bun fetch decompression behavior), then remove
stale Content-Encoding, Content-Length and validators after mutation.

## Files

- `packages/daemon/src/core/proxy-policy.ts` and property tests.
- `packages/daemon/src/shell/proxy-service.ts`: capability and tagged errors.
- `packages/daemon/src/shell/bun-proxy.ts` and real-server contract tests.
- `spike/proxy-gate.*`: scoped local fixture and six-frame browser harness.
- `spike/results.md`: runtime versions, commands, evidence and failures.

Start with policy properties and fake service contracts, then real adapter and
browser evidence. S0 may use minimal browser automation to establish its own gate;
S0b separately records the supported full Playwright setup. No canvas work.

## Open questions

Approve this S0 design before implementation. No additional product decision is
needed: use an injected marker for S0, defer the inspector to S1/S2. If Bun fails
the gate, record the failure and implement the planned Node service fallback.
