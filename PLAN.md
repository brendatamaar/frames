# Frames: Implementation Plan

Source of truth for scope: the Frames PRD. This file is the working plan for agents and humans. Update the checkboxes and the Progress Log as work lands.

## 1. Product in one paragraph

Frames is a self-hosted, agent-agnostic canvas that shows a running web app as live frames (one iframe per route and viewport). The user clicks an element, adds a comment, and Frames captures precise context (selector, trimmed HTML, computed styles, screenshot, **source file:line**). Annotations are queued and handed to any coding agent through an MCP server or a CLI. The agent edits the real code, the dev server hot-reloads, and the frames update. **The code is the only source of truth. Frames never stores a separate design file.**

## 2. Decisions already made (do not re-litigate)

| Topic                                | Decision                                                                                                                                                                                                                                              |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name                                 | Frames (CLI binary: `frames`). npm and domain names are TBD, pending an availability check.                                                                                                                                                           |
| License                              | MIT                                                                                                                                                                                                                                                   |
| Language                             | TypeScript everywhere (strict)                                                                                                                                                                                                                        |
| Runtime, package manager, workspaces | Bun (replaces Node and pnpm). Exception: `packages/vite-plugin` and `packages/protocol` must also run on Node (see CI).                                                                                                                               |
| Lint and format                      | Biome                                                                                                                                                                                                                                                 |
| Daemon                               | Bun + Effect (Effect 4, currently a release candidate; pin an exact version in M0). Effect is used in the daemon only.                                                                                                                                |
| Daemon HTTP                          | Effect HTTP server on Bun. `/__frames/*` goes to Effect's router; everything else goes to the proxy.                                                                                                                                                  |
| Proxy                                | Written on Bun primitives (`Bun.serve`, `fetch`, global `WebSocket`) behind a `ProxyService` interface. Fallback if the M1 gate fails: a Node implementation of the same service (for example `http-proxy`).                                          |
| Shared protocol                      | `packages/protocol`: Effect Schema as the source of truth, JSON Schema export for the open format. Two entry points: `protocol/types` (type-only, safe for the inspector) and `protocol/schema` (runtime, daemon and canvas only).                    |
| Inspector                            | Vanilla TypeScript (tiny `el()` helper), Shadow DOM, bundled with `bun build` to one script, `@floating-ui/dom` for popover positioning. No UI framework, no Effect runtime. Size budget about 50 KB gzipped.                                         |
| Inspector origin                     | Built from scratch. Do not fork or copy Stagewise (AGPL).                                                                                                                                                                                             |
| Screenshots                          | `modern-screenshot`, lazy-loaded on first capture. Compare against SnapDOM in the spike. Fallback: daemon-side headless-browser capture.                                                                                                              |
| Source mapping                       | Build-time source stamping through a Vite plugin. Reuse existing open-source plugins where license allows (candidates: code-inspector-plugin, vite-plugin-vue-inspector; verify license and behavior first). Framework internals are a fallback only. |
| Canvas UI                            | React + Vite + Tailwind + Zustand; pan and zoom via CSS transform with `@use-gesture/react` (graph libraries fight with iframes)                                                                                                                      |
| Canvas to daemon                     | Native WebSocket with typed messages                                                                                                                                                                                                                  |
| Annotation storage                   | One JSON file per annotation in `.frames/` of the target project, written atomically (temp file then rename). No database.                                                                                                                            |
| Variants                             | `git worktree` through the git CLI plus a free-port allocator                                                                                                                                                                                         |
| MCP                                  | Official `@modelcontextprotocol/sdk`, wrapped at the edges. stdio locally, HTTP with a token for remote. (verify under Bun)                                                                                                                           |
| CLI                                  | Effect's CLI package if stable in the pinned version, otherwise `commander` (verify)                                                                                                                                                                  |
| Tests                                | `bun test` for unit tests; Playwright for end to end (verify under Bun, see risks)                                                                                                                                                                    |
| Test fakes                           | Effect Layers for fake dev servers and fake agents                                                                                                                                                                                                    |
| CI                                   | GitHub Actions: `bun run check`, Playwright, plus one Node job that loads `vite-plugin` and `protocol`                                                                                                                                                |
| Versioning                           | Changesets (verify the release flow from a Bun workspace)                                                                                                                                                                                             |
| Distribution                         | `bun build --compile` single binary (Linux, macOS, Windows) embedding the canvas build and inspector script. `bunx frames` as a secondary path.                                                                                                       |
| Logging                              | Effect logger, structured JSON to `.frames/logs`, no telemetry                                                                                                                                                                                        |
| Frameworks (MVP)                     | Vue 3, React, Svelte                                                                                                                                                                                                                                  |
| Frameworks (v1)                      | Nuxt, Next.js App Router, SolidJS, Astro. Angular is best effort.                                                                                                                                                                                     |
| Remote dev servers                   | In the MVP (local or remote URL)                                                                                                                                                                                                                      |
| Variants (FR-10)                     | In the MVP                                                                                                                                                                                                                                            |
| Delivery to agents                   | MCP server and CLI (agent-agnostic)                                                                                                                                                                                                                   |

## 3. Non-goals (reject scope creep)

- Free-form visual editing (drag, resize, style panels). Changes go through the agent.
- Being an IDE or a coding agent.
- Editing production sites; no-code building.
- Figma import or any separate design format.

## 4. Architecture

```
Browser                    Local daemon (Bun + Effect)        Your project
-------                    ---------------------------        ------------
Canvas UI (React)  ---->   Proxy + injector  ------------->   Dev server (Vite/Next, HMR)
  live iframes             (same-origin frames,               + source-location plugin
  annotation queue          injects inspector)
Inspector (injected) ---->  Annotation store (.frames/*.json)
                            MCP server + CLI  <------------>  Coding agent (Claude Code, Codex, ...)
                                                              edits repo files -> HMR reload
```

Key mechanics:

- **Proxy + injector.** A reverse proxy in front of the dev server makes frames same-origin with the canvas so the inspector can read frame DOM. It injects the inspector script into HTML responses only. It must pass websockets through (HMR, including Vite's subprotocol), handle compressed bodies, rewrite or strip `X-Frame-Options` and CSP `frame-ancestors`, and rewrite redirects and cookies.
- **Element to source.** The Vite plugin stamps elements with source attributes (file, line, column) in dev builds only. The inspector reads them. If missing, fall back to selector plus DOM snippet.
- **Annotation lifecycle.** `pending` -> `sent` -> `applied` (set by the agent) -> `resolved` (set by the user). Replies allowed at any point.
- **Agent bridge (MCP tools).** `list_annotations`, `get_annotation`, `mark_applied`, `reply`. The CLI renders a batch into a prompt and pipes it into an agent's headless mode.
- **Variants.** Each variant runs on its own git worktree and dev server (own port). Effect Scopes guarantee that processes and worktrees are cleaned up on discard or failure. The canvas shows variants side by side.
- **Protocol package.** All shapes (annotations, WebSocket messages, MCP inputs) are defined once in Effect Schema. The inspector imports types only and validates incoming `postMessage` data with small hand-written type guards that are tested against the Schema.

### Annotation JSON (draft schema, finalize in M1)

```json
{
  "version": 1,
  "id": "ann_01",
  "status": "pending",
  "comment": "too much padding, match the card above",
  "route": "/dashboard",
  "viewport": { "width": 1440, "height": 900 },
  "target": {
    "selector": "main > section:nth-child(2) .card",
    "source": { "file": "src/components/Card.vue", "line": 18, "column": 4 },
    "html": "<div class=\"card\">…</div>",
    "styles": { "padding": "32px" },
    "box": { "x": 120, "y": 340, "w": 480, "h": 160 }
  },
  "screenshot": ".frames/shots/ann_01.png",
  "createdAt": "2026-11-01T10:00:00Z",
  "replies": []
}
```

## 5. Repository layout (create in M0)

```
frames/
  AGENTS.md  CLAUDE.md  PLAN.md  README.md  LICENSE
  package.json  biome.json  bunfig.toml  .changeset/
  packages/
    protocol/      Effect Schema; entry points `types` (type-only) and `schema`
    daemon/        Bun + Effect: HTTP, proxy, store, MCP server, CLI, variants
    inspector/     vanilla TS overlay, bundled to a single script
    vite-plugin/   source stamping (wraps or replaces existing plugins)
    canvas/        React + Vite canvas UI
  examples/
    vue-app/  react-app/  svelte-app/    small apps for testing and the spike
  spike/           spike protocol and results (removable after M1)
  docs/            including effect-idioms.md (created in M0)
```

Tooling: Bun workspaces, Biome, and `bun run check` as the single verification command.

## 6. Milestones

Durations are part-time estimates. A phase starts only when the gate before it is met.

### M0: Scaffold (about 3 to 4 days)

- [x] Create the repo layout above with MIT `LICENSE`, `README.md` stub, `.gitignore` (include `.frames/`).
- [x] Bun workspace root, Biome config, strict `tsconfig` shared by all packages.
- [x] Pin an exact Effect version; record it in `package.json` and `docs/effect-idioms.md`.
- [x] `docs/effect-idioms.md`: short, **verified** snippets that compile against the pinned version (service as Layer, tagged error, Scope-managed resource, Layer-based test fake). Agents use this instead of writing Effect APIs from memory.
- [x] `packages/protocol` with the two entry points and a first Schema (annotation draft).
- [x] Guardrails: a lint rule banning runtime imports of `protocol/schema` and `effect` inside `packages/inspector`, and a CI check on inspector bundle size.
- [x] `frames version` CLI command in `packages/daemon`.
- [x] Example apps (Vue, React, Svelte): small but realistic, with nested components, lists, slots or children, conditional rendering, and one third-party component library. All start under Bun.
- [x] `bun run check`: typecheck, Biome, `bun test`, build all packages, inspector size check.
- [x] CI workflow running `bun run check`, plus a Node job that loads `vite-plugin` and `protocol`.

**Acceptance:** `bun run check` passes on a clean clone; all example apps start with their dev servers.

### M1: Spike, prove the riskiest parts (about 2 weeks)

Goal: prove the proxy on Bun and element-to-source before any canvas work.

- [x] **S0 Bun proxy gate (first 2 days).** Build only the proxy on Bun against `vue-app` and `react-app`. It passes only if: HMR updates reach a framed app through the proxy, HTML injection works on compressed responses, redirects and cookies survive, and six frames run concurrently. If it fails, implement the Node version of `ProxyService`, and record why in `spike/results.md`.
- [x] **S0b Playwright check (first week).** Confirm Playwright runs in this setup. If it does not work under Bun, drive the browser through the DevTools Protocol or keep Node as a test-only dependency, and record the decision.
- [x] **S1 Proxy + injector.** `frames proxy <url>` serves the target through a local port, injects the inspector, and keeps HMR working. Handles iframe-blocking headers.
- [x] **S2 Inspector.** Hover highlight, click select, shift-click multi-select, rendered in a Shadow DOM so it does not disturb page styles. Capture-phase listeners that block the app's own click handlers while inspect mode is on. Reports tag, classes, key computed styles, box size, selector. Rebuilds itself after an HMR reload.
- [x] **S3 Source stamping.** Vite plugin for Vue 3 and React (dev only) that stamps file, line, column. Evaluate existing plugins first; document the choice and license in `docs/source-mapping.md`.
- [x] **S4 Click to file:line.** Inspector resolves a clicked element to its stamped source location, with the DOM-snippet fallback.
- [ ] **S5 Measurement.** For each of `vue-app` and `react-app`, click 20 varied elements (nested components, list items, slot content, conditional blocks, third-party components). Automate with Playwright (or CDP, per S0b). Record expected vs resolved file:line in `spike/results.md`.
- [ ] **S6 Screenshot comparison.** Compare `modern-screenshot` and SnapDOM on the example apps (fidelity, speed, cross-origin assets). Pick one and record why.
- [ ] **S7 Decide.** Write findings: what worked, failure patterns, and whether to keep, replace, or extend the chosen approaches.

**Gate:** S0 passes (or the Node fallback is in place) and at least **90%** of clicks resolve to the correct file and line in both apps.

### M2: MVP (about 6 weeks)

- [ ] **FR-1 Connect.** Daemon points at a dev server URL, local or remote. Remote access requires a token; default bind is `127.0.0.1`.
- [ ] **FR-2 Canvas.** Infinite pan and zoom; each frame is a live iframe of one route at one viewport; add, remove, arrange frames; presets 390, 768, 1440 px.
- [ ] **FR-3 Inspect.** Hover, click, multi-select, with an info readout.
- [ ] **FR-4 Element to source.** Productionize the M1 result for Vue 3, React, and Svelte, with fallback.
- [ ] **FR-5 Annotate.** Comment plus automatic capture: cropped screenshot, trimmed HTML, computed styles, selector, source location, route, viewport.
- [ ] **FR-6 Queue.** List pending annotations; edit, delete, reorder.
- [ ] **FR-7 Deliver.** MCP server (`list_annotations`, `get_annotation`, `mark_applied`, `reply`) and `frames send` CLI that renders a batch into a prompt for an agent's headless mode.
- [ ] **FR-8 Status loop.** Frames reload on HMR; annotation status moves pending, sent, applied, resolved.
- [ ] **FR-10 Variants.** Run agent variants on separate git worktrees and dev servers, shown side by side; pick one and discard the rest. Cleanup must be guaranteed on discard, crash, and daemon shutdown.
- [ ] **Compiled binary early check.** `bun build --compile` produces a working binary that serves the embedded canvas and inspector. Smoke test it in CI. Check macOS code signing before M4.
- [ ] Offscreen frames pause and show a static snapshot; at least six live frames stay responsive.
- [ ] Setup under five minutes on an existing Vite project.
- [ ] Docs: quickstart, MCP setup for Claude Code and Codex.

**Gate:** daily personal use for two weeks.

### M3: v1 (about 6 weeks)

- [ ] **FR-9 Draw.** Rectangles and arrows on a frame, attached to an annotation.
- [ ] **FR-11 Before and after.** Snapshot a frame before a change and toggle against the result.
- [ ] **FR-12 Saved layouts.** Persist frame layouts per project.
- [ ] **FR-13 More frameworks.** Nuxt, Next.js App Router, SolidJS, Astro; Angular best effort.

**Gate:** works on three real repositories (not the example apps).

### M4: Open source release

- [ ] Docs site or README with demo video.
- [ ] Release binaries for macOS, Linux, Windows; macOS code signing.
- [ ] Verify the Changesets release flow from the Bun workspace.
- [ ] Check final npm package names and domain; publish packages.
- [ ] Public repo.

### Later (not scheduled)

Shared review links, voice notes, design-token awareness, per-annotation parallel agent dispatch.

## 7. Risks to watch

| Risk                                                                         | Mitigation                                                                                                          |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Bun compatibility gaps (proxy websockets, subprocesses, MCP SDK, Playwright) | Two-day proxy gate in M1; services behind interfaces so a Node implementation can replace a Bun one; Node CI job    |
| Effect 4 is a release candidate and its API differs from v3                  | Pin an exact version; `docs/effect-idioms.md` with verified snippets; agents must not write Effect APIs from memory |
| Agents write outdated Effect code                                            | Rule in AGENTS.md; check installed typings before using an API                                                      |
| Effect or Schema leaks into the inspector bundle                             | Lint rule, type-only imports, CI size check                                                                         |
| Source mapping breaks across framework versions                              | Build-time stamping, not framework internals; DOM fallback                                                          |
| Proxy breaks auth cookies, CSP, or websockets                                | Header rewriting, document known limits; browser-controlled mode (DevTools Protocol) as plan B                      |
| Many live iframes get heavy                                                  | Pause offscreen frames, use snapshots                                                                               |
| Compiled binary is large or fails to embed assets                            | Early compiled-binary smoke test in M2; `bunx` as secondary path                                                    |
| Agent misapplies a large batch                                               | Option to send one annotation per run; before and after review                                                      |
| Existing tools close the gap                                                 | Stay agent-agnostic, open format, self-hosted, remote-friendly                                                      |

## 8. Progress Log

Append one line per meaningful change: date, agent or person, task ID, outcome.

- 2026-10-31, Codex, M0-1: Created section 5 layout, MIT license, README and ignore rules; retained original docs copies.
- 2026-10-31, Codex, M0-2: Configured Bun workspaces, Biome and shared strict TypeScript settings.
- 2026-10-31, Codex, M0-3: Pinned Effect 4.0.0-rc.118 exactly in root, daemon and protocol.
- 2026-10-31, Codex, M0-4: Verified Effect idioms against installed typings; compiled examples and tested Layers, tagged errors and scoped cleanup.
- 2026-10-31, Codex, M0-5: Added annotation draft Schema, JSON Schema export and runtime-free types entry.
- 2026-10-31, Codex, M0-6: Added inspector restricted-import lint rule and 50 KiB gzip gate in CI.
- 2026-10-31, Codex, M0-7: Added frames version command with usage validation.
- 2026-10-31, Codex, M0-8: Added nested Vue, React and Svelte fixtures with lists, conditional content and slots/children; React uses MIT Radix Slot; verified all dev servers.
- 2026-10-31, Codex, M0-9: Added unified checks for typechecking, Biome, unit tests, every package build and inspector size; make check delegates.
- 2026-10-31, Codex, M0-10: Added GitHub Actions verification and separate Node package-loading job; Node smoke passed locally.

- 2026-10-31, Codex, FE-setup: Applied user-approved Model Functional Effect service profile, core/shell paths, deny mode, changed-core recheck, path-scoped rules and agent guidance; automatic bun test verification awaits separate approval. No M1 work started.

- 2026-10-31, Codex, M1-preflight: Stopped before M1. M0 local checks and fixture startup are recorded, but HEAD contains only LICENSE; scaffold, package manifests, lockfile and checks are uncommitted. The clean-clone M0 acceptance gate cannot be met from current history. Commit M0 and verify bun install --frozen-lockfile, make check and bun run smoke:examples in a clean checkout before starting M1.

- 2026-10-31, Codex, M0-clean-clone: Committed scaffold in five logical changes. Fresh Windows checkout exposed CRLF conversion conflicting with Biome; added .gitattributes to enforce LF for reproducible checks.

- 2026-10-31, Codex, M0-gate: Fresh clone of c8252e4 passed bun install --frozen-lockfile, make check (4 tests, all package builds, 292-byte gzip inspector), bun run smoke:examples (Vue, React, Svelte) and Node package-loading smoke; clean clone remained unchanged. M0 acceptance gate met; earlier M1-preflight blocker resolved. GitHub default branch confirmed as main.

- 2026-10-31, Codex, M1-S0-design: Confirmed recorded M0 gate evidence; created M1-bun-proxy and prepared docs/design/s0-bun-proxy.md for required Functional Effect design approval. S0 implementation and gate measurements remain pending; no milestone checkbox ticked.

- 2026-11-01, Codex, M1-S0: Implemented pure proxy policy and scoped Bun ProxyService; real HTTP/WS contracts and six-frame Vue/React HMR browser gate pass. make check passed (16 tests); explicit core purity scan passed; HTML guard mutation was caught. Results and deflate boundary finding recorded in spike/results.md; no new dependencies.
- 2026-11-01, Codex, M1-note: Biome includes generated .frames files despite gitignore. Left tooling unchanged; probe profiles live under ignored .frames/dist. Automatic approval review blocked deletion of initial profiles; preserved them there using reversible moves.
- 2026-11-01, Codex, M1-S0b: Playwright 1.64.1 runner failed collection under Bun; Node 22.22.3 fallback passed the real browser compatibility test via bun run e2e. Added exact Apache-2.0 dev dependency after license checks; make check passed (16 tests and all builds). Decision recorded in spike/results.md.
- 2026-11-01, Codex, M1-S1-design: Prepared docs/design/s1-proxy-command.md for required Functional Effect design approval; S1 implementation remains pending. Proposed loopback ephemeral port and built inspector asset; no M2 work.
- 2026-11-01, Codex, M1-S1: Added dev-only proxy CLI, fixed inspector asset route and scoped lifecycle after design approval. make check passed (36 tests); two Playwright tests and six-frame Vue/React HMR through the built CLI passed; purity scan and terminal-guard mutation proof passed. No new dependencies; inspector interactions remain S2.
- 2026-11-01, Codex, M1-S2-design: Prepared docs/design/s2-inspector.md with pure inspection state, synchronous event blocking, Shadow DOM boundaries and browser contracts; awaiting required design approval. No S2 implementation or later milestone work started.
- 2026-11-01, Codex, M1-S2: Implemented approved pure inspection model, DOM snapshots and isolated overlay; make check passed (44 tests), five Playwright tests passed, and six-frame Vue/React probes retained working selection after HMR. Purity scan and disposal-guard mutation proof passed; inspector gzip 2,954 bytes. No dependencies added; limitations recorded in spike/results.md.
- 2026-11-01, Codex, M1-S3-design: Reviewed MIT licenses and published Vue inspector 7.0.0 / code-inspector 2.0.9 transform/client behavior; documented static evaluation in docs/source-mapping.md. Prepared S3 lifecycle/AST stamping design for approval before compiler dependency declarations or implementation. S3 checkbox and source-accuracy gate remain pending.
- 2026-11-01, Codex, M1-S3: Implemented approved dev-only native Vue/JSX AST stamping with root-relative files, one-based positions and source maps. make check passed (54 tests), nine Playwright tests and compiled Node smoke passed; six-frame Vue/React HMR moved heading lines and updated stamps without reload. Native-tag mutation proof and purity scan passed. Declared existing MIT/Apache compiler dependencies and BSD-3-Clause test map consumer; S4 lookup and S5 accuracy gate remain pending.
- 2026-11-01, Codex, M1-S4-design: Prepared docs/design/s4-click-to-source.md for source-context enrichment and explicit DOM fallback. Proposed exact-element-only stamps, strict path/position validation, bounded HTML and unchanged protocol Schema; awaiting required design approval. No S4 implementation or S5 measurement started.
- 2026-11-01, Codex, M1-S4: Implemented approved exact-element source lookup and bounded DOM fallback. make check passed (57 tests); ten browser tests, six-frame Vue/React readout/HMR probes, protocol compatibility, purity scan and HTML-limit mutation proof passed. No dependencies added. User grants standing approval for remaining M1 designs; still stop for PLAN conflicts or expensive ambiguity.
