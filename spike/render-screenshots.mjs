import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";

const rows = JSON.parse(
  await readFile(".frames/dist/screenshot-results.json", "utf8"),
);
assert.equal(rows.length, 12);
const lines = [
  "## S6 — Screenshot comparison",
  "",
  "Measured 2026-11-01 on the Vue/React apps in Edge 156.0.4314.50. Libraries: modern-screenshot 4.7.0 and @zumer/snapdom 3.7.0, both MIT. Both are exact dev-only dependencies with no production inspector integration.",
  "",
  "Method: 720px styled main root, PNG scale/DPR 1, three runs per library/scene, first and median times recorded separately. Vue runs modern first; React runs SnapDOM first. Browser reference is the same root's native screenshot. CORS assets come from a second loopback origin; non-loopback network requests are blocked. RGB mean absolute error is 0–255 over overlapping pixels; dimension mismatches are reported separately. Timing includes the lazy import on the first call and is machine-specific.",
  "",
  "| App | Scene | Library | First ms | Median ms | Mean RGB error | Output / reference | Asset matches |",
  "| --- | --- | --- | --- | --- | --- | --- | --- |",
];
for (const row of rows) {
  const c = row.comparison;
  const size = c
    ? `${c.width}×${c.height} / ${c.referenceWidth}×${c.referenceHeight}`
    : "failed";
  lines.push(
    `| ${row.app} | ${row.scene} | ${row.library} | ${row.firstMs?.toFixed(1) ?? "—"} | ${row.medianMs?.toFixed(1) ?? "—"} | ${c?.meanChannelError.toFixed(3) ?? row.error} | ${size} | ${c?.imageMatches === null ? "n/a" : c?.imageMatches ? "yes" : "no"} |`,
  );
}
lines.push(
  "",
  "Choice: **SnapDOM 3.7.0** for later lazy screenshot integration. Its median is lower in all six app/scene pairs and its pixel error is lower in each comparison. First-run timings fluctuate and do not establish a universal cold-start advantage. Both base captures round a fractional root height down by one pixel. This is the planned S6 selection among the candidates, not an M2 integration change.",
  "",
  "Both libraries reproduce the CORS-enabled image. Neither reproduces the opaque cross-origin image: visual inspection shows a SnapDOM placeholder and a blank area from modern-screenshot. The image-center pixel check independently confirms omission. Do not claim full cross-origin fidelity; use the planned daemon-side headless-browser fallback when that matters in M2. No public CORS proxy or disabled security is used.",
  "",
  "PNGs were visually inspected under .frames/dist/capture. Raw numbers are in spike/screenshot-results.json. Reproduce with bun run e2e, then node spike/render-screenshots.mjs. Capture code is test-only and lazily split; the initial inspector bundle is unchanged.",
  "",
);
await writeFile(
  "spike/screenshot-results.json",
  `${JSON.stringify(rows, null, 2)}\n`,
);
const path = "spike/results.md",
  previous = await readFile(path, "utf8");
const start = "<!-- screenshot-comparison:start -->",
  end = "<!-- screenshot-comparison:end -->";
const block = `${start}\n${lines.join("\n")}\n${end}`;
await writeFile(
  path,
  previous.includes(start)
    ? previous.slice(0, previous.indexOf(start)) +
        block +
        previous.slice(previous.indexOf(end) + end.length)
    : `${previous}\n${block}\n`,
);
assert(
  rows
    .filter((row) => row.scene === "cors")
    .every((row) => row.comparison?.imageMatches && !row.error),
);
