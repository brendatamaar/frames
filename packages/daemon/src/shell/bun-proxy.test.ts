import { expect, test } from "bun:test";
import { brotliCompressSync, deflateSync, gzipSync } from "node:zlib";
import { Effect, Layer } from "effect";
import { BunProxyLive } from "./bun-proxy";
import { parseOrigin } from "./proxy-boundary";
import { ProxyService, ProxyStartError } from "./proxy-service";

function fixture() {
  let posts = 0;
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request, listener) {
      const path = new URL(request.url).pathname;
      if (path === "/ws") {
        if (
          listener.upgrade(request, {
            headers: { "sec-websocket-protocol": "vite-hmr" },
          })
        )
          return;
        return new Response("bad upgrade", { status: 400 });
      }
      if (path === "/redirect")
        return new Response(null, {
          status: 302,
          headers: { location: `${listener.url.origin}/cookies` },
        });
      if (path === "/cookies") {
        const headers = new Headers();
        headers.append(
          "set-cookie",
          "one=1; Domain=127.0.0.1; HttpOnly; SameSite=Lax",
        );
        headers.append("set-cookie", "two=2; Path=/; Secure");
        return new Response("cookies", { headers });
      }
      if (path === "/post") {
        posts++;
        return new Response(`${posts}:${await request.text()}`);
      }
      if (path === "/binary")
        return new Response(gzipSync("binary payload"), {
          headers: {
            "content-type": "application/octet-stream",
            "content-encoding": "gzip",
          },
        });
      if (path === "/bad")
        return new Response("bad gzip", {
          headers: { "content-type": "text/html", "content-encoding": "gzip" },
        });
      const html =
        "<!doctype html><html><head></head><body>fixture</body></html>";
      const encoding = path.slice(1);
      const compressors = {
        gzip: gzipSync,
        deflate: deflateSync,
        br: brotliCompressSync,
      };
      const headers = new Headers({
        "content-type": "text/html",
        "x-frame-options": "DENY",
        "content-security-policy": "frame-ancestors 'none'; img-src 'self'",
        etag: "old",
      });
      if (encoding in compressors) {
        headers.set("content-encoding", encoding);
        return new Response(
          compressors[encoding as keyof typeof compressors](html),
          { headers },
        );
      }
      return new Response(html, { headers });
    },
    websocket: {
      open(socket) {
        socket.send("connected");
      },
      message(socket, message) {
        socket.send(message);
      },
    },
  });
  return server;
}

test("real HTTP contract: compressed HTML, binary, headers, redirects, cookies and POST", async () => {
  const upstream = fixture();
  try {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const service = yield* ProxyService;
          const proxy = yield* service.start({ upstream: upstream.url.origin });
          yield* Effect.tryPromise(async () => {
            for (const encoding of ["gzip", "deflate", "br", "identity"]) {
              const response = await fetch(`${proxy.origin}/${encoding}`);
              expect(response.status).toBe(200);
              expect(await response.text()).toContain(
                "<script data-frames-spike>",
              );
              expect(response.headers.get("content-encoding")).toBeNull();
              expect(response.headers.get("etag")).toBeNull();
              expect(response.headers.get("x-frame-options")).toBeNull();
              expect(response.headers.get("content-security-policy")).toBe(
                "img-src 'self'",
              );
            }
            const binary = await fetch(`${proxy.origin}/binary`, {
              decompress: false,
            });
            expect(binary.headers.get("content-encoding")).toBe("gzip");
            expect(new Uint8Array(await binary.arrayBuffer())).toEqual(
              new Uint8Array(gzipSync("binary payload")),
            );
            const redirect = await fetch(`${proxy.origin}/redirect`, {
              redirect: "manual",
            });
            expect(redirect.headers.get("location")).toBe(
              `${proxy.origin}/cookies`,
            );
            const cookies = await fetch(`${proxy.origin}/cookies`);
            expect(cookies.headers.getSetCookie()).toEqual([
              "one=1; HttpOnly; SameSite=Lax",
              "two=2; Path=/; Secure",
            ]);
            expect(
              await (
                await fetch(`${proxy.origin}/post`, {
                  method: "POST",
                  body: "payload",
                })
              ).text(),
            ).toBe("1:payload");
            expect((await fetch(`${proxy.origin}/bad`)).status).toBe(502);
            expect((await fetch(proxy.origin, { method: "HEAD" })).status).toBe(
              200,
            );
          });
        }),
      ).pipe(Effect.provide(BunProxyLive)),
    );
  } finally {
    upstream.stop(true);
  }
});

test("WebSocket contract: selected Vite protocol, ordered text/binary and scope cleanup", async () => {
  const upstream = fixture();
  let origin = "";
  let socket: WebSocket | undefined;
  try {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const service = yield* ProxyService;
          const handle = yield* service.start({
            upstream: upstream.url.origin,
          });
          origin = handle.origin;
          yield* Effect.tryPromise(
            () =>
              new Promise<void>((resolve, reject) => {
                const timer = setTimeout(
                  () => reject(new Error("Socket contract timeout")),
                  3000,
                );
                socket = new WebSocket(`${origin.replace("http", "ws")}/ws`, [
                  "other",
                  "vite-hmr",
                ]);
                socket.binaryType = "arraybuffer";
                const received: (string | Uint8Array)[] = [];
                socket.onopen = () => {
                  expect(socket?.protocol).toBe("vite-hmr");
                  socket?.send("one");
                  socket?.send(new Uint8Array([1, 2, 3]));
                };
                socket.onerror = () => {
                  clearTimeout(timer);
                  reject(new Error("Socket failed"));
                };
                socket.onmessage = (
                  event: MessageEvent<string | ArrayBuffer>,
                ) => {
                  received.push(
                    typeof event.data === "string"
                      ? event.data
                      : new Uint8Array(event.data),
                  );
                  if (received.length === 3) {
                    clearTimeout(timer);
                    expect(received).toEqual([
                      "connected",
                      "one",
                      new Uint8Array([1, 2, 3]),
                    ]);
                    resolve();
                  }
                };
              }),
          );
        }),
      ).pipe(Effect.provide(BunProxyLive)),
    );
    await expect(fetch(origin)).rejects.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(socket?.readyState).toBe(WebSocket.CLOSED);
  } finally {
    socket?.close();
    upstream.stop(true);
  }
});

// The fake models scoped resource ownership; wire behavior belongs to the real
// HTTP/WS fixture above, rather than duplicating a proxy in a test fake.
for (const [name, layer] of [
  ["Bun", BunProxyLive],
  [
    "Layer fake",
    Layer.succeed(ProxyService, {
      start: ({ upstream }) =>
        Effect.acquireRelease(
          Effect.try({
            try: () => ({ origin: parseOrigin(upstream) }),
            catch: () => new ProxyStartError({ reason: "Invalid origin" }),
          }),
          () => Effect.void,
        ),
    }),
  ],
] as const) {
  test(`${name} service contract rejects invalid configuration`, async () => {
    const outcome = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const service = yield* ProxyService;
          return yield* service.start({ upstream: "file:///bad" });
        }),
      ).pipe(Effect.provide(layer), Effect.flip),
    );
    expect(outcome._tag).toBe("ProxyStartError");
  });
}
