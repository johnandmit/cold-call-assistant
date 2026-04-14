import { useState, useEffect } from 'react';
import { Settings as SettingsType, DEFAULT_SETTINGS } from '@/types';
import { getSettings, saveSettings } from '@/lib/storage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { ExternalLink, Save, Key, FileText, Clock, HardDrive, Plus, X, Trash2, Mic, Check } from 'lucide-react';
import { toast } from 'sonner';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const TIMES = Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, '0')}:00`);

// Google OAuth config — replace with your own client ID when deployed
const GOOGLE_CLIENT_ID = '';
const GOOGLE_REDIRECT_URI = window.location.origin + '/settings';
const GOOGLE_SCOPES = 'https://www.googleapis.com/auth/drive.file';

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsType>(DEFAULT_SETTINGS);
  const [newApiKey, setNewApiKey] = useState('');

  useEffect(() => {
    const loaded = getSettings();
    if (loaded.geminiApiKey && (!loaded.geminiApiKeys || loaded.geminiApiKeys.length === 0)) {
      loaded.geminiApiKeys = [loaded.geminiApiKey];
    }
    if (!loaded.geminiApiKeys) loaded.geminiApiKeys = [];
    setSettings(loaded);
  }, []);

  // Handle Google OAuth callback
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes('access_token')) {
      const params = new URLSearchParams(hash.slice(1));
      const token = params.get('access_token');
      if (token) {
        // Fetch user email
        fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${token}` },
        })
          .then(r => r.json())
          .then(data => {
            update({ driveConnected: true, driveToken: token, driveEmail: data.email || 'Connected' });
            toast.success('Google Drive connected!');
            window.history.replaceState(null, '', window.location.pathname);
          })
          .catch(() => {
            update({ driveConnected: true, driveToken: token, driveEmail: '' });
            toast.success('Google Drive connected');
            window.history.replaceState(null, '', window.location.pathname);
          });
      }
    }
  }, []);

  const update = (patch: Partial<SettingsType>) => {
    setSettings(prev => ({ ...prev, ...patch }));
  };

  const save = () => {
    const toSave = { ...settings, geminiApiKey: settings.geminiApiKeys[0] || '' };
    saveSettings(toSave);
    toast.success('Settings saved');
  };

  const addApiKey = () => {
    const key = newApiKey.trim();
    if (!key) return;
    if (settings.geminiApiKeys.includes(key)) {
      toast.error('Key already added');
      return;
    }
    update({ geminiApiKeys: [...settings.geminiApiKeys, key] });
    setNewApiKey('');
    toast.success('API key added');
  };

  const removeApiKey = (idx: number) => {
    update({ geminiApiKeys: settings.geminiApiKeys.filter((_, i) => i !== idx) });
  };

  const updateSchedule = (dayIdx: number, field: 'startTime' | 'endTime', value: string) => {
    const schedule = [...settings.schedule];
    schedule[dayIdx] = { ...schedule[dayIdx], [field]: value };
    update({ schedule });
  };

  const connectGoogleDrive = () => {
    if (!GOOGLE_CLIENT_ID) {
      toast.error('Google OAuth Client ID not configured. Add your Client ID in the Settings source code or environment.');
      return;
    }
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(GOOGLE_REDIRECT_URI)}&response_type=token&scope=${encodeURIComponent(GOOGLE_SCOPES)}&prompt=consent`;
    window.location.href = authUrl;
  };

  const disconnectDrive = () => {
    update({ driveConnected: false, driveToken: '', driveEmail: '', driveFolderId: '' });
    toast.success('Google Drive disconnected');
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
            <h2 className="font-semibold">Call Script</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-3">Paste your call script here. This will be displayed during calls and used for AI suggestions. You can also edit it live during a call.</p>
          <Textarea
            value={settings.salesScript}
            onChange={e => update({ salesScript: e.target.value })}
            placeholder="Enter your call script, talking points, objection handling, product info..."
            className="min-h-[300px] bg-input border-border font-mono text-xs"
          />
        </section>

        {/* Transcription API Key */}
        <section className="glass-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Mic className="w-4 h-4 text-primary" />
            <h2 className="font-semibold">Transcription API Key (Agora)</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Optional. If not provided, calls will still record but transcription and AI suggestions will be disabled.{' '}
            <a href="https://www.agora.io/en/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
              Get an Agora API key <ExternalLink className="w-3 h-3" />
            </a>
          </p>
          <Input
            type="password"
            value={settings.transcriptionApiKey || ''}
            onChange={e => update({ transcriptionApiKey: e.target.value })}
            placeholder="Enter transcription API key..."
            className="bg-input border-border font-mono text-sm"
          />
        </section>

        {/* Gemini API Keys */}
        <section className="glass-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Key className="w-4 h-4 text-primary" />
            <h2 className="font-semibold">Gemini API Keys</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Add multiple keys — when one is exhausted, it auto-cycles to the next.{' '}
            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
              Get a key <ExternalLink className="w-3 h-3" />
            </a>
          </p>

          <div className="space-y-2 mb-3">
            {settings.geminiApiKeys.map((key, idx) => (
              <div key={idx} className="flex items-center gap-2 glass-card p-2">
                <span className="text-xs font-mono text-muted-foreground flex-1 truncate">
                  {key.slice(0, 8)}...{key.slice(-4)}
                </span>
                <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Key {idx + 1}</span>
                <button onClick={() => removeApiKey(idx)} className="text-muted-foreground hover:text-destructive transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            {settings.geminiApiKeys.length === 0 && (
              <p className="text-xs text-muted-foreground italic">No API keys added yet</p>
            )}
          </div>

          <div className="flex gap-2">
            <Input
              type="password"
              value={newApiKey}
              onChange={e => setNewApiKey(e.target.value)}
              placeholder="AIza..."
              className="bg-input border-border font-mono text-sm flex-1"
              onKeyDown={e => e.key === 'Enter' && addApiKey()}
            />
            <Button size="sm" onClick={addApiKey} className="gap-1 shrink-0">
              <Plus className="w-3.5 h-3.5" />
              Add
            </Button>
          </div>
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

        {/* Recording Save Mode */}
        <section className="glass-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <HardDrive className="w-4 h-4 text-primary" />
            <h2 className="font-semibold">Recording Save Mode</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-3">Choose where call recordings are saved.</p>
          <div className="space-y-2">
            {([
              { value: 'local' as const, label: 'Save locally (download)', desc: 'Downloads recording to your device after each call' },
              { value: 'drive' as const, label: 'Upload to Google Drive only', desc: 'Uploads to Drive, skips local download (requires Drive connection)' },
              { value: 'both' as const, label: 'Both (local + Drive)', desc: 'Downloads locally and uploads to Drive' },
            ]).map(opt => (
              <label key={opt.value} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${settings.recordingSaveMode === opt.value ? 'border-primary/50 bg-primary/5' : 'border-border hover:border-primary/20'}`}>
                <input
                  type="radio"
                  name="recordingSaveMode"
                  checked={settings.recordingSaveMode === opt.value}
                  onChange={() => update({ recordingSaveMode: opt.value })}
                  className="mt-0.5 accent-primary"
                />
                <div>
                  <span className="text-sm font-medium">{opt.label}</span>
                  <p className="text-xs text-muted-foreground">{opt.desc}</p>
                </div>
              </label>
            ))}
          </div>
        </section>

        {/* Confirm before delete */}
        <section className="glass-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Trash2 className="w-4 h-4 text-primary" />
            <h2 className="font-semibold">Delete Confirmation</h2>
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.confirmBeforeDelete}
              onChange={e => update({ confirmBeforeDelete: e.target.checked })}
              className="accent-primary w-4 h-4"
            />
            <div>
              <span className="text-sm font-medium">Ask for confirmation before deleting leads</span>
              <p className="text-xs text-muted-foreground">When disabled, leads are deleted immediately without a prompt.</p>
            </div>
          </label>
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

        {/* Google Drive Status */}
        <section className="glass-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <HardDrive className="w-4 h-4 text-primary" />
            <h2 className="font-semibold">Google Drive Automation</h2>
          </div>
          <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-4">
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-green-400 flex items-center gap-1.5">
                <Check className="w-4 h-4" />
                Google Drive Connected
              </span>
              <p className="text-xs text-muted-foreground">
                Recording uploads are active using the default Apps Script integration.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
