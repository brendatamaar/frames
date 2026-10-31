import { Context, Data, type Effect, type Scope } from "effect";
import type { Origin } from "../core/proxy-policy";

export class ProxyStartError extends Data.TaggedError("ProxyStartError")<{
  readonly reason: string;
}> {}
export class ProxyUpstreamError extends Data.TaggedError("ProxyUpstreamError")<{
  readonly reason: string;
}> {}
export interface ProxyOptions {
  readonly upstream: string;
  readonly port?: number;
}
export interface ProxyHandle {
  readonly origin: Origin;
}
export class ProxyService extends Context.Service<
  ProxyService,
  {
    readonly start: (
      options: ProxyOptions,
    ) => Effect.Effect<ProxyHandle, ProxyStartError, Scope.Scope>;
  }
>()("frames/ProxyService") {}
