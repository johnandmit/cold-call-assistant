import { useState, useEffect } from 'react';
import { Settings as SettingsType, DEFAULT_SETTINGS } from '@/types';
import { getSettings, saveSettings } from '@/lib/storage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { ExternalLink, Save, Key, FileText, Clock, HardDrive } from 'lucide-react';
import { toast } from 'sonner';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const TIMES = Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, '0')}:00`);

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsType>(DEFAULT_SETTINGS);

  useEffect(() => {
    setSettings(getSettings());
  }, []);

  const update = (patch: Partial<SettingsType>) => {
    setSettings(prev => ({ ...prev, ...patch }));
  };

  const save = () => {
    saveSettings(settings);
    toast.success('Settings saved');
  };

  const updateSchedule = (dayIdx: number, field: 'startTime' | 'endTime', value: string) => {
    const schedule = [...settings.schedule];
    schedule[dayIdx] = { ...schedule[dayIdx], [field]: value };
    update({ schedule });
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Settings</h1>
        <Button onClick={save} className="gap-1.5">
          <Save className="w-4 h-4" />
          Save
        </Button>
      </div>

      <div className="space-y-6">
        {/* Sales Script */}
        <section className="glass-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="w-4 h-4 text-primary" />
            <h2 className="font-semibold">Sales Script / AI Context</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-3">This text is sent to the AI with every suggestion request. Include your script, common objections, product details, and goals.</p>
          <Textarea
            value={settings.salesScript}
            onChange={e => update({ salesScript: e.target.value })}
            placeholder="Enter your sales script, product info, and talking points..."
            className="min-h-[150px] bg-input border-border font-mono text-xs"
          />
        </section>

        {/* Gemini API Key */}
        <section className="glass-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Key className="w-4 h-4 text-primary" />
            <h2 className="font-semibold">Gemini API Key</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Get a free API key at{' '}
            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
              aistudio.google.com <ExternalLink className="w-3 h-3" />
            </a>
          </p>
          <Input
            type="password"
            value={settings.geminiApiKey}
            onChange={e => update({ geminiApiKey: e.target.value })}
            placeholder="AIza..."
            className="bg-input border-border font-mono text-sm"
          />
        </section>

        {/* Suggestion Rate */}
        <section className="glass-card p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              <h2 className="font-semibold">Suggestion Refresh Rate</h2>
            </div>
            <span className="text-sm font-mono text-muted-foreground">{settings.suggestionRefreshRate}s</span>
          </div>
          <Slider
            value={[settings.suggestionRefreshRate]}
            onValueChange={([v]) => update({ suggestionRefreshRate: v })}
            min={5}
            max={20}
            step={5}
            className="py-2"
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>5s</span><span>10s</span><span>15s</span><span>20s</span>
          </div>
        </section>

        {/* Call Schedule */}
        <section className="glass-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-primary" />
            <h2 className="font-semibold">Call Schedule (Tier 1 Priority Window)</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-3">Contacts within these hours get priority in the queue.</p>
          <div className="space-y-2">
            {settings.schedule.map((entry, i) => (
              <div key={entry.day} className="flex items-center gap-3">
                <span className="w-24 text-sm">{entry.day}</span>
                <select
                  value={entry.startTime}
                  onChange={e => updateSchedule(i, 'startTime', e.target.value)}
                  className="h-8 rounded-md border border-border bg-input px-2 text-sm"
                >
                  {TIMES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <span className="text-muted-foreground text-sm">to</span>
                <select
                  value={entry.endTime}
                  onChange={e => updateSchedule(i, 'endTime', e.target.value)}
                  className="h-8 rounded-md border border-border bg-input px-2 text-sm"
                >
                  {TIMES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            ))}
          </div>
        </section>

        {/* Google Drive */}
        <section className="glass-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <HardDrive className="w-4 h-4 text-primary" />
            <h2 className="font-semibold">Google Drive</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-3">Connect Google Drive to automatically upload call recordings.</p>
          {settings.driveConnected ? (
            <div className="flex items-center justify-between">
              <span className="text-sm text-success">Connected: {settings.driveEmail || 'Account linked'}</span>
              <Button variant="outline" size="sm" onClick={() => { update({ driveConnected: false, driveToken: '', driveEmail: '' }); toast.success('Disconnected'); }}>
                Disconnect
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Google Drive integration requires a Google Cloud project with OAuth configured. This feature is available when deployed with proper OAuth credentials.</p>
          )}
        </section>
      </div>
    </div>
  );
}
