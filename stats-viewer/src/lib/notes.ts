// Manages per-run user notes, tags, LLM model tagging, and exclusion flags.
// Persists to stats-viewer/data/notes.json.

import fs from 'fs';
import path from 'path';

export interface RunNotes {
  displayName?: string;
  llmModel?: string;
  tags: string[];
  notes: string;
  excluded: boolean;
}

const DATA_DIR = path.join(process.cwd(), 'data');
const NOTES_FILE = path.join(DATA_DIR, 'notes.json');

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readAll(): Record<string, RunNotes> {
  ensureDataDir();
  if (!fs.existsSync(NOTES_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(NOTES_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function writeAll(data: Record<string, RunNotes>): void {
  ensureDataDir();
  fs.writeFileSync(NOTES_FILE, JSON.stringify(data, null, 2));
}

export function getNotes(gameId: string): RunNotes {
  const all = readAll();
  return all[gameId] ?? { tags: [], notes: '', excluded: false };
}

export function setNotes(gameId: string, notes: Partial<RunNotes>): RunNotes {
  const all = readAll();
  const current = all[gameId] ?? { tags: [], notes: '', excluded: false };
  const updated: RunNotes = { ...current, ...notes };
  all[gameId] = updated;
  writeAll(all);
  return updated;
}

export function getAllNotes(): Record<string, RunNotes> {
  return readAll();
}
