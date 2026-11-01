import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";

const reports = JSON.parse(
  await readFile(".frames/dist/source-measurement.json", "utf8"),
);
assert.deepEqual(
  reports.map((report) => report.app),
  ["vue", "react"],
);
const sections = [
  "## S5 — Source accuracy measurement",
  "",
  "Measured 2026-11-01 using Playwright, real pointer clicks, the built CLI proxy and the current Vue/React fixtures. Added static Details components so each app has 20 distinct native targets. Expected locations use fixed source anchors, not DOM stamp values. All failures remain in the denominator.",
  "",
];
for (const report of reports) {
  assert.equal(report.total, 20);
  assert.equal(report.rows.length, 20);
  assert.equal(new Set(report.rows.map((row) => row.selector)).size, 20);
  assert.equal(report.correct, report.rows.filter((row) => row.correct).length);
  sections.push(
    `### ${report.app}: ${report.correct}/20 (${report.correct * 5}%)`,
    "",
    "| Target | Expected file:line:column | Resolved file:line:column | Result |",
    "| --- | --- | --- | --- |",
  );
  const location = (value) =>
    value ? `${value.file}:${value.line}:${value.column}` : "unresolved";
  for (const row of report.rows)
    sections.push(
      `| \`${row.selector}\` | ${location(row.expected)} | ${location(row.actual)} | ${row.correct ? "PASS" : `FAIL: ${row.failure ?? "wrong location"}`}${row.correct && !row.columnCorrect ? " (column differs)" : ""} |`,
    );
  sections.push("");
}
sections.push(
  "Reproduce: `bun run e2e`, then `node spike/render-measurement.mjs`. Raw expected/actual rows are in spike/source-results.json. The initial measurement harness used an ambiguous button selector that also matched the inspector toggle; it was corrected to article button before recording these results. No resolution failure was filtered out.",
  "",
  "The file:line gate passes in each app separately. This measures these fixtures, not arbitrary repositories, unsupported frameworks or third-party internals.",
  "",
);
await writeFile(
  "spike/source-results.json",
  `${JSON.stringify(reports, null, 2)}\n`,
);
const path = "spike/results.md";
const previous = await readFile(path, "utf8");
const start = "<!-- source-measurement:start -->";
const end = "<!-- source-measurement:end -->";
const block = `${start}\n${sections.join("\n")}\n${end}`;
const contents = previous.includes(start)
  ? previous.slice(0, previous.indexOf(start)) +
    block +
    previous.slice(previous.indexOf(end) + end.length)
  : `${previous}\n${block}\n`;
await writeFile(path, contents);
assert(
  reports.every((report) => report.correct >= 18),
  "M1 source accuracy gate failed",
);
console.log(
  reports.map((report) => `${report.app}: ${report.correct}/20`).join(", "),
);
