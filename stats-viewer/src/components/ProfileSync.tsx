// Profile-to-profile data sync UI.
// Lets users copy completed game databases and telemetry files between profiles.
// Shows a scan preview, asks confirmation, then streams copy progress.

'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';

interface Profile {
  name: string;
  rootDir: string;
}

interface SyncPreview {
  filesToCopy: { filename: string; gameId: string; type: 'game' | 'telemetry' | 'replay'; sizeBytes: number }[];
  skippedIncomplete: string[];
  skippedExistingCount: number;
  totalBytes: number;
  totalFiles: number;
  gameFileCount: number;
  telemetryFileCount: number;
  replayFileCount: number;
}

interface SyncEvent {
  type: 'progress' | 'complete' | 'error';
  file?: string;
  copied?: number;
  total?: number;
  bytes?: number;
  totalBytes?: number;
  error?: string;
  summary?: { copiedCount: number; errorCount: number; totalBytes: number };
}

type SyncState = 'idle' | 'scanning' | 'previewing' | 'confirming' | 'copying' | 'done';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default function ProfileSync({ profiles }: { profiles: Profile[] }) {
  const [source, setSource] = useState<string>('');
  const [target, setTarget] = useState<string>('');
  const [state, setState] = useState<SyncState>('idle');
  const [preview, setPreview] = useState<SyncPreview | null>(null);
  const [progress, setProgress] = useState({ copied: 0, total: 0, bytes: 0, totalBytes: 0, currentFile: '' });
  const [errors, setErrors] = useState<{ file: string; error: string }[]>([]);
  const [summary, setSummary] = useState<SyncEvent['summary'] | null>(null);
  const [scanError, setScanError] = useState('');

  const canScan = source && target && source !== target && state !== 'scanning' && state !== 'copying';

  const scan = async () => {
    setState('scanning');
    setScanError('');
    setPreview(null);
    setSummary(null);
    setErrors([]);

    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'preview', sourceProfile: source, targetProfile: target }),
      });

      if (!res.ok) {
        const err = await res.json();
        setScanError(err.error || 'Scan failed');
        setState('idle');
        return;
      }

      const data = (await res.json()) as SyncPreview;
      setPreview(data);
      setState('previewing');
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Network error');
      setState('idle');
    }
  };

  const startCopy = async () => {
    setState('copying');
    setScanError('');
    setProgress({ copied: 0, total: preview?.totalFiles ?? 0, bytes: 0, totalBytes: preview?.totalBytes ?? 0, currentFile: '' });
    setErrors([]);
    setSummary(null);

    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'execute', sourceProfile: source, targetProfile: target }),
      });

      if (!res.ok || !res.body) {
        setScanError('Copy failed to start');
        setState('previewing');
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop()!;

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line) as SyncEvent;
            if (event.type === 'progress') {
              setProgress({
                copied: event.copied ?? 0,
                total: event.total ?? 0,
                bytes: event.bytes ?? 0,
                totalBytes: event.totalBytes ?? 0,
                currentFile: event.file ?? '',
              });
            } else if (event.type === 'error') {
              setErrors((prev) => [...prev, { file: event.file ?? '?', error: event.error ?? 'Unknown error' }]);
              setProgress((prev) => ({ ...prev, copied: event.copied ?? prev.copied, total: event.total ?? prev.total }));
            } else if (event.type === 'complete') {
              setSummary(event.summary ?? null);
            }
          } catch {
            // Invalid JSON line, skip
          }
        }
      }

      setState('done');
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Network error during copy');
      setState('previewing');
    }
  };

  const reset = () => {
    setState('idle');
    setPreview(null);
    setSummary(null);
    setErrors([]);
    setScanError('');
    setProgress({ copied: 0, total: 0, bytes: 0, totalBytes: 0, currentFile: '' });
  };

  if (profiles.length < 2) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sync Data Between Profiles</CardTitle>
          <CardDescription>
            Add at least two profiles above to enable data synchronization.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const pct = progress.total > 0 ? Math.round((progress.copied / progress.total) * 100) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sync Data Between Profiles</CardTitle>
        <CardDescription>
          Copy completed game databases, telemetry, and replay files from one profile to another.
          Incomplete runs and log files are excluded. Existing files are skipped.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Source / Target selectors */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">Source</label>
            <Select value={source} onValueChange={setSource} disabled={state === 'copying'}>
              <SelectTrigger>
                <SelectValue placeholder="Select source profile" />
              </SelectTrigger>
              <SelectContent>
                {profiles.map((p) => (
                  <SelectItem key={p.name} value={p.name} disabled={p.name === target}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {source && (
              <p className="text-xs text-muted-foreground truncate">
                {profiles.find((p) => p.name === source)?.rootDir}
              </p>
            )}
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Target</label>
            <Select value={target} onValueChange={setTarget} disabled={state === 'copying'}>
              <SelectTrigger>
                <SelectValue placeholder="Select target profile" />
              </SelectTrigger>
              <SelectContent>
                {profiles.map((p) => (
                  <SelectItem key={p.name} value={p.name} disabled={p.name === source}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {target && (
              <p className="text-xs text-muted-foreground truncate">
                {profiles.find((p) => p.name === target)?.rootDir}
              </p>
            )}
          </div>
        </div>

        {/* Scan button */}
        {(state === 'idle' || state === 'previewing' || state === 'done') && (
          <Button onClick={scan} disabled={!canScan} variant="outline">
            Scan
          </Button>
        )}

        {state === 'scanning' && (
          <p className="text-sm text-muted-foreground animate-pulse">Scanning source profile for completed runs...</p>
        )}

        {scanError && (
          <p className="text-sm text-destructive">{scanError}</p>
        )}

        {/* Preview results */}
        {preview && state !== 'idle' && state !== 'scanning' && (
          <>
            <Separator />
            <div className="space-y-2">
              <p className="text-sm font-medium">Scan Results</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <span className="text-muted-foreground">Game databases to copy</span>
                <span>{preview.gameFileCount}</span>
                <span className="text-muted-foreground">Telemetry files to copy</span>
                <span>{preview.telemetryFileCount}</span>
                {preview.replayFileCount > 0 && (
                  <>
                    <span className="text-muted-foreground">Replay files to copy</span>
                    <span>{preview.replayFileCount}</span>
                  </>
                )}
                <span className="text-muted-foreground">Total size</span>
                <span>{formatBytes(preview.totalBytes)}</span>
                <span className="text-muted-foreground">Already in target (skipped)</span>
                <span>{preview.skippedExistingCount}</span>
                <span className="text-muted-foreground">Incomplete runs (skipped)</span>
                <span>{preview.skippedIncomplete.length}</span>
              </div>
            </div>
          </>
        )}

        {/* Confirm and copy */}
        {state === 'previewing' && preview && preview.totalFiles > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <p className="text-sm">
                Copy <strong>{preview.totalFiles}</strong> files ({formatBytes(preview.totalBytes)}) from{' '}
                <strong>{source}</strong> to <strong>{target}</strong>?
              </p>
              <div className="flex gap-2">
                <Button onClick={startCopy}>Start Copy</Button>
                <Button variant="outline" onClick={reset}>Cancel</Button>
              </div>
            </div>
          </>
        )}

        {state === 'previewing' && preview && preview.totalFiles === 0 && (
          <>
            <Separator />
            <p className="text-sm text-muted-foreground">Nothing to copy. Target is already up to date.</p>
          </>
        )}

        {/* Copy progress */}
        {state === 'copying' && (
          <>
            <Separator />
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Copying files...</span>
                <span>{progress.copied} / {progress.total} ({pct}%)</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-primary h-2.5 rounded-full transition-all duration-200"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span className="truncate max-w-[70%]">{progress.currentFile}</span>
                <span>{formatBytes(progress.bytes)} / {formatBytes(progress.totalBytes)}</span>
              </div>
            </div>
          </>
        )}

        {/* Completion */}
        {state === 'done' && summary && (
          <>
            <Separator />
            <div className="space-y-2">
              <p className="text-sm font-medium">Sync Complete</p>
              <div className="flex gap-2 items-center">
                <Badge variant="success">{summary.copiedCount} copied</Badge>
                {summary.errorCount > 0 && (
                  <Badge variant="destructive">{summary.errorCount} errors</Badge>
                )}
                <span className="text-xs text-muted-foreground">{formatBytes(summary.totalBytes)}</span>
              </div>

              {errors.length > 0 && (
                <div className="space-y-1 mt-2">
                  <p className="text-sm text-destructive">Errors:</p>
                  <ul className="text-xs space-y-1 max-h-40 overflow-y-auto">
                    {errors.map((e, i) => (
                      <li key={i} className="text-destructive/80">
                        <span className="font-mono">{e.file}</span>: {e.error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <Button variant="outline" size="sm" onClick={reset}>Done</Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
