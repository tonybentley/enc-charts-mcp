import { z } from 'zod';
import { getDatabaseManager } from '../services/serviceInitializer.js';

// Query parameter types for parameterized queries
const QueryParameterSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null()
]);

const ExecuteQuerySchema = z.object({
  query: z.string(),
  params: z.array(QueryParameterSchema).optional(),
  readonly: z.boolean().default(true)
});

export interface QueryResult {
  query: string;
  executionTime: number;
  type: 'select' | 'insert' | 'update' | 'delete' | 'other';
  rowCount?: number;
  columnCount?: number;
  affectedRows?: number;
  lastInsertId?: number;
  columns?: string[];
  rows?: Record<string, any>[];
  error?: string;
  readonlyViolation?: boolean;
}

export async function executeQueryHandler(args: unknown): Promise<QueryResult> {
  const parsed = ExecuteQuerySchema.parse(args);
  const { query, params = [], readonly = true } = parsed;

  const startTime = Date.now();
  
  try {
    const dbManager = await getDatabaseManager();
    if (!dbManager) {
      throw new Error('Database manager not available');
    }

    if (!dbManager.isOpen()) {
      throw new Error('Database is not initialized or open');
    }

    // Security check: if readonly is true, prevent write operations
    if (readonly && isWriteOperation(query)) {
      return {
        query,
        executionTime: Date.now() - startTime,
        type: 'other',
        error: 'Write operations are not allowed in readonly mode',
        readonlyViolation: true
      };
    }

    const queryType = getQueryType(query);
    
    // Execute the query using the DatabaseManager
    if (queryType === 'select') {
      const stmt = dbManager.prepare(query);
      const rows = stmt.all(params) as Record<string, any>[];
      
      const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
      
      return {
        query,
        executionTime: Date.now() - startTime,
        type: queryType,
        rowCount: rows.length,
        columnCount: columns.length,
        columns,
        rows
      };
    } else {
      // For non-SELECT queries (INSERT, UPDATE, DELETE, etc.)
      const stmt = dbManager.prepare(query);
      const result = stmt.run(params);
      
      return {
        query,
        executionTime: Date.now() - startTime,
        type: queryType,
        affectedRows: result.changes,
        lastInsertId: result.lastInsertRowid
      };
    }
  } catch (error) {
    return {
      query,
      executionTime: Date.now() - startTime,
      type: getQueryType(query),
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function getQueryType(query: string): 'select' | 'insert' | 'update' | 'delete' | 'other' {
  const trimmedQuery = query.trim().toLowerCase();
  
  if (trimmedQuery.startsWith('select')) return 'select';
  if (trimmedQuery.startsWith('insert')) return 'insert';
  if (trimmedQuery.startsWith('update')) return 'update';
  if (trimmedQuery.startsWith('delete')) return 'delete';
  
  return 'other';
}

function isWriteOperation(query: string): boolean {
  const trimmedQuery = query.trim().toLowerCase();
  
  // Check for write operations
  const writeKeywords = [
    'insert', 'update', 'delete', 'drop', 'create', 'alter', 
    'truncate', 'replace', 'merge', 'upsert'
  ];
  
  return writeKeywords.some(keyword => 
    trimmedQuery.startsWith(keyword) || 
    trimmedQuery.includes(` ${keyword} `)
  );
}