import type { StampResult } from "../core/inspection";

export function parseStamp(value: unknown): StampResult {
  if (!value || typeof value !== "object") return { tag: "invalid" };
  const attributes = value as Record<string, unknown>;
  const { file, line, column } = attributes;
  if (
    [file, line, column].every((entry) => entry === null || entry === undefined)
  )
    return { tag: "missing" };
  if (
    typeof file !== "string" ||
    !file ||
    /[\\\0]/.test(file) ||
    file.startsWith("/") ||
    /^[A-Za-z]:/.test(file) ||
    file
      .split("/")
      .some((part) => ["", ".", "..", "node_modules"].includes(part))
  )
    return { tag: "invalid" };
  if (
    typeof line !== "string" ||
    typeof column !== "string" ||
    !/^[1-9]\d*$/.test(line) ||
    !/^[1-9]\d*$/.test(column) ||
    !Number.isSafeInteger(Number(line)) ||
    !Number.isSafeInteger(Number(column))
  )
    return { tag: "invalid" };
  return {
    tag: "valid",
    source: { file, line: Number(line), column: Number(column) },
  };
}
export function readStamp(element: Element): StampResult {
  return parseStamp({
    file: element.getAttribute("data-frames-file"),
    line: element.getAttribute("data-frames-line"),
    column: element.getAttribute("data-frames-column"),
  });
}
