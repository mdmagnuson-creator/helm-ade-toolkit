/**
 * Call graph and dependency extraction using AST analysis
 * 
 * Extracts function calls, imports, and class relationships
 * to enable "what calls X?" and "what does X depend on?" queries.
 */

import { FileInfo } from './chunker.js';
import { RelationshipRecord } from './store.js';

// Tree-sitter imports (conditional)
let Parser: any;
let TypeScript: any;
let JavaScript: any;
let Python: any;
let Go: any;

try {
  Parser = require('tree-sitter');
  TypeScript = require('tree-sitter-typescript').typescript;
  JavaScript = require('tree-sitter-javascript');
  Python = require('tree-sitter-python');
  Go = require('tree-sitter-go');
} catch {
  // Tree-sitter not available
}

export interface FunctionInfo {
  name: string;
  file: string;
  lineStart: number;
  lineEnd: number;
  calls: string[];
  imports: string[];
}

export interface ImportInfo {
  source: string;
  specifiers: string[];
  file: string;
  lineStart: number;
}

/**
 * Extract all relationships from a set of files
 */
export async function extractRelationships(
  files: FileInfo[]
): Promise<RelationshipRecord[]> {
  const relationships: RelationshipRecord[] = [];
  
  // First pass: collect all function definitions
  const functionDefs = new Map<string, { file: string; lineStart: number; lineEnd: number }>();
  const importMaps = new Map<string, Map<string, string>>(); // file -> (localName -> sourcePath)
  
  for (const file of files) {
    if (!canAnalyze(file.language)) continue;
    
    try {
      const parser = new Parser();
      parser.setLanguage(getLanguageParser(file.language));
      const tree = parser.parse(file.content);
      
      // Collect function definitions
      const defs = extractFunctionDefinitions(tree.rootNode, file);
      for (const def of defs) {
        // Use qualified name (file:function)
        const qualifiedName = `${file.path}:${def.name}`;
        functionDefs.set(qualifiedName, {
          file: file.path,
          lineStart: def.lineStart,
          lineEnd: def.lineEnd,
        });
        // Also store short name for local resolution
        functionDefs.set(`${file.path}#${def.name}`, {
          file: file.path,
          lineStart: def.lineStart,
          lineEnd: def.lineEnd,
        });
      }
      
      // Collect imports
      const imports = extractImports(tree.rootNode, file);
      const importMap = new Map<string, string>();
      for (const imp of imports) {
        for (const spec of imp.specifiers) {
          importMap.set(spec, imp.source);
        }
        
        // Record import relationships
        relationships.push({
          id: `import:${file.path}:${imp.source}:${imp.lineStart}`,
          sourceFile: file.path,
          sourceName: '',
          sourceLineStart: imp.lineStart,
          sourceLineEnd: imp.lineStart,
          targetFile: resolveImportPath(imp.source, file.path),
          targetName: '',
          relationshipType: 'imports',
        });
      }
      importMaps.set(file.path, importMap);
    } catch {
      // Parse error, skip file
    }
  }
  
  // Second pass: extract function calls
  for (const file of files) {
    if (!canAnalyze(file.language)) continue;
    
    try {
      const parser = new Parser();
      parser.setLanguage(getLanguageParser(file.language));
      const tree = parser.parse(file.content);
      
      const calls = extractFunctionCalls(tree.rootNode, file, importMaps.get(file.path) || new Map());
      
      for (const call of calls) {
        // Try to resolve the target
        let targetFile = file.path;
        let targetName = call.callee;
        
        // Check if it's an imported function
        const importMap = importMaps.get(file.path);
        if (importMap) {
          const parts = call.callee.split('.');
          const baseName = parts[0];
          if (importMap.has(baseName)) {
            targetFile = resolveImportPath(importMap.get(baseName)!, file.path);
            targetName = parts.length > 1 ? parts.slice(1).join('.') : baseName;
          }
        }
        
        relationships.push({
          id: `call:${file.path}:${call.caller}:${call.lineStart}:${call.callee}`,
          sourceFile: file.path,
          sourceName: call.caller,
          sourceLineStart: call.lineStart,
          sourceLineEnd: call.lineEnd,
          targetFile,
          targetName,
          relationshipType: 'calls',
        });
      }
      
      // Extract class relationships (extends/implements)
      const classRels = extractClassRelationships(tree.rootNode, file);
      relationships.push(...classRels);
    } catch {
      // Parse error, skip file
    }
  }
  
  return relationships;
}

/**
 * Check if a language can be analyzed
 */
function canAnalyze(language: string): boolean {
  if (!Parser) return false;
  return ['typescript', 'javascript', 'python', 'go'].includes(language);
}

/**
 * Get Tree-sitter language parser
 */
function getLanguageParser(language: string): any {
  switch (language) {
    case 'typescript': return TypeScript;
    case 'javascript': return JavaScript;
    case 'python': return Python;
    case 'go': return Go;
    default: return null;
  }
}

/**
 * Extract function/method definitions from AST
 */
function extractFunctionDefinitions(
  rootNode: any,
  file: FileInfo
): Array<{ name: string; lineStart: number; lineEnd: number }> {
  const defs: Array<{ name: string; lineStart: number; lineEnd: number }> = [];
  
  function traverse(node: any, parentClass?: string) {
    const nodeType = node.type;
    let name: string | null = null;
    
    switch (file.language) {
      case 'typescript':
      case 'javascript':
        if (nodeType === 'function_declaration') {
          name = node.childForFieldName('name')?.text;
        } else if (nodeType === 'method_definition') {
          name = node.childForFieldName('name')?.text;
          if (parentClass && name) {
            name = `${parentClass}.${name}`;
          }
        } else if (nodeType === 'arrow_function' || nodeType === 'function_expression') {
          // Check if assigned to a variable
          const parent = node.parent;
          if (parent?.type === 'variable_declarator') {
            name = parent.childForFieldName('name')?.text;
          }
        } else if (nodeType === 'class_declaration') {
          const className = node.childForFieldName('name')?.text;
          if (className) {
            defs.push({
              name: className,
              lineStart: node.startPosition.row + 1,
              lineEnd: node.endPosition.row + 1,
            });
          }
          // Traverse class body with class context
          for (const child of node.children || []) {
            traverse(child, className);
          }
          return; // Don't double-traverse
        }
        break;
        
      case 'python':
        if (nodeType === 'function_definition') {
          name = node.childForFieldName('name')?.text;
          if (parentClass && name) {
            name = `${parentClass}.${name}`;
          }
        } else if (nodeType === 'class_definition') {
          const className = node.childForFieldName('name')?.text;
          if (className) {
            defs.push({
              name: className,
              lineStart: node.startPosition.row + 1,
              lineEnd: node.endPosition.row + 1,
            });
          }
          for (const child of node.children || []) {
            traverse(child, className);
          }
          return;
        }
        break;
        
      case 'go':
        if (nodeType === 'function_declaration') {
          name = node.childForFieldName('name')?.text;
        } else if (nodeType === 'method_declaration') {
          const receiver = node.childForFieldName('receiver');
          const methodName = node.childForFieldName('name')?.text;
          if (receiver && methodName) {
            // Extract receiver type
            const receiverType = extractGoReceiverType(receiver);
            name = receiverType ? `${receiverType}.${methodName}` : methodName;
          }
        }
        break;
    }
    
    if (name) {
      defs.push({
        name,
        lineStart: node.startPosition.row + 1,
        lineEnd: node.endPosition.row + 1,
      });
    }
    
    // Traverse children
    for (const child of node.children || []) {
      traverse(child, parentClass);
    }
  }
  
  traverse(rootNode);
  return defs;
}

/**
 * Extract Go receiver type from parameter list
 */
function extractGoReceiverType(receiver: any): string | null {
  // Receiver is a parameter_list with one parameter
  for (const child of receiver.children || []) {
    if (child.type === 'parameter_declaration') {
      const typeNode = child.childForFieldName('type');
      if (typeNode) {
        // Handle pointer receivers (*Type)
        if (typeNode.type === 'pointer_type') {
          return typeNode.text.replace('*', '');
        }
        return typeNode.text;
      }
    }
  }
  return null;
}

/**
 * Extract imports from AST
 */
function extractImports(
  rootNode: any,
  file: FileInfo
): ImportInfo[] {
  const imports: ImportInfo[] = [];
  
  function traverse(node: any) {
    switch (file.language) {
      case 'typescript':
      case 'javascript':
        if (node.type === 'import_statement') {
          const source = node.childForFieldName('source')?.text?.replace(/['"]/g, '');
          if (source) {
            const specifiers: string[] = [];
            
            // Handle various import types
            for (const child of node.children || []) {
              if (child.type === 'import_clause') {
                for (const spec of child.children || []) {
                  if (spec.type === 'identifier') {
                    specifiers.push(spec.text);
                  } else if (spec.type === 'named_imports') {
                    for (const named of spec.children || []) {
                      if (named.type === 'import_specifier') {
                        const name = named.childForFieldName('name')?.text;
                        const alias = named.childForFieldName('alias')?.text;
                        specifiers.push(alias || name);
                      }
                    }
                  } else if (spec.type === 'namespace_import') {
                    const alias = spec.children?.find((c: any) => c.type === 'identifier')?.text;
                    if (alias) specifiers.push(alias);
                  }
                }
              }
            }
            
            imports.push({
              source,
              specifiers,
              file: file.path,
              lineStart: node.startPosition.row + 1,
            });
          }
        }
        break;
        
      case 'python':
        if (node.type === 'import_statement') {
          for (const child of node.children || []) {
            if (child.type === 'dotted_name') {
              imports.push({
                source: child.text,
                specifiers: [child.text.split('.').pop() || child.text],
                file: file.path,
                lineStart: node.startPosition.row + 1,
              });
            }
          }
        } else if (node.type === 'import_from_statement') {
          const module = node.childForFieldName('module_name')?.text;
          if (module) {
            const specifiers: string[] = [];
            for (const child of node.children || []) {
              if (child.type === 'import_alias' || child.type === 'identifier') {
                specifiers.push(child.text);
              }
            }
            imports.push({
              source: module,
              specifiers,
              file: file.path,
              lineStart: node.startPosition.row + 1,
            });
          }
        }
        break;
        
      case 'go':
        if (node.type === 'import_declaration') {
          for (const child of node.children || []) {
            if (child.type === 'import_spec') {
              const path = child.childForFieldName('path')?.text?.replace(/"/g, '');
              const alias = child.childForFieldName('name')?.text;
              if (path) {
                imports.push({
                  source: path,
                  specifiers: [alias || path.split('/').pop() || path],
                  file: file.path,
                  lineStart: node.startPosition.row + 1,
                });
              }
            } else if (child.type === 'import_spec_list') {
              for (const spec of child.children || []) {
                if (spec.type === 'import_spec') {
                  const path = spec.childForFieldName('path')?.text?.replace(/"/g, '');
                  const alias = spec.childForFieldName('name')?.text;
                  if (path) {
                    imports.push({
                      source: path,
                      specifiers: [alias || path.split('/').pop() || path],
                      file: file.path,
                      lineStart: node.startPosition.row + 1,
                    });
                  }
                }
              }
            }
          }
        }
        break;
    }
    
    for (const child of node.children || []) {
      traverse(child);
    }
  }
  
  traverse(rootNode);
  return imports;
}

interface FunctionCallInfo {
  caller: string;
  callee: string;
  lineStart: number;
  lineEnd: number;
}

/**
 * Extract function calls from AST
 */
function extractFunctionCalls(
  rootNode: any,
  file: FileInfo,
  importMap: Map<string, string>
): FunctionCallInfo[] {
  const calls: FunctionCallInfo[] = [];
  let currentFunction: string | null = null;
  let currentFunctionStart = 0;
  let currentFunctionEnd = 0;
  
  function traverse(node: any) {
    const nodeType = node.type;
    
    // Track current function context
    switch (file.language) {
      case 'typescript':
      case 'javascript':
        if (nodeType === 'function_declaration' || nodeType === 'method_definition') {
          const name = node.childForFieldName('name')?.text;
          if (name) {
            currentFunction = name;
            currentFunctionStart = node.startPosition.row + 1;
            currentFunctionEnd = node.endPosition.row + 1;
          }
        } else if (nodeType === 'arrow_function' || nodeType === 'function_expression') {
          const parent = node.parent;
          if (parent?.type === 'variable_declarator') {
            currentFunction = parent.childForFieldName('name')?.text || null;
            currentFunctionStart = node.startPosition.row + 1;
            currentFunctionEnd = node.endPosition.row + 1;
          }
        }
        
        // Extract call expression
        if (nodeType === 'call_expression') {
          const callee = extractCalleeExpression(node, file.language);
          if (callee && currentFunction) {
            calls.push({
              caller: currentFunction,
              callee,
              lineStart: node.startPosition.row + 1,
              lineEnd: node.endPosition.row + 1,
            });
          }
        }
        break;
        
      case 'python':
        if (nodeType === 'function_definition') {
          currentFunction = node.childForFieldName('name')?.text || null;
          currentFunctionStart = node.startPosition.row + 1;
          currentFunctionEnd = node.endPosition.row + 1;
        }
        
        if (nodeType === 'call') {
          const callee = extractCalleeExpression(node, file.language);
          if (callee && currentFunction) {
            calls.push({
              caller: currentFunction,
              callee,
              lineStart: node.startPosition.row + 1,
              lineEnd: node.endPosition.row + 1,
            });
          }
        }
        break;
        
      case 'go':
        if (nodeType === 'function_declaration' || nodeType === 'method_declaration') {
          currentFunction = node.childForFieldName('name')?.text || null;
          currentFunctionStart = node.startPosition.row + 1;
          currentFunctionEnd = node.endPosition.row + 1;
        }
        
        if (nodeType === 'call_expression') {
          const callee = extractCalleeExpression(node, file.language);
          if (callee && currentFunction) {
            calls.push({
              caller: currentFunction,
              callee,
              lineStart: node.startPosition.row + 1,
              lineEnd: node.endPosition.row + 1,
            });
          }
        }
        break;
    }
    
    // Traverse children
    for (const child of node.children || []) {
      traverse(child);
    }
    
    // Reset function context after leaving function body
    if ((nodeType === 'function_declaration' || nodeType === 'method_definition' ||
         nodeType === 'function_definition' || nodeType === 'arrow_function') &&
        currentFunction) {
      // Only reset if this was the function we're tracking
      if (node.endPosition.row + 1 === currentFunctionEnd) {
        currentFunction = null;
      }
    }
  }
  
  traverse(rootNode);
  return calls;
}

/**
 * Extract callee name from call expression
 */
function extractCalleeExpression(node: any, language: string): string | null {
  switch (language) {
    case 'typescript':
    case 'javascript': {
      const func = node.childForFieldName('function');
      if (!func) return null;
      
      if (func.type === 'identifier') {
        return func.text;
      } else if (func.type === 'member_expression') {
        // Handle obj.method() calls
        const obj = func.childForFieldName('object');
        const prop = func.childForFieldName('property');
        if (obj && prop) {
          return `${obj.text}.${prop.text}`;
        }
      }
      return null;
    }
    
    case 'python': {
      const func = node.childForFieldName('function');
      if (!func) return null;
      
      if (func.type === 'identifier') {
        return func.text;
      } else if (func.type === 'attribute') {
        return func.text;
      }
      return null;
    }
    
    case 'go': {
      const func = node.childForFieldName('function');
      if (!func) return null;
      
      if (func.type === 'identifier') {
        return func.text;
      } else if (func.type === 'selector_expression') {
        return func.text;
      }
      return null;
    }
    
    default:
      return null;
  }
}

/**
 * Extract class inheritance relationships
 */
function extractClassRelationships(
  rootNode: any,
  file: FileInfo
): RelationshipRecord[] {
  const relationships: RelationshipRecord[] = [];
  
  function traverse(node: any) {
    switch (file.language) {
      case 'typescript':
      case 'javascript':
        if (node.type === 'class_declaration') {
          const className = node.childForFieldName('name')?.text;
          
          // Check heritage clause
          for (const child of node.children || []) {
            if (child.type === 'class_heritage') {
              for (const heritageChild of child.children || []) {
                if (heritageChild.type === 'extends_clause') {
                  const extended = heritageChild.children?.find((c: any) => c.type === 'identifier')?.text;
                  if (extended && className) {
                    relationships.push({
                      id: `extends:${file.path}:${className}:${extended}`,
                      sourceFile: file.path,
                      sourceName: className,
                      sourceLineStart: node.startPosition.row + 1,
                      sourceLineEnd: node.endPosition.row + 1,
                      targetFile: file.path, // Will be resolved later if imported
                      targetName: extended,
                      relationshipType: 'extends',
                    });
                  }
                } else if (heritageChild.type === 'implements_clause') {
                  for (const impl of heritageChild.children || []) {
                    if (impl.type === 'type_identifier' || impl.type === 'identifier') {
                      if (className) {
                        relationships.push({
                          id: `implements:${file.path}:${className}:${impl.text}`,
                          sourceFile: file.path,
                          sourceName: className,
                          sourceLineStart: node.startPosition.row + 1,
                          sourceLineEnd: node.endPosition.row + 1,
                          targetFile: file.path,
                          targetName: impl.text,
                          relationshipType: 'implements',
                        });
                      }
                    }
                  }
                }
              }
            }
          }
        }
        break;
        
      case 'python':
        if (node.type === 'class_definition') {
          const className = node.childForFieldName('name')?.text;
          const superclasses = node.childForFieldName('superclasses');
          
          if (superclasses && className) {
            for (const child of superclasses.children || []) {
              if (child.type === 'identifier' || child.type === 'attribute') {
                relationships.push({
                  id: `extends:${file.path}:${className}:${child.text}`,
                  sourceFile: file.path,
                  sourceName: className,
                  sourceLineStart: node.startPosition.row + 1,
                  sourceLineEnd: node.endPosition.row + 1,
                  targetFile: file.path,
                  targetName: child.text,
                  relationshipType: 'extends',
                });
              }
            }
          }
        }
        break;
    }
    
    for (const child of node.children || []) {
      traverse(child);
    }
  }
  
  traverse(rootNode);
  return relationships;
}

/**
 * Resolve import path to file path
 */
function resolveImportPath(importSource: string, fromFile: string): string {
  // Handle relative imports
  if (importSource.startsWith('.')) {
    const dir = fromFile.split('/').slice(0, -1).join('/');
    const parts = importSource.split('/');
    const resolved: string[] = dir ? dir.split('/') : [];
    
    for (const part of parts) {
      if (part === '.') continue;
      if (part === '..') {
        resolved.pop();
      } else {
        resolved.push(part);
      }
    }
    
    return resolved.join('/');
  }
  
  // Node modules or external packages
  return importSource;
}

/**
 * Query callers of a function
 */
export function findCallers(
  relationships: RelationshipRecord[],
  functionName: string,
  file?: string
): RelationshipRecord[] {
  return relationships.filter(r => 
    r.relationshipType === 'calls' &&
    r.targetName === functionName &&
    (!file || r.targetFile === file)
  );
}

/**
 * Query callees of a function
 */
export function findCallees(
  relationships: RelationshipRecord[],
  functionName: string,
  file?: string
): RelationshipRecord[] {
  return relationships.filter(r => 
    r.relationshipType === 'calls' &&
    r.sourceName === functionName &&
    (!file || r.sourceFile === file)
  );
}

/**
 * Query files that import a module
 */
export function findImporters(
  relationships: RelationshipRecord[],
  modulePath: string
): RelationshipRecord[] {
  return relationships.filter(r => 
    r.relationshipType === 'imports' &&
    (r.targetFile === modulePath || r.targetFile.includes(modulePath))
  );
}
