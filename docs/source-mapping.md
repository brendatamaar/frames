# Source mapping evaluation

S3 design research, 2026-11-01. Implementation and accuracy measurements pending.

## Candidate review

Reviewed npm registry metadata and the exact published archives below. Their
LICENSE files were read before their implementation. The archives are local,
ignored research artifacts under `.frames/dist/source-eval/`; no candidate was
installed into the workspace or executed against the fixtures.

| Candidate                                          | License | Observed published behavior                                                                                                                                                                                             | Assessment for Frames                                                                                               |
| -------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| code-inspector-plugin / @code-inspector/vite 2.0.9 | MIT     | Vite pre-transform calls core transformCode for Vue/JSX and getCodeWithWebComponent; transformIndexHtml injects a browser client. Core includes editor/server capabilities and supports data-insp-path/row/col markers. | Broader integration than a source-stamping adapter; adopting the full plugin duplicates inspector responsibilities. |
| vite-plugin-vue-inspector 7.0.0                    | MIT     | Pre-transform inserts data-v-inspector fallback markers in Vue templates. Post-transform wraps compiled VNode factories using source maps and imports a runtime recorder. HTML gets a virtual client loader.            | Vue-only and coupled to a client/recorder; React still needs another approach.                                      |

These are static behavior findings, not runtime accuracy results. No claim about
either candidate meeting or failing the M1 accuracy gate is made. Public primary
references: [code-inspector](https://github.com/zh-lx/code-inspector),
[Vue inspector](https://github.com/webfansplz/vite-plugin-vue-inspector), and their
versioned npm distributions ([Vite adapter](https://www.npmjs.com/package/@code-inspector/vite/v/2.0.9),
[Vue plugin](https://www.npmjs.com/package/vite-plugin-vue-inspector/v/7.0.0)).

## Proposed choice

Implement original, small AST-based transforms using the compiler packages already
present in this workspace. Do not copy candidate implementation code. The only
browser runtime stays the Frames inspector.

- Vue: parse the SFC/template using Vue compiler APIs; stamp native elements,
  avoiding component wrappers whose fallthrough attributes could override the
  actual rendered element's source.
- React: TypeScript's JSX/TSX parser identifies native opening tags. Stamp their
  original source locations before Vite's React transform.
- Keep transforms and source-location/edit decisions separate. Apply edits with
  MagicString and preserve source maps.
- Use root-relative `data-frames-file` and one-based `data-frames-line` /
  `data-frames-column`. No absolute machine paths in browser markup.
- Activate only for dev serving. Production builds, SSR transforms, dependencies,
  files outside the configured root and virtual/raw requests remain unchanged.
- Unsupported template languages and third-party internals retain DOM fallback;
  their limitations must be recorded rather than guessed away.

Proposed package dependencies, checked from installed metadata: @vue/compiler-sfc
3.5.44 (MIT), @vue/compiler-dom 3.5.44 (MIT), magic-string 0.30.21 (MIT), and
typescript 5.9.3 (Apache-2.0). All are MIT-compatible and already in the lockfile;
S3 must declare those it imports directly in the Vite plugin's package manifest.

S3 acceptance requires actual Vite browser and production-build tests plus Node
compatibility. S5 owns the 20-click-per-app measurement and the 90% accuracy gate.
