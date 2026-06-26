import { Parser, Language } from 'web-tree-sitter';
import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import type { LanguagePlugin, AST, Symbol, Relationship, Import } from '@pcm/core';

const _require = createRequire(import.meta.url);

interface TSNode {
  type: string;
  text: string;
  parent: TSNode | null;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  children: TSNode[];
  namedChildren: TSNode[];
  [key: string]: unknown;
}

export class TypeScriptLanguagePlugin implements LanguagePlugin {
  name = 'typescript';
  version = '0.1.0';
  extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
  private tsParser: Parser | null = null;
  private tsxParser: Parser | null = null;
  private jsParser: Parser | null = null;

  async parse(filePath: string, source: string): Promise<AST> {
    const parser = await this.getParser(filePath);
    const tree = parser.parse(source);
    return {
      language: 'typescript',
      filePath,
      source,
      raw: tree,
    };
  }

  async extractImports(ast: AST): Promise<Import[]> {
    const root = (ast.raw as { rootNode: TSNode }).rootNode;
    const imports: Import[] = [];

    this.walkNode(root, (node) => {
      if (node.type === 'import_statement' || node.type === 'import_declaration') {
        const sourceNode = node.children.find((c: TSNode) =>
          c.type === 'string' || c.type === 'string_fragment'
        );
        const specifiers = node.namedChildren
          .filter((c: TSNode) => c.type === 'import_specifier' || c.type === 'import_default')
          .map((c: TSNode) => {
            const nameNode = c.namedChildren.find((n: TSNode) =>
              n.type === 'identifier' || n.type === 'property_identifier'
            );
            return nameNode?.text ?? c.text;
          });

        if (sourceNode) {
          imports.push({
            source: sourceNode.text.replace(/['"]/g, ''),
            imported: specifiers,
            isDefault: node.namedChildren.some((c: TSNode) => c.type === 'import_default'),
            isTypeOnly: node.text.startsWith('import type'),
            startLine: node.startPosition.row + 1,
          });
        }
      }

      if (node.type === 'require_function') {
        const argNode = node.namedChildren.find((c: TSNode) =>
          c.type === 'string' || c.type === 'template_string'
        );
        if (argNode) {
          imports.push({
            source: argNode.text.replace(/['"`]/g, ''),
            imported: [],
            isDefault: true,
            isTypeOnly: false,
            startLine: node.startPosition.row + 1,
          });
        }
      }

      if (node.type === 'import_expression' || node.type === 'dynamic_import') {
        const argNode = node.namedChildren.find((c: TSNode) =>
          c.type === 'string' || c.type === 'template_string'
        );
        if (argNode) {
          imports.push({
            source: argNode.text.replace(/['"`]/g, ''),
            imported: [],
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
    const root = (ast.raw as { rootNode: TSNode }).rootNode;
    const symbols: Symbol[] = [];
    const filePath = ast.filePath;
    const addSymbol = (
      type: Symbol['type'], node: TSNode, extraName?: string,
    ) => {
      const name = extraName || this.getNodeName(node) || 'anonymous';
      symbols.push({
        id: randomUUID(),
        projectId: '',
        type,
        name,
        fullyQualifiedName: `${filePath}::${name}`,
        filePath,
        location: {
          file: filePath,
          startLine: node.startPosition.row + 1,
          startColumn: node.startPosition.column + 1,
          endLine: node.endPosition.row + 1,
          endColumn: node.endPosition.column + 1,
        },
        language: 'typescript',
        complexity: 0,
        lineCount: node.endPosition.row - node.startPosition.row + 1,
        docString: this.extractDocString(node),
        metadata: {},
      });
    };

    this.walkNode(root, (node) => {
      if (node.type === 'function_declaration' || node.type === 'function') {
        addSymbol('function', node);
      }
      if (node.type === 'method_definition' || node.type === 'method') {
        addSymbol('method', node);
      }
      if (node.type === 'arrow_function') {
        if (node.parent?.type === 'variable_declarator') {
          addSymbol('function', node);
        }
      }
      if (node.type === 'class_declaration' || node.type === 'class') {
        addSymbol('class', node);
      }
      if (node.type === 'interface_declaration') {
        addSymbol('interface', node);
      }
      if (node.type === 'type_alias_declaration') {
        addSymbol('type', node);
      }
      if (node.type === 'enum_declaration') {
        addSymbol('enum', node);
      }
      if (node.type === 'export_statement' && node.children[0]?.type === 'function_declaration') {
        addSymbol('function', node.children[0]);
      }
      if (node.type === 'export_statement' && node.children[0]?.type === 'class_declaration') {
        addSymbol('class', node.children[0]);
      }
    });

    return symbols;
  }

  async extractRelationships(ast: AST): Promise<Relationship[]> {
    const root = (ast.raw as { rootNode: TSNode }).rootNode;
    const rels: Relationship[] = [];
    const imports = await this.extractImports(ast);

    for (const imp of imports) {
      rels.push({
        id: randomUUID(),
        sourceId: '',
        targetId: '',
        type: 'imports',
        strength: 1.0,
        metadata: { importSource: imp.source, imported: imp.imported },
      });
    }

    this.walkNode(root, (node) => {
      if (node.type === 'class_declaration' || node.type === 'interface_declaration') {
        const heritage = node.namedChildren.filter((c: TSNode) =>
          c.type === 'extends' || c.type === 'implements' ||
          c.type === 'heritage_clause' || c.type === 'extends_clause'
        );
        for (const clause of heritage) {
          for (const typeNode of clause.namedChildren) {
            if (typeNode.type === 'type_identifier' || typeNode.type === 'identifier') {
              rels.push({
                id: randomUUID(),
                sourceId: '',
                targetId: '',
                type: clause.type === 'implements' ? 'implements' : 'extends',
                strength: 1.0,
                metadata: { targetName: typeNode.text },
              });
            }
          }
        }
      }
    });

    return rels;
  }

  async calculateComplexity(ast: AST): Promise<number> {
    const root = (ast.raw as { rootNode: TSNode }).rootNode;
    let complexity = 1;

    this.walkNode(root, (node) => {
      if (
        node.type === 'if_statement' ||
        node.type === 'else' ||
        node.type === 'conditional_expression' ||
        node.type === 'switch_case' ||
        node.type === 'for_statement' ||
        node.type === 'for_in_statement' ||
        node.type === 'while_statement' ||
        node.type === 'do_statement' ||
        node.type === 'catch_clause' ||
        node.type === 'logical_operator' ||
        node.type === 'binary_operator'
      ) {
        complexity++;
      }
    });

    return complexity;
  }

  private async getParser(filePath: string): Promise<Parser> {
    const ext = path.extname(filePath);

    if ((ext === '.tsx') && !this.tsxParser) {
      await this.initTsxParser();
      return this.tsxParser!;
    }
    if ((ext === '.ts' || ext === '.mts' || ext === '.cts') && !this.tsParser) {
      await this.initTsParser();
      return this.tsParser!;
    }
    if (!this.jsParser) {
      await this.initJsParser();
    }
    if ((ext === '.tsx') && this.tsxParser) return this.tsxParser;
    if ((ext === '.ts' || ext === '.mts' || ext === '.cts') && this.tsParser) return this.tsParser;
    return this.jsParser!;
  }

  private async initTsParser(): Promise<void> {
    await Parser.init();
    this.tsParser = new Parser();
    const wasmPath = this.resolveWasmPath('tree-sitter-typescript.wasm');
    const Lang = await Language.load(wasmPath);
    this.tsParser.setLanguage(Lang);
  }

  private async initTsxParser(): Promise<void> {
    await Parser.init();
    this.tsxParser = new Parser();
    const wasmPath = this.resolveWasmPath('tree-sitter-tsx.wasm');
    const Lang = await Language.load(wasmPath);
    this.tsxParser.setLanguage(Lang);
  }

  private async initJsParser(): Promise<void> {
    this.jsParser = new Parser();

    const tsDir = path.dirname(_require.resolve('tree-sitter-typescript/package.json'));
    const jsWasm = path.join(tsDir, 'tree-sitter-javascript.wasm');
    if (fs.existsSync(jsWasm)) {
      const Lang = await Language.load(jsWasm);
      this.jsParser.setLanguage(Lang);
    } else {
      const wasmPath = this.resolveWasmPath('tree-sitter-typescript.wasm');
      const Lang = await Language.load(wasmPath);
      this.jsParser.setLanguage(Lang);
    }
  }

  private resolveWasmPath(wasmFile: string): string {
    const tsDir = path.dirname(_require.resolve('tree-sitter-typescript/package.json'));
    return path.join(tsDir, wasmFile);
  }

  private walkNode(node: TSNode, fn: (node: TSNode) => void): void {
    fn(node);
    for (const child of node.namedChildren) {
      this.walkNode(child as TSNode, fn);
    }
  }

  private getNodeName(node: TSNode): string | null {
    const nameNode = node.namedChildren.find((c: TSNode) =>
      c.type === 'identifier' || c.type === 'property_identifier' ||
      c.type === 'type_identifier'
    );
    return nameNode?.text ?? null;
  }

  private extractDocString(node: TSNode): string | null {
    // Look for a comment block before the node
    // Tree-sitter comments are siblings, not parents
    return null;   }
}
