// API route for syncing game databases and telemetry files between profiles.
// POST with action=preview returns a sync plan; action=execute streams copy progress as NDJSON.

import { NextRequest, NextResponse } from 'next/server';
import { getConfig } from '@/lib/config';
import { buildSyncPlan, copySyncFile } from '@/lib/sync';
import type { SyncEvent } from '@/lib/sync';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action, sourceProfile, targetProfile } = body as {
    action: string;
    sourceProfile: string;
    targetProfile: string;
  };

  if (action !== 'preview' && action !== 'execute') {
    return NextResponse.json({ error: 'Invalid action — must be "preview" or "execute"' }, { status: 400 });
  }

  if (!sourceProfile || !targetProfile || sourceProfile === targetProfile) {
    return NextResponse.json({ error: 'Source and target profiles must be different' }, { status: 400 });
  }

  const config = getConfig();
  const source = config.profiles.find((p) => p.name === sourceProfile);
  const target = config.profiles.find((p) => p.name === targetProfile);

  if (!source || !target) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }

  const plan = buildSyncPlan(source, target, config.gameRelPath, config.telemetryRelPath);

  if (action === 'preview') {
    return NextResponse.json({
      filesToCopy: plan.filesToCopy.map((f) => ({
        filename: f.filename,
        gameId: f.gameId,
        type: f.type,
        sizeBytes: f.sizeBytes,
      })),
      skippedIncomplete: plan.skippedIncomplete,
      skippedExistingCount: plan.skippedExisting.length,
      totalBytes: plan.totalBytes,
      totalFiles: plan.filesToCopy.length,
      gameFileCount: plan.filesToCopy.filter((f) => f.type === 'game').length,
      telemetryFileCount: plan.filesToCopy.filter((f) => f.type === 'telemetry').length,
    });
  }

  // Execute: stream NDJSON progress events using pull-based iteration
  // so each chunk is flushed to the client before the next file copy starts.
  const encoder = new TextEncoder();
  let fileIndex = 0;
  let copiedCount = 0;
  let errorCount = 0;
  let bytesCopied = 0;
  const total = plan.filesToCopy.length;
  let complete = false;

  const stream = new ReadableStream({
    pull(controller) {
      const send = (event: SyncEvent) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
      };

      // Copy one file per pull() call so each progress event is flushed
      if (fileIndex < total) {
        const file = plan.filesToCopy[fileIndex++];
        const result = copySyncFile(file);
        if (result.success) {
          copiedCount++;
          bytesCopied += file.sizeBytes;
          send({
            type: 'progress',
            file: file.filename,
            copied: copiedCount,
            total,
            bytes: bytesCopied,
            totalBytes: plan.totalBytes,
          });
        } else {
          errorCount++;
          send({
            type: 'error',
            file: file.filename,
            error: result.error,
            copied: copiedCount,
            total,
          });
        }
      } else if (!complete) {
        complete = true;
        send({
          type: 'complete',
          copied: copiedCount,
          total,
          summary: {
            copiedCount,
            errorCount,
            totalBytes: bytesCopied,
          },
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
    },
  });
}
