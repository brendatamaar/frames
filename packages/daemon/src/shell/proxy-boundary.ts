import type { Origin } from "../core/proxy-policy";

export function parseOrigin(value: unknown): Origin {
  if (typeof value !== "string") throw new Error("Expected HTTP origin");
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error("Expected HTTP origin without credentials or path");
  return url.origin as Origin;
}

export function parseProtocols(value: string | null): readonly string[] {
  if (value === null) return [];
  const protocols = value.split(",").map((token) => token.trim());
  if (
    protocols.some((token) => !/^[!#$%&'*+\-.^_`|~\da-zA-Z]+$/.test(token)) ||
    new Set(protocols).size !== protocols.length
  )
    throw new Error("Invalid WebSocket protocols");
  return protocols;
}
