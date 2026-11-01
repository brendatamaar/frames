# Source mapping evaluation

S3 implementation, 2026-11-01. The S5 accuracy measurement remains pending.

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

## Choice

Frames uses original, small AST-based transforms with compiler packages already
present in this workspace. No candidate implementation code was copied. The only
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

Direct package dependencies, checked from installed metadata: @vue/compiler-sfc
3.5.44 (MIT), @vue/compiler-dom 3.5.44 (MIT), magic-string 0.30.21 (MIT), and
typescript 5.9.3 (Apache-2.0). All are MIT-compatible and already in the lockfile;
the plugin declares these imports directly. source-map-js 1.2.2 (BSD-3-Clause,
MIT-compatible) is a test-only dependency for checking actual original mappings.

## Evidence and limits

Real Vite browser tests check six representative native nodes per app, including
Vue slot content and React Radix Slot children, against original file/line/column.
Production bundle scans find no stamps or inspector code. Compiler contracts cover
LF/CRLF, marker idempotence, escaping, native/wrapper distinctions, syntax errors
and generated-to-original source-map positions. The compiled Node smoke exercises
Vue and React transforms, production disablement and SSR exclusion.

The six-frame browser probe also moves a heading onto a new line during HMR and
asserts updated file/line/column stamps in every Vue/React frame without reload.

Files outside the configured Vite root, node_modules, query/raw/virtual modules,
SSR, external/non-HTML Vue templates and render functions without JSX are not
stamped. Templates using non-HTML languages emit a diagnostic. Native descendants
keep their own locations; component wrappers are deliberately skipped to avoid
fallthrough attributes overwriting child source. Third-party internals may have
no stamp; S4 must keep DOM fallback available.

The inspector does not consume these attributes until S4. S5 owns the
20-click-per-app measurement and the 90% milestone gate; these S3 samples do not
substitute for that measurement.
