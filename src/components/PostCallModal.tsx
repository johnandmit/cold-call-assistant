import { useState } from 'react';
import { Contact } from '@/types';
import { getSettings } from '@/lib/storage';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Check, Copy, Download, CalendarIcon, X, Undo2, PhoneOff, PhoneMissed, Upload, Trash2, Star, ThumbsUp, ThumbsDown, Clock } from 'lucide-react';
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
  onDone: (notes: string, actions: string[], followUpDate?: string, outcome?: string, keepRecording?: boolean, callRating?: number, callSuccess?: boolean, direction?: 'forward' | 'backward') => void;
}

export default function PostCallModal({ contact, transcript, recordingBlob, duration, onDone }: Props) {
  const [notes, setNotes] = useState('');
  const [actions, setActions] = useState<Set<string>>(new Set(['no_action']));
  const [copied, setCopied] = useState(false);
  const [followUpDate, setFollowUpDate] = useState<Date | undefined>();
  const [followUpTime, setFollowUpTime] = useState('09:00');
  const [keepRecording, setKeepRecording] = useState(true);
  const [callRating, setCallRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [callSuccess, setCallSuccess] = useState<boolean | null>(null);
  const settings = getSettings();

  const dateStr = new Date().toISOString().slice(0, 10);
  const title = `${dateStr} — ${contact.name}`;

  const toggleAction = (action: string) => {
    setActions(prev => {
      const next = new Set(prev);
      if (next.has(action)) {
        next.delete(action);
      } else {
        next.add(action);
        if (['no_answer', 'phone_not_working', 'revert_uncalled', 'not_interested'].includes(action)) {
          next.delete('no_action');
        }
        if (action === 'no_action') {
          ['no_answer', 'phone_not_working', 'revert_uncalled', 'not_interested'].forEach(a => next.delete(a));
        }
      }

      const exclusiveOutcomes = ['no_answer', 'phone_not_working', 'not_interested', 'revert_uncalled'];
      if (exclusiveOutcomes.includes(action) && next.has(action)) {
        exclusiveOutcomes.filter(a => a !== action).forEach(a => next.delete(a));
      }
      return next;
    });

    // Auto-discard recording if user selects no_answer or phone_not_working
    if ((action === 'no_answer' || action === 'phone_not_working') && !actions.has(action)) {
      setKeepRecording(false);
    }
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

  const handleDone = (direction: 'forward' | 'backward' = 'forward') => {
    let followUpISO = '';
    if (actions.has('follow_up') && followUpDate) {
      const [h, m] = followUpTime.split(':').map(Number);
      const d = new Date(followUpDate);
      d.setHours(h, m, 0, 0);
      followUpISO = d.toISOString();
    }
    onDone(notes, Array.from(actions), followUpISO, getOutcome(), keepRecording, callRating, callSuccess ?? undefined, direction);
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="glass-card w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 animate-fade-in-scale">
        <h2 className="text-xl font-bold mb-1">{title}</h2>
        <p className="text-sm text-muted-foreground mb-4">Duration: {Math.floor(duration / 60)}m {duration % 60}s</p>

        {/* Call Success/Fail Toggle */}
        <div className="glass-card p-3 mb-4">
          <p className="text-sm font-medium mb-2">Was the call a success?</p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={callSuccess === true ? 'default' : 'outline'}
              onClick={() => setCallSuccess(callSuccess === true ? null : true)}
              className={`gap-1.5 text-xs flex-1 h-10 ${callSuccess === true ? 'bg-success hover:bg-success/90 text-success-foreground' : ''}`}
            >
              <ThumbsUp className="w-4 h-4" />
              Success
            </Button>
            <Button
              size="sm"
              variant={callSuccess === false ? 'destructive' : 'outline'}
              onClick={() => setCallSuccess(callSuccess === false ? null : false)}
              className="gap-1.5 text-xs flex-1 h-10"
            >
              <ThumbsDown className="w-4 h-4" />
              Failed
            </Button>
          </div>
        </div>

        {/* Call Rating */}
        <div className="glass-card p-3 mb-4">
          <p className="text-sm font-medium mb-2">How did the call go?</p>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map(star => (
              <button
                key={star}
                onClick={() => setCallRating(star === callRating ? 0 : star)}
                onMouseEnter={() => setHoverRating(star)}
                onMouseLeave={() => setHoverRating(0)}
                className="p-0.5 transition-transform hover:scale-110"
              >
                <Star
                  className={`w-6 h-6 transition-colors ${
                    star <= (hoverRating || callRating)
                      ? 'text-warning fill-warning'
                      : 'text-muted-foreground'
                  }`}
                />
              </button>
            ))}
            {callRating > 0 && (
              <span className="text-xs text-muted-foreground ml-2">{callRating}/5</span>
            )}
          </div>
        </div>

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

          <label className="flex items-center gap-3 glass-card p-3 cursor-pointer hover:border-primary/30 transition-colors">
            <input type="checkbox" checked={actions.has('no_answer')} onChange={() => toggleAction('no_answer')} className="accent-primary w-4 h-4" />
            <PhoneMissed className="w-4 h-4 text-warning" />
            <span className="text-sm font-medium">No Answer</span>
            <span className="text-xs text-muted-foreground ml-auto">Suppressed for session</span>
          </label>

          <label className="flex items-center gap-3 glass-card p-3 cursor-pointer hover:border-primary/30 transition-colors">
            <input type="checkbox" checked={actions.has('phone_not_working')} onChange={() => toggleAction('phone_not_working')} className="accent-primary w-4 h-4" />
            <PhoneOff className="w-4 h-4 text-destructive" />
            <span className="text-sm font-medium">Phone Number Not Working</span>
            <span className="text-xs text-muted-foreground ml-auto">Suppressed for session</span>
          </label>

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

          <label className="flex items-center gap-3 glass-card p-3 cursor-pointer hover:border-primary/30 transition-colors">
            <input type="checkbox" checked={actions.has('remove_from_queue')} onChange={() => toggleAction('remove_from_queue')} className="accent-primary w-4 h-4" />
            <X className="w-4 h-4 text-muted-foreground" />
            <div className="flex-1">
              <span className="text-sm font-medium">Remove from Queue</span>
              <span className="text-xs text-muted-foreground block">Hidden from queue, kept in CSV for deduplication</span>
            </div>
          </label>

          <label className="flex items-start gap-3 glass-card p-3 cursor-pointer hover:border-primary/30 transition-colors">
            <input type="checkbox" checked={actions.has('follow_up')} onChange={() => toggleAction('follow_up')} className="mt-0.5 accent-primary w-4 h-4" />
            <div className="flex-1">
              <span className="text-sm font-medium">Schedule Follow-up</span>
              {actions.has('follow_up') && (
                <div className="mt-3 space-y-3 animate-fade-in">
                  {/* Quick schedule buttons for same-day */}
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { label: 'In 30 min', mins: 30 },
                      { label: 'In 1 hour', mins: 60 },
                      { label: 'In 2 hours', mins: 120 },
                      { label: 'In 3 hours', mins: 180 },
                    ].map(opt => {
                      const target = new Date(Date.now() + opt.mins * 60000);
                      return (
                        <Button
                          key={opt.label}
                          type="button"
                          variant="outline"
                          size="sm"
                          className="text-xs h-7 px-2"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setFollowUpDate(target);
                            setFollowUpTime(`${target.getHours().toString().padStart(2, '0')}:${target.getMinutes().toString().padStart(2, '0')}`);
                          }}
                        >
                          <Clock className="w-3 h-3 mr-1" />
                          {opt.label}
                        </Button>
                      );
                    })}
                  </div>
                  {/* Date + time picker */}
                  <div className="flex items-center gap-2">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className={cn("gap-1.5 text-xs h-8", !followUpDate && "text-muted-foreground")}>
                          <CalendarIcon className="w-3 h-3" />
                          {followUpDate ? (
                            <>
                              {format(followUpDate, 'PPP')}
                              {followUpDate.toDateString() === new Date().toDateString() && (
                                <span className="text-[10px] bg-primary/20 text-primary px-1 py-0.5 rounded ml-1">Today</span>
                              )}
                            </>
                          ) : 'Pick date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={followUpDate}
                          onSelect={setFollowUpDate}
                          disabled={(d) => {
                            const today = new Date();
                            today.setHours(0, 0, 0, 0);
                            return d < today;
                          }}
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

        <div className="flex gap-2">
          <Button onClick={() => handleDone('backward')} variant="outline" className="flex-1 h-11 font-semibold rounded-lg">
            <Undo2 className="w-4 h-4 mr-2" />
            Done & Prev
          </Button>
          <Button onClick={() => handleDone('forward')} className="flex-[2] h-11 font-semibold rounded-lg">
            Done & Next
          </Button>
        </div>
      </div>
    </div>
  );
}
