import frames from "@frames/vite-plugin";
import plugin from "@vitejs/plugin-vue";
import { defineConfig } from "vite";
export default defineConfig({ plugins: [frames(), plugin()] });
