#!/usr/bin/env bun
import { Effect, Layer } from "effect";
import { version } from "../package.json";
import { BunProxyLive } from "./shell/bun-proxy";
import { CliInputError, parseCli } from "./shell/cli-boundary";
import { CliRuntime, CliRuntimeLive } from "./shell/cli-runtime";
import { InspectorAssetLive } from "./shell/inspector-asset";
import { runProxyCommand } from "./shell/proxy-command";

const program = Effect.gen(function* () {
  const command = yield* Effect.try({
    try: () => parseCli(process.argv.slice(2), process.env.NODE_ENV),
    catch: (error) =>
      error instanceof CliInputError
        ? error
        : new CliInputError({ reason: "Invalid command" }),
  });
  if (command.tag === "proxy") return yield* runProxyCommand(command.upstream);
  const runtime = yield* CliRuntime;
  yield* runtime.out(`frames ${version}`);
  return 0;
}).pipe(
  Effect.catchTag("CliInputError", (error) =>
    Effect.gen(function* () {
      const runtime = yield* CliRuntime;
      yield* runtime.error(error.reason);
      return 1;
    }),
  ),
  Effect.provide(
    Layer.mergeAll(BunProxyLive, InspectorAssetLive, CliRuntimeLive),
  ),
);
Effect.runPromise(program)
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
