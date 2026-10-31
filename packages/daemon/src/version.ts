export function versionCommand(
  args: readonly string[],
  version: string,
): string {
  if (args.length === 1 && args[0] === "version") return "frames " + version;
  throw new Error("Usage: frames version");
}
