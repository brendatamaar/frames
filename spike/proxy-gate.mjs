// Local browser gate; no browser-automation dependency. Edge/Chrome CDP only.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const children = [];
function child(command, args) {
  const handle = spawn(command, args, {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  let output = "";
  handle.stdout.on("data", (data) => {
    output += data;
  });
  handle.stderr.on("data", (data) => {
    output += data;
  });
  handle.on("error", (error) => {
    output += error.message;
  });
  children.push(handle);
  return { handle, output: () => output };
}
async function until(probe, label, timeout = 30_000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try {
      const value = await probe();
      if (value) return value;
    } catch (error) {
      last = error;
    }
    await delay(100);
  }
  throw new Error(`${label} timed out`, { cause: last });
}
async function port() {
  const listener = createServer();
  await new Promise((done) => listener.listen(0, "127.0.0.1", done));
  const value = listener.address().port;
  await new Promise((done) => listener.close(done));
  return value;
}
async function cdp(url) {
  const socket = new WebSocket(url);
  await new Promise((done, fail) => {
    socket.onopen = done;
    socket.onerror = fail;
  });
  let id = 0;
  const pending = new Map();
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    clearTimeout(waiter.timer);
    if (message.error) waiter.fail(new Error(JSON.stringify(message.error)));
    else waiter.done(message.result);
  };
  return {
    socket,
    send: (method, params = {}) =>
      new Promise((done, fail) => {
        const key = ++id;
        const timer = setTimeout(() => {
          pending.delete(key);
          fail(new Error(`CDP timeout: ${method}`));
        }, 10_000);
        pending.set(key, { done, fail, timer });
        socket.send(JSON.stringify({ id: key, method, params }));
      }),
  };
}

let browser;
const profileRoot = resolve(".frames/dist");
const profile = resolve(profileRoot, `spike-browser-${process.pid}`);
assert(
  profile.startsWith(`${profileRoot}/`) ||
    profile.startsWith(`${profileRoot}\\`),
);
const reactEntry = "examples/react-app/src/main.tsx";
const reactOriginal = await readFile(reactEntry, "utf8");
try {
  // The scaffold's entry exports no component and Vite therefore reloads it.
  // Expose its component temporarily so this probe tests React Fast Refresh.
  await writeFile(reactEntry, `${reactOriginal}\nexport { App };\n`);
  const origins = [];
  for (const app of ["vue", "react"]) {
    const selected = await port();
    const server = child("bun", [
      "run",
      "--cwd",
      `examples/${app}-app`,
      "dev",
      "--port",
      String(selected),
      "--strictPort",
    ]);
    const origin = `http://127.0.0.1:${selected}`;
    await until(async () => {
      if (server.handle.exitCode !== null) throw new Error(server.output());
      return (await fetch(origin)).ok;
    }, `${app} startup`);
    origins.push(origin);
  }
  const cliMode = process.env.FRAMES_GATE_CLI === "1";
  const host = cliMode
    ? undefined
    : child("bun", [
        "run",
        "packages/daemon/src/shell/proxy-spike.ts",
        ...origins,
      ]);
  const proxies = cliMode
    ? {}
    : await until(() => {
        const line = host
          .output()
          .split(/\r?\n/)
          .find((value) => value.startsWith('{"vue"'));
        return line && JSON.parse(line);
      }, "proxy startup");
  if (cliMode) {
    for (const [index, app] of ["vue", "react"].entries()) {
      const cli = child("bun", [
        "run",
        "packages/daemon/dist/cli.js",
        "proxy",
        origins[index],
      ]);
      proxies[app] = await until(() => {
        if (cli.handle.exitCode !== null) throw new Error(cli.output());
        return cli
          .output()
          .split(/\r?\n/)
          .find((line) => /^http:\/\/127\.0\.0\.1:\d+$/.test(line));
      }, `${app} CLI startup`);
    }
  }
  await mkdir(profile, { recursive: true });
  const executable =
    process.env.FRAMES_BROWSER ??
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
  child(executable, [
    "--headless=new",
    "--disable-gpu",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-extensions",
    "--disable-sync",
    "--metrics-recording-only",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-port=0",
    "--remote-debugging-address=127.0.0.1",
    `--user-data-dir=${profile}`,
    "about:blank",
  ]);
  const debugPort = await until(
    async () =>
      (await readFile(`${profile}/DevToolsActivePort`, "utf8")).split("\n")[0],
    "browser startup",
  );
  const targets = await (
    await fetch(`http://127.0.0.1:${debugPort}/json/list`)
  ).json();
  browser = await cdp(
    targets.find((target) => target.type === "page").webSocketDebuggerUrl,
  );
  await browser.send("Page.enable");
  await browser.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
    window.__documentToken = crypto.randomUUID();
    window.__socketUrls = [];
    window.__socketMessages = [];
    const NativeSocket = window.WebSocket;
    window.WebSocket = class extends NativeSocket {
      constructor(...args) {
        super(...args);
        window.__socketUrls.push(String(args[0]));
        this.addEventListener('message', event => window.__socketMessages.push(String(event.data)));
      }
    };
  `,
  });
  const evaluate = async (expression) => {
    const result = await browser.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
    });
    if (result.exceptionDetails)
      throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  for (const app of ["vue", "react"]) {
    const origin = proxies[app];
    await browser.send("Page.navigate", { url: origin });
    await until(
      () =>
        evaluate(
          `!!document.querySelector('h1') && (window.__framesSpike === true || !!document.querySelector('script[data-frames-inspector]'))`,
        ),
      `${app} parent render`,
    );
    await evaluate(
      `(() => { for (let i = 0; i < 6; i++) { const frame = document.createElement('iframe'); frame.src = '/?frame=' + i; document.body.append(frame); } return true; })()`,
    );
    const snapshot = () =>
      evaluate(`Array.from(document.querySelectorAll('iframe'), frame => ({
      title: frame.contentDocument?.querySelector('h1')?.textContent,
      token: frame.contentWindow.__documentToken,
      injected: frame.contentWindow.__framesSpike || frame.contentWindow.performance.getEntriesByType('resource').some(entry => entry.name.endsWith('/__frames/inspector.js') && entry.responseStatus === 200),
      urls: frame.contentWindow.__socketUrls,
      messages: frame.contentWindow.__socketMessages
    }))`);
    const initial = await until(async () => {
      const frames = await snapshot();
      return (
        frames.length === 6 &&
        frames.every(
          (frame) =>
            frame.title === "Project dashboard" &&
            frame.injected &&
            frame.messages.some((message) => message.includes("connected")),
        ) &&
        frames
      );
    }, `${app} six frames connected`);
    assert(
      initial.every(
        (frame) =>
          frame.urls.length > 0 &&
          frame.urls.every((url) => new URL(url).port === new URL(origin).port),
      ),
      "HMR must use proxy, not Vite fallback port",
    );
    const file = `examples/${app}-app/src/${app === "vue" ? "App.vue" : "main.tsx"}`;
    const original = await readFile(file, "utf8");
    assert(original.includes("Project dashboard"));
    try {
      await writeFile(
        file,
        original.replace("Project dashboard", "S0 HMR verified"),
      );
      const updated = await until(async () => {
        const frames = await snapshot();
        return (
          frames.length === 6 &&
          frames.every(
            (frame) =>
              frame.title === "S0 HMR verified" &&
              frame.messages.some((message) => message.includes("update")),
          ) &&
          frames
        );
      }, `${app} HMR across six frames`);
      assert.deepEqual(
        updated.map((frame) => frame.token),
        initial.map((frame) => frame.token),
        "HMR must not reload the documents",
      );
      console.log(
        `${app}: PASS six concurrent framed apps; injected marker; proxied HMR update; no document reload`,
      );
    } finally {
      await writeFile(file, original);
    }
  }
  console.log("S0 browser gate PASS");
} finally {
  await writeFile(reactEntry, reactOriginal);
  browser?.socket.close();
  for (const handle of children.reverse()) {
    if (handle.exitCode !== null || !handle.pid) continue;
    if (process.platform === "win32") {
      try {
        execFileSync("taskkill", ["/pid", String(handle.pid), "/T", "/F"], {
          stdio: "pipe",
          windowsHide: true,
        });
      } catch (error) {
        if (handle.exitCode === null)
          console.error(`Cleanup failed for ${handle.pid}: ${error.message}`);
      }
    } else handle.kill("SIGTERM");
  }
}
