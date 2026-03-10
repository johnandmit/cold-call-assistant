import { useState } from 'react';
import { Contact } from '@/types';
import { getSettings } from '@/lib/storage';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Check, Copy, Download, CalendarIcon, X } from 'lucide-react';
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
  onDone: (notes: string, actions: string[], followUpDate?: string) => void;
}

export default function PostCallModal({ contact, transcript, recordingBlob, duration, onDone }: Props) {
  const [notes, setNotes] = useState('');
  const [actions, setActions] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const [followUpDate, setFollowUpDate] = useState<Date | undefined>();
  const [followUpTime, setFollowUpTime] = useState('09:00');
  const settings = getSettings();

  const dateStr = new Date().toISOString().slice(0, 10);
  const title = `${dateStr} — ${contact.name}`;

  const toggleAction = (action: string) => {
    setActions(prev => {
      const next = new Set(prev);
      if (next.has(action)) next.delete(action); else next.add(action);
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

  const handleDone = () => {
    let followUpISO = '';
    if (actions.has('follow_up') && followUpDate) {
      const [h, m] = followUpTime.split(':').map(Number);
      const d = new Date(followUpDate);
      d.setHours(h, m, 0, 0);
      followUpISO = d.toISOString();
    }
    onDone(notes, Array.from(actions), followUpISO);
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="glass-card w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 animate-fade-in-scale">
        <h2 className="text-xl font-bold mb-1">{title}</h2>
        <p className="text-sm text-muted-foreground mb-6">Duration: {Math.floor(duration / 60)}m {duration % 60}s</p>

        {/* Recording status */}
        <div className="glass-card p-3 mb-4">
          <div className="flex items-center gap-2 text-sm">
            <Download className="w-4 h-4 text-success" />
            <span className="text-success">
              {settings.recordingSaveMode === 'drive' ? '✓ Recording will upload to Drive' : '✓ Recording saved'}
            </span>
          </div>
          {settings.recordingSaveMode === 'local' && !settings.driveConnected && (
            <p className="text-xs text-muted-foreground mt-1 ml-6">Connect Drive in Settings to auto-upload</p>
          )}
        </div>

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

        {/* Actions */}
        <div className="space-y-3 mb-6">
          <p className="text-sm font-medium">What would you like to do?</p>

          <label className="flex items-start gap-3 glass-card p-3 cursor-pointer hover:border-primary/30 transition-colors">
            <input type="checkbox" checked={actions.has('anti_gravity')} onChange={() => toggleAction('anti_gravity')} className="mt-0.5 accent-primary" />
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
            <input type="checkbox" checked={actions.has('not_interested')} onChange={() => toggleAction('not_interested')} className="accent-primary" />
            <span className="text-sm font-medium">Mark as Not Interested</span>
          </label>

          <label className="flex items-start gap-3 glass-card p-3 cursor-pointer hover:border-primary/30 transition-colors">
            <input type="checkbox" checked={actions.has('follow_up')} onChange={() => toggleAction('follow_up')} className="mt-0.5 accent-primary" />
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
            <input type="checkbox" checked={actions.has('send_proposal')} onChange={() => toggleAction('send_proposal')} className="accent-primary" />
            <span className="text-sm font-medium">Send Proposal / Info</span>
          </label>

          <label className="flex items-center gap-3 glass-card p-3 cursor-pointer hover:border-primary/30 transition-colors">
            <input type="checkbox" checked={actions.has('warm_lead')} onChange={() => toggleAction('warm_lead')} className="accent-primary" />
            <span className="text-sm font-medium">Mark as Warm Lead</span>
          </label>

          <label className="flex items-center gap-3 glass-card p-3 cursor-pointer hover:border-primary/30 transition-colors">
            <input type="checkbox" checked={actions.has('no_action')} onChange={() => toggleAction('no_action')} className="accent-primary" />
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
