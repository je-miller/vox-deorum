// Configuration management for stats-viewer data source paths.
// Supports a profile-based system where each profile points to a monorepo root,
// and relative sub-paths are resolved against it. Falls back to manual absolute paths
// when no profile is active. Reads/writes stats-viewer/data/config.json.

import fs from 'fs';
import path from 'path';

/** A named pointer to a monorepo worktree root directory. */
export interface Profile {
  name: string;      // e.g. "vox-deorum-a"
  rootDir: string;   // e.g. "D:\develop\AgenticAI\vox-deorum-a"
}

export interface AppConfig {
  // Profile system
  profiles: Profile[];
  activeProfile: string | null;  // profile name, or null for manual paths

  // Relative sub-paths (shared across all profiles)
  gameRelPath: string;       // default: "mcp-server/data"
  telemetryRelPath: string;  // default: "vox-agents/telemetry"
  logsRelPath: string;       // default: "vox-agents/logs"

  // Resolved absolute paths (computed from active profile + rel paths, or manual override)
  dbDir: string;
  telemetryDir: string;
  logsDir: string;

  // Standalone path to Civ 5 Replays directory (not profile-relative).
  replayDir: string;
}

const DATA_DIR = path.join(process.cwd(), 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

// Default paths relative to stats-viewer (one level up is monorepo root)
export const defaultConfig: AppConfig = {
  profiles: [],
  activeProfile: null,
  gameRelPath: 'mcp-server/data',
  telemetryRelPath: 'vox-agents/telemetry',
  logsRelPath: 'vox-agents/logs',
  dbDir: path.join(process.cwd(), '..', 'mcp-server', 'data'),
  telemetryDir: path.join(process.cwd(), '..', 'vox-agents', 'telemetry'),
  logsDir: path.join(process.cwd(), '..', 'vox-agents', 'logs'),
  replayDir: '',
};

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/** Resolve absolute data paths from an active profile and relative sub-paths. */
function resolveProfilePaths(config: AppConfig): AppConfig {
  if (!config.activeProfile) return config;

  const profile = config.profiles.find((p) => p.name === config.activeProfile);
  if (!profile) return config;

  return {
    ...config,
    dbDir: path.join(profile.rootDir, config.gameRelPath),
    telemetryDir: path.join(profile.rootDir, config.telemetryRelPath),
    logsDir: path.join(profile.rootDir, config.logsRelPath),
  };
}

export function getConfig(): AppConfig {
  ensureDataDir();
  if (!fs.existsSync(CONFIG_FILE)) {
    return { ...defaultConfig };
  }
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
    const stored = JSON.parse(raw) as Partial<AppConfig>;
    const merged: AppConfig = { ...defaultConfig, ...stored };
    // Ensure profiles array is preserved from stored config (spread doesn't deep-merge arrays)
    if (stored.profiles) {
      merged.profiles = stored.profiles;
    }
    return resolveProfilePaths(merged);
  } catch {
    return { ...defaultConfig };
  }
}

export function setConfig(config: Partial<AppConfig>): AppConfig {
  ensureDataDir();
  const current = getConfig();
  const updated: AppConfig = { ...current, ...config };
  // Preserve explicit profiles array from input
  if (config.profiles) {
    updated.profiles = config.profiles;
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(updated, null, 2));
  // Return with resolved paths so the caller sees computed values
  return resolveProfilePaths(updated);
}
