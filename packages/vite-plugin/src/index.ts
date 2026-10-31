import type { Plugin } from "vite";
/** Scaffold only. Source stamping is gated on the M1 spike. */
export default function frames(): Plugin {
  return { name: "frames", apply: "serve" };
}
