import {
  ElementTypes,
  NodeTypes,
  parse as parseTemplate,
  type TemplateChildNode,
} from "@vue/compiler-dom";
import { parse as parseSfc } from "@vue/compiler-sfc";
import type { ElementSite } from "../core/stamping";
import {
  type SourceParser,
  StampTransformError,
  validateSites,
} from "./parsers";

export const parseVue: SourceParser = (module) => {
  const parsed = parseSfc(module.code, { filename: module.file });
  if (parsed.errors.length)
    throw new StampTransformError(module.file, String(parsed.errors[0]));
  const template = parsed.descriptor.template;
  if (!template) return { sites: [] };
  if (template.src || (template.lang && template.lang !== "html"))
    return {
      sites: [],
      diagnostic: `Frames skips external/non-HTML template in ${module.file}; DOM context remains available`,
    };
  const sites: ElementSite[] = [];
  try {
    const ast = parseTemplate(template.content);
    const visit = (node: TemplateChildNode) => {
      if (node.type !== NodeTypes.ELEMENT) return;
      const start = template.loc.start.offset + node.loc.start.offset;
      const stamped = node.props.some((prop) =>
        prop.type === NodeTypes.ATTRIBUTE
          ? prop.name.startsWith("data-frames-")
          : prop.type === NodeTypes.DIRECTIVE &&
            prop.arg?.type === NodeTypes.SIMPLE_EXPRESSION &&
            prop.arg.isStatic &&
            prop.arg.content.startsWith("data-frames-"),
      );
      sites.push({
        start,
        insert: start + 1 + node.tag.length,
        native:
          node.tagType === ElementTypes.ELEMENT &&
          !["template", "slot", "script", "style"].includes(node.tag),
        stamped,
      });
      for (const child of node.children) visit(child);
    };
    for (const child of ast.children) visit(child);
  } catch (error) {
    throw new StampTransformError(
      module.file,
      error instanceof Error ? error.message : String(error),
    );
  }
  return { sites: validateSites(module, sites) };
};
