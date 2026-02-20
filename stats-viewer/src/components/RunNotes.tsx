// Editor for run notes, tags, LLM model label, and exclusion toggle.

'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { X, Plus } from 'lucide-react';

interface RunNotesData {
  displayName?: string;
  llmModel?: string;
  tags: string[];
  notes: string;
  excluded: boolean;
}

interface RunNotesProps {
  gameId: string;
  initial: RunNotesData;
}

export default function RunNotes({ gameId, initial }: RunNotesProps) {
  const [data, setData] = useState<RunNotesData>(initial);
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = useCallback(async () => {
    setSaving(true);
    await fetch(`/api/notes/${encodeURIComponent(gameId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [gameId, data]);

  const addTag = () => {
    const tag = tagInput.trim();
    if (!tag || data.tags.includes(tag)) return;
    setData((d) => ({ ...d, tags: [...d.tags, tag] }));
    setTagInput('');
  };

  const removeTag = (tag: string) => {
    setData((d) => ({ ...d, tags: d.tags.filter((t) => t !== tag) }));
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-sm font-medium">Display Name</label>
          <Input
            value={data.displayName ?? ''}
            onChange={(e) => setData((d) => ({ ...d, displayName: e.target.value }))}
            placeholder={gameId}
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">LLM Model</label>
          <Input
            value={data.llmModel ?? ''}
            onChange={(e) => setData((d) => ({ ...d, llmModel: e.target.value }))}
            placeholder="e.g. claude-opus-4-6"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Tags</label>
        <div className="flex flex-wrap gap-2 mb-2">
          {data.tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="gap-1">
              {tag}
              <button onClick={() => removeTag(tag)} className="hover:text-destructive"><X className="h-3 w-3" /></button>
            </Badge>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
            placeholder="Add tag…"
            className="max-w-xs"
          />
          <Button variant="outline" size="icon" onClick={addTag}><Plus className="h-4 w-4" /></Button>
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium">Notes</label>
        <Textarea
          value={data.notes}
          onChange={(e) => setData((d) => ({ ...d, notes: e.target.value }))}
          placeholder="Add notes about this run…"
          rows={6}
        />
      </div>

      <div className="flex items-center gap-3">
        <Switch
          checked={data.excluded}
          onCheckedChange={(v) => setData((d) => ({ ...d, excluded: v }))}
          id="exclude-switch"
        />
        <label htmlFor="exclude-switch" className="text-sm cursor-pointer">Exclude from aggregate stats</label>
      </div>

      <Button onClick={save} disabled={saving} className="w-fit">
        {saving ? 'Saving…' : saved ? 'Saved!' : 'Save'}
      </Button>
    </div>
  );
}
