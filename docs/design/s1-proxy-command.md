# S1 proxy command — Model Functional Effect design

Profile: service

Scope: M1 S1 only. Expose the proven S0 adapter as `frames proxy <url>` and serve
the built inspector entry. Inspector interactions remain S2.

## State map

- `idle`: no owned resources.
- `loading { upstream }`: loading the built inspector asset.
- `starting { upstream }`: scoped proxy acquisition in progress.
- `serving { origin }`: listener and its connections owned by the scope.
- `stopped`: terminal, all resources released.
- `failed { reason }`: terminal, actionable error reported and resources released.

## Inputs

`Start { upstream }`, `AssetLoaded { script }`, `Started { origin }`,
`StopRequested`, `Failed { reason }`. Origins use the S0 validated Origin type.
Signals and IO outcomes enter through the shell. Empty/malformed CLI input is
rejected before entering the core.

## Transition table

| From                          | Input         | Guard                  | To       | Commands                  |
| ----------------------------- | ------------- | ---------------------- | -------- | ------------------------- |
| idle                          | Start         | validated origin       | loading  | LoadInspector             |
| loading                       | AssetLoaded   | built script available | starting | StartProxy                |
| starting                      | Started       | acquired listener      | serving  | AnnounceOrigin            |
| idle/loading/starting/serving | StopRequested | always                 | stopped  | ReleaseScope              |
| loading/starting/serving      | Failed        | always                 | failed   | ReportError, ReleaseScope |

Any other (state, input) pair: no change, no commands. No retries. Late acquisition
results after cancellation are ignored by the core and released by the scope.

## Invariants

- `startOnce`: an input sequence emits at most one StartProxy.
- `announceAfterAcquisition`: AnnounceOrigin occurs only following Started.
- `terminalIsQuiet`: stopped/failed states never emit further commands.
- `releaseOnExit`: every acquired listener closes on signal, failure or interruption
  (shell lifecycle test in addition to core properties).
- `assetIsReserved`: the inspector route is served locally and never forwarded;
  only HTML references the inspector (real HTTP contract).
- `loopbackOnly`: this command never accepts a public bind address (CLI boundary
  test and real listener test).

## Commands

| Command        | Cardinality         | Idempotent | Produces              |
| -------------- | ------------------- | ---------- | --------------------- |
| LoadInspector  | one                 | yes        | AssetLoaded or Failed |
| StartProxy     | one scoped resource | no         | Started or Failed     |
| AnnounceOrigin | one                 | no         | none                  |
| ReportError    | one                 | no         | none                  |
| ReleaseScope   | one                 | yes        | none                  |

## Call graph

```ts
// Production
frames proxy <url>
  → parse CLI and origin (boundary)
  → lifecycle step (core)
  → InspectorAssetService.live → built inspector.js
  → ProxyService.bun.start (existing S0 scoped adapter)
    → /__frames/inspector.js → local script response
    → upstream HTTP/WS → S0 pure policy
    → HTML injector → reference local inspector script
  → report loopback origin → await SIGINT/SIGTERM
  → close Effect scope → listener and connection cleanup

// Tests
generated lifecycle inputs → step/run (core)
same asset contract → Layer fake and filesystem adapter with local fixture
CLI subprocess → real local HTTP/WS target → signal/failure → port released
browser gate → six framed Vue/React apps → HMR preserved
```

## Failures

| Node            | Failure                              | Class          | Handling                                                  |
| --------------- | ------------------------------------ | -------------- | --------------------------------------------------------- |
| CLI parser      | malformed input or non-origin URL    | domain outcome | usage and nonzero exit                                    |
| asset loader    | missing or unreadable build          | escape hatch   | Failed with instruction to run bun run build; close scope |
| proxy startup   | invalid port or unavailable listener | escape hatch   | translate ProxyStartError to Failed and nonzero exit      |
| request adapter | upstream failure                     | escape hatch   | existing S0 502/connection-close behavior                 |
| signal handler  | cancellation                         | domain outcome | StopRequested and guaranteed scope finalization           |
| interpreter     | impossible command/state mismatch    | die            | surface defect without disguising as an upstream failure  |

## Requirements

| Capability            | Live                                           | Test                             | Contract                                                                            |
| --------------------- | ---------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------- |
| InspectorAssetService | filesystem loader                              | Layer fake                       | available asset, missing asset, read failure; no unrelated files served             |
| ProxyService          | existing Bun layer with inspector asset option | Layer fake and real local server | startup, reserved asset, HTML injection, non-HTML passthrough, failure and shutdown |
| CLI runtime           | process stdout/stderr and signal subscription  | subprocess fixture               | usage, version regression, announced origin, exit status, SIGINT cleanup            |

All contracts run against local fixtures without credentials. No new dependency
is planned. Verify Effect APIs against installed definitions before use.

## Boundary

| Source          | Parser                          | Produces                           | Rejects                                                                                 |
| --------------- | ------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------- |
| argv            | command parser + S0 parseOrigin | version or validated proxy command | unknown command, extra/missing args, credentials, non-http schemes, path/query/fragment |
| asset file      | loader of fixed built path      | script string                      | missing/empty script or read error                                                      |
| proxy result    | typed service adapter           | Started                            | acquisition error translated to Failed                                                  |
| process signals | fixed signal mapping            | StopRequested                      | other events have no domain effect                                                      |

Boundary tests cover valid round trips, accepted-implies-valid and each rejected
rule. The fixed inspector URL is not user-supplied markup. Preserve CSP directives
other than frame-ancestors; explicitly test a same-origin script-src policy and
record restrictive script policies as a limitation rather than disabling CSP.

## Files

- `packages/daemon/src/core/proxy-command.ts`: lifecycle step/run.
- `packages/daemon/src/shell/proxy-command.test.ts`: generated invariant properties
  with shrinking, boundary tests and mutation proof.
- `packages/daemon/src/shell/inspector-asset.ts`: service, live loader and contract.
- `packages/daemon/src/shell/proxy-command.ts`: interpreter and scoped lifecycle.
- Existing CLI and Bun adapter: wiring and fixed inspector route only.
- `spike/results.md`: S1 reproduction commands, evidence and limitations.

## Open questions

Approved by the user on 2026-11-01. Defaults: OS-allocated port,
print its loopback URL, require an origin URL (matching S0), serve the existing
built inspector stub until S2. Binary asset embedding stays in M2 as planned.

Implementation notes: process signals race the workflow and interrupt pending
acquisition. ReleaseScope is interpreted by returning from that race and closing
the enclosing Effect scope. The CLI rejects proxy mode when NODE_ENV=production.
The reserved inspector route accepts only GET/HEAD and never proxies other
reserved paths. E2E builds first to verify both the bundled CLI and its asset path.
