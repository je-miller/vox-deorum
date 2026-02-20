// Configuration management for stats-viewer data source paths.
// Reads/writes stats-viewer/data/config.json.

import fs from 'fs';
import path from 'path';

export interface AppConfig {
  dbDir: string;
  telemetryDir: string;
  logsDir: string;
}

const DATA_DIR = path.join(process.cwd(), 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

// Default paths relative to stats-viewer (one level up is monorepo root)
export const defaultConfig: AppConfig = {
  dbDir: path.join(process.cwd(), '..', 'mcp-server', 'data'),
  telemetryDir: path.join(process.cwd(), '..', 'vox-agents', 'telemetry'),
  logsDir: path.join(process.cwd(), '..', 'vox-agents', 'logs'),
};

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function getConfig(): AppConfig {
  ensureDataDir();
  if (!fs.existsSync(CONFIG_FILE)) {
    return { ...defaultConfig };
  }
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
    return { ...defaultConfig, ...JSON.parse(raw) };
  } catch {
    return { ...defaultConfig };
  }
}

export function setConfig(config: Partial<AppConfig>): AppConfig {
  ensureDataDir();
  const current = getConfig();
  const updated = { ...current, ...config };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(updated, null, 2));
  return updated;
}
