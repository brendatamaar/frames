import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

for (const [index, framework] of ["vue", "react", "svelte"].entries()) {
  const port = 5190 + index;
  const child = spawn(
    "bun",
    [
      "run",
      "--cwd",
      `examples/${framework}-app`,
      "dev",
      "--port",
      String(port),
      "--strictPort",
    ],
    { stdio: "pipe" },
  );
  let output = "";
  child.stdout.on("data", (data) => {
    output += data;
  });
  child.stderr.on("data", (data) => {
    output += data;
  });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error(output);
      try {
        const response = await fetch(`http://127.0.0.1:${port}`);
        if (response.ok) {
          ready = true;
          break;
        }
      } catch {
        /* Server is still starting; bounded retry below. */
      }
      await delay(200);
    }
    if (!ready) throw new Error(`Startup timeout: ${output}`);
    const entry = `/src/main.${framework === "react" ? "tsx" : "ts"}`;
    for (const route of [
      entry,
      ...(framework === "react"
        ? []
        : [`/src/App.${framework === "vue" ? "vue" : "svelte"}`]),
    ]) {
      const response = await fetch(`http://127.0.0.1:${port}${route}`);
      if (!response.ok) throw new Error(await response.text());
    }
    console.log(`${framework}: dev server and transformed components passed`);
  } finally {
    if (process.platform === "win32") {
      const { execFileSync } = await import("node:child_process");
      if (child.exitCode === null)
        execFileSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
          stdio: "ignore",
        });
    } else child.kill("SIGTERM");
  }
}
