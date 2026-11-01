// Test-only entry point. The parent harness closes stdin to release both proxies.
import { Effect } from "effect";
import { BunProxyLive } from "./bun-proxy";
import { ProxyService } from "./proxy-service";

const program = Effect.scoped(
  Effect.gen(function* () {
    const service = yield* ProxyService;
    const vue = yield* service.start({ upstream: process.argv[2] });
    const react = yield* service.start({ upstream: process.argv[3] });
    console.log(JSON.stringify({ vue: vue.origin, react: react.origin }));
    yield* Effect.tryPromise(
      () =>
        new Promise<void>((resolve) => {
          process.stdin.resume();
          process.stdin.once("end", resolve);
        }),
    );
  }),
).pipe(Effect.provide(BunProxyLive));
Effect.runPromise(program).catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
