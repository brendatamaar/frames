import { Context, Data, Effect, Layer } from "effect";
export class Greeting extends Context.Service<
  Greeting,
  { readonly text: Effect.Effect<string> }
>()("frames/Greeting") {}
export const GreetingLive = Layer.succeed(Greeting, {
  text: Effect.succeed("Hello from Frames"),
});
export const GreetingFake = Layer.succeed(Greeting, {
  text: Effect.succeed("test greeting"),
});
export class Unavailable extends Data.TaggedError("Unavailable")<{
  readonly reason: string;
}> {}
export const greeting = Effect.gen(function* () {
  const service = yield* Greeting;
  return yield* service.text;
});
export const scopedResource = (release: () => void) =>
  Effect.acquireRelease(Effect.succeed({ name: "example" }), () =>
    Effect.sync(release),
  );
