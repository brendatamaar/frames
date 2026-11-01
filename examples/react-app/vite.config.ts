import frames from "@frames/vite-plugin";
import plugin from "@vitejs/plugin-react";
import { defineConfig } from "vite";
export default defineConfig({ plugins: [frames(), plugin()] });
