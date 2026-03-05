// Generic SQLite introspection for the DB Browser feature.
// Provides functions to list databases, tables, schemas, and paginated row data.

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { type AppConfig } from './config.js';

export interface DatabaseEntry {
  name: string;
  path: string;
  type: 'game' | 'telemetry';
}

export interface ColumnDef {
  name: string;
  type: string;
  pk: boolean;
}

export interface TableRows {
  columns: ColumnDef[];
  rows: Record<string, unknown>[];
  totalCount: number;
}

// Scans configured directories for game and telemetry SQLite databases.
export function listDatabases(config: AppConfig): DatabaseEntry[] {
  const results: DatabaseEntry[] = [];

  // Game databases from dbDir
  if (config.dbDir && fs.existsSync(config.dbDir)) {
    try {
      const files = fs.readdirSync(config.dbDir).filter((f) => f.endsWith('.db'));
      for (const f of files) {
        results.push({ name: f, path: path.join(config.dbDir, f), type: 'game' });
      }
    } catch { /* directory not accessible */ }
  }

  // Telemetry databases from telemetryDir (recursive scan)
  if (config.telemetryDir && fs.existsSync(config.telemetryDir)) {
    scanDir(config.telemetryDir, config.telemetryDir, results);
  }

  return results;
}

// Recursively scans a directory for .db files, labeling them as telemetry.
function scanDir(baseDir: string, dir: string, results: DatabaseEntry[]): void {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(baseDir, fullPath, results);
      } else if (entry.isFile() && entry.name.endsWith('.db')) {
        // Use relative path from baseDir as display name
        const relName = path.relative(baseDir, fullPath);
        results.push({ name: relName, path: fullPath, type: 'telemetry' });
      }
    }
  } catch { /* directory not accessible */ }
}

// Validates that a database path is within one of the configured directories.
export function validateDbPath(dbPath: string, config: AppConfig): boolean {
  const normalized = path.resolve(dbPath);
  const allowedDirs = [config.dbDir, config.telemetryDir].filter(Boolean);
  return allowedDirs.some((dir) => normalized.startsWith(path.resolve(dir)));
}

// Lists all table names in a database.
export function listTables(dbPath: string): string[] {
  const db = new Database(dbPath, { readonly: true });
  try {
    const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[];
    return rows.map((r) => r.name);
  } finally {
    db.close();
  }
}

// Returns column definitions for a table using PRAGMA table_info.
// The table name is validated against sqlite_master before use to prevent injection.
export function getTableSchema(dbPath: string, table: string): ColumnDef[] {
  const db = new Database(dbPath, { readonly: true });
  try {
    const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);
    if (!exists) throw new Error(`Table "${table}" not found`);
    const rows = db.prepare(`PRAGMA table_info("${table}")`).all() as { name: string; type: string; pk: number }[];
    return rows.map((r) => ({ name: r.name, type: r.type || 'TEXT', pk: r.pk > 0 }));
  } finally {
    db.close();
  }
}

// Fetches paginated rows from a table. Table name is validated against sqlite_master before use.
export function getTableRows(dbPath: string, table: string, limit: number, offset: number): TableRows {
  const db = new Database(dbPath, { readonly: true });
  try {
    // Validate table exists in sqlite_master (prevents SQL injection via table name)
    const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);
    if (!exists) {
      throw new Error(`Table "${table}" not found`);
    }

    const columns = getTableSchemaFromDb(db, table);
    const countRow = db.prepare(`SELECT COUNT(*) AS cnt FROM "${table}"`).get() as { cnt: number };
    const rows = db.prepare(`SELECT * FROM "${table}" LIMIT ? OFFSET ?`).all(limit, offset) as Record<string, unknown>[];

    return { columns, rows, totalCount: countRow.cnt };
  } finally {
    db.close();
  }
}

// Internal: gets schema from an already-open database connection.
function getTableSchemaFromDb(db: Database.Database, table: string): ColumnDef[] {
  const rows = db.prepare(`PRAGMA table_info("${table}")`).all() as { name: string; type: string; pk: number }[];
  return rows.map((r) => ({ name: r.name, type: r.type || 'TEXT', pk: r.pk > 0 }));
}
