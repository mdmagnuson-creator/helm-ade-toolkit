/**
 * Database schema extraction for vectorization
 * Supports PostgreSQL, MySQL, SQLite, and Supabase (PostgreSQL with RLS)
 */

import { Chunk } from './chunker.js';
import { VectorizationConfig } from './config.js';

/** Binary/blob data types that should be skipped in config extraction */
const BINARY_TYPES = new Set([
  // PostgreSQL
  'bytea', 'bit', 'bit varying', 'oid',
  // MySQL
  'binary', 'varbinary', 'blob', 'tinyblob', 'mediumblob', 'longblob',
  // SQLite
  'blob',
]);

/** RLS policy information for Supabase-aware extraction */
export interface RlsPolicy {
  tableName: string;
  policyName: string;
  command: string; // SELECT, INSERT, UPDATE, DELETE, ALL
  using: string | null;
  withCheck: string | null;
}

/**
 * Detect database type from connection URL
 */
export function detectDatabaseType(url: string): 'postgres' | 'mysql' | 'sqlite' {
  if (url.startsWith('postgres') || url.startsWith('postgresql')) return 'postgres';
  if (url.startsWith('mysql')) return 'mysql';
  if (url.startsWith('sqlite') || url.includes('.db') || url.includes('.sqlite')) return 'sqlite';
  return 'postgres';
}

/**
 * Check if a column type is binary/blob (should be skipped)
 */
export function isBinaryType(dataType: string): boolean {
  const normalized = dataType.toLowerCase().trim();
  return BINARY_TYPES.has(normalized);
}

/**
 * Match a table name against include/exclude glob patterns
 */
export function matchesPattern(tableKey: string, include: string[], exclude: string[]): boolean {
  // Check exclude first
  for (const pattern of exclude) {
    if (matchGlob(tableKey, pattern)) return false;
  }
  
  // Then check include
  for (const pattern of include) {
    if (matchGlob(tableKey, pattern)) return true;
  }
  
  return false;
}

/**
 * Simple glob matching for schema.table patterns
 */
export function matchGlob(str: string, pattern: string): boolean {
  const regex = new RegExp(
    '^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$'
  );
  return regex.test(str);
}

/**
 * Group rows by table key
 */
export function groupByTable(
  rows: any[],
  tableKey = 'table_name',
  schemaKey = 'table_schema'
): Record<string, any[]> {
  const tables: Record<string, any[]> = {};
  
  for (const row of rows) {
    const key = `${row[schemaKey]}.${row[tableKey]}`;
    if (!tables[key]) tables[key] = [];
    tables[key].push(row);
  }
  
  return tables;
}

/**
 * Group foreign key rows by table
 */
export function groupForeignKeys(rows: any[]): Record<string, any[]> {
  const fks: Record<string, any[]> = {};
  
  for (const row of rows) {
    const key = `${row.table_schema}.${row.table_name}`;
    if (!fks[key]) fks[key] = [];
    fks[key].push(row);
  }
  
  return fks;
}

/**
 * Format table schema as DDL-like representation
 */
export function formatTableDDL(
  tableName: string,
  columns: any[],
  foreignKeys: any[],
  indexes: any[],
  rlsPolicies?: RlsPolicy[]
): string {
  const lines: string[] = [];
  
  lines.push(`CREATE TABLE ${tableName} (`);
  
  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    let line = `  ${col.column_name} ${col.data_type}`;
    
    if (col.character_maximum_length) {
      line += `(${col.character_maximum_length})`;
    }
    
    if (col.is_nullable === 'NO') {
      line += ' NOT NULL';
    }
    
    if (col.column_default) {
      line += ` DEFAULT ${col.column_default}`;
    }
    
    // Add comma if not last
    if (i < columns.length - 1 || foreignKeys.length > 0) {
      line += ',';
    }
    
    // Add comment
    if (col.column_comment) {
      line += ` -- ${col.column_comment}`;
    }
    
    lines.push(line);
  }
  
  // Add foreign keys
  for (let i = 0; i < foreignKeys.length; i++) {
    const fk = foreignKeys[i];
    let line = `  FOREIGN KEY (${fk.column_name}) REFERENCES ${fk.foreign_table_name}(${fk.foreign_column_name})`;
    if (i < foreignKeys.length - 1) {
      line += ',';
    }
    lines.push(line);
  }
  
  lines.push(');');
  
  // Add indexes
  for (const idx of indexes) {
    if (idx.indexdef) {
      lines.push(`-- ${idx.indexdef}`);
    }
  }
  
  // Add RLS policies if present (Supabase awareness)
  if (rlsPolicies && rlsPolicies.length > 0) {
    lines.push('');
    lines.push('-- Row Level Security Policies:');
    for (const policy of rlsPolicies) {
      lines.push(`-- ${policy.policyName} (${policy.command})`);
      if (policy.using) {
        lines.push(`--   USING: ${policy.using}`);
      }
      if (policy.withCheck) {
        lines.push(`--   WITH CHECK: ${policy.withCheck}`);
      }
    }
  }
  
  return lines.join('\n');
}

/**
 * Format config table rows as SQL INSERT statements (for embedding)
 */
export function formatConfigRows(tableName: string, rows: any[], skipBinaryColumns = true): string {
  if (rows.length === 0) return `-- Table ${tableName} is empty`;
  
  const allColumns = Object.keys(rows[0]);
  
  // Filter out binary columns if requested
  const columns = skipBinaryColumns
    ? allColumns.filter(col => {
        const sampleValue = rows.find(r => r[col] !== null)?.[col];
        // Skip if it looks like binary data (Buffer or very long non-readable string)
        if (Buffer.isBuffer(sampleValue)) return false;
        if (typeof sampleValue === 'string' && sampleValue.length > 1000 && !/^[\x20-\x7E\n\r\t]+$/.test(sampleValue)) return false;
        return true;
      })
    : allColumns;
  
  const lines: string[] = [];
  
  lines.push(`-- Configuration data from ${tableName}`);
  lines.push(`-- Columns: ${columns.join(', ')}`);
  if (columns.length < allColumns.length) {
    const skipped = allColumns.filter(c => !columns.includes(c));
    lines.push(`-- Skipped binary columns: ${skipped.join(', ')}`);
  }
  lines.push('');
  
  for (const row of rows) {
    const values = columns.map(col => {
      const val = row[col];
      if (val === null) return 'NULL';
      if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
      if (typeof val === 'object') return `'${JSON.stringify(val)}'`;
      return String(val);
    });
    
    lines.push(`INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${values.join(', ')});`);
  }
  
  return lines.join('\n');
}

/**
 * Create schema chunks from extracted table data
 */
export function createSchemaChunks(
  tables: Record<string, any[]>,
  foreignKeys: Record<string, any[]>,
  indexes: Record<string, any[]>,
  config: VectorizationConfig['database'],
  rlsPolicies?: Record<string, RlsPolicy[]>
): Chunk[] {
  const chunks: Chunk[] = [];
  const include = config?.schema?.include || ['*.*'];
  const exclude = config?.schema?.exclude || [];
  
  for (const [tableKey, columns] of Object.entries(tables)) {
    // Check include/exclude patterns
    if (!matchesPattern(tableKey, include, exclude)) continue;
    
    const [schema, tableName] = tableKey.split('.');
    const tableFks = foreignKeys[tableKey] || [];
    const tableIndexes = indexes[tableKey] || [];
    const tableRlsPolicies = rlsPolicies?.[tableKey];
    
    // Create DDL-like representation
    const ddl = formatTableDDL(tableName, columns, tableFks, tableIndexes, tableRlsPolicies);
    
    chunks.push({
      id: `schema:${tableKey}`,
      content: ddl,
      filePath: `database:${schema}/${tableName}`,
      lineRange: [1, ddl.split('\n').length],
      language: 'sql',
      type: 'schema',
      context: `Database table ${tableName} with ${columns.length} columns`,
    });
  }
  
  return chunks;
}

/**
 * Extract database schema as chunks for embedding
 */
export async function extractDatabaseSchema(
  connectionUrl: string,
  config: VectorizationConfig['database']
): Promise<Chunk[]> {
  if (!config?.schema?.enabled) return [];
  
  const dbType = detectDatabaseType(connectionUrl);
  
  switch (dbType) {
    case 'postgres':
      return extractPostgresSchema(connectionUrl, config);
    case 'mysql':
      return extractMysqlSchema(connectionUrl, config);
    case 'sqlite':
      return extractSqliteSchema(connectionUrl, config);
    default:
      console.warn(`Unsupported database type: ${dbType}`);
      return [];
  }
}

/**
 * Extract config table rows as chunks
 */
export async function extractConfigTableRows(
  connectionUrl: string,
  config: VectorizationConfig['database']
): Promise<Chunk[]> {
  if (!config?.configTables?.length) return [];
  
  const dbType = detectDatabaseType(connectionUrl);
  const chunks: Chunk[] = [];
  
  for (const tableConfig of config.configTables) {
    try {
      const rows = await fetchConfigRows(connectionUrl, dbType, tableConfig);
      
      if (rows.length > 0) {
        // Create a chunk for the entire table
        const content = formatConfigRows(tableConfig.table, rows);
        
        chunks.push({
          id: `config:${tableConfig.table}`,
          content,
          filePath: `database:${tableConfig.table}`,
          lineRange: [1, rows.length],
          language: 'sql',
          type: 'config',
          context: tableConfig.description || `Configuration data from ${tableConfig.table}`,
        });
      }
    } catch (err) {
      console.warn(`Failed to extract config from ${tableConfig.table}:`, err);
    }
  }
  
  return chunks;
}

// ============================================================================
// Internal extraction functions (not exported - require actual DB connections)
// ============================================================================

async function extractPostgresSchema(
  connectionUrl: string,
  config: VectorizationConfig['database']
): Promise<Chunk[]> {
  // Dynamic import to avoid bundling pg when not needed
  const pg = await import('pg');
  const client = new pg.default.Client({ connectionString: connectionUrl });
  
  try {
    await client.connect();
    
    // Get all tables with columns
    const tablesQuery = `
      SELECT 
        t.table_schema,
        t.table_name,
        c.column_name,
        c.data_type,
        c.is_nullable,
        c.column_default,
        c.character_maximum_length,
        col_description(
          (quote_ident(t.table_schema) || '.' || quote_ident(t.table_name))::regclass, 
          c.ordinal_position
        ) as column_comment
      FROM information_schema.tables t
      JOIN information_schema.columns c 
        ON t.table_name = c.table_name 
        AND t.table_schema = c.table_schema
      WHERE t.table_type = 'BASE TABLE'
        AND t.table_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY t.table_schema, t.table_name, c.ordinal_position
    `;
    
    const result = await client.query(tablesQuery);
    const tables = groupByTable(result.rows);
    
    // Get foreign keys
    const fkQuery = `
      SELECT
        tc.table_schema,
        tc.table_name,
        kcu.column_name,
        ccu.table_schema AS foreign_table_schema,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
    `;
    
    const fkResult = await client.query(fkQuery);
    const foreignKeys = groupForeignKeys(fkResult.rows);
    
    // Get indexes
    const indexQuery = `
      SELECT
        schemaname,
        tablename,
        indexname,
        indexdef
      FROM pg_indexes
      WHERE schemaname NOT IN ('pg_catalog')
    `;
    
    const indexResult = await client.query(indexQuery);
    const indexes = groupByTable(indexResult.rows, 'tablename', 'schemaname');
    
    // Get RLS policies (Supabase awareness)
    const rlsQuery = `
      SELECT
        schemaname || '.' || tablename AS table_key,
        policyname,
        cmd,
        qual AS using_expr,
        with_check
      FROM pg_policies
      WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
    `;
    
    let rlsPolicies: Record<string, RlsPolicy[]> = {};
    try {
      const rlsResult = await client.query(rlsQuery);
      for (const row of rlsResult.rows) {
        const key = row.table_key;
        if (!rlsPolicies[key]) rlsPolicies[key] = [];
        rlsPolicies[key].push({
          tableName: key.split('.')[1],
          policyName: row.policyname,
          command: row.cmd,
          using: row.using_expr,
          withCheck: row.with_check,
        });
      }
    } catch {
      // pg_policies may not exist on older PostgreSQL versions
    }
    
    return createSchemaChunks(tables, foreignKeys, indexes, config, rlsPolicies);
  } finally {
    await client.end();
  }
}

async function extractMysqlSchema(
  connectionUrl: string,
  config: VectorizationConfig['database']
): Promise<Chunk[]> {
  const mysql = await import('mysql2/promise');
  const connection = await mysql.createConnection(connectionUrl);
  
  try {
    // Get database name from URL
    const dbName = new URL(connectionUrl).pathname.slice(1);
    
    // Get all tables with columns
    const [rows] = await connection.execute(`
      SELECT 
        TABLE_SCHEMA as table_schema,
        TABLE_NAME as table_name,
        COLUMN_NAME as column_name,
        DATA_TYPE as data_type,
        IS_NULLABLE as is_nullable,
        COLUMN_DEFAULT as column_default,
        CHARACTER_MAXIMUM_LENGTH as character_maximum_length,
        COLUMN_COMMENT as column_comment
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ?
      ORDER BY TABLE_NAME, ORDINAL_POSITION
    `, [dbName]);
    
    const tables = groupByTable(rows as any[]);
    
    // Get foreign keys
    const [fkRows] = await connection.execute(`
      SELECT
        TABLE_SCHEMA as table_schema,
        TABLE_NAME as table_name,
        COLUMN_NAME as column_name,
        REFERENCED_TABLE_SCHEMA as foreign_table_schema,
        REFERENCED_TABLE_NAME as foreign_table_name,
        REFERENCED_COLUMN_NAME as foreign_column_name
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = ?
        AND REFERENCED_TABLE_NAME IS NOT NULL
    `, [dbName]);
    
    const foreignKeys = groupForeignKeys(fkRows as any[]);
    
    return createSchemaChunks(tables, foreignKeys, {}, config);
  } finally {
    await connection.end();
  }
}

async function extractSqliteSchema(
  connectionUrl: string,
  config: VectorizationConfig['database']
): Promise<Chunk[]> {
  const sqlite = await import('better-sqlite3');
  const dbPath = connectionUrl.replace('sqlite:', '').replace('file:', '');
  const db = sqlite.default(dbPath);
  
  try {
    // Get all tables
    const tables = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
    `).all() as { name: string }[];
    
    const tableSchemas: Record<string, any[]> = {};
    
    for (const { name } of tables) {
      const columns = db.prepare(`PRAGMA table_info("${name}")`).all();
      tableSchemas[name] = (columns as any[]).map(col => ({
        table_schema: 'main',
        table_name: name,
        column_name: col.name,
        data_type: col.type,
        is_nullable: col.notnull ? 'NO' : 'YES',
        column_default: col.dflt_value,
      }));
    }
    
    // Get foreign keys
    const foreignKeys: Record<string, any[]> = {};
    for (const { name } of tables) {
      const fks = db.prepare(`PRAGMA foreign_key_list("${name}")`).all() as any[];
      if (fks.length > 0) {
        foreignKeys[`main.${name}`] = fks.map(fk => ({
          column_name: fk.from,
          foreign_table_name: fk.table,
          foreign_column_name: fk.to,
        }));
      }
    }
    
    return createSchemaChunks(tableSchemas, foreignKeys, {}, config);
  } finally {
    db.close();
  }
}

async function fetchConfigRows(
  connectionUrl: string,
  dbType: 'postgres' | 'mysql' | 'sqlite',
  tableConfig: { table: string; sampleRows?: number | 'all' }
): Promise<any[]> {
  const limit = tableConfig.sampleRows === 'all' ? 10000 : (tableConfig.sampleRows || 100);
  const query = `SELECT * FROM ${tableConfig.table} LIMIT ${limit}`;
  
  switch (dbType) {
    case 'postgres': {
      const pg = await import('pg');
      const client = new pg.default.Client({ connectionString: connectionUrl });
      await client.connect();
      try {
        const result = await client.query(query);
        return result.rows;
      } finally {
        await client.end();
      }
    }
    
    case 'mysql': {
      const mysql = await import('mysql2/promise');
      const connection = await mysql.createConnection(connectionUrl);
      try {
        const [rows] = await connection.execute(query);
        return rows as any[];
      } finally {
        await connection.end();
      }
    }
    
    case 'sqlite': {
      const sqlite = await import('better-sqlite3');
      const dbPath = connectionUrl.replace('sqlite:', '').replace('file:', '');
      const db = sqlite.default(dbPath);
      try {
        return db.prepare(query).all();
      } finally {
        db.close();
      }
    }
  }
}
