import { expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import { type Input, type State, step } from "../core/proxy-command";
import { parseCli } from "./cli-boundary";
import { CliRuntime, CliRuntimeLive } from "./cli-runtime";
import {
  InspectorAssetError,
  InspectorAssetService,
  parseInspectorScript,
} from "./inspector-asset";
import { parseOrigin } from "./proxy-boundary";
import { runProxyCommand } from "./proxy-command";
import { ProxyService, ProxyStartError } from "./proxy-service";

const origin = parseOrigin("http://127.0.0.1:5173");
const script = parseInspectorScript("window.inspectorLoaded=true;");
const domain: Input[] = [
  { tag: "Start", upstream: origin },
  { tag: "AssetLoaded", script },
  { tag: "Started", origin },
  { tag: "StopRequested" },
  { tag: "Failed", reason: "unavailable" },
];
function property(name: string, check: (inputs: readonly Input[]) => void) {
  test(name, () => {
    let seed = 100;
    for (let round = 0; round < 200; round++) {
      let inputs = Array.from({ length: 50 }, () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return domain[seed % domain.length];
      });
      try {
        check(inputs);
      } catch {
        for (let index = inputs.length - 1; index >= 0; index--) {
          const smaller = inputs.filter((_, i) => i !== index);
          try {
            check(smaller);
          } catch {
            inputs = smaller;
          }
        }
        check(inputs);
      }
    }
  });
}
property("startOnce", (inputs) => {
  let state: State = { tag: "idle" };
  let starts = 0;
  for (const input of inputs) {
    const [next, commands] = step(state, input);
    state = next;
    starts += commands.filter((command) => command.tag === "StartProxy").length;
    expect(starts).toBeLessThanOrEqual(1);
  }
});
property("announceAfterAcquisition", (inputs) => {
  let state: State = { tag: "idle" };
  for (const input of inputs) {
    const [next, commands] = step(state, input);
    if (commands.some((command) => command.tag === "AnnounceOrigin")) {
      expect(state.tag).toBe("starting");
      expect(input.tag).toBe("Started");
    }
    state = next;
  }
});
property("terminalIsQuiet", (inputs) => {
  let state: State = { tag: "idle" };
  for (const input of inputs) {
    const result = step(state, input);
    if (state.tag === "stopped" || state.tag === "failed")
      expect(result).toEqual([state, []]);
    state = result[0];
  }
});
test("CLI boundary accepts origins and rejects malformed commands, public bind options and production", () => {
  expect(parseCli(["version"], "production")).toEqual({ tag: "version" });
  for (const url of [
    "http://127.0.0.1:5000",
    "https://localhost",
    "http://[::1]:5173",
  ]) {
    const command = parseCli(["proxy", url], undefined);
    expect(command).toEqual({ tag: "proxy", upstream: parseOrigin(url) });
    if (command.tag === "proxy")
      expect(parseCli(["proxy", command.upstream], "development")).toEqual(
        command,
      );
  }
  for (const args of [
    [],
    ["proxy"],
    ["unknown"],
    ["version", "extra"],
    ["proxy", origin, "--host", "0.0.0.0"],
    ...[
      "bad",
      "file:///test",
      "http://u:p@localhost",
      "http://localhost/path",
      "http://localhost?q=1",
      "http://localhost/#hash",
    ].map((url) => ["proxy", url]),
  ])
    expect(() => parseCli(args, undefined)).toThrow();
  expect(() => parseCli(["proxy", origin], "production")).toThrow("dev-only");
});

for (const outcome of [
  "stop",
  "missing asset",
  "startup failure",
  "stop during startup",
] as const) {
  test(`scoped lifecycle: ${outcome}`, async () => {
    const messages: string[] = [];
    const errors: string[] = [];
    let starts = 0;
    let released = 0;
    let stop: () => void = () => {};
    const stopped = new Promise<void>((resolve) => {
      stop = resolve;
    });
    const proxy = Layer.succeed(ProxyService, {
      start: () => {
        starts++;
        if (outcome === "startup failure")
          return Effect.fail(
            new ProxyStartError({ reason: "port unavailable" }),
          );
        return Effect.acquireRelease(Effect.succeed({ origin }), () =>
          Effect.sync(() => {
            released++;
          }),
        ).pipe(
          Effect.flatMap((handle) => {
            if (outcome === "stop during startup")
              return Effect.sync(stop).pipe(Effect.flatMap(() => Effect.never));
            return Effect.succeed(handle);
          }),
        );
      },
    });
    const assets = Layer.succeed(InspectorAssetService, {
      load:
        outcome === "missing asset"
          ? Effect.fail(
              new InspectorAssetError({ reason: "missing; run bun run build" }),
            )
          : Effect.succeed(script),
    });
    const runtime = Layer.succeed(CliRuntime, {
      out: (value) =>
        Effect.sync(() => {
          messages.push(value);
          stop();
        }),
      error: (value) =>
        Effect.sync(() => {
          errors.push(value);
        }),
      watchStop: Effect.succeed({ stopped: Effect.promise(() => stopped) }),
    });
    const exitCode = await Effect.runPromise(
      runProxyCommand(origin).pipe(
        Effect.provide(Layer.mergeAll(proxy, assets, runtime)),
      ),
    );
    expect(exitCode).toBe(
      outcome === "missing asset" || outcome === "startup failure" ? 1 : 0,
    );
    expect(starts).toBe(outcome === "missing asset" ? 0 : 1);
    expect(released).toBe(
      outcome === "stop" || outcome === "stop during startup" ? 1 : 0,
    );
    expect(messages).toEqual(outcome === "stop" ? [origin] : []);
    expect(errors.length).toBe(
      outcome === "missing asset" || outcome === "startup failure" ? 1 : 0,
    );
  });
}
test("live runtime handles SIGINT and removes subscriptions on scope exit", async () => {
  const before = [
    process.listenerCount("SIGINT"),
    process.listenerCount("SIGTERM"),
  ];
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const runtime = yield* CliRuntime;
        const watcher = yield* runtime.watchStop;
        yield* Effect.sync(() => {
          process.emit("SIGINT");
        });
        yield* watcher.stopped;
      }),
    ).pipe(Effect.provide(CliRuntimeLive)),
  );
  expect([
    process.listenerCount("SIGINT"),
    process.listenerCount("SIGTERM"),
  ]).toEqual(before);
});
