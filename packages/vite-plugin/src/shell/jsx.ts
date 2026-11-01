import ts from "typescript";
import type { ElementSite } from "../core/stamping";
import {
  type SourceParser,
  StampTransformError,
  validateSites,
} from "./parsers";

export const parseJsx: SourceParser = (module) => {
  const validation = ts.transpileModule(module.code, {
    fileName: module.file,
    compilerOptions: {
      jsx: ts.JsxEmit.Preserve,
      target: ts.ScriptTarget.ESNext,
    },
    reportDiagnostics: true,
  });
  const error = validation.diagnostics?.find(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
  if (error)
    throw new StampTransformError(
      module.file,
      ts.flattenDiagnosticMessageText(error.messageText, "\n"),
    );
  const ast = ts.createSourceFile(
    module.file,
    module.code,
    ts.ScriptTarget.ESNext,
    true,
    module.file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.JSX,
  );
  const sites: ElementSite[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const stamped = node.attributes.properties.some(
        (attribute) =>
          ts.isJsxAttribute(attribute) &&
          attribute.name.getText(ast).startsWith("data-frames-"),
      );
      sites.push({
        start: node.getStart(ast),
        insert: node.tagName.end,
        native:
          ts.isIdentifier(node.tagName) && /^[a-z]/.test(node.tagName.text),
        stamped,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return { sites: validateSites(module, sites) };
};
