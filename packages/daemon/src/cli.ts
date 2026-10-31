#!/usr/bin/env bun
import { Effect } from "effect";
import { version } from "../package.json";
import { versionCommand } from "./version";

const program = Effect.try(() =>
  versionCommand(process.argv.slice(2), version),
).pipe(Effect.flatMap((message) => Effect.sync(() => console.log(message))));
Effect.runPromise(program).catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
