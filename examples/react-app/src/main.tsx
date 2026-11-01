import { Slot } from "@radix-ui/react-slot";
import type { ReactNode } from "react";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import Details from "./Details";

function Card({ children }: { children: ReactNode }) {
  return (
    <article>
      <h2>Release board</h2>
      {children}
    </article>
  );
}
function App() {
  const [visible, setVisible] = useState(true);
  return (
    <main>
      <h1>Project dashboard</h1>
      <Card>
        <Slot>
          <button type="button" onClick={() => setVisible(!visible)}>
            Toggle tasks
          </button>
        </Slot>
        {visible && (
          <ul>
            {["Design review", "Accessibility pass", "Release notes"].map(
              (task) => (
                <li key={task}>{task}</li>
              ),
            )}
          </ul>
        )}
      </Card>
      <Details />
    </main>
  );
}
const root = document.getElementById("root");
if (!root) throw new Error("Missing root");
createRoot(root).render(<App />);
