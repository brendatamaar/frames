import type { Plugin } from "vite";
import { type State, step } from "./core/stamping";
import { parseModule, parseRoot } from "./shell/boundary";
import { applyEdits } from "./shell/edits";
import { parseJsx } from "./shell/jsx";
import { StampTransformError } from "./shell/parsers";
import { parseVue } from "./shell/vue";

export default function frames(): Plugin {
  let state: State = { tag: "unconfigured" };
  return {
    name: "frames",
    enforce: "pre",
    apply: "serve",
    configResolved(config) {
      [state] = step(state, {
        tag: "Configured",
        root: parseRoot(config.root),
        command: config.command,
        production: config.isProduction,
      });
    },
    transform(code, id, options) {
      if (state.tag !== "enabled") return;
      const module = parseModule(state.root, code, id, options?.ssr === true);
      if (!module) return;
      const [, commands] = step(state, { tag: "TransformRequested", module });
      for (const command of commands) {
        if (command.tag !== "ParseSource")
          throw new Error("Expected source parser command");
        try {
          const result = (module.kind === "vue" ? parseVue : parseJsx)(
            command.module,
          );
          if (result.diagnostic) this.warn(result.diagnostic);
          const [, plans] = step(state, {
            tag: "Parsed",
            module,
            sites: result.sites,
          });
          for (const plan of plans) {
            if (plan.tag !== "ApplyEdits")
              throw new Error("Expected edit command");
            return applyEdits(plan.module, plan.edits, id);
          }
        } catch (error) {
          if (error instanceof StampTransformError)
            return this.error({ message: error.message, id });
          throw error;
        }
      }
    },
  };
}
