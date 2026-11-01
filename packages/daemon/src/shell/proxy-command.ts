import { Effect, type Scope } from "effect";
import { type Input, type State, step } from "../core/proxy-command";
import type { Origin } from "../core/proxy-policy";
import { CliRuntime } from "./cli-runtime";
import { InspectorAssetService } from "./inspector-asset";
import { ProxyService } from "./proxy-service";

export const runProxyCommand = (upstream: Origin) =>
  Effect.scoped(
    Effect.gen(function* () {
      const assets = yield* InspectorAssetService;
      const proxy = yield* ProxyService;
      const runtime = yield* CliRuntime;
      const watcher = yield* runtime.watchStop;
      let state: State = { tag: "idle" };

      const dispatch = (
        input: Input,
      ): Effect.Effect<void, never, Scope.Scope> =>
        Effect.gen(function* () {
          const [next, commands] = step(state, input);
          state = next;
          for (const command of commands) {
            switch (command.tag) {
              case "LoadInspector": {
                const result = yield* assets.load.pipe(
                  Effect.map(
                    (script): Input => ({ tag: "AssetLoaded", script }),
                  ),
                  Effect.catchTag("InspectorAssetError", (error) =>
                    Effect.succeed<Input>({
                      tag: "Failed",
                      reason: error.reason,
                    }),
                  ),
                );
                yield* dispatch(result);
                break;
              }
              case "StartProxy": {
                const result = yield* proxy
                  .start({
                    upstream: command.upstream,
                    inspectorScript: command.script,
                  })
                  .pipe(
                    Effect.map(
                      (handle): Input => ({
                        tag: "Started",
                        origin: handle.origin,
                      }),
                    ),
                    Effect.catchTag("ProxyStartError", (error) =>
                      Effect.succeed<Input>({
                        tag: "Failed",
                        reason: error.reason,
                      }),
                    ),
                  );
                yield* dispatch(result);
                break;
              }
              case "AnnounceOrigin":
                yield* runtime.out(command.origin);
                break;
              case "ReportError":
                yield* runtime.error(command.reason);
                break;
              case "ReleaseScope":
                break; // Returning from the race closes the owning scope.
            }
          }
        });
      const serve = dispatch({ tag: "Start", upstream }).pipe(
        Effect.flatMap(() =>
          state.tag === "failed" ? Effect.succeed(1) : Effect.never,
        ),
      );
      const stop = watcher.stopped.pipe(
        Effect.flatMap(() => dispatch({ tag: "StopRequested" })),
        Effect.map(() => 0),
      );
      return yield* Effect.raceFirst(serve, stop);
    }),
  );
