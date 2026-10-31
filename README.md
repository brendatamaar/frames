# Frames

Self-hosted context for coding agents. The code is the source of truth.

M0 scaffold only; proxy, inspection and source stamping are not implemented.
See [PLAN.md](PLAN.md) for scope and [AGENTS.md](AGENTS.md) for contributor rules.

Requires Bun 1.3.14+ and Node 22+ (compatibility check).

    bun install --frozen-lockfile
    bun run check
    make check
    bun run packages/daemon/src/cli.ts version

Start fixtures with bun run --cwd examples/vue-app dev, or substitute
react-app / svelte-app. Each binds to 127.0.0.1. Stop with Ctrl+C.

Package names use the local @frames scope; npm availability is unverified.
Dependencies and their compatible licenses are recorded in docs/dependencies.md.
