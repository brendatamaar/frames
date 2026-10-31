import { createRoot } from "react-dom/client";

const root = document.getElementById("root");
if (!root) throw new Error("Missing root");
createRoot(root).render(
  <main>
    <h1>Frames</h1>
    <p>M0 scaffold</p>
  </main>,
);
