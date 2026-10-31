# Effect idioms

Pinned: **effect 4.0.0-rc.118**, exactly, in root, daemon and protocol manifests.
This intentionally follows the plan's RC requirement rather than the latest tag.

Verified against installed dist/Context.d.ts (Service), Layer.d.ts (succeed),
Data.d.ts (TaggedError), Effect.d.ts (acquireRelease/scoped) and Schema.d.ts.
The complete examples live in packages/daemon/src/effect-examples.ts and are
compiled by the shared strict typecheck. Its companion test verifies the live
Layer, fake Layer, tagged error, and Scope cleanup on success and failure.

Service and Layer:

    class Greeting extends Context.Service<Greeting, {
      readonly text: Effect.Effect<string>
    }>()('frames/Greeting') {}
    const GreetingLive = Layer.succeed(Greeting, { text: Effect.succeed('Hello') });

Tagged error:

    class Unavailable extends Data.TaggedError('Unavailable')<{
      readonly reason: string
    }> {}

Scope-managed resource (the caller supplies the real cleanup capability):

    const resource = Effect.acquireRelease(
      Effect.succeed({ name: 'example' }),
      () => Effect.sync(release)
    );
    // Execute with Effect.scoped; the finalizer runs on success and failure.

Layer fake:

    const GreetingFake = Layer.succeed(Greeting, { text: Effect.succeed('test') });
    // Provide with Effect.provide(program, GreetingFake).

Run bun run check after changing these examples. Do not substitute v3 APIs.
