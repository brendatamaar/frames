import { Context, Effect, Layer, type Scope } from "effect";

export class CliRuntime extends Context.Service<
  CliRuntime,
  {
    readonly out: (message: string) => Effect.Effect<void>;
    readonly error: (message: string) => Effect.Effect<void>;
    readonly watchStop: Effect.Effect<
      { readonly stopped: Effect.Effect<void> },
      never,
      Scope.Scope
    >;
  }
>()("frames/CliRuntime") {}

export const CliRuntimeLive = Layer.succeed(CliRuntime, {
  out: (message) =>
    Effect.sync(() => {
      console.log(message);
    }),
  error: (message) =>
    Effect.sync(() => {
      console.error(message);
    }),
  watchStop: Effect.acquireRelease(
    Effect.sync(() => {
      let stop: () => void = () => {};
      const promise = new Promise<void>((resolve) => {
        stop = resolve;
      });
      process.on("SIGINT", stop);
      process.on("SIGTERM", stop);
      return {
        stopped: Effect.promise(() => promise),
        close: () => {
          process.off("SIGINT", stop);
          process.off("SIGTERM", stop);
        },
      };
    }),
    (subscription) => Effect.sync(subscription.close),
  ),
});
