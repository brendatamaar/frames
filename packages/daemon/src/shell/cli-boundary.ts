import { Data } from "effect";
import type { Origin } from "../core/proxy-policy";
import { parseOrigin } from "./proxy-boundary";

export class CliInputError extends Data.TaggedError("CliInputError")<{
  readonly reason: string;
}> {
  override get message() {
    return this.reason;
  }
}
export type CliCommand =
  | { readonly tag: "version" }
  | { readonly tag: "proxy"; readonly upstream: Origin };
export function parseCli(
  args: readonly string[],
  mode: string | undefined,
): CliCommand {
  if (args.length === 1 && args[0] === "version") return { tag: "version" };
  if (args.length === 2 && args[0] === "proxy") {
    if (mode === "production")
      throw new CliInputError({
        reason: "frames proxy is dev-only; NODE_ENV=production is unsupported",
      });
    try {
      return { tag: "proxy", upstream: parseOrigin(args[1]) };
    } catch {
      throw new CliInputError({
        reason:
          "Expected an HTTP(S) origin without credentials, path, query or fragment",
      });
    }
  }
  throw new CliInputError({
    reason: "Usage: frames version | frames proxy <url>",
  });
}
