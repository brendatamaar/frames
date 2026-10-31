import { execFileSync } from "node:child_process";

const run = (args) => execFileSync("bun", args, { stdio: "inherit" });
for (const name of ["protocol", "vite-plugin"]) {
  const entries = name === "protocol" ? ["schema", "types"] : ["index"];
  for (const entry of entries)
    run([
      "build",
      "packages/" + name + "/src/" + entry + ".ts",
      "--target=node",
      "--packages=external",
      "--outdir=packages/" + name + "/dist",
    ]);
}
run([
  "build",
  "packages/daemon/src/cli.ts",
  "--target=bun",
  "--packages=external",
  "--outdir=packages/daemon/dist",
]);
run([
  "build",
  "packages/inspector/src/index.ts",
  "--target=browser",
  "--minify",
  "--format=iife",
  "--outfile=packages/inspector/dist/inspector.js",
]);
for (const dir of [
  "packages/canvas",
  "examples/vue-app",
  "examples/react-app",
  "examples/svelte-app",
])
  run(["run", "--cwd", dir, "build"]);
