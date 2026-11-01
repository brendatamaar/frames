import {
  makeContext,
  type TargetId,
  type TargetSnapshot,
} from "../core/inspection";
import { readStamp } from "./source";

const styleKeys = [
  "display",
  "position",
  "padding",
  "margin",
  "gap",
  "color",
  "background-color",
  "font-family",
  "font-size",
  "font-weight",
  "border-radius",
] as const;
export interface TargetReader {
  readonly read: (element: Element) => TargetSnapshot | null;
  readonly element: (id: TargetId) => Element | undefined;
  readonly retain: (ids: readonly TargetId[]) => void;
  readonly clear: () => void;
}

export function selectorFor(
  element: Element,
  document: Document,
): string | null {
  if (!element.isConnected || element.getRootNode() !== document) return null;
  if (element.id) {
    const selector = `#${CSS.escape(element.id)}`;
    if (document.querySelectorAll(selector).length === 1) return selector;
  }
  const parts: string[] = [];
  let node: Element | null = element;
  while (node) {
    const siblings: Element[] = node.parentElement
      ? [...node.parentElement.children].filter(
          (sibling) =>
            sibling.localName === node?.localName &&
            sibling.namespaceURI === node?.namespaceURI,
        )
      : [node];
    parts.unshift(
      `${CSS.escape(node.localName)}:nth-of-type(${siblings.indexOf(node) + 1})`,
    );
    node = node.parentElement;
  }
  const selector = parts.join(" > ");
  const matches = document.querySelectorAll(selector);
  return matches.length === 1 && matches[0] === element ? selector : null;
}

export function createTargetReader(
  document: Document,
  view: Window,
): TargetReader {
  let nextId = 1;
  const identities = new WeakMap<Element, TargetId>();
  const references = new Map<TargetId, Element>();
  return {
    read(element) {
      const selector = selectorFor(element, document);
      if (selector === null) return null;
      const rect = element.getBoundingClientRect();
      const box = { x: rect.x, y: rect.y, w: rect.width, h: rect.height };
      if (!Object.values(box).every(Number.isFinite) || box.w < 0 || box.h < 0)
        return null;
      let id = identities.get(element);
      if (id === undefined) {
        id = nextId++ as TargetId;
        identities.set(element, id);
      }
      references.set(id, element);
      const computed = view.getComputedStyle(element);
      return {
        id,
        selector,
        tag: element.localName,
        classes: [...element.classList],
        styles: Object.fromEntries(
          styleKeys.map((key) => [key, computed.getPropertyValue(key)]),
        ),
        box,
        context: makeContext(readStamp(element), element.outerHTML),
      };
    },
    element: (id) => references.get(id),
    retain(ids) {
      for (const id of references.keys())
        if (!ids.includes(id)) references.delete(id);
    },
    clear() {
      references.clear();
    },
  };
}
