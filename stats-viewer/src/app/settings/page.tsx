// Settings page for configuring data source paths via profiles or manual overrides.
// Profiles point to monorepo root directories; relative sub-paths are resolved against them.

'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

interface Profile {
  name: string;
  rootDir: string;
}

interface Config {
  profiles: Profile[];
  activeProfile: string | null;
  gameRelPath: string;
  telemetryRelPath: string;
  logsRelPath: string;
  dbDir: string;
  telemetryDir: string;
  logsDir: string;
}

const emptyConfig: Config = {
  profiles: [],
  activeProfile: null,
  gameRelPath: 'mcp-server/data',
  telemetryRelPath: 'vox-agents/telemetry',
  logsRelPath: 'vox-agents/logs',
  dbDir: '',
  telemetryDir: '',
  logsDir: '',
};

export default function SettingsPage() {
  const [config, setConfig] = useState<Config>(emptyConfig);
  const [original, setOriginal] = useState<Config>(emptyConfig);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  // New profile form state
  const [newName, setNewName] = useState('');
  const [newRootDir, setNewRootDir] = useState('');

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
      body: JSON.stringify({
        profiles: config.profiles,
        activeProfile: config.activeProfile,
        gameRelPath: config.gameRelPath,
        telemetryRelPath: config.telemetryRelPath,
        logsRelPath: config.logsRelPath,
        // Only send manual paths when no profile is active
        ...(config.activeProfile ? {} : {
          dbDir: config.dbDir,
          telemetryDir: config.telemetryDir,
          logsDir: config.logsDir,
        }),
      }),
    });
    const updated = (await res.json()) as Config;
    setConfig(updated);
    setOriginal(updated);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const reset = () => setConfig({ ...original });

  const addProfile = () => {
    const trimmedName = newName.trim();
    const trimmedRoot = newRootDir.trim();
    if (!trimmedName || !trimmedRoot) return;
    if (config.profiles.some((p) => p.name === trimmedName)) return;

    setConfig((c) => ({
      ...c,
      profiles: [...c.profiles, { name: trimmedName, rootDir: trimmedRoot }],
    }));
    setNewName('');
    setNewRootDir('');
  };

  const removeProfile = (name: string) => {
    setConfig((c) => ({
      ...c,
      profiles: c.profiles.filter((p) => p.name !== name),
      activeProfile: c.activeProfile === name ? null : c.activeProfile,
    }));
  };

  const selectProfile = (name: string | null) => {
    setConfig((c) => ({ ...c, activeProfile: name }));
  };

  if (loading) return <p className="text-muted-foreground p-6">Loading...</p>;

  const hasActiveProfile = config.activeProfile !== null;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground text-sm">
          Configure data source paths for the stats viewer
        </p>
      </div>

      {/* Section 1: Profiles */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profiles</CardTitle>
          <CardDescription>
            Each profile points to a monorepo root directory. Select a profile to resolve data paths
            automatically, or choose manual mode.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* None (manual) option */}
          <label
            className={
              'flex items-center gap-3 rounded-md border p-3 cursor-pointer transition-colors ' +
              (!hasActiveProfile
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-muted-foreground')
            }
          >
            <input
              type="radio"
              name="profile"
              checked={!hasActiveProfile}
              onChange={() => selectProfile(null)}
              className="accent-primary h-4 w-4"
            />
            <div>
              <span className="text-sm font-medium">None (manual paths)</span>
              <p className="text-xs text-muted-foreground">
                Specify absolute paths directly instead of using a profile
              </p>
            </div>
          </label>

          {/* Existing profiles */}
          {config.profiles.map((profile) => (
            <label
              key={profile.name}
              className={
                'flex items-center gap-3 rounded-md border p-3 cursor-pointer transition-colors ' +
                (config.activeProfile === profile.name
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-muted-foreground')
              }
            >
              <input
                type="radio"
                name="profile"
                checked={config.activeProfile === profile.name}
                onChange={() => selectProfile(profile.name)}
                className="accent-primary h-4 w-4"
              />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium">{profile.name}</span>
                <p className="text-xs text-muted-foreground truncate">{profile.rootDir}</p>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  removeProfile(profile.name);
                }}
                className="text-muted-foreground hover:text-destructive transition-colors p-1 shrink-0"
                title={`Remove profile "${profile.name}"`}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              </button>
            </label>
          ))}

          <Separator />

          {/* Add new profile */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Add Profile</p>
            <div className="flex gap-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Profile name"
                className="w-40"
              />
              <Input
                value={newRootDir}
                onChange={(e) => setNewRootDir(e.target.value)}
                placeholder="Monorepo root path"
                className="flex-1"
              />
              <Button
                variant="outline"
                onClick={addProfile}
                disabled={!newName.trim() || !newRootDir.trim()}
              >
                Add
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 2: Relative Paths (only when a profile is active) */}
      {hasActiveProfile && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Relative Paths</CardTitle>
            <CardDescription>
              Sub-paths resolved against the active profile&apos;s root directory.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Game Databases</label>
              <Input
                value={config.gameRelPath}
                onChange={(e) => setConfig((c) => ({ ...c, gameRelPath: e.target.value }))}
                placeholder="mcp-server/data"
              />
            </div>
            <Separator />
            <div className="space-y-1">
              <label className="text-sm font-medium">Telemetry Databases</label>
              <Input
                value={config.telemetryRelPath}
                onChange={(e) => setConfig((c) => ({ ...c, telemetryRelPath: e.target.value }))}
                placeholder="vox-agents/telemetry"
              />
            </div>
            <Separator />
            <div className="space-y-1">
              <label className="text-sm font-medium">Log Files</label>
              <Input
                value={config.logsRelPath}
                onChange={(e) => setConfig((c) => ({ ...c, logsRelPath: e.target.value }))}
                placeholder="vox-agents/logs"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Section 3: Resolved / Manual Paths */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {hasActiveProfile ? 'Resolved Paths' : 'Data Source Paths'}
          </CardTitle>
          <CardDescription>
            {hasActiveProfile
              ? 'Computed absolute paths from the active profile. Save to apply changes.'
              : 'Absolute paths to your data directories. Changes take effect after saving.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <PathField
            label="Game Databases Directory"
            description="Directory containing game .db files"
            value={config.dbDir}
            readOnly={hasActiveProfile}
            onChange={(v) => setConfig((c) => ({ ...c, dbDir: v }))}
          />
          <Separator />
          <PathField
            label="Telemetry Databases Directory"
            description="Directory containing telemetry .db files"
            value={config.telemetryDir}
            readOnly={hasActiveProfile}
            onChange={(v) => setConfig((c) => ({ ...c, telemetryDir: v }))}
          />
          <Separator />
          <PathField
            label="Log Files Directory"
            description="Directory containing combined*.log files"
            value={config.logsDir}
            readOnly={hasActiveProfile}
            onChange={(v) => setConfig((c) => ({ ...c, logsDir: v }))}
          />
        </CardContent>
      </Card>

      {/* Save / Reset */}
      <div className="flex gap-3">
        <Button onClick={save} disabled={saving}>
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Changes'}
        </Button>
        <Button variant="outline" onClick={reset}>
          Reset
        </Button>
      </div>
    </div>
  );
}

/** Displays a path field -- editable when manual mode, read-only when profile-driven. */
function PathField({
  label,
  description,
  value,
  readOnly,
  onChange,
}: {
  label: string;
  description: string;
  value: string;
  readOnly: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium">{label}</label>
      <p className="text-xs text-muted-foreground">{description}</p>
      {readOnly ? (
        <p className="text-sm font-mono bg-muted/50 rounded px-3 py-2 break-all">{value}</p>
      ) : (
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={description} />
      )}
    </div>
  );
}
