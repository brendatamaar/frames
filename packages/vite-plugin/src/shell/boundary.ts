import { isAbsolute, relative, resolve } from "node:path";
import type { ModuleSource, ProjectRoot, SourceFile } from "../core/stamping";

export function parseRoot(value: unknown): ProjectRoot {
  if (typeof value !== "string" || !isAbsolute(value) || value.includes("\0"))
    throw new Error("Expected absolute Vite project root");
  return resolve(value) as ProjectRoot;
}
export function parseFile(value: unknown): SourceFile {
  if (
    typeof value !== "string" ||
    !value ||
    /[\\\0]/.test(value) ||
    value.startsWith("/") ||
    /^[A-Za-z]:/.test(value) ||
    value
      .split("/")
      .some((part) => ["", ".", "..", "node_modules"].includes(part))
  )
    throw new Error("Expected root-relative source file");
  return value as SourceFile;
}
export function parseModule(
  root: ProjectRoot,
  code: string,
  id: string,
  ssr: boolean,
): ModuleSource | null {
  if (ssr || !isAbsolute(id) || /[\0?#]/.test(id)) return null;
  const local = relative(root, id).replaceAll("\\", "/");
  let file: SourceFile;
  try {
    file = parseFile(local);
  } catch {
    return null;
  }
  const kind = file.endsWith(".vue")
    ? "vue"
    : /\.[jt]sx$/.test(file)
      ? "jsx"
      : null;
  return kind ? { file, code, kind } : null;
}
