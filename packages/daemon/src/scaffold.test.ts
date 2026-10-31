import { expect, test } from "bun:test";
import { Effect } from "effect";
import {
  GreetingFake,
  GreetingLive,
  greeting,
  scopedResource,
  Unavailable,
} from "./effect-examples";
import { versionCommand } from "./version";

test("version command and usage", () => {
  expect(versionCommand(["version"], "0.0.0")).toBe("frames 0.0.0");
  expect(() => versionCommand([], "0")).toThrow("Usage");
});
test("service Layers can be replaced with a fake", async () => {
  expect(await Effect.runPromise(Effect.provide(greeting, GreetingLive))).toBe(
    "Hello from Frames",
  );
  expect(await Effect.runPromise(Effect.provide(greeting, GreetingFake))).toBe(
    "test greeting",
  );
});
test("tagged failure and scoped cleanup on either exit", async () => {
  for (const fail of [false, true]) {
    let releases = 0;
    const program = Effect.scoped(
      Effect.gen(function* () {
        yield* scopedResource(() => {
          releases++;
        });
        if (fail)
          return yield* Effect.fail(new Unavailable({ reason: "offline" }));
        return "ok";
      }),
    );
    const result = await Effect.runPromise(Effect.result(program));
    expect(result._tag).toBe(fail ? "Failure" : "Success");
    expect(releases).toBe(1);
  }
});
