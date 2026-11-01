import { expect, test } from "bun:test";
import {
  NodeTypes,
  parse as parseTemplate,
  type TemplateChildNode,
} from "@vue/compiler-dom";
import { parse as parseSfc } from "@vue/compiler-sfc";
import { SourceMapConsumer } from "source-map-js";
import ts from "typescript";
import { type ModuleSource, planEdits } from "../core/stamping";
import { parseFile } from "./boundary";
import { applyEdits } from "./edits";
import { parseJsx } from "./jsx";
import { StampTransformError } from "./parsers";
import { parseVue } from "./vue";

for (const kind of ["vue", "jsx"] as const) {
  for (const newline of ["\n", "\r\n"]) {
    test(`${kind} compiler contract: native tags, original positions, escaping, maps and idempotence (${JSON.stringify(newline)})`, () => {
      const source =
        kind === "vue"
          ? `<script setup>const visible = true</script>\n<template>\n  <main><Card><button v-if="visible" v-bind="{}">Hello</button><ul><li v-for="n in 2">{{n}}</li></ul></Card><template #extra><span /></template><slot /></main>\n</template>`
          : `const view = <>\n  <main><Card><button {...props}>Hello</button><ul>{items.map(item => <li>{item}</li>)}</ul></Card><UI.Component /><span /></main>\n</>;`;
      const module: ModuleSource = {
        code: source.replaceAll("\n", newline),
        file: parseFile(`src/quote"&-🌿.${kind === "vue" ? "vue" : "tsx"}`),
        kind,
      };
      const parse = kind === "vue" ? parseVue : parseJsx;
      const sites = parse(module).sites;
      const native = sites.filter((site) => site.native);
      expect(native.length).toBe(5);
      const edits = planEdits(module, sites);
      expect(edits.length).toBe(native.length);
      for (const [index, edit] of edits.entries()) {
        const start = native[index].start;
        const prefix = module.code.slice(0, start);
        const line = prefix.split("\n").length;
        const column = start - prefix.lastIndexOf("\n");
        expect(edit.text).toContain(
          kind === "vue"
            ? `data-frames-line="${line}" data-frames-column="${column}"`
            : `data-frames-line={${line}} data-frames-column={${column}}`,
        );
      }
      const result = applyEdits(module, edits);
      expect(result.map.sourcesContent).toEqual([module.code]);
      expect(result.map.sources).toEqual([module.file]);
      expect(result.map.mappings.length).toBeGreaterThan(0);
      const consumer = new SourceMapConsumer({
        version: String(result.map.version),
        sources: result.map.sources,
        names: result.map.names,
        mappings: result.map.mappings,
      });
      const token = "Hello";
      const generatedPrefix = result.code.slice(0, result.code.indexOf(token));
      const originalPrefix = module.code.slice(0, module.code.indexOf(token));
      const mapped = consumer.originalPositionFor({
        line: generatedPrefix.split("\n").length,
        column: generatedPrefix.length - generatedPrefix.lastIndexOf("\n") - 1,
      });
      expect(mapped.line).toBe(originalPrefix.split("\n").length);
      expect(mapped.column).toBe(
        originalPrefix.length - originalPrefix.lastIndexOf("\n") - 1,
      );
      const again = { ...module, code: result.code };
      expect(planEdits(again, parse(again).sites)).toEqual([]);
      expect(result.code).not.toContain("import ");
      if (kind === "vue") {
        const template = parseSfc(result.code).descriptor.template;
        if (!template) throw new Error("Missing parsed template");
        const files: string[] = [];
        const visit = (node: TemplateChildNode) => {
          if (node.type !== NodeTypes.ELEMENT) return;
          for (const prop of node.props)
            if (
              prop.type === NodeTypes.ATTRIBUTE &&
              prop.name === "data-frames-file"
            )
              files.push(prop.value?.content ?? "");
          node.children.forEach(visit);
        };
        parseTemplate(template.content).children.forEach(visit);
        expect(files).toEqual(native.map(() => module.file));
      } else {
        const ast = ts.createSourceFile(
          module.file,
          result.code,
          ts.ScriptTarget.ESNext,
          true,
          ts.ScriptKind.TSX,
        );
        const files: string[] = [];
        const visit = (node: ts.Node) => {
          if (
            ts.isJsxAttribute(node) &&
            node.name.getText(ast) === "data-frames-file" &&
            node.initializer &&
            ts.isJsxExpression(node.initializer) &&
            node.initializer.expression &&
            ts.isStringLiteral(node.initializer.expression)
          )
            files.push(node.initializer.expression.text);
          ts.forEachChild(node, visit);
        };
        visit(ast);
        expect(files).toEqual(native.map(() => module.file));
      }
    });
  }
}
test("Vue adapter reports unsupported templates and preserves explicit marker attributes", () => {
  for (const code of [
    '<template lang="pug">main Hello</template>',
    '<template src="./view.html" />',
  ]) {
    const result = parseVue({
      code,
      file: parseFile("src/App.vue"),
      kind: "vue",
    });
    expect(result.sites).toEqual([]);
    expect(result.diagnostic).toContain("DOM context");
  }
  const module: ModuleSource = {
    code: '<template><div data-frames-file="owned"/><button :data-frames-line="1" /></template>',
    file: parseFile("App.vue"),
    kind: "vue",
  };
  expect(planEdits(module, parseVue(module).sites)).toEqual([]);
});
test("real parsers reject malformed syntax with file context", () => {
  expect(() =>
    parseVue({
      file: parseFile("App.vue"),
      kind: "vue",
      code: "<template><div></template>",
    }),
  ).toThrow(StampTransformError);
  expect(() =>
    parseJsx({
      file: parseFile("App.tsx"),
      kind: "jsx",
      code: "const a = <main><div></main>",
    }),
  ).toThrow(StampTransformError);
});
