/**
 * Tests for database schema extraction (pure functions only)
 * Integration tests with actual databases are skipped (similar to embeddings.test.ts)
 */
import { describe, it, expect } from 'vitest';
import { detectDatabaseType, isBinaryType, matchesPattern, matchGlob, groupByTable, groupForeignKeys, formatTableDDL, formatConfigRows, createSchemaChunks, } from './database.js';
describe('detectDatabaseType', () => {
    it('detects PostgreSQL from postgres:// URL', () => {
        expect(detectDatabaseType('postgres://user:pass@localhost:5432/db')).toBe('postgres');
    });
    it('detects PostgreSQL from postgresql:// URL', () => {
        expect(detectDatabaseType('postgresql://user:pass@localhost:5432/db')).toBe('postgres');
    });
    it('detects MySQL from mysql:// URL', () => {
        expect(detectDatabaseType('mysql://user:pass@localhost:3306/db')).toBe('mysql');
    });
    it('detects SQLite from sqlite: prefix', () => {
        expect(detectDatabaseType('sqlite:./data/app.db')).toBe('sqlite');
    });
    it('detects SQLite from .db file path', () => {
        expect(detectDatabaseType('/path/to/database.db')).toBe('sqlite');
    });
    it('detects SQLite from .sqlite file path', () => {
        expect(detectDatabaseType('./data/app.sqlite')).toBe('sqlite');
    });
    it('defaults to postgres for unknown URLs', () => {
        expect(detectDatabaseType('unknown://localhost')).toBe('postgres');
    });
});
describe('isBinaryType', () => {
    describe('PostgreSQL binary types', () => {
        it('detects bytea', () => {
            expect(isBinaryType('bytea')).toBe(true);
        });
        it('detects bit', () => {
            expect(isBinaryType('bit')).toBe(true);
        });
        it('detects bit varying', () => {
            expect(isBinaryType('bit varying')).toBe(true);
        });
        it('detects oid', () => {
            expect(isBinaryType('oid')).toBe(true);
        });
    });
    describe('MySQL binary types', () => {
        it('detects binary', () => {
            expect(isBinaryType('binary')).toBe(true);
        });
        it('detects varbinary', () => {
            expect(isBinaryType('varbinary')).toBe(true);
        });
        it('detects blob', () => {
            expect(isBinaryType('blob')).toBe(true);
        });
        it('detects tinyblob', () => {
            expect(isBinaryType('tinyblob')).toBe(true);
        });
        it('detects mediumblob', () => {
            expect(isBinaryType('mediumblob')).toBe(true);
        });
        it('detects longblob', () => {
            expect(isBinaryType('longblob')).toBe(true);
        });
    });
    describe('non-binary types', () => {
        it('returns false for varchar', () => {
            expect(isBinaryType('varchar')).toBe(false);
        });
        it('returns false for integer', () => {
            expect(isBinaryType('integer')).toBe(false);
        });
        it('returns false for text', () => {
            expect(isBinaryType('text')).toBe(false);
        });
        it('returns false for json', () => {
            expect(isBinaryType('json')).toBe(false);
        });
        it('returns false for timestamp', () => {
            expect(isBinaryType('timestamp')).toBe(false);
        });
    });
    it('handles case insensitivity', () => {
        expect(isBinaryType('BYTEA')).toBe(true);
        expect(isBinaryType('Blob')).toBe(true);
        expect(isBinaryType('VARBINARY')).toBe(true);
    });
    it('trims whitespace', () => {
        expect(isBinaryType('  bytea  ')).toBe(true);
    });
});
describe('matchGlob', () => {
    it('matches exact pattern', () => {
        expect(matchGlob('public.users', 'public.users')).toBe(true);
    });
    it('does not match different strings', () => {
        expect(matchGlob('public.users', 'public.posts')).toBe(false);
    });
    it('matches with wildcard at end', () => {
        expect(matchGlob('public.users', 'public.*')).toBe(true);
        expect(matchGlob('public.posts', 'public.*')).toBe(true);
    });
    it('matches with wildcard at start', () => {
        expect(matchGlob('public.users', '*.users')).toBe(true);
        expect(matchGlob('private.users', '*.users')).toBe(true);
    });
    it('matches with wildcards on both sides', () => {
        expect(matchGlob('public.users', '*.*')).toBe(true);
        expect(matchGlob('any.table', '*.*')).toBe(true);
    });
    it('matches partial wildcards', () => {
        expect(matchGlob('public.user_accounts', 'public.user_*')).toBe(true);
        expect(matchGlob('public.users', 'public.user*')).toBe(true);
    });
});
describe('matchesPattern', () => {
    it('includes tables matching include pattern', () => {
        expect(matchesPattern('public.users', ['public.*'], [])).toBe(true);
    });
    it('excludes tables matching exclude pattern', () => {
        expect(matchesPattern('public.migrations', ['*.*'], ['*.migrations'])).toBe(false);
    });
    it('exclude takes precedence over include', () => {
        expect(matchesPattern('public.users', ['public.*'], ['public.users'])).toBe(false);
    });
    it('returns false when no include pattern matches', () => {
        expect(matchesPattern('private.users', ['public.*'], [])).toBe(false);
    });
    it('matches all with *.*', () => {
        expect(matchesPattern('any.table', ['*.*'], [])).toBe(true);
    });
    it('handles multiple include patterns', () => {
        expect(matchesPattern('private.users', ['public.*', 'private.*'], [])).toBe(true);
    });
    it('handles multiple exclude patterns', () => {
        expect(matchesPattern('public.migrations', ['*.*'], ['*.migrations', '*.schema_history'])).toBe(false);
        expect(matchesPattern('public.schema_history', ['*.*'], ['*.migrations', '*.schema_history'])).toBe(false);
        expect(matchesPattern('public.users', ['*.*'], ['*.migrations', '*.schema_history'])).toBe(true);
    });
});
describe('groupByTable', () => {
    it('groups rows by table_schema.table_name', () => {
        const rows = [
            { table_schema: 'public', table_name: 'users', column_name: 'id' },
            { table_schema: 'public', table_name: 'users', column_name: 'name' },
            { table_schema: 'public', table_name: 'posts', column_name: 'id' },
        ];
        const result = groupByTable(rows);
        expect(Object.keys(result)).toEqual(['public.users', 'public.posts']);
        expect(result['public.users']).toHaveLength(2);
        expect(result['public.posts']).toHaveLength(1);
    });
    it('handles custom key names', () => {
        const rows = [
            { schemaname: 'public', tablename: 'users', indexname: 'idx1' },
            { schemaname: 'public', tablename: 'users', indexname: 'idx2' },
        ];
        const result = groupByTable(rows, 'tablename', 'schemaname');
        expect(Object.keys(result)).toEqual(['public.users']);
        expect(result['public.users']).toHaveLength(2);
    });
    it('returns empty object for empty input', () => {
        expect(groupByTable([])).toEqual({});
    });
});
describe('groupForeignKeys', () => {
    it('groups foreign keys by table', () => {
        const rows = [
            { table_schema: 'public', table_name: 'posts', column_name: 'user_id', foreign_table_name: 'users' },
            { table_schema: 'public', table_name: 'posts', column_name: 'category_id', foreign_table_name: 'categories' },
            { table_schema: 'public', table_name: 'comments', column_name: 'post_id', foreign_table_name: 'posts' },
        ];
        const result = groupForeignKeys(rows);
        expect(Object.keys(result)).toEqual(['public.posts', 'public.comments']);
        expect(result['public.posts']).toHaveLength(2);
        expect(result['public.comments']).toHaveLength(1);
    });
    it('returns empty object for empty input', () => {
        expect(groupForeignKeys([])).toEqual({});
    });
});
describe('formatTableDDL', () => {
    it('formats basic table with columns', () => {
        const columns = [
            { column_name: 'id', data_type: 'integer', is_nullable: 'NO' },
            { column_name: 'name', data_type: 'varchar', character_maximum_length: 255, is_nullable: 'YES' },
        ];
        const ddl = formatTableDDL('users', columns, [], []);
        expect(ddl).toContain('CREATE TABLE users (');
        expect(ddl).toContain('id integer NOT NULL');
        expect(ddl).toContain('name varchar(255)');
        expect(ddl).toContain(');');
    });
    it('includes column comments', () => {
        const columns = [
            { column_name: 'id', data_type: 'integer', is_nullable: 'NO', column_comment: 'Primary key' },
        ];
        const ddl = formatTableDDL('users', columns, [], []);
        expect(ddl).toContain('-- Primary key');
    });
    it('includes default values', () => {
        const columns = [
            { column_name: 'created_at', data_type: 'timestamp', is_nullable: 'NO', column_default: 'now()' },
        ];
        const ddl = formatTableDDL('users', columns, [], []);
        expect(ddl).toContain('DEFAULT now()');
    });
    it('includes foreign key constraints', () => {
        const columns = [
            { column_name: 'user_id', data_type: 'integer', is_nullable: 'NO' },
        ];
        const foreignKeys = [
            { column_name: 'user_id', foreign_table_name: 'users', foreign_column_name: 'id' },
        ];
        const ddl = formatTableDDL('posts', columns, foreignKeys, []);
        expect(ddl).toContain('FOREIGN KEY (user_id) REFERENCES users(id)');
    });
    it('includes multiple foreign keys with commas', () => {
        const columns = [
            { column_name: 'user_id', data_type: 'integer', is_nullable: 'NO' },
            { column_name: 'category_id', data_type: 'integer', is_nullable: 'NO' },
        ];
        const foreignKeys = [
            { column_name: 'user_id', foreign_table_name: 'users', foreign_column_name: 'id' },
            { column_name: 'category_id', foreign_table_name: 'categories', foreign_column_name: 'id' },
        ];
        const ddl = formatTableDDL('posts', columns, foreignKeys, []);
        expect(ddl).toContain('FOREIGN KEY (user_id) REFERENCES users(id),');
        expect(ddl).toContain('FOREIGN KEY (category_id) REFERENCES categories(id)');
        // Last FK should not have a comma
        expect(ddl).not.toContain('REFERENCES categories(id),');
    });
    it('includes indexes as comments', () => {
        const columns = [
            { column_name: 'email', data_type: 'varchar', is_nullable: 'NO' },
        ];
        const indexes = [
            { indexdef: 'CREATE UNIQUE INDEX idx_users_email ON users(email)' },
        ];
        const ddl = formatTableDDL('users', columns, [], indexes);
        expect(ddl).toContain('-- CREATE UNIQUE INDEX idx_users_email ON users(email)');
    });
    it('includes RLS policies for Supabase', () => {
        const columns = [
            { column_name: 'id', data_type: 'integer', is_nullable: 'NO' },
        ];
        const rlsPolicies = [
            {
                tableName: 'documents',
                policyName: 'users_own_documents',
                command: 'SELECT',
                using: 'auth.uid() = user_id',
                withCheck: null,
            },
        ];
        const ddl = formatTableDDL('documents', columns, [], [], rlsPolicies);
        expect(ddl).toContain('-- Row Level Security Policies:');
        expect(ddl).toContain('-- users_own_documents (SELECT)');
        expect(ddl).toContain('--   USING: auth.uid() = user_id');
    });
    it('includes both USING and WITH CHECK for RLS', () => {
        const columns = [
            { column_name: 'id', data_type: 'integer', is_nullable: 'NO' },
        ];
        const rlsPolicies = [
            {
                tableName: 'documents',
                policyName: 'insert_own',
                command: 'INSERT',
                using: null,
                withCheck: 'auth.uid() = user_id',
            },
        ];
        const ddl = formatTableDDL('documents', columns, [], [], rlsPolicies);
        expect(ddl).toContain('-- insert_own (INSERT)');
        expect(ddl).toContain('--   WITH CHECK: auth.uid() = user_id');
        expect(ddl).not.toContain('--   USING:');
    });
});
describe('formatConfigRows', () => {
    it('formats empty table', () => {
        const result = formatConfigRows('settings', []);
        expect(result).toBe('-- Table settings is empty');
    });
    it('formats rows as INSERT statements', () => {
        const rows = [
            { key: 'theme', value: 'dark' },
            { key: 'language', value: 'en' },
        ];
        const result = formatConfigRows('settings', rows);
        expect(result).toContain('-- Configuration data from settings');
        expect(result).toContain('-- Columns: key, value');
        expect(result).toContain("INSERT INTO settings (key, value) VALUES ('theme', 'dark');");
        expect(result).toContain("INSERT INTO settings (key, value) VALUES ('language', 'en');");
    });
    it('handles NULL values', () => {
        const rows = [
            { key: 'optional', value: null },
        ];
        const result = formatConfigRows('settings', rows);
        expect(result).toContain("VALUES ('optional', NULL)");
    });
    it('escapes single quotes in strings', () => {
        const rows = [
            { key: 'message', value: "It's working" },
        ];
        const result = formatConfigRows('settings', rows);
        expect(result).toContain("'It''s working'");
    });
    it('formats JSON objects', () => {
        const rows = [
            { key: 'config', value: { nested: true } },
        ];
        const result = formatConfigRows('settings', rows);
        expect(result).toContain('\'{"nested":true}\'');
    });
    it('formats numeric values', () => {
        const rows = [
            { key: 'count', value: 42 },
            { key: 'price', value: 19.99 },
        ];
        const result = formatConfigRows('settings', rows);
        expect(result).toContain("VALUES ('count', 42)");
        expect(result).toContain("VALUES ('price', 19.99)");
    });
    it('skips Buffer values when skipBinaryColumns is true', () => {
        const rows = [
            { key: 'text', value: 'hello', binary: Buffer.from('binary data') },
        ];
        const result = formatConfigRows('settings', rows, true);
        expect(result).toContain('-- Skipped binary columns: binary');
        expect(result).toContain('INSERT INTO settings (key, value)');
        expect(result).not.toContain('binary data');
    });
    it('includes all columns when skipBinaryColumns is false', () => {
        const rows = [
            { key: 'text', value: 'hello' },
        ];
        const result = formatConfigRows('settings', rows, false);
        expect(result).toContain('INSERT INTO settings (key, value)');
    });
});
describe('createSchemaChunks', () => {
    it('creates chunks for each table', () => {
        const tables = {
            'public.users': [
                { column_name: 'id', data_type: 'integer', is_nullable: 'NO' },
                { column_name: 'name', data_type: 'varchar', is_nullable: 'YES' },
            ],
            'public.posts': [
                { column_name: 'id', data_type: 'integer', is_nullable: 'NO' },
            ],
        };
        const chunks = createSchemaChunks(tables, {}, {}, { schema: { enabled: true } });
        expect(chunks).toHaveLength(2);
        expect(chunks[0].id).toBe('schema:public.users');
        expect(chunks[0].filePath).toBe('database:public/users');
        expect(chunks[0].type).toBe('schema');
        expect(chunks[0].language).toBe('sql');
        expect(chunks[1].id).toBe('schema:public.posts');
    });
    it('applies include patterns', () => {
        const tables = {
            'public.users': [{ column_name: 'id', data_type: 'integer', is_nullable: 'NO' }],
            'private.secrets': [{ column_name: 'id', data_type: 'integer', is_nullable: 'NO' }],
        };
        const chunks = createSchemaChunks(tables, {}, {}, {
            schema: { enabled: true, include: ['public.*'] },
        });
        expect(chunks).toHaveLength(1);
        expect(chunks[0].id).toBe('schema:public.users');
    });
    it('applies exclude patterns', () => {
        const tables = {
            'public.users': [{ column_name: 'id', data_type: 'integer', is_nullable: 'NO' }],
            'public.migrations': [{ column_name: 'id', data_type: 'integer', is_nullable: 'NO' }],
        };
        const chunks = createSchemaChunks(tables, {}, {}, {
            schema: { enabled: true, include: ['*.*'], exclude: ['*.migrations'] },
        });
        expect(chunks).toHaveLength(1);
        expect(chunks[0].id).toBe('schema:public.users');
    });
    it('includes foreign keys in chunk content', () => {
        const tables = {
            'public.posts': [
                { column_name: 'id', data_type: 'integer', is_nullable: 'NO' },
                { column_name: 'user_id', data_type: 'integer', is_nullable: 'NO' },
            ],
        };
        const foreignKeys = {
            'public.posts': [
                { column_name: 'user_id', foreign_table_name: 'users', foreign_column_name: 'id' },
            ],
        };
        const chunks = createSchemaChunks(tables, foreignKeys, {}, { schema: { enabled: true } });
        expect(chunks[0].content).toContain('FOREIGN KEY (user_id) REFERENCES users(id)');
    });
    it('includes RLS policies in chunk content', () => {
        const tables = {
            'public.documents': [
                { column_name: 'id', data_type: 'integer', is_nullable: 'NO' },
            ],
        };
        const rlsPolicies = {
            'public.documents': [
                {
                    tableName: 'documents',
                    policyName: 'select_own',
                    command: 'SELECT',
                    using: 'auth.uid() = user_id',
                    withCheck: null,
                },
            ],
        };
        const chunks = createSchemaChunks(tables, {}, {}, { schema: { enabled: true } }, rlsPolicies);
        expect(chunks[0].content).toContain('-- Row Level Security Policies:');
        expect(chunks[0].content).toContain('-- select_own (SELECT)');
    });
    it('sets context with column count', () => {
        const tables = {
            'public.users': [
                { column_name: 'id', data_type: 'integer', is_nullable: 'NO' },
                { column_name: 'name', data_type: 'varchar', is_nullable: 'YES' },
                { column_name: 'email', data_type: 'varchar', is_nullable: 'NO' },
            ],
        };
        const chunks = createSchemaChunks(tables, {}, {}, { schema: { enabled: true } });
        expect(chunks[0].context).toBe('Database table users with 3 columns');
    });
    it('uses default include pattern of *.* when not specified', () => {
        const tables = {
            'any.table': [{ column_name: 'id', data_type: 'integer', is_nullable: 'NO' }],
        };
        const chunks = createSchemaChunks(tables, {}, {}, { schema: { enabled: true } });
        expect(chunks).toHaveLength(1);
    });
});
//# sourceMappingURL=database.test.js.map