# S3 source stamping — Model Functional Effect design

Profile: service

Scope: M1 S3 only. Candidate license and published-code review is recorded in
docs/source-mapping.md. Proposed implementation uses original Vue/TypeScript AST
adapters; no browser client or editor server dependency.

## State map

- `unconfigured`: no transforms permitted.
- `enabled { root }`: development serving, validated project root.
- `disabled`: production/build context; transforms forbidden.

Per-module transform results are values, not shared mutable cache state.

## Inputs

`Configured { root, command, production }`, `TransformRequested { file, code, kind }`,
`Parsed { file, code, kind, sites }`. Boundary adapters validate root-relative
files and module IDs. ElementSite carries original offset, line/column, tag kind
and whether reserved attributes already exist. Compiler ASTs remain in the shell.

## Transition table

| From         | Input              | Guard                                    | To       | Commands    |
| ------------ | ------------------ | ---------------------------------------- | -------- | ----------- |
| unconfigured | Configured         | serve and not production                 | enabled  | none        |
| unconfigured | Configured         | otherwise                                | disabled | none        |
| enabled      | TransformRequested | supported, root-local module             | enabled  | ParseSource |
| enabled      | Parsed             | native sites lacking reserved attributes | enabled  | ApplyEdits  |
| enabled      | Parsed             | no eligible sites                        | enabled  | none        |

Any other (state, input) pair: no change, no commands. Configuration is fixed for
one plugin instance; a restarted server creates a fresh instance.

## Invariants

- `devOnly`: disabled/unconfigured never emits a transform command.
- `nativeOnly`: component, fragment, slot and template wrapper sites receive no stamp.
- `noAbsolutePaths`: attribute values contain only validated root-relative paths.
- `originalPositions`: locations refer to the unmodified input; edits cannot shift
  later stamps' line/column values.
- `idempotentStamping`: a second transform adds no duplicate reserved attributes.
- `preserveSource`: applying planned insertions changes only the intended sites.
- `noClientInjection`: output adds attributes and source maps only, with no browser
  imports, editor middleware or inspector script injection (integration contract).

Each core invariant gets generated sequence/edit properties with shrinking and a
mutation proof. Parser location/escaping properties use both Unix and CRLF input.

## Commands

| Command     | Cardinality        | Idempotent              | Produces                          |
| ----------- | ------------------ | ----------------------- | --------------------------------- |
| ParseSource | one module value   | yes                     | Parsed or typed transform failure |
| ApplyEdits  | one code/map value | yes for same input/plan | Vite transform result             |

No IO, retries, timers or caches in the core. Vite supplies source text; the
parser and edit adapters do not read project files independently.

## Call graph

```ts
// Production toolchain (Node or Bun)
frames() → Vite apply/configResolved (boundary)
  → lifecycle step (core): enabled only for dev serving
Vite transform(code, id, options)
  → module/root/SSR filter (boundary)
  → step → ParseSource
    → Vue SFC + template parser, or TypeScript JSX parser
    → validated native ElementSites with original offsets
  → step → ApplyEdits
    → MagicString → code and original-source map

// Tests
generated lifecycle/sites/edits → step/run and pure edit planner
same parser contract → Vue and JSX adapters with real compiler APIs
real Vite fixtures → Vue/React DOM attributes and HMR
real production builds → no stamps or inspector client in output
compiled package → Node import/transform smoke alongside Bun tests
```

## Failures

| Node              | Failure                                                   | Class          | Handling                                                                |
| ----------------- | --------------------------------------------------------- | -------------- | ----------------------------------------------------------------------- |
| module boundary   | virtual, query/raw, outside-root, dependency or SSR input | domain outcome | unchanged module                                                        |
| template boundary | unsupported language/external template                    | domain outcome | unchanged source and explicit diagnostic; DOM fallback remains possible |
| compiler adapter  | malformed source                                          | escape hatch   | typed transform error translated into Vite diagnostic with file context |
| planner           | invalid/overlapping offsets                               | die            | reject impossible plan; fail property test                              |
| configuration     | production/build mode                                     | domain outcome | disabled state; never stamp                                             |

## Requirements

| Capability              | Live                      | Test                    | Contract                                                                                                        |
| ----------------------- | ------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------- |
| Vue parser              | compiler-sfc/compiler-dom | real compiler fixture   | nested native elements, slots, conditionals, lists, wrapper skips, inline templates, CRLF, unsupported language |
| JSX parser              | TypeScript compiler API   | real compiler fixture   | JSX/TSX, self-closing tags, fragments, native/component distinctions, spreads, syntax errors                    |
| edit/source-map adapter | MagicString               | real string/map fixture | preserved source, escaping, idempotence, original mapping                                                       |
| Vite shell              | pre-transform plugin      | real dev/build fixtures | dev-only attributes, framework ordering, HMR, no production stamps, Node compatibility                          |

These are pure compiler/string capabilities injected as plain TypeScript
interfaces; use real adapters in contracts rather than mock ASTs. No Effect or
Bun runtime APIs may enter the Vite plugin package.

## Boundary

| Source                 | Parser                                     | Produces             | Rejects                                                                            |
| ---------------------- | ------------------------------------------ | -------------------- | ---------------------------------------------------------------------------------- |
| Vite config            | command/production/root validation         | Configured           | invalid root                                                                       |
| Vite module ID/options | normalize and root-relative path validator | TransformRequested   | absolute browser paths, outside root, node_modules, virtual/raw/query modules, SSR |
| compiler AST           | node-location/native-tag reader            | ElementSites         | non-native sites, missing locations, out-of-range offsets                          |
| existing markup        | reserved-attribute reader                  | already-stamped site | duplicate/malformed marker plans                                                   |

Boundary tests cover accepted-implies-valid and every rejection; compiler
contracts assert tag location round trips. Stamp values must be escaped for their
Vue or JSX context, including file names with quotes or ampersands.

## Files

- `packages/vite-plugin/src/core/stamping.ts`: lifecycle, sites and edit planning.
- `packages/vite-plugin/src/shell/stamping.test.ts`: properties and boundaries.
- `packages/vite-plugin/src/shell/vue.ts`, `jsx.ts`, `edits.ts`: compiler adapters.
- Existing plugin entry: Vite hook wiring, no inspector injection.
- Vue/React fixture Vite configs: opt into Frames dev plugin.
- Package manifest/lockfile: direct compiler dependencies, exact versions.
- Browser/build/Node contracts and docs/source-mapping.md: observed evidence.

## Open questions

Approved by the user on 2026-11-01: original AST transforms using the
existing compiler toolchain, three separate data-frames attributes, native tags
only and one-based positions. This avoids coupling Frames to another inspector's
client lifecycle. Accuracy remains to be measured, not assumed. S4 will consume
the attributes; S5 will decide whether the approach meets the milestone gate.

Implementation notes: adapters report typed StampTransformError failures to Vite.
Only supported root-local main modules are transformed, without independently
reading source files. Source maps retain the original module ID while browser
stamp attributes stay root-relative. A test-only BSD-3-Clause source-map-js
dependency verifies mapping positions after insertion. Compiler versions remain
the exact versions already in this workspace; no third-party inspector is added.
