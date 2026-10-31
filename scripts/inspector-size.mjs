import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const size = gzipSync(
  readFileSync("packages/inspector/dist/inspector.js"),
).length;
const budget = 50 * 1024;
console.log("Inspector gzip: " + size + " / " + budget + " bytes");
if (size > budget) throw new Error("Inspector exceeds 50 KiB gzip budget");
