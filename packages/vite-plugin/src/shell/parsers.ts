import type { ElementSite, ModuleSource } from "../core/stamping";

export class StampTransformError extends Error {
  readonly tag = "StampTransformError";
  constructor(
    readonly file: string,
    reason: string,
  ) {
    super(`Frames source stamping: ${file}: ${reason}`);
  }
}
export interface ParsedSites {
  readonly sites: readonly ElementSite[];
  readonly diagnostic?: string;
}
export type SourceParser = (module: ModuleSource) => ParsedSites;

export function validateSites(
  module: ModuleSource,
  sites: readonly ElementSite[],
): readonly ElementSite[] {
  for (const site of sites) {
    if (
      !Number.isSafeInteger(site.start) ||
      !Number.isSafeInteger(site.insert) ||
      site.start < 0 ||
      site.insert <= site.start ||
      site.insert > module.code.length ||
      module.code[site.start] !== "<"
    )
      throw new StampTransformError(
        module.file,
        "Invalid compiler element location",
      );
  }
  return sites;
}
