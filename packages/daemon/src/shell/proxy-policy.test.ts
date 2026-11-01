import { expect, test } from "bun:test";
import { type Input, run, step } from "../core/proxy-policy";
import { parseOrigin, parseProtocols } from "./proxy-boundary";

const upstream = parseOrigin("http://localhost:5173");
const proxy = parseOrigin("http://127.0.0.1:8000");
const state = { tag: "ready" } as const;
const response = (
  headers: Extract<Input, { tag: "HttpResponse" }>["headers"],
  status = 200,
  head = false,
): Input => ({ tag: "HttpResponse", headers, status, head, upstream, proxy });

// Seeded generation with remove-one shrinking: a failure reports its smallest
// reproducing sequence, without introducing another dependency for the spike.
function property(name: string, check: (inputs: Input[]) => void) {
  test(name, () => {
    let seed = 0x12345;
    const next = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed;
    };
    const domain: Input[] = [
      ...[
        "text/html",
        "TEXT/HTML; charset=utf-8",
        "application/json",
        "image/png",
      ].flatMap((type) =>
        [200, 204, 304, 302].flatMap((status) =>
          [true, false].map((head) =>
            response(
              [
                ["content-type", type],
                ["location", `${upstream}/next`],
                ["set-cookie", "id=one; Domain=localhost; Secure; HttpOnly"],
                ["connection", "x-secret"],
                ["x-secret", "hidden"],
              ],
              status,
              head,
            ),
          ),
        ),
      ),
      {
        tag: "HttpRequest",
        headers: [
          ["Connection", "X-Secret"],
          ["X-Secret", "hidden"],
          ["Host", "upstream"],
        ],
      },
      { tag: "UpgradeRequest", protocols: ["vite-hmr", "other"] },
    ];
    for (let round = 0; round < 100; round++) {
      let inputs = Array.from(
        { length: 30 },
        () => domain[next() % domain.length],
      );
      try {
        check(inputs);
      } catch {
        for (let i = inputs.length - 1; i >= 0; i--) {
          const smaller = inputs.filter((_, index) => index !== i);
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

property("htmlOnly", (inputs) => {
  for (const input of inputs) {
    const command = step(state, input)[1][0];
    if (input.tag === "HttpResponse")
      expect(command.tag === "InjectHtml").toBe(
        !input.head &&
          input.status !== 204 &&
          input.status !== 304 &&
          input.headers.some(
            ([key, value]) =>
              key === "content-type" &&
              value.toLowerCase().startsWith("text/html"),
          ),
      );
  }
});
property("stableState", (inputs) => {
  expect(run(state, inputs)[0]).toEqual(state);
});
property("noHopHeaders", (inputs) => {
  for (const command of run(state, inputs)[1])
    if ("headers" in command)
      expect(
        command.headers.some(([key]) =>
          ["connection", "x-secret"].includes(key.toLowerCase()),
        ),
      ).toBe(false);
});
property("websocketProtocols", (inputs) => {
  for (const input of inputs)
    if (input.tag === "UpgradeRequest")
      expect(step(state, input)[1]).toEqual([
        { tag: "BridgeWebSocket", protocols: input.protocols },
      ]);
});
property("sameOriginRedirect", (inputs) => {
  for (const input of inputs)
    if (input.tag === "HttpResponse") {
      const command = step(state, input)[1][0];
      if ("headers" in command)
        expect(command.headers.find(([key]) => key === "location")?.[1]).toBe(
          `${proxy}/next`,
        );
    }
});
property("cookieIsolation", (inputs) => {
  for (const input of inputs)
    if (input.tag === "HttpResponse") {
      const command = step(state, input)[1][0];
      if ("headers" in command)
        expect(command.headers.find(([key]) => key === "set-cookie")?.[1]).toBe(
          "id=one; Secure; HttpOnly",
        );
    }
});
test("external and lookalike redirects remain external; CSP preserves unrelated directives", () => {
  const command = step(
    state,
    response([
      ["location", `${upstream}.evil/path`],
      [
        "content-security-policy",
        "default-src 'self'; frame-ancestors 'none'; script-src 'self'",
      ],
      ["x-frame-options", "DENY"],
    ]),
  )[1][0];
  expect(command).toEqual({
    tag: "StreamBody",
    headers: [
      ["location", `${upstream}.evil/path`],
      ["content-security-policy", "default-src 'self'; script-src 'self'"],
    ],
  });
});
test("boundary round trips and rejects invalid origins and protocols", () => {
  for (const origin of [
    "http://localhost:5173",
    "https://example.test",
    "http://127.0.0.1:80",
  ])
    expect(parseOrigin(parseOrigin(origin))).toBe(parseOrigin(origin));
  for (const value of [
    null,
    42,
    "file:///tmp",
    "ftp://localhost",
    "http://user:pass@localhost",
    "http://localhost/path",
    "http://localhost?q",
    "http://localhost/#hash",
  ])
    expect(() => parseOrigin(value)).toThrow();
  for (const protocols of [["vite-hmr"], ["one", "two"], ["a.b-1"]])
    expect(parseProtocols(protocols.join(", "))).toEqual(protocols);
  for (const value of ["", "one,one", "bad token", "bad/", "one,"])
    expect(() => parseProtocols(value)).toThrow();
  expect(parseProtocols(null)).toEqual([]);
});
