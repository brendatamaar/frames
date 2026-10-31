# Frames — PRD

Oct 26, 2026 · @brendatama

## Overview

Frames is a self-hosted, agent-agnostic canvas that shows your running app as live frames. You click any element to annotate it, batch the annotations, and send them to whichever coding agent you use. The code stays the only source of truth: the canvas never holds a separate design file.

**Problem.** Agents generate UI quickly, but correcting it is slow. Today you open devtools, hunt for the right div, guess which component file renders it, then describe its location to the agent in prose. That loop repeats for every small fix.

**Why now.** Existing tools solve parts of this, but each locks you in: Cursor Design Mode works only inside Cursor, Stagewise expects the app and codebase on localhost, and pen.dev keeps a design file that can drift from the code.

## Goals and non-goals

The product wins if fixing a piece of generated UI takes one click and one sentence.

**Goals**

- Give the agent precise context (element, screenshot, styles, source file and line) from a single click.
- Map a clicked element to its source component reliably for Vue and React.
- Work with any agent through MCP or a CLI: Claude Code, Codex, Cursor and others.
- Show many routes, breakpoints and variants at once on a pan/zoom canvas.
- Run self-hosted, against a local or remote dev server.

**Non-goals**

- Free-form visual editing (dragging, resizing, a style panel). Changes go through the agent.
- Being an IDE or a coding agent itself.
- Editing production sites or acting as a no-code builder.
- Figma import or a separate design format.

## Target users

The first user is a full-stack developer who builds UI with coding agents and reviews the result.

| Persona                          | Situation                                                                                     | What they need                                           |
| -------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Agent-driven developer (primary) | Generates screens with Claude Code or Codex, then fixes spacing, colors and layout one by one | Point at a problem and have the agent fix the right file |
| Reviewer on a small team (later) | A PM or designer reviews AI-built UI but does not touch code                                  | Leave annotations that a developer's agent can apply     |
| Remote or VPS developer          | Runs the dev server and agent on a remote machine                                             | Review and annotate from a laptop or phone browser       |

## Competitive landscape

The gap is a tool that combines live click-to-annotate, a multi-frame canvas and agent-agnostic delivery, and runs anywhere.

| Product                                                                                                                               | What it does                                                                                            | What we take                                          | Where it falls short                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Stagewise](https://docs.stagewise.io/reference/dom-context-selector)                                                                 | Click an element in the running app; sends HTML, computed styles, bounding box and selector to an agent | Click-to-context capture, framework-agnostic approach | Expects app and code on localhost; one page at a time; AGPL license                                                                                                      |
| [Cursor Design Mode](https://techdevnotes.com/releases/cursor-docs/20260626-202020Z-6c7064724f5e/content/pages/agent/design-mode.txt) | Click, draw or speak on the page; queue several edits while agents work                                 | Drawing on the page, queued parallel edits            | Works only inside Cursor; click-to-source is still a [user request](https://forum.cursor.com/t/click-to-source-from-browser-visual-editor-inspect-open-file-line/146166) |
| [pen.dev](https://www.pen.dev/)                                                                                                       | Agentic design canvas with an open JSON format, MCP and CLI access, HTML export                         | Canvas overview, open format, MCP/CLI access          | Design file is separate from code; changes return through export                                                                                                         |

## Core user flows

The review loop is the product; the other flows reuse it.

**Flow A: review and fix (MVP)**

1. Start the daemon in the project and open the canvas in a browser.
2. Add frames: pick routes and viewport presets (mobile, tablet, desktop).
3. Turn on inspect mode, hover to highlight, click an element.
4. Type a comment such as "too much padding, match the card above". The tool captures context automatically.
5. Repeat across frames to build a queue of annotations.
6. Send the batch. The agent pulls it through MCP or receives it through the CLI.
7. The agent edits the code; frames hot-reload; each annotation moves to "applied".
8. Review the result and resolve each annotation, or reply to send it back.

**Flow B: compare variants (MVP)**

1. Ask the agent for two or three versions of a screen.
2. Each variant runs on its own branch or worktree and dev server.
3. The canvas shows them side by side; pick one and discard the rest.

**Flow C: reviewer hand-off (later)**

1. A reviewer opens a shared canvas link and leaves annotations.
2. The developer's agent pulls them through the same queue.

## Functional requirements

The MVP covers Flow A end to end; everything else waits until it is in daily use.

### MVP

- **FR-1 Connect.** Point the daemon at a running dev server by URL, local or remote.
- **FR-2 Canvas.** Infinite pan/zoom; each frame is a live iframe of one route at one viewport size. Add, remove and arrange frames; presets for 390, 768 and 1440 px.
- **FR-3 Inspect.** Hover highlights elements; click selects; shift-click selects several. Show tag, classes, key computed styles and box size.
- **FR-4 Element to source.** Resolve a selection to component name and file:line for Vue 3, React and Svelte in dev builds, through one Vite plugin shared across frameworks. Fall back to selector and DOM snippet when unresolved.
- **FR-5 Annotate.** Attach a comment to the selection. Capture a cropped screenshot, trimmed outer HTML, computed styles, selector, source location, route and viewport.
- **FR-6 Queue.** List pending annotations; edit, delete and reorder them.
- **FR-7 Deliver.** Expose the batch through an MCP server and a CLI that pipes a prompt into an agent's headless mode.
- **FR-8 Status loop.** Frames reload on HMR. Annotations move through pending, sent, applied (set by the agent) and resolved (set by the user).
- **FR-10 Variants.** Run agent variants on separate worktrees and dev servers, shown side by side.

### v1

- **FR-9 Draw.** Rectangles and arrows on a frame, attached to an annotation.
- **FR-11 Before and after.** Snapshot a frame before a change and toggle against the result.
- **FR-12 Saved layouts.** Persist frame layouts per project.
- **FR-13 More frameworks.** Nuxt, Next.js App Router, SolidJS and Astro; Angular best effort, since its build does not accept Vite plugins.

### Later

- **FR-14 Shared review.** Share a link so reviewers can annotate.
- **FR-15 Voice notes.** Dictate an annotation.
- **FR-16 Token awareness.** Show which design token or utility class produced a value.
- **FR-17 Parallel dispatch.** Send each annotation to its own agent run.

## Technical architecture

A small daemon (TypeScript on Bun, built with Effect) sits between the browser, the dev server and the agent; it never edits code itself.

&#91;embedded content: architecture · browser, local daemon, dev server and agent\]

The agent changes repo files, the dev server hot-reloads, and the frames update through the proxy.

- **Proxy + injector.** A reverse proxy in front of the dev server makes frames same-origin with the canvas, so the inspector can read their DOM. It injects the inspector script into HTML responses.
- **Element to source.** A Vite plugin stamps elements with source attributes (file, line, column) in dev builds, the approach existing click-to-source plugins use. Framework internals are only a fallback, since they change between versions.
- **Annotation format.** One JSON file per annotation: id, comment, route, viewport, selector, source location, trimmed HTML, computed styles, screenshot path, status and replies.
- **Agent bridge.** MCP tools such as `list_annotations`, `get_annotation`, `mark_applied` and `reply`. The CLI renders a batch into a prompt for an agent's headless mode.
- **Screenshots.** In-page DOM capture first; a headless browser in the daemon if fidelity is poor.

## Non-functional requirements

It must be safe to run next to real code and light enough to leave open all day.

- **Local-first.** Nothing leaves the machine except what the chosen agent sends to its own model.
- **Dev-only.** The inspector and source plugin never ship in production builds.
- **Security.** The daemon binds to localhost by default; remote access needs a token.
- **Performance.** At least six live frames stay responsive; offscreen frames pause and show a static snapshot.
- **Install.** One binary plus one build plugin; setup under five minutes on an existing Vite project.
- **Graceful fallback.** Without the plugin, every feature still works with DOM context instead of file:line.
- **Open format.** Annotations are plain JSON files that any agent or script can read.

## Success metrics

The first test is whether you keep using it yourself; the targets below are starting guesses to revise after the spike.

| Metric                                                  | Target                        | How measured                   |
| ------------------------------------------------------- | ----------------------------- | ------------------------------ |
| Time from spotting an issue to the agent having context | Under 15 s                    | Timed on 20 real fixes         |
| Clicks resolved to the correct file:line                | 90% or more                   | Test set of Vue and React apps |
| Annotations applied correctly on the first agent run    | 70% or more                   | Resolved without a reply       |
| Personal use                                            | Daily for 4 consecutive weeks | Annotation log                 |

## Milestones

A two-week spike proves the hardest part, element-to-source mapping, before any canvas work starts.

&#91;embedded content: roadmap · 4 phases, 3 gates, durations estimated\]

Durations are part-time estimates; each phase starts only when the gate before it is met.

## Risks and open questions

The biggest risk is that larger players ship the same workflow; staying agent-agnostic and self-hosted is the defense.

| Risk                                            | Mitigation                                                                                  |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Cursor or Stagewise close the gap               | Stay agent-agnostic, open format, self-hosted, remote-friendly                              |
| Source mapping breaks across framework versions | Rely on a build plugin that stamps source attributes, not framework internals; DOM fallback |
| Proxy breaks auth cookies, CSP or websockets    | Rewrite headers in the proxy; document known limits                                         |
| Many live iframes get heavy                     | Pause offscreen frames and show snapshots                                                   |
| Agent misapplies a large batch                  | Option to send one annotation per run; before/after review                                  |

**Open questions**

- [x] Product name: Frames
- [x] Inspector built from scratch, reusing existing source-stamping plugins (no Stagewise fork)
- [x] License: MIT
- [x] Canvas UI in React; the injected inspector stays framework-free
- [x] Variants (FR-10) moved into the MVP
