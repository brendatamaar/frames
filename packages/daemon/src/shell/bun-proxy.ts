import type { ServerWebSocket, WebSocketOptions } from "bun";
import { Effect, Layer } from "effect";
import { type Header, step } from "../core/proxy-policy";
import { parseOrigin, parseProtocols } from "./proxy-boundary";
import {
  type ProxyOptions,
  ProxyService,
  ProxyStartError,
  ProxyUpstreamError,
} from "./proxy-service";

type Bridge = {
  upstream: WebSocket;
  downstream?: ServerWebSocket<Bridge>;
  pending: (string | Uint8Array)[];
  pendingBytes: number;
};
const marker = "<script data-frames-spike>window.__framesSpike=true</script>";
const timeoutMs = 10_000;
// lib.dom masks Bun's documented options overload (bun-types/globals.d.ts).
const ClientWebSocket = WebSocket as unknown as {
  new (url: string, options: WebSocketOptions): WebSocket;
};

function headersOf(headers: Headers): Header[] {
  return [...headers]
    .filter(([key]) => key !== "set-cookie")
    .concat(
      headers
        .getSetCookie()
        .map((cookie): [string, string] => ["set-cookie", cookie]),
    );
}
function toHeaders(pairs: readonly Header[]) {
  const headers = new Headers();
  for (const [key, value] of pairs) headers.append(key, value);
  return headers;
}

function openProxy(options: ProxyOptions) {
  const upstream = parseOrigin(options.upstream);
  const abort = new AbortController();
  const bridges = new Set<Bridge>();
  const closeBridge = (bridge: Bridge) => {
    bridge.upstream.close();
    bridge.downstream?.close(1001, "Proxy connection closed");
    bridges.delete(bridge);
  };
  const server = Bun.serve<Bridge>({
    hostname: "127.0.0.1",
    port: options.port ?? 0,
    idleTimeout: 30,
    async fetch(request, listener) {
      const incoming = new URL(request.url);
      const target = new URL(upstream);
      target.pathname = incoming.pathname;
      target.search = incoming.search;
      try {
        if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
          let protocols: readonly string[];
          try {
            protocols = parseProtocols(
              request.headers.get("sec-websocket-protocol"),
            );
          } catch {
            return new Response("Invalid WebSocket protocols", { status: 400 });
          }
          const command = step(
            { tag: "ready" },
            { tag: "UpgradeRequest", protocols },
          )[1][0];
          if (command.tag !== "BridgeWebSocket")
            throw new Error("Invalid upgrade command");
          target.protocol = target.protocol === "https:" ? "wss:" : "ws:";
          // Bun's client extension forwards headers required by authenticated dev servers.
          const headers = new Headers(request.headers);
          for (const key of [
            "host",
            "connection",
            "upgrade",
            "sec-websocket-key",
            "sec-websocket-version",
            "sec-websocket-protocol",
            "sec-websocket-extensions",
          ])
            headers.delete(key);
          const socket = new ClientWebSocket(target.href, {
            protocols: [...command.protocols],
            headers,
          });
          socket.binaryType = "arraybuffer";
          const bridge: Bridge = {
            upstream: socket,
            pending: [],
            pendingBytes: 0,
          };
          bridges.add(bridge);
          socket.addEventListener(
            "message",
            (event: MessageEvent<string | ArrayBuffer>) => {
              const data =
                typeof event.data === "string"
                  ? event.data
                  : new Uint8Array(event.data);
              if (bridge.downstream) {
                if (bridge.downstream.send(data) === -1) closeBridge(bridge);
              } else {
                bridge.pendingBytes +=
                  typeof data === "string"
                    ? new TextEncoder().encode(data).length
                    : data.byteLength;
                if (bridge.pendingBytes > 1024 * 1024) closeBridge(bridge);
                else bridge.pending.push(data);
              }
            },
          );
          socket.addEventListener("close", () => closeBridge(bridge), {
            once: true,
          });
          socket.addEventListener("error", () => closeBridge(bridge), {
            once: true,
          });
          try {
            await new Promise<void>((resolve, reject) => {
              const timer = setTimeout(() => {
                cleanup();
                reject(new Error("WebSocket handshake timeout"));
              }, timeoutMs);
              const opened = () => {
                cleanup();
                resolve();
              };
              const failed = () => {
                cleanup();
                reject(new Error("WebSocket handshake failed"));
              };
              const cleanup = () => {
                clearTimeout(timer);
                socket.removeEventListener("open", opened);
                socket.removeEventListener("error", failed);
                socket.removeEventListener("close", failed);
                abort.signal.removeEventListener("abort", failed);
              };
              socket.addEventListener("open", opened, { once: true });
              socket.addEventListener("error", failed, { once: true });
              socket.addEventListener("close", failed, { once: true });
              abort.signal.addEventListener("abort", failed, { once: true });
              if (abort.signal.aborted) failed();
            });
            if (socket.protocol && !protocols.includes(socket.protocol))
              throw new Error("Unexpected WebSocket protocol");
            if (
              listener.upgrade(request, {
                data: bridge,
                headers: socket.protocol
                  ? { "sec-websocket-protocol": socket.protocol }
                  : {},
              })
            )
              return;
            closeBridge(bridge);
            return new Response("Invalid WebSocket upgrade", { status: 400 });
          } catch (error) {
            closeBridge(bridge);
            throw error;
          }
        }
        const command = step(
          { tag: "ready" },
          { tag: "HttpRequest", headers: headersOf(request.headers) },
        )[1][0];
        if (command.tag !== "ForwardHttp")
          throw new Error("Invalid request command");
        const signal = AbortSignal.any([
          abort.signal,
          request.signal,
          AbortSignal.timeout(timeoutMs),
        ]);
        const response = await fetch(target, {
          method: request.method,
          headers: toHeaders(command.headers),
          body: request.body,
          redirect: "manual",
          // Explicit raw bytes: decode HTML ourselves; preserve non-HTML encoding.
          decompress: false,
          signal,
        });
        const plan = step(
          { tag: "ready" },
          {
            tag: "HttpResponse",
            headers: headersOf(response.headers),
            status: response.status,
            head: request.method === "HEAD",
            upstream,
            proxy: parseOrigin(incoming.origin),
          },
        )[1][0];
        if (plan.tag !== "InjectHtml" && plan.tag !== "StreamBody")
          throw new Error("Invalid response command");
        const headers = toHeaders(plan.headers);
        if (plan.tag === "StreamBody")
          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers,
          });
        let bytes = new Uint8Array(await response.arrayBuffer());
        const encodings = (
          response.headers.get("content-encoding") ?? "identity"
        )
          .split(",")
          .map((value) => value.trim().toLowerCase())
          .reverse();
        for (const encoding of encodings) {
          if (encoding === "gzip") bytes = Bun.gunzipSync(bytes);
          else if (encoding === "deflate") {
            const { inflateSync } = await import("node:zlib");
            bytes = new Uint8Array(inflateSync(bytes));
          } else if (encoding === "br") {
            const { brotliDecompressSync } = await import("node:zlib");
            bytes = new Uint8Array(brotliDecompressSync(bytes));
          } else if (encoding !== "identity")
            throw new Error("Unsupported HTML encoding");
        }
        const html = new TextDecoder().decode(bytes);
        const injected = /<\/head\s*>/i.test(html)
          ? html.replace(/<\/head\s*>/i, `${marker}</head>`)
          : marker + html;
        return new Response(injected, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      } catch {
        const error = new ProxyUpstreamError({
          reason: "Upstream request failed",
        });
        return new Response(error.reason, { status: 502 });
      }
    },
    websocket: {
      open(socket) {
        const bridge = socket.data;
        bridge.downstream = socket;
        for (const message of bridge.pending)
          if (socket.send(message) === -1) {
            closeBridge(bridge);
            break;
          }
        bridge.pending = [];
        bridge.pendingBytes = 0;
      },
      message(socket, message) {
        if (socket.data.upstream.readyState !== WebSocket.OPEN)
          closeBridge(socket.data);
        else if (typeof message === "string")
          socket.data.upstream.send(message);
        else socket.data.upstream.send(new Uint8Array(message));
      },
      close(socket) {
        closeBridge(socket.data);
      },
    },
  });
  return {
    origin: parseOrigin(`http://127.0.0.1:${server.port}`),
    close: () => {
      abort.abort();
      for (const bridge of bridges) closeBridge(bridge);
      server.stop(true);
    },
  };
}

export const BunProxyLive = Layer.succeed(ProxyService, {
  start: (options) =>
    Effect.acquireRelease(
      Effect.try({
        try: () => openProxy(options),
        catch: () =>
          new ProxyStartError({
            reason:
              "Could not start proxy: check upstream origin and local port",
          }),
      }),
      (handle) => Effect.sync(handle.close),
    ),
});
