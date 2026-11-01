# Frames

Self-hosted context for coding agents. The code is the source of truth.

M1 spike in progress: the development proxy, inspector and Vue/React dev source
stamps are available. Inspector source lookup is the next step.
See [PLAN.md](PLAN.md) for scope and [AGENTS.md](AGENTS.md) for contributor rules.

Requires Bun 1.3.14+ and Node 22+ (compatibility check).

    bun install --frozen-lockfile
    bun run check
    make check
    bun run packages/daemon/src/cli.ts version

Start fixtures with bun run --cwd examples/vue-app dev, or substitute
react-app / svelte-app. Each binds to 127.0.0.1. Stop with Ctrl+C.

After starting a development server, build Frames and proxy its origin:

    bun run build
    bun run packages/daemon/src/cli.ts proxy http://127.0.0.1:5173

Open the printed loopback URL. The proxy injects the built inspector entry and
passes HMR through. Click Inspect to enable hover highlighting and selection;
Shift-click toggles additional targets. Disabling Inspect clears the selection
and restores ordinary app clicks. The readout includes selectors, computed
styles and element bounds. Stop with Ctrl+C.
Use an HTTP(S) origin without a path or credentials. This command is development
only and refuses NODE_ENV=production. Restrictive script CSP policies remain
enforced and may block the inspector; Frames preserves those policies.

Run the browser tests with bun run e2e (builds first; uses Node and installed Edge).
Set FRAMES_BROWSER to another local Chromium executable if needed.

Enable source stamps in a Vue/React Vite config with `frames()` from
`@frames/vite-plugin`, before the framework plugin. It stamps native template/JSX
elements during dev serving only; production builds and SSR remain unchanged.
The example Vue/React configs already enable it. See
[source mapping](docs/source-mapping.md) for coverage and limitations.

Package names use the local @frames scope; npm availability is unverified.
Dependencies and their compatible licenses are recorded in docs/dependencies.md.
