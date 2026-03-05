// Profile-to-profile data sync for game databases and telemetry files.
// Only syncs completed runs (Win/Loss), skips if target file already exists.
// Supports UNC paths for cross-network copying.

import fs from 'fs';
import path from 'path';
import { findGameDbs, getRunInfo } from './db';
import { findTelemetryFiles } from './telemetry';
import type { Profile } from './config';

/** A single file to be copied from source to target. */
export interface SyncFile {
  sourcePath: string;
  targetPath: string;
  filename: string;
  gameId: string;
  type: 'game' | 'telemetry';
  sizeBytes: number;
}

/** Preview of what a sync operation will do. */
export interface SyncPlan {
  filesToCopy: SyncFile[];
  skippedIncomplete: string[];
  skippedExisting: SyncFile[];
  totalBytes: number;
}

/** Progress event emitted during sync execution. */
export interface SyncEvent {
  type: 'progress' | 'complete' | 'error';
  file?: string;
  copied?: number;
  total?: number;
  bytes?: number;
  totalBytes?: number;
  error?: string;
  /** Summary included in the 'complete' event. */
  summary?: {
    copiedCount: number;
    errorCount: number;
    totalBytes: number;
  };
}

/** Gets file size, returns 0 if inaccessible. */
function fileSize(filePath: string): number {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}

/**
 * Builds a plan of files to copy from source to target profile.
 * Only includes runs where outcome is Win or Loss.
 * Skips files that already exist in the target location.
 */
export function buildSyncPlan(
  sourceProfile: Profile,
  targetProfile: Profile,
  gameRelPath: string,
  telemetryRelPath: string,
): SyncPlan {
  const sourceDbDir = path.join(sourceProfile.rootDir, gameRelPath);
  const targetDbDir = path.join(targetProfile.rootDir, gameRelPath);
  const sourceTelemetryDir = path.join(sourceProfile.rootDir, telemetryRelPath);
  const targetTelemetryDir = path.join(targetProfile.rootDir, telemetryRelPath);

  const filesToCopy: SyncFile[] = [];
  const skippedIncomplete: string[] = [];
  const skippedExisting: SyncFile[] = [];

  // Find all game DBs in source and filter to completed runs only
  const gameDbPaths = findGameDbs(sourceDbDir);
  const completedGameIds: string[] = [];

  for (const dbPath of gameDbPaths) {
    const info = getRunInfo(dbPath);
    if (!info) continue;

    if (info.outcome === 'Incomplete') {
      skippedIncomplete.push(info.gameId || path.basename(dbPath, '.db'));
      continue;
    }

    const gameId = info.gameId || path.basename(dbPath, '.db');
    const filename = path.basename(dbPath);
    const targetPath = path.join(targetDbDir, filename);
    const sizeBytes = fileSize(dbPath);
    const syncFile: SyncFile = {
      sourcePath: dbPath,
      targetPath,
      filename,
      gameId,
      type: 'game',
      sizeBytes,
    };

    if (fs.existsSync(targetPath)) {
      skippedExisting.push(syncFile);
    } else {
      filesToCopy.push(syncFile);
      completedGameIds.push(gameId);
    }
  }

  // Find telemetry files for completed game IDs (including ones already existing in target for game DBs,
  // since their telemetry may not have been copied yet)
  const allCompletedGameIds = new Set([
    ...completedGameIds,
    ...skippedExisting.filter((f) => f.type === 'game').map((f) => f.gameId),
  ]);

  for (const gameId of allCompletedGameIds) {
    const telemetryFiles = findTelemetryFiles(sourceTelemetryDir, gameId);
    for (const sourcePath of telemetryFiles) {
      // Preserve relative directory structure within telemetry dir
      const relativePath = path.relative(sourceTelemetryDir, sourcePath);
      const targetPath = path.join(targetTelemetryDir, relativePath);
      const filename = path.basename(sourcePath);
      const sizeBytes = fileSize(sourcePath);
      const syncFile: SyncFile = {
        sourcePath,
        targetPath,
        filename,
        gameId,
        type: 'telemetry',
        sizeBytes,
      };

      if (fs.existsSync(targetPath)) {
        skippedExisting.push(syncFile);
      } else {
        filesToCopy.push(syncFile);
      }
    }
  }

  const totalBytes = filesToCopy.reduce((sum, f) => sum + f.sizeBytes, 0);

  return { filesToCopy, skippedIncomplete, skippedExisting, totalBytes };
}

/**
 * Copies a single file, creating parent directories as needed.
 * Uses COPYFILE_EXCL to fail if target already exists (race condition safety).
 */
export function copySyncFile(file: SyncFile): { success: boolean; error?: string } {
  try {
    const targetDir = path.dirname(file.targetPath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    fs.copyFileSync(file.sourcePath, file.targetPath, fs.constants.COPYFILE_EXCL);
    return { success: true };
  } catch (err) {
    // EEXIST means file appeared between plan and execute — treat as skip, not error
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
      return { success: true };
    }
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}
