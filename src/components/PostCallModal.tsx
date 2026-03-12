import { useState } from 'react';
import { Contact } from '@/types';
import { getSettings } from '@/lib/storage';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Check, Copy, Download, CalendarIcon, X, Undo2, PhoneOff, PhoneMissed, Upload, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface Props {
  contact: Contact;
  transcript: string;
  recordingBlob: Blob | null;
  duration: number;
  onDone: (notes: string, actions: string[], followUpDate?: string, outcome?: string, keepRecording?: boolean) => void;
}

export default function PostCallModal({ contact, transcript, recordingBlob, duration, onDone }: Props) {
  const [notes, setNotes] = useState('');
  const [actions, setActions] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const [followUpDate, setFollowUpDate] = useState<Date | undefined>();
  const [followUpTime, setFollowUpTime] = useState('09:00');
  const [keepRecording, setKeepRecording] = useState(true);
  const settings = getSettings();

  const dateStr = new Date().toISOString().slice(0, 10);
  const title = `${dateStr} — ${contact.name}`;

  const toggleAction = (action: string) => {
    setActions(prev => {
      const next = new Set(prev);
      if (next.has(action)) next.delete(action); else next.add(action);
      // Mutually exclusive outcomes
      if (action === 'no_answer' && next.has(action)) {
        next.delete('phone_not_working');
        next.delete('not_interested');
        next.delete('revert_uncalled');
      }
      if (action === 'phone_not_working' && next.has(action)) {
        next.delete('no_answer');
        next.delete('not_interested');
        next.delete('revert_uncalled');
      }
      if (action === 'not_interested' && next.has(action)) {
        next.delete('no_answer');
        next.delete('phone_not_working');
        next.delete('revert_uncalled');
      }
      if (action === 'revert_uncalled' && next.has(action)) {
        next.delete('no_answer');
        next.delete('phone_not_working');
        next.delete('not_interested');
      }
      return next;
    });
  };

  const copyWorkflowTrigger = () => {
    const text = `ANTI-GRAVITY TASK: Build website for ${contact.name}.\nGoogle Maps URL: ${contact.google_maps_url || 'N/A'}\nAddress: ${contact.address || 'N/A'}\nPhone: ${contact.phone}\nNotes from call: ${notes || 'None'}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Workflow trigger copied to clipboard');
  };

  const getOutcome = (): string => {
    if (actions.has('no_answer')) return 'no_answer';
    if (actions.has('phone_not_working')) return 'phone_not_working';
    if (actions.has('not_interested')) return 'not_interested';
    if (actions.has('warm_lead')) return 'interested';
    if (actions.has('anti_gravity')) return 'interested';
    if (actions.has('send_proposal')) return 'interested';
    return 'completed';
  };

  const handleDone = () => {
    let followUpISO = '';
    if (actions.has('follow_up') && followUpDate) {
      const [h, m] = followUpTime.split(':').map(Number);
      const d = new Date(followUpDate);
      d.setHours(h, m, 0, 0);
      followUpISO = d.toISOString();
    }
    onDone(notes, Array.from(actions), followUpISO, getOutcome(), keepRecording);
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="glass-card w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 animate-fade-in-scale">
        <h2 className="text-xl font-bold mb-1">{title}</h2>
        <p className="text-sm text-muted-foreground mb-6">Duration: {Math.floor(duration / 60)}m {duration % 60}s</p>

        {/* Recording decision */}
        {recordingBlob && (
          <div className="glass-card p-3 mb-4">
            <p className="text-sm font-medium mb-2">Recording</p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={keepRecording ? 'default' : 'outline'}
                onClick={() => setKeepRecording(true)}
                className="gap-1.5 text-xs flex-1"
              >
                <Upload className="w-3 h-3" />
                {settings.recordingSaveMode === 'drive' ? 'Upload to Drive' : 'Save Recording'}
              </Button>
              <Button
                size="sm"
                variant={!keepRecording ? 'destructive' : 'outline'}
                onClick={() => setKeepRecording(false)}
                className="gap-1.5 text-xs flex-1"
              >
                <Trash2 className="w-3 h-3" />
                Discard
              </Button>
            </div>
          </div>
        )}

        {/* Notes */}
        <div className="mb-4">
          <label className="text-sm font-medium mb-1.5 block">Notes for {contact.name}</label>
          <Textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Add notes from the call..."
            className="min-h-[80px] bg-input border-border"
          />
        </div>

        {/* Outcome Actions */}
        <div className="space-y-3 mb-6">
          <p className="text-sm font-medium">Call Outcome</p>

          {/* No Answer */}
          <label className="flex items-center gap-3 glass-card p-3 cursor-pointer hover:border-primary/30 transition-colors">
            <input type="checkbox" checked={actions.has('no_answer')} onChange={() => toggleAction('no_answer')} className="accent-primary w-4 h-4" />
            <PhoneMissed className="w-4 h-4 text-warning" />
            <span className="text-sm font-medium">No Answer</span>
            <span className="text-xs text-muted-foreground ml-auto">Suppressed for session</span>
          </label>

          {/* Phone Not Working */}
          <label className="flex items-center gap-3 glass-card p-3 cursor-pointer hover:border-primary/30 transition-colors">
            <input type="checkbox" checked={actions.has('phone_not_working')} onChange={() => toggleAction('phone_not_working')} className="accent-primary w-4 h-4" />
            <PhoneOff className="w-4 h-4 text-destructive" />
            <span className="text-sm font-medium">Phone Number Not Working</span>
            <span className="text-xs text-muted-foreground ml-auto">Suppressed for session</span>
          </label>

          {/* Revert to uncalled */}
          <label className="flex items-center gap-3 glass-card p-3 cursor-pointer hover:border-primary/30 transition-colors">
            <input type="checkbox" checked={actions.has('revert_uncalled')} onChange={() => toggleAction('revert_uncalled')} className="accent-primary w-4 h-4" />
            <Undo2 className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium">Revert to Uncalled</span>
            <span className="text-xs text-muted-foreground ml-auto">Put back in queue</span>
          </label>

          <div className="border-t border-border/50 pt-3 mt-3">
            <p className="text-sm font-medium mb-3">Post-Call Actions</p>
          </div>

          <label className="flex items-start gap-3 glass-card p-3 cursor-pointer hover:border-primary/30 transition-colors">
            <input type="checkbox" checked={actions.has('anti_gravity')} onChange={() => toggleAction('anti_gravity')} className="mt-0.5 accent-primary w-4 h-4" />
            <div className="flex-1">
              <span className="text-sm font-medium">Trigger Anti-Gravity website build</span>
              {actions.has('anti_gravity') && (
                <div className="mt-2 space-y-2 animate-fade-in">
                  <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2 font-mono">
                    {contact.google_maps_url || 'No Google Maps URL available'}
                  </div>
                  <Button size="sm" variant="outline" onClick={copyWorkflowTrigger} className="gap-1.5 text-xs h-8">
                    {copied ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
                    {copied ? 'Copied!' : 'Copy Workflow Trigger'}
                  </Button>
                </div>
              )}
            </div>
          </label>

          <label className="flex items-center gap-3 glass-card p-3 cursor-pointer hover:border-primary/30 transition-colors">
            <input type="checkbox" checked={actions.has('not_interested')} onChange={() => toggleAction('not_interested')} className="accent-primary w-4 h-4" />
            <span className="text-sm font-medium">Mark as Not Interested</span>
          </label>

          <label className="flex items-start gap-3 glass-card p-3 cursor-pointer hover:border-primary/30 transition-colors">
            <input type="checkbox" checked={actions.has('follow_up')} onChange={() => toggleAction('follow_up')} className="mt-0.5 accent-primary w-4 h-4" />
            <div className="flex-1">
              <span className="text-sm font-medium">Schedule Follow-up</span>
              {actions.has('follow_up') && (
                <div className="mt-3 flex items-center gap-2 animate-fade-in">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className={cn("gap-1.5 text-xs h-8", !followUpDate && "text-muted-foreground")}>
                        <CalendarIcon className="w-3 h-3" />
                        {followUpDate ? format(followUpDate, 'PPP') : 'Pick date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={followUpDate}
                        onSelect={setFollowUpDate}
                        disabled={(d) => d < new Date()}
                        initialFocus
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                  <Input
                    type="time"
                    value={followUpTime}
                    onChange={e => setFollowUpTime(e.target.value)}
                    className="w-28 h-8 text-xs bg-input border-border"
                  />
                </div>
              )}
            </div>
          </label>

          <label className="flex items-center gap-3 glass-card p-3 cursor-pointer hover:border-primary/30 transition-colors">
            <input type="checkbox" checked={actions.has('send_proposal')} onChange={() => toggleAction('send_proposal')} className="accent-primary w-4 h-4" />
            <span className="text-sm font-medium">Send Proposal / Info</span>
          </label>

          <label className="flex items-center gap-3 glass-card p-3 cursor-pointer hover:border-primary/30 transition-colors">
            <input type="checkbox" checked={actions.has('warm_lead')} onChange={() => toggleAction('warm_lead')} className="accent-primary w-4 h-4" />
            <span className="text-sm font-medium">Mark as Warm Lead</span>
          </label>

          <label className="flex items-center gap-3 glass-card p-3 cursor-pointer hover:border-primary/30 transition-colors">
            <input type="checkbox" checked={actions.has('no_action')} onChange={() => toggleAction('no_action')} className="accent-primary w-4 h-4" />
            <span className="text-sm font-medium">No further action</span>
          </label>
        </div>

        <Button onClick={handleDone} className="w-full h-11 font-semibold rounded-lg">
          Done
        </Button>
      </div>
    </div>
  );
}
