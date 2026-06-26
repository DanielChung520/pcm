import { Parser, Language } from 'web-tree-sitter';
import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import type { LanguagePlugin, AST, Symbol, Relationship, Import } from '@pcm/core';

const _require = createRequire(import.meta.url);

interface PyNode {
  type: string;
  text: string;
  parent: PyNode | null;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  children: PyNode[];
  namedChildren: PyNode[];
  [key: string]: unknown;
}

export class PythonLanguagePlugin implements LanguagePlugin {
  name = 'python';
  version = '0.1.0';
  extensions = ['.py'];
  private parser: Parser | null = null;

  async parse(filePath: string, source: string): Promise<AST> {
    const parser = await this.getParser();
    const tree = parser.parse(source);
    return { language: 'python', filePath, source, raw: tree };
  }

  async extractImports(ast: AST): Promise<Import[]> {
    const root = (ast.raw as { rootNode: PyNode }).rootNode;
    const imports: Import[] = [];

    this.walkNode(root, (node) => {
      if (node.type === 'import_statement') {
        const source = node.namedChildren
          .filter(c => c.type === 'dotted_name')
          .map(c => c.text)
          .join(', ');
        if (source) {
          imports.push({ source, imported: [], isDefault: true, isTypeOnly: false, startLine: node.startPosition.row + 1 });
        }
      }
      if (node.type === 'import_from_statement') {
        const moduleNode = node.namedChildren.find(c => c.type === 'dotted_name');
        const names = node.namedChildren
          .filter(c => c.type === 'aliased_import' || c.type === 'dotted_name')
          .map(c => c.namedChildren[0]?.text || c.text);
        if (moduleNode) {
          imports.push({
            source: moduleNode.text,
            imported: names,
            isDefault: false,
            isTypeOnly: false,
            startLine: node.startPosition.row + 1,
          });
        }
      }
    });
    return imports;
  }

  async extractSymbols(ast: AST): Promise<Symbol[]> {
    const root = (ast.raw as { rootNode: PyNode }).rootNode;
    const symbols: Symbol[] = [];
    const filePath = ast.filePath;

    const addSymbol = (type: Symbol['type'], node: PyNode) => {
      const nameNode = node.namedChildren.find(c => c.type === 'identifier' || c.type === 'name');
      const name = nameNode?.text || 'anonymous';
      symbols.push({
        id: randomUUID(), projectId: '', type, name,
        fullyQualifiedName: `${filePath}::${name}`,
        filePath,
        location: { file: filePath, startLine: node.startPosition.row + 1, startColumn: node.startPosition.column + 1, endLine: node.endPosition.row + 1, endColumn: node.endPosition.column + 1 },
        language: 'python', complexity: 1, lineCount: node.endPosition.row - node.startPosition.row + 1,
        docString: null, metadata: {},
      });
    };

    this.walkNode(root, (node) => {
      if (node.type === 'function_definition') addSymbol('function', node);
      if (node.type === 'class_definition') addSymbol('class', node);
      if (node.type === 'decorated_definition') {
        const def = node.namedChildren.find(c => c.type === 'function_definition' || c.type === 'class_definition');
        if (def) addSymbol(def.type === 'function_definition' ? 'function' : 'class', def);
      }
    });
    return symbols;
  }

  async extractRelationships(ast: AST): Promise<Relationship[]> {
    const root = (ast.raw as { rootNode: PyNode }).rootNode;
    const rels: Relationship[] = [];
    const imports = await this.extractImports(ast);
    for (const imp of imports) {
      rels.push({ id: randomUUID(), sourceId: '', targetId: '', type: 'imports', strength: 1.0, metadata: { importSource: imp.source, imported: imp.imported } });
    }
    this.walkNode(root, (node) => {
      if (node.type === 'class_definition') {
        const bases = node.namedChildren.filter(c => c.type === 'argument_list');
        for (const base of bases) {
          for (const id of base.namedChildren) {
            if (id.type === 'identifier' || id.type === 'attribute') {
              rels.push({ id: randomUUID(), sourceId: '', targetId: '', type: 'extends', strength: 1.0, metadata: { targetName: id.text } });
            }
          }
        }
      }
    });
    return rels;
  }

  async calculateComplexity(ast: AST): Promise<number> {
    const root = (ast.raw as { rootNode: PyNode }).rootNode;
    let cc = 1;
    this.walkNode(root, (node) => {
      if (['if_statement', 'elif_clause', 'else_clause', 'for_statement', 'while_statement', 'try_statement', 'except_clause', 'boolean_operator', 'condition'].includes(node.type)) {
        cc++;
      }
    });
    return cc;
  }

  private async getParser(): Promise<Parser> {
    if (this.parser) return this.parser;
    await Parser.init();
    this.parser = new Parser();
    const pkgDir = path.dirname(_require.resolve('tree-sitter-python/package.json'));
    const wasmPath = path.join(pkgDir, 'tree-sitter-python.wasm');
    const lang = await Language.load(wasmPath);
    this.parser.setLanguage(lang);
    return this.parser;
  }

  private walkNode(node: PyNode, fn: (n: PyNode) => void): void {
    fn(node);
    for (const child of node.namedChildren) {
      this.walkNode(child as PyNode, fn);
    }
  }
}
