import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getContacts, getCalls } from '@/lib/storage';
import { getSessionStats } from '@/lib/session';
import { Contact, Call } from '@/types';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Phone, PhoneOff, PhoneMissed, CheckCircle, Users, Clock } from 'lucide-react';

const OUTCOME_LABELS: Record<string, { label: string; icon: typeof Phone; color: string }> = {
  interested: { label: 'Interested', icon: CheckCircle, color: 'text-success' },
  not_interested: { label: 'Not Interested', icon: PhoneOff, color: 'text-destructive' },
  no_answer: { label: 'No Answer', icon: PhoneMissed, color: 'text-warning' },
  phone_not_working: { label: 'Phone Not Working', icon: PhoneOff, color: 'text-destructive' },
  completed: { label: 'Completed', icon: Phone, color: 'text-primary' },
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [calls, setCalls] = useState<Call[]>([]);

  useEffect(() => {
    setContacts(getContacts());
    setCalls(getCalls());
  }, []);

  const sessionStats = getSessionStats();

  const overallStats = useMemo(() => {
    const total = contacts.length;
    const called = contacts.filter(c => c.called).length;
    const remaining = total - called;
    const notInterested = contacts.filter(c => c.not_interested).length;
    const withFollowUp = contacts.filter(c => !!c.follow_up_date).length;
    return { total, called, remaining, notInterested, withFollowUp };
  }, [contacts]);

  // Session outcome breakdown
  const sessionOutcomes = useMemo(() => {
    const entries = Object.entries(sessionStats.outcomes).sort((a, b) => b[1] - a[1]);
    return entries;
  }, [sessionStats]);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="gap-1">
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>
        <h1 className="text-2xl font-bold">Dashboard</h1>
      </div>

      {/* Overall Stats */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Overall</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="glass-card p-4 text-center">
            <Users className="w-5 h-5 mx-auto mb-2 text-primary" />
            <div className="text-2xl font-bold">{overallStats.total}</div>
            <div className="text-xs text-muted-foreground">Total Leads</div>
          </div>
          <div className="glass-card p-4 text-center">
            <Phone className="w-5 h-5 mx-auto mb-2 text-success" />
            <div className="text-2xl font-bold">{overallStats.called}</div>
            <div className="text-xs text-muted-foreground">Called</div>
          </div>
          <div className="glass-card p-4 text-center">
            <Clock className="w-5 h-5 mx-auto mb-2 text-warning" />
            <div className="text-2xl font-bold">{overallStats.remaining}</div>
            <div className="text-xs text-muted-foreground">Remaining</div>
          </div>
          <div className="glass-card p-4 text-center">
            <PhoneOff className="w-5 h-5 mx-auto mb-2 text-destructive" />
            <div className="text-2xl font-bold">{overallStats.notInterested}</div>
            <div className="text-xs text-muted-foreground">Not Interested</div>
          </div>
          <div className="glass-card p-4 text-center">
            <CheckCircle className="w-5 h-5 mx-auto mb-2 text-primary" />
            <div className="text-2xl font-bold">{overallStats.withFollowUp}</div>
            <div className="text-xs text-muted-foreground">Follow-ups</div>
          </div>
        </div>
      </div>

      {/* Session Stats */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Current Session</h2>
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-3xl font-bold">{sessionStats.callsMade}</div>
              <div className="text-sm text-muted-foreground">Calls Made</div>
            </div>
            <div className="text-xs text-muted-foreground">
              Started: {new Date(sessionStats.sessionStart).toLocaleTimeString()}
            </div>
          </div>

          {sessionOutcomes.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground mb-2">Outcome Breakdown</p>
              {sessionOutcomes.map(([outcome, count]) => {
                const info = OUTCOME_LABELS[outcome] || { label: outcome, icon: Phone, color: 'text-muted-foreground' };
                const Icon = info.icon;
                const percentage = sessionStats.callsMade > 0 ? Math.round((count / sessionStats.callsMade) * 100) : 0;
                return (
                  <div key={outcome} className="flex items-center gap-3">
                    <Icon className={`w-4 h-4 ${info.color}`} />
                    <span className="text-sm flex-1">{info.label}</span>
                    <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${percentage}%` }} />
                    </div>
                    <span className="text-sm font-mono w-8 text-right">{count}</span>
                    <span className="text-xs text-muted-foreground w-10 text-right">{percentage}%</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">No calls made this session yet</p>
          )}
        </div>
      </div>

      {/* Recent Calls */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Recent Calls</h2>
        <div className="space-y-2">
          {calls.slice(-10).reverse().map(call => (
            <div key={call.id} className="glass-card p-3 flex items-center justify-between">
              <div>
                <span className="font-medium text-sm">{call.contact_name}</span>
                <div className="text-xs text-muted-foreground">
                  {new Date(call.started_at).toLocaleDateString()} · {Math.floor(call.duration_seconds / 60)}m {call.duration_seconds % 60}s
                </div>
              </div>
              <div className="flex items-center gap-2">
                {call.actions_taken.map(action => (
                  <span key={action} className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{action}</span>
                ))}
              </div>
            </div>
          ))}
          {calls.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">No calls recorded yet</p>
          )}
        </div>
      </div>
    </div>
  );
}
