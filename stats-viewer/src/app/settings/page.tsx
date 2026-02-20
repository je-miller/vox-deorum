// Settings page for configuring data source paths (dbDir, telemetryDir, logsDir).

'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

interface Config {
  dbDir: string;
  telemetryDir: string;
  logsDir: string;
}

const DEFAULT_LABELS: Record<keyof Config, string> = {
  dbDir: 'Game Databases Directory',
  telemetryDir: 'Telemetry Databases Directory',
  logsDir: 'Log Files Directory',
};

const DEFAULT_DESCRIPTIONS: Record<keyof Config, string> = {
  dbDir: 'Path to directory containing game .db files (default: ../mcp-server/data)',
  telemetryDir: 'Path to directory containing telemetry .db files (default: ../vox-agents/telemetry)',
  logsDir: 'Path to directory containing combined*.log files (default: ../vox-agents/logs)',
};

export default function SettingsPage() {
  const [config, setConfig] = useState<Config>({ dbDir: '', telemetryDir: '', logsDir: '' });
  const [original, setOriginal] = useState<Config>({ dbDir: '', telemetryDir: '', logsDir: '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((data: Config) => {
        setConfig(data);
        setOriginal(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    const res = await fetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    const updated = await res.json() as Config;
    setConfig(updated);
    setOriginal(updated);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const reset = () => setConfig(original);

  if (loading) return <p className="text-muted-foreground">Loading...</p>;

  const fields: (keyof Config)[] = ['dbDir', 'telemetryDir', 'logsDir'];

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground text-sm">Configure data source paths for the stats viewer</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Data Source Paths</CardTitle>
          <CardDescription>Absolute or relative paths to your data directories. Changes take effect immediately after saving.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {fields.map((field, i) => (
            <div key={field}>
              {i > 0 && <Separator className="my-4" />}
              <div className="space-y-1">
                <label className="text-sm font-medium">{DEFAULT_LABELS[field]}</label>
                <p className="text-xs text-muted-foreground">{DEFAULT_DESCRIPTIONS[field]}</p>
                <Input
                  value={config[field]}
                  onChange={(e) => setConfig((c) => ({ ...c, [field]: e.target.value }))}
                  placeholder={DEFAULT_DESCRIPTIONS[field]}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button onClick={save} disabled={saving}>{saving ? 'Saving...' : saved ? 'Saved!' : 'Save Changes'}</Button>
        <Button variant="outline" onClick={reset}>Reset</Button>
      </div>
    </div>
  );
}
