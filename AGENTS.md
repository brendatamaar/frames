# AGENTS.md

Instructions for AI coding agents (Claude Code, Codex, and others) working on **Frames**. Humans: see README.md. The working plan is in PLAN.md and is the source of truth for scope and order of work.

## What this project is

Frames is a self-hosted, agent-agnostic canvas that shows a running web app as live iframes. The user clicks an element, comments on it, and Frames sends precise context (selector, HTML, styles, screenshot, source file:line) to a coding agent through MCP or a CLI. The agent edits the real code and the dev server hot-reloads.

Core principle: **the code is the only source of truth.** Frames never keeps a separate design file and never edits visuals directly.

## Before you start any task

1. Read `PLAN.md`. Work on the current milestone only, in order. Do not start a later milestone early.
2. Pick one unchecked task. Keep the change small and focused on that task.
3. If a request conflicts with PLAN.md (a non-goal, a settled decision, or an earlier milestone's gate), stop and ask instead of working around it.
4. If something is ambiguous and a wrong guess would be expensive to undo, ask. Otherwise choose the simplest reasonable option and note the assumption in your summary.

## Stack and layout

| Area                                                          | Tech                                                  | Path                    |
| ------------------------------------------------------------- | ----------------------------------------------------- | ----------------------- |
| Runtime, package manager, workspaces, bundler, unit tests     | Bun                                                   | repo root               |
| Lint and format                                               | Biome                                                 | repo root               |
| Daemon (HTTP, proxy, store, MCP server, CLI, variants)        | TypeScript on Bun, with Effect                        | `packages/daemon/`      |
| Shared protocol (annotations, WebSocket messages, MCP inputs) | Effect Schema                                         | `packages/protocol/`    |
| Injected inspector                                            | Vanilla TypeScript, Shadow DOM, single bundled script | `packages/inspector/`   |
| Source stamping                                               | TypeScript Vite plugin                                | `packages/vite-plugin/` |
| Canvas UI                                                     | React + Vite + Tailwind + Zustand                     | `packages/canvas/`      |
| Test apps                                                     | Vue 3, React, Svelte                                  | `examples/`             |

Some of these directories are created in milestone M0. If a directory does not exist yet, check PLAN.md before creating structure that differs from the plan.

## Commands

The single verification command is `bun run check`. It must pass before you consider a task done. It runs typecheck, Biome, `bun test`, builds all packages, and checks the inspector bundle size.

Other commands (available after M0; check the root `package.json` scripts for the exact names):

- `bun install`: install dependencies
- `bun test`: unit tests
- `bun run build`: build all packages
- `bun run e2e`: Playwright end-to-end tests (see the Playwright note in PLAN.md)

If a command here does not exist yet, do not invent a different one; check the package scripts, and fix or add them as part of the task if they are missing.

## Definition of done

- `bun run check` passes.
- New behavior has tests. Prefer real tests over mocks; for the proxy, test against a real local HTTP server including websocket passthrough.
- No leftover debug output, commented-out code, or unused dependencies.
- The checkbox for the task in PLAN.md is ticked and one line is added to the Progress Log (date, your agent name, task ID, outcome).
- Your summary says what changed, how you verified it, and anything you assumed or left undone.

## Conventions

**General**
- Keep changes minimal. Do not refactor unrelated code or reformat files you are not changing.
- Prefer boring, readable code over clever code. Match the surrounding style.
- Errors are handled explicitly. No silent failures; no swallowed errors.
- TypeScript `strict` mode on. No `any` without a comment explaining why.

**Effect (daemon only)**
- Effect is used in `packages/daemon` and `packages/protocol/schema` only. Never import `effect` at runtime in `inspector`, `vite-plugin`, or `canvas`.
- **Effect 4 is a release candidate and its API differs from v3.** Do not write Effect APIs from memory. Before using an API, check `docs/effect-idioms.md` and the installed package's type definitions. If you cannot verify an API, stop and ask.
- The Effect version is pinned exactly. Do not upgrade it as a side effect of another task.
- Model capabilities (dev server, git, process spawning, clock, file system, proxy) as services provided through Layers, so tests can swap in fakes.
- Use tagged errors for expected failures. Manage resources (servers, child processes, worktrees, ports) with Scopes so cleanup is guaranteed on error and interruption.
- Use Layer-based fakes in tests, not ad hoc mocks.

**Bun**
- Bun-specific APIs (`Bun.*`) are allowed only inside `packages/daemon`, and only in the platform layers behind service interfaces (for example `ProxyService`). This keeps a Node implementation possible.
- `packages/vite-plugin` and `packages/protocol` run in other people's toolchains and must work on Node as well as Bun. A CI Node job checks this; do not break it.
- The proxy is implemented on Bun primitives behind `ProxyService`. If the M1 proxy gate fails, a Node implementation replaces it; do not work around the gate.

**Inspector (`packages/inspector`)**
- Vanilla TypeScript and Shadow DOM. No UI framework and no Effect runtime. It is injected into every frame, so keep the bundle small (budget in PLAN.md) and load the screenshot library lazily.
- Import types from `protocol/types` only (type-only imports).
- Validate every incoming `postMessage` with a hand-written type guard and a strict origin check. Test the guards against the Schema so they cannot drift.
- Use capture-phase listeners and block the app's own handlers only while inspect mode is on. Never leak styles into or out of the host page.
- The inspector and the Vite plugin are **dev-only**. They must never run in or ship with production builds.

**Git**
- One logical change per commit. Imperative commit messages, for example `Add websocket passthrough to proxy`.
- Do not commit `.frames/`, secrets, build output, or `node_modules`.

## Boundaries

**Do**
- Keep annotation data as plain, documented JSON, defined once in `packages/protocol` (draft shape in PLAN.md).
- Keep the MCP tool surface small and stable: `list_annotations`, `get_annotation`, `mark_applied`, `reply`. Changing a tool's name or shape needs a note in PLAN.md.
- Fall back gracefully: if source stamping is missing, every feature still works with DOM context.

**Do not**
- Add free-form visual editing (drag, resize, style panels). It is a stated non-goal.
- Copy, port, or closely imitate code from Stagewise or any AGPL/GPL project. This project is MIT. Study behavior from public docs only.
- Add a dependency without checking its license is compatible with MIT (no AGPL/GPL) and noting it in your summary. For the source-stamping plugins, verify license and behavior before relying on them.
- Weaken security defaults: no binding to all interfaces by default, no disabling the token for remote access, no running the inspector outside dev mode.
- Run destructive commands (`rm -rf` outside the working tree, `git push --force`, `git reset --hard` on shared branches) unless explicitly told to.
- Touch files outside the repository, or send data off the machine.

## Working with other agents

Several agents (Claude Code, Codex) may work on this repo. To avoid conflicts:

- Work on your own branch, ideally in your own git worktree. Do not commit directly to `main`.
- PLAN.md is the shared coordination file. Before starting, check the Progress Log and open tasks so you do not duplicate work. When you finish, update the checkbox and log line promptly.
- Keep PLAN.md edits limited to checkboxes, the Progress Log, and notes under the task you worked on. Changes to decisions, scope, or milestones need a human's approval.
- If you find a problem outside your task, add a short note to the Progress Log instead of fixing it silently.

## Known hard parts (read before touching these)

- **Proxy.** Must pass websockets through (HMR, including Vite's subprotocol), decompress before injecting into HTML, inject only into HTML responses, and handle `X-Frame-Options`, CSP `frame-ancestors`, redirects, and cookies. It runs on Bun primitives, so Bun compatibility is the main risk. Test it thoroughly against the example apps.
- **Element to source.** The product's success depends on resolving clicks to the right file and line. The M1 gate is 90% accuracy on the example apps. Record failures in `spike/results.md` rather than guessing.
- **Variant lifecycle.** Each variant owns a worktree, a dev server process, and a port. All three must be released on discard, crash, and daemon shutdown. Use Scopes and test the failure paths.
- **Frame performance.** Many live iframes get heavy. Offscreen frames should pause and show a snapshot.
- **Compiled binary.** `bun build --compile` must embed the canvas build and the inspector script. Keep the smoke test green.

## Model Functional Effect

This repository adopts the service profile configured in `.functional-effect.json`.
Follow `.claude/rules/functional-effect.md` for the configured functional-core paths, including in Codex. Keep decisions pure as `(state, input) => (state, commands)`; put boundary parsing, Effect services, interpreters and wiring in the shell. New package domain logic belongs under `src/core/`, with effectful adapters under `src/shell/`. Existing entry points remain in place.

Use the Model Functional Effect design skill before new stateful features and the extract skill when separating decisions from existing IO. Continue to follow PLAN.md milestone gates. Run the plugin purity scan after changing core files and `bun run check` before declaring work done. The plugin automatic `bun test` verification requires separate user approval through `/functional-effect:verify approve`; configuration alone does not enable it.
