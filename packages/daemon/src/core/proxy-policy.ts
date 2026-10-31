export type Origin = string & { readonly __origin: unique symbol };
export type Header = readonly [string, string];
export type State = { readonly tag: "ready" };
export type Input =
  | { readonly tag: "HttpRequest"; readonly headers: readonly Header[] }
  | {
      readonly tag: "HttpResponse";
      readonly headers: readonly Header[];
      readonly status: number;
      readonly head: boolean;
      readonly upstream: Origin;
      readonly proxy: Origin;
    }
  | { readonly tag: "UpgradeRequest"; readonly protocols: readonly string[] };
export type Command =
  | { readonly tag: "ForwardHttp"; readonly headers: readonly Header[] }
  | {
      readonly tag: "InjectHtml" | "StreamBody";
      readonly headers: readonly Header[];
    }
  | { readonly tag: "BridgeWebSocket"; readonly protocols: readonly string[] };

const hop = [
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
];
export function cleanHeaders(headers: readonly Header[]): Header[] {
  const nominated = headers
    .filter(([key]) => key.toLowerCase() === "connection")
    .flatMap(([, value]) =>
      value
        .toLowerCase()
        .split(",")
        .map((token) => token.trim()),
    );
  return headers.filter(
    ([key]) => ![...hop, ...nominated].includes(key.toLowerCase()),
  );
}

export function step(
  state: State,
  input: Input,
): readonly [State, readonly Command[]] {
  switch (input.tag) {
    case "HttpRequest":
      return [
        state,
        [
          {
            tag: "ForwardHttp",
            headers: cleanHeaders(input.headers).filter(
              ([key]) => key.toLowerCase() !== "host",
            ),
          },
        ],
      ];
    case "UpgradeRequest":
      return [state, [{ tag: "BridgeWebSocket", protocols: input.protocols }]];
    case "HttpResponse": {
      const html =
        !input.head &&
        input.status !== 204 &&
        input.status !== 304 &&
        input.headers.some(
          ([key, value]) =>
            key.toLowerCase() === "content-type" &&
            value.split(";")[0].trim().toLowerCase() === "text/html",
        );
      const headers = cleanHeaders(input.headers)
        .filter(
          ([key]) =>
            key.toLowerCase() !== "x-frame-options" &&
            !(
              html &&
              [
                "content-encoding",
                "content-length",
                "etag",
                "content-md5",
                "digest",
              ].includes(key.toLowerCase())
            ),
        )
        .map(([key, value]): Header => {
          switch (key.toLowerCase()) {
            case "location":
              return [
                key,
                value === input.upstream ||
                value.startsWith(`${input.upstream}/`) ||
                value.startsWith(`${input.upstream}?`) ||
                value.startsWith(`${input.upstream}#`)
                  ? input.proxy + value.slice(input.upstream.length)
                  : value,
              ];
            case "set-cookie":
              return [
                key,
                value
                  .split(";")
                  .filter(
                    (part, index) =>
                      index === 0 || !/^\s*domain\s*=/i.test(part),
                  )
                  .join(";"),
              ];
            case "content-security-policy":
            case "content-security-policy-report-only":
              return [
                key,
                value
                  .split(";")
                  .filter((part) => !/^\s*frame-ancestors(?:\s|$)/i.test(part))
                  .join(";"),
              ];
            default:
              return [key, value];
          }
        });
      return [state, [{ tag: html ? "InjectHtml" : "StreamBody", headers }]];
    }
  }
}

export function run(state: State, inputs: readonly Input[]) {
  return inputs.reduce<readonly [State, readonly Command[]]>(
    ([previous, commands], input) => {
      const [next, emitted] = step(previous, input);
      return [next, [...commands, ...emitted]];
    },
    [state, []],
  );
}
