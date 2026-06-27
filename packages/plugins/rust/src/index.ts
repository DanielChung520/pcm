import { Parser, Language } from 'web-tree-sitter';
import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import type { LanguagePlugin, AST, Symbol, Relationship, Import } from '@pcm/core';

const _require = createRequire(import.meta.url);

interface RsNode {
  type: string; text: string; parent: RsNode | null;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  children: RsNode[]; namedChildren: RsNode[];
  [key: string]: unknown;
}

export class RustLanguagePlugin implements LanguagePlugin {
  name = 'rust';
  version = '0.1.0';
  extensions = ['.rs'];
  private parser: Parser | null = null;

  async parse(filePath: string, source: string): Promise<AST> {
    const parser = await this.getParser();
    const tree = parser.parse(source);
    return { language: 'rust', filePath, source, raw: tree };
  }

  async extractImports(ast: AST): Promise<Import[]> {
    const root = (ast.raw as { rootNode: RsNode }).rootNode;
    const imports: Import[] = [];

    this.walkNode(root, (node) => {
      if (node.type === 'use_declaration') {
        const module = node.namedChildren
          .filter(c => c.type !== 'alias')
          .map(c => c.text)
          .join('');
        imports.push({
          source: module,
          imported: [],
          isDefault: true, isTypeOnly: false,
          startLine: node.startPosition.row + 1,
        });
      }
      if (node.type === 'extern_crate_declaration') {
        const name = node.namedChildren[0]?.text || '';
        imports.push({ source: name, imported: [], isDefault: true, isTypeOnly: false, startLine: node.startPosition.row + 1 });
      }
    });
    return imports;
  }

  async extractSymbols(ast: AST): Promise<Symbol[]> {
    const root = (ast.raw as { rootNode: RsNode }).rootNode;
    const symbols: Symbol[] = [];
    const filePath = ast.filePath;

    const addSym = (type: Symbol['type'], node: RsNode) => {
      const name = node.namedChildren.find(c => c.type === 'name' || c.type === 'identifier' || c.type === 'type_identifier')?.text || 'anonymous';
      symbols.push({
        id: randomUUID(), projectId: '', type, name,
        fullyQualifiedName: `${filePath}::${name}`,
        filePath,
        location: { file: filePath, startLine: node.startPosition.row + 1, startColumn: node.startPosition.column + 1, endLine: node.endPosition.row + 1, endColumn: node.endPosition.column + 1 },
        language: 'rust', complexity: 1, lineCount: node.endPosition.row - node.startPosition.row + 1,
        docString: null, metadata: {},
      });
    };

    this.walkNode(root, (node) => {
      if (node.type === 'function_item' || node.type === 'function') addSym('function', node);
      if (node.type === 'struct_item') addSym('class', node);
      if (node.type === 'enum_item') addSym('enum', node);
      if (node.type === 'trait_item') addSym('interface', node);
      if (node.type === 'type_item') addSym('type', node);
      if (node.type === 'const_item') addSym('variable', node);
      if (node.type === 'static_item') addSym('variable', node);
      if (node.type === 'macro_definition') addSym('function', node);
    });
    return symbols;
  }

  async extractRelationships(ast: AST): Promise<Relationship[]> {
    const root = (ast.raw as { rootNode: RsNode }).rootNode;
    const rels: Relationship[] = [];
    const imports = await this.extractImports(ast);
    for (const imp of imports) {
      rels.push({ id: randomUUID(), sourceId: '', targetId: '', type: 'imports', strength: 1.0, metadata: { importSource: imp.source } });
    }
    this.walkNode(root, (node) => {
      if (node.type === 'impl_item') {
        const trait = node.namedChildren.find(c => c.type === 'trait_type');
        if (trait) rels.push({ id: randomUUID(), sourceId: '', targetId: '', type: 'implements', strength: 1.0, metadata: { targetName: trait.text } });
      }
    });
    return rels;
  }

  async calculateComplexity(ast: AST): Promise<number> {
    let cc = 1;
    const root = (ast.raw as { rootNode: RsNode }).rootNode;
    this.walkNode(root, (node) => {
      if (['if_expression', 'match_arm', 'for_expression', 'while_expression', 'loop_expression', 'catch_clause', 'binary_expression'].includes(node.type)) cc++;
    });
    return cc;
  }

  private async getParser(): Promise<Parser> {
    if (this.parser) return this.parser;
    await Parser.init();
    this.parser = new Parser();
    const pkgDir = path.dirname(_require.resolve('tree-sitter-rust/package.json'));
    const lang = await Language.load(path.join(pkgDir, 'tree-sitter-rust.wasm'));
    this.parser.setLanguage(lang);
    return this.parser;
  }

  private walkNode(node: RsNode, fn: (n: RsNode) => void): void {
    fn(node);
    for (const child of node.namedChildren) this.walkNode(child as RsNode, fn);
  }
}
