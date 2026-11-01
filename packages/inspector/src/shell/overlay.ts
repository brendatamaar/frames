import {
  type Input,
  type State,
  step,
  type TargetSnapshot,
} from "../core/inspection";
import { createTargetReader, type TargetReader } from "./targets";

export interface OverlayRenderer {
  readonly host: HTMLElement;
  readonly toggle: HTMLButtonElement;
  readonly render: (state: State) => void;
  readonly attach: () => void;
  readonly remove: () => void;
}
export function createOverlay(document: Document): OverlayRenderer {
  const host = document.createElement("frames-inspector");
  const root = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial !important; position: fixed !important; inset: 0 !important; z-index: 2147483647 !important; pointer-events: none !important; }
    * { box-sizing: border-box; }
    .panel { position: fixed; top: 12px; right: 12px; width: min(320px, calc(100vw - 24px)); padding: 12px; border: 1px solid #cbd5e1; border-radius: 8px; background: #fff; color: #0f172a; font: 12px/1.5 system-ui, sans-serif; pointer-events: auto; box-shadow: 0 2px 10px #0002; }
    button { all: unset; display: inline-block; padding: 6px 12px; border: 1px solid #475569; border-radius: 4px; cursor: pointer; font: 600 13px/1.5 system-ui, sans-serif; color: #0f172a; background: #f8fafc; }
    button[aria-pressed=true] { background: #1d4ed8; color: white; }
    button:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }
    ol { margin: 8px 0 0; padding: 0; list-style: none; max-height: min(50vh, 400px); overflow: auto; }
    pre { white-space: pre-wrap; overflow-wrap: anywhere; font: 11px/1.5 monospace; margin: 8px 0; }
    .box { position: fixed; pointer-events: none; border: 2px solid #2563eb; background: #2563eb18; }
    .box[data-kind=hover] { border-color: #ea580c; background: #ea580c12; }
  `;
  const boxes = document.createElement("div");
  boxes.setAttribute("aria-hidden", "true");
  const panel = document.createElement("section");
  panel.className = "panel";
  panel.setAttribute("aria-label", "Frames inspector");
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.textContent = "Inspect";
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  const details = document.createElement("ol");
  details.setAttribute("aria-label", "Element details");
  panel.append(toggle, status, details);
  root.append(style, boxes, panel);
  const rectangle = (target: TargetSnapshot, kind: "hover" | "selected") => {
    const box = document.createElement("div");
    box.className = "box";
    box.dataset.kind = kind;
    box.dataset.targetId = String(target.id);
    Object.assign(box.style, {
      left: `${target.box.x}px`,
      top: `${target.box.y}px`,
      width: `${target.box.w}px`,
      height: `${target.box.h}px`,
    });
    return box;
  };
  return {
    host,
    toggle,
    attach() {
      if (!host.isConnected) document.documentElement.append(host);
    },
    remove() {
      host.remove();
    },
    render(state) {
      const active = state.tag === "inspecting";
      toggle.setAttribute("aria-pressed", String(active));
      status.textContent = active
        ? `${state.selected.length} selected · Shift-click to toggle`
        : "Inspect mode off";
      boxes.replaceChildren();
      details.replaceChildren();
      if (!active) return;
      for (const target of state.selected)
        boxes.append(rectangle(target, "selected"));
      if (
        state.hover &&
        !state.selected.some((target) => target.id === state.hover?.id)
      )
        boxes.append(rectangle(state.hover, "hover"));
      const readout = state.selected.length
        ? state.selected
        : state.hover
          ? [state.hover]
          : [];
      for (const target of readout) {
        const item = document.createElement("li");
        item.dataset.targetId = String(target.id);
        const text = document.createElement("pre");
        text.textContent = JSON.stringify(
          {
            tag: target.tag,
            classes: target.classes,
            selector: target.selector,
            box: target.box,
            styles: target.styles,
          },
          null,
          2,
        );
        item.append(text);
        details.append(item);
      }
    },
  };
}

export interface InspectorHandle {
  readonly dispose: () => void;
}
const installationKey = Symbol.for("frames.inspector.installation");
type InspectorDocument = Document & { [installationKey]?: InspectorHandle };

export function installInspector(
  document: Document,
  view: Window,
  targets: TargetReader = createTargetReader(document, view),
  overlay: OverlayRenderer = createOverlay(document),
): InspectorHandle {
  const owned = document as InspectorDocument;
  const existing = owned[installationKey];
  if (existing) return existing;
  let state: State = { tag: "disabled" };
  let scheduled: number | undefined;

  const selectedTargets = (): readonly TargetSnapshot[] =>
    state.tag === "inspecting"
      ? [...state.selected, ...(state.hover ? [state.hover] : [])]
      : [];
  const dispatch = (input: Input, event?: Event) => {
    const [next, commands] = step(state, input);
    state = next;
    for (const command of commands) {
      switch (command.tag) {
        case "BlockClick":
          if (!event) throw new Error("BlockClick requires the current event");
          event.preventDefault();
          event.stopImmediatePropagation();
          break;
        case "Render":
          overlay.render(command.state);
          break;
        case "ReleaseOverlay":
          release();
          break;
      }
    }
    targets.retain(selectedTargets().map((target) => target.id));
  };
  const toggle = (event: Event) => {
    event.stopPropagation();
    dispatch({ tag: state.tag === "inspecting" ? "Disable" : "Enable" });
  };
  const eventTarget = (event: Event): Element | null => {
    const path = event.composedPath();
    if (path.includes(overlay.host)) return null;
    return (
      path.find((node): node is Element => node instanceof Element) ?? null
    );
  };
  const hover = (event: Event) => {
    if (state.tag !== "inspecting") return;
    const target = eventTarget(event);
    if (!target) return;
    dispatch({ tag: "Hover", target: targets.read(target) });
  };
  const leave = () => {
    if (state.tag === "inspecting") dispatch({ tag: "Hover", target: null });
  };
  const click = (event: MouseEvent) => {
    if (state.tag !== "inspecting") return;
    const element = eventTarget(event);
    const target = element && targets.read(element);
    if (target) dispatch({ tag: "Pick", target, shift: event.shiftKey }, event);
  };
  const refresh = () => {
    scheduled = undefined;
    const snapshots: TargetSnapshot[] = [];
    const removed = [];
    for (const target of selectedTargets()) {
      const element = targets.element(target.id);
      const snapshot = element && targets.read(element);
      if (snapshot) snapshots.push(snapshot);
      else removed.push(target.id);
    }
    dispatch({ tag: "TargetsRemoved", ids: removed });
    dispatch({ tag: "Refreshed", targets: snapshots });
  };
  const scheduleRefresh = () => {
    if (state.tag === "inspecting" && scheduled === undefined)
      scheduled = view.requestAnimationFrame(refresh);
  };
  const observer = new MutationObserver(() => {
    if (state.tag === "disposed") return;
    overlay.attach();
    scheduleRefresh();
  });
  const resized = new ResizeObserver(scheduleRefresh);
  const pagehide = (event: PageTransitionEvent) => {
    if (!event.persisted) dispatch({ tag: "Dispose" });
  };
  const release = () => {
    observer.disconnect();
    resized.disconnect();
    if (scheduled !== undefined) view.cancelAnimationFrame(scheduled);
    view.removeEventListener("pointermove", hover, true);
    view.removeEventListener("pointerout", leave, true);
    view.removeEventListener("click", click, true);
    view.removeEventListener("scroll", scheduleRefresh, true);
    view.removeEventListener("resize", scheduleRefresh);
    view.removeEventListener("pagehide", pagehide);
    overlay.toggle.removeEventListener("click", toggle);
    overlay.remove();
    targets.clear();
    delete owned[installationKey];
  };
  const handle = { dispose: () => dispatch({ tag: "Dispose" }) };
  owned[installationKey] = handle;
  overlay.attach();
  overlay.render(state);
  overlay.toggle.addEventListener("click", toggle);
  view.addEventListener("pointermove", hover, true);
  view.addEventListener("pointerout", leave, true);
  view.addEventListener("click", click, true);
  view.addEventListener("scroll", scheduleRefresh, true);
  view.addEventListener("resize", scheduleRefresh);
  view.addEventListener("pagehide", pagehide);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    characterData: true,
  });
  resized.observe(document.documentElement);
  return handle;
}
