import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getContacts, getCalls } from '@/lib/storage';
import { getSessions, getActiveSession, startSession, endActiveSession } from '@/lib/session';
import { Contact, Call, Session } from '@/types';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Phone, PhoneOff, PhoneMissed, CheckCircle, Users, Clock, Star, Play, Square, ChevronRight, ChevronDown, BarChart3, MapPin, Globe, FileText, ThumbsUp, ThumbsDown } from 'lucide-react';

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
  const [sessions, setSessions] = useState<Session[]>([]);
  const [viewingSessionId, setViewingSessionId] = useState<string | null>(null);
  const [expandedCallId, setExpandedCallId] = useState<string | null>(null);

  useEffect(() => {
    setContacts(getContacts());
    setCalls(getCalls());
    setSessions(getSessions());
  }, []);

  const activeSession = getActiveSession();

  const handleStartSession = () => {
    const s = startSession();
    setSessions(getSessions());
    setViewingSessionId(s.id);
  };

  const handleEndSession = () => {
    endActiveSession();
    setSessions(getSessions());
    setViewingSessionId(null);
  };

  const overallStats = useMemo(() => {
    const total = contacts.length;
    const called = contacts.filter(c => c.called).length;
    const remaining = total - called;
    const notInterested = contacts.filter(c => c.not_interested).length;
    const withFollowUp = contacts.filter(c => !!c.follow_up_date).length;
    const totalCalls = calls.length;
    return { total, called, remaining, notInterested, withFollowUp, totalCalls };
  }, [contacts, calls]);

  // Overall outcome aggregation
  const overallOutcomes = useMemo(() => {
    const outcomes: Record<string, number> = {};
    sessions.forEach(s => {
      Object.entries(s.outcomes).forEach(([k, v]) => {
        outcomes[k] = (outcomes[k] || 0) + v;
      });
    });
    return Object.entries(outcomes).sort((a, b) => b[1] - a[1]);
  }, [sessions]);

  // Average call rating
  const avgRating = useMemo(() => {
    const rated = calls.filter(c => c.call_rating > 0);
    if (rated.length === 0) return 0;
    return rated.reduce((sum, c) => sum + c.call_rating, 0) / rated.length;
  }, [calls]);

  // Niche performance
  const nichePerformance = useMemo(() => {
    const niches: Record<string, { total: number; interested: number; avgRating: number; ratings: number[] }> = {};
    calls.forEach(c => {
      const cat = c.category || 'Uncategorized';
      if (!niches[cat]) niches[cat] = { total: 0, interested: 0, avgRating: 0, ratings: [] };
      niches[cat].total++;
      const contact = contacts.find(co => co.id === c.contact_id);
      if (contact && (contact.call_outcome === 'interested' || contact.follow_up_date)) {
        niches[cat].interested++;
      }
      if (c.call_rating > 0) niches[cat].ratings.push(c.call_rating);
    });
    return Object.entries(niches)
      .map(([name, data]) => ({
        name,
        total: data.total,
        interested: data.interested,
        convRate: data.total > 0 ? Math.round((data.interested / data.total) * 100) : 0,
        avgRating: data.ratings.length > 0 ? (data.ratings.reduce((a, b) => a + b, 0) / data.ratings.length).toFixed(1) : '—',
      }))
      .sort((a, b) => b.convRate - a.convRate);
  }, [calls, contacts]);

  // Session-specific view
  const viewingSession = viewingSessionId ? sessions.find(s => s.id === viewingSessionId) : null;
  const sessionCalls = useMemo(() => {
    if (!viewingSessionId) return [];
    return calls.filter(c => c.session_id === viewingSessionId);
  }, [calls, viewingSessionId]);

  const sessionAvgRating = useMemo(() => {
    const rated = sessionCalls.filter(c => c.call_rating > 0);
    if (rated.length === 0) return 0;
    return rated.reduce((sum, c) => sum + c.call_rating, 0) / rated.length;
  }, [sessionCalls]);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="gap-1">
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="ml-auto flex items-center gap-2">
          {activeSession ? (
            <>
              <span className="text-xs text-muted-foreground">Session: {activeSession.name}</span>
              <Button variant="outline" size="sm" onClick={handleEndSession} className="gap-1 text-xs">
                <Square className="w-3 h-3" /> End Session
              </Button>
            </>
          ) : (
            <Button variant="default" size="sm" onClick={handleStartSession} className="gap-1 text-xs">
              <Play className="w-3 h-3" /> Start Session
            </Button>
          )}
        </div>
      </div>

      {/* Session navigation */}
      {!viewingSession && (
        <>
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
                <div className="text-2xl font-bold">{overallStats.totalCalls}</div>
                <div className="text-xs text-muted-foreground">Calls Made</div>
              </div>
              <div className="glass-card p-4 text-center">
                <Clock className="w-5 h-5 mx-auto mb-2 text-warning" />
                <div className="text-2xl font-bold">{overallStats.remaining}</div>
                <div className="text-xs text-muted-foreground">Remaining</div>
              </div>
              <div className="glass-card p-4 text-center">
                <Star className="w-5 h-5 mx-auto mb-2 text-warning" />
                <div className="text-2xl font-bold">{avgRating > 0 ? avgRating.toFixed(1) : '—'}</div>
                <div className="text-xs text-muted-foreground">Avg Rating</div>
              </div>
              <div className="glass-card p-4 text-center">
                <CheckCircle className="w-5 h-5 mx-auto mb-2 text-primary" />
                <div className="text-2xl font-bold">{overallStats.withFollowUp}</div>
                <div className="text-xs text-muted-foreground">Follow-ups</div>
              </div>
            </div>
          </div>

          {/* Overall Outcomes */}
          {overallOutcomes.length > 0 && (
            <div className="mb-8">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Outcome Breakdown</h2>
              <div className="glass-card p-5 space-y-2">
                {overallOutcomes.map(([outcome, count]) => {
                  const info = OUTCOME_LABELS[outcome] || { label: outcome, icon: Phone, color: 'text-muted-foreground' };
                  const Icon = info.icon;
                  const total = overallOutcomes.reduce((s, [, c]) => s + c, 0);
                  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                  return (
                    <div key={outcome} className="flex items-center gap-3">
                      <Icon className={`w-4 h-4 ${info.color}`} />
                      <span className="text-sm flex-1">{info.label}</span>
                      <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-sm font-mono w-8 text-right">{count}</span>
                      <span className="text-xs text-muted-foreground w-10 text-right">{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Niche Performance */}
          {nichePerformance.length > 0 && (
            <div className="mb-8">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Niche Performance</h2>
              <div className="glass-card overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left p-3 text-xs font-semibold text-muted-foreground">Category</th>
                      <th className="text-center p-3 text-xs font-semibold text-muted-foreground">Calls</th>
                      <th className="text-center p-3 text-xs font-semibold text-muted-foreground">Interested</th>
                      <th className="text-center p-3 text-xs font-semibold text-muted-foreground">Conv. Rate</th>
                      <th className="text-center p-3 text-xs font-semibold text-muted-foreground">Avg Rating</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nichePerformance.map(n => (
                      <tr key={n.name} className="border-b border-border/50">
                        <td className="p-3 font-medium">{n.name}</td>
                        <td className="p-3 text-center">{n.total}</td>
                        <td className="p-3 text-center text-success">{n.interested}</td>
                        <td className="p-3 text-center">
                          <span className={n.convRate >= 20 ? 'text-success font-semibold' : 'text-muted-foreground'}>{n.convRate}%</span>
                        </td>
                        <td className="p-3 text-center">{n.avgRating}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Sessions List */}
          <div className="mb-8">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Sessions</h2>
            <div className="space-y-2">
              {sessions.slice().reverse().map(session => (
                <button
                  key={session.id}
                  onClick={() => setViewingSessionId(session.id)}
                  className="w-full glass-card p-4 flex items-center justify-between hover:border-primary/30 transition-colors text-left"
                >
                  <div>
                    <span className="font-medium text-sm">{session.name}</span>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {session.callsMade} calls · {Object.keys(session.outcomes).length} outcome types
                      {session.id === activeSession?.id && <span className="text-success ml-2">● Active</span>}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
              ))}
              {sessions.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">No sessions yet — start one to begin tracking</p>
              )}
            </div>
          </div>
        </>
      )}

      {/* Single Session View */}
      {viewingSession && (
        <>
          <Button variant="ghost" size="sm" onClick={() => setViewingSessionId(null)} className="gap-1 mb-4 text-xs">
            <ArrowLeft className="w-3.5 h-3.5" /> All Sessions
          </Button>

          <div className="mb-6">
            <h2 className="text-lg font-bold">{viewingSession.name}</h2>
            <p className="text-xs text-muted-foreground">
              Started: {new Date(viewingSession.startedAt).toLocaleString()}
              {viewingSession.endedAt && ` · Ended: ${new Date(viewingSession.endedAt).toLocaleString()}`}
            </p>
          </div>

          {/* Session Stats */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="glass-card p-4 text-center">
              <Phone className="w-5 h-5 mx-auto mb-2 text-primary" />
              <div className="text-2xl font-bold">{viewingSession.callsMade}</div>
              <div className="text-xs text-muted-foreground">Calls Made</div>
            </div>
            <div className="glass-card p-4 text-center">
              <Star className="w-5 h-5 mx-auto mb-2 text-warning" />
              <div className="text-2xl font-bold">{sessionAvgRating > 0 ? sessionAvgRating.toFixed(1) : '—'}</div>
              <div className="text-xs text-muted-foreground">Avg Rating</div>
            </div>
            <div className="glass-card p-4 text-center">
              <BarChart3 className="w-5 h-5 mx-auto mb-2 text-success" />
              <div className="text-2xl font-bold">{Object.keys(viewingSession.outcomes).length}</div>
              <div className="text-xs text-muted-foreground">Outcome Types</div>
            </div>
          </div>

          {/* Session Outcome Breakdown */}
          {Object.keys(viewingSession.outcomes).length > 0 && (
            <div className="glass-card p-5 mb-6 space-y-2">
              <p className="text-xs font-medium text-muted-foreground mb-2">Outcome Breakdown</p>
              {Object.entries(viewingSession.outcomes).sort((a, b) => b[1] - a[1]).map(([outcome, count]) => {
                const info = OUTCOME_LABELS[outcome] || { label: outcome, icon: Phone, color: 'text-muted-foreground' };
                const Icon = info.icon;
                const pct = viewingSession.callsMade > 0 ? Math.round((count / viewingSession.callsMade) * 100) : 0;
                return (
                  <div key={outcome} className="flex items-center gap-3">
                    <Icon className={`w-4 h-4 ${info.color}`} />
                    <span className="text-sm flex-1">{info.label}</span>
                    <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-sm font-mono w-8 text-right">{count}</span>
                    <span className="text-xs text-muted-foreground w-10 text-right">{pct}%</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Session Calls */}
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Calls in this session</h3>
          <div className="space-y-2">
            {sessionCalls.map(call => {
              const isExpanded = expandedCallId === call.id;
              const callContact = contacts.find(co => co.id === call.contact_id);
              return (
                <div key={call.id} className="glass-card overflow-hidden">
                  <button
                    onClick={() => setExpandedCallId(isExpanded ? null : call.id)}
                    className="w-full p-3 flex items-center justify-between text-left hover:bg-accent/50 transition-colors"
                  >
                    <div>
                      <span className="font-medium text-sm">{call.contact_name}</span>
                      {call.category && <span className="text-xs text-muted-foreground ml-2">({call.category})</span>}
                      <div className="text-xs text-muted-foreground">
                        {new Date(call.started_at).toLocaleTimeString()} · {Math.floor(call.duration_seconds / 60)}m {call.duration_seconds % 60}s
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {call.call_success === true && <ThumbsUp className="w-3.5 h-3.5 text-success" />}
                      {call.call_success === false && <ThumbsDown className="w-3.5 h-3.5 text-destructive" />}
                      {call.call_rating > 0 && (
                        <div className="flex items-center gap-0.5">
                          {Array.from({ length: call.call_rating }).map((_, i) => (
                            <Star key={i} className="w-3 h-3 text-warning fill-warning" />
                          ))}
                        </div>
                      )}
                      {call.actions_taken.map(action => (
                        <span key={action} className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{action}</span>
                      ))}
                      {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="border-t border-border/50 p-4 space-y-3 animate-fade-in bg-muted/20">
                      {/* Contact details */}
                      {callContact && (
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Phone className="w-3 h-3" />
                            <span className="font-mono">{callContact.phone}</span>
                          </div>
                          {callContact.address && (
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <MapPin className="w-3 h-3" />
                              <span className="truncate">{callContact.address}</span>
                            </div>
                          )}
                          {callContact.website && (
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <Globe className="w-3 h-3" />
                              <a href={callContact.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate">{callContact.website}</a>
                            </div>
                          )}
                          {callContact.category && (
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <span className="text-[10px] bg-accent px-1.5 py-0.5 rounded">{callContact.category}</span>
                            </div>
                          )}
                        </div>
                      )}
                      {/* Call outcome */}
                      {callContact?.call_outcome && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-muted-foreground">Outcome:</span>
                          <span className={`text-xs font-medium ${
                            OUTCOME_LABELS[callContact.call_outcome]?.color || 'text-muted-foreground'
                          }`}>
                            {OUTCOME_LABELS[callContact.call_outcome]?.label || callContact.call_outcome}
                          </span>
                        </div>
                      )}
                      {/* Success/Fail */}
                      {call.call_success !== undefined && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-muted-foreground">Result:</span>
                          {call.call_success ? (
                            <span className="text-xs font-medium text-success flex items-center gap-1"><ThumbsUp className="w-3 h-3" /> Success</span>
                          ) : (
                            <span className="text-xs font-medium text-destructive flex items-center gap-1"><ThumbsDown className="w-3 h-3" /> Failed</span>
                          )}
                        </div>
                      )}
                      {/* Notes */}
                      {call.notes && (
                        <div>
                          <div className="flex items-center gap-1.5 mb-1">
                            <FileText className="w-3 h-3 text-muted-foreground" />
                            <span className="text-xs font-medium text-muted-foreground">Notes</span>
                          </div>
                          <p className="text-sm bg-muted/50 rounded p-2 whitespace-pre-wrap">{call.notes}</p>
                        </div>
                      )}
                      {/* Transcript */}
                      {call.transcript && (
                        <div>
                          <span className="text-xs font-medium text-muted-foreground">Transcript</span>
                          <p className="text-xs text-muted-foreground bg-muted/50 rounded p-2 mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap">
                            {call.transcript.length > 500 ? call.transcript.slice(0, 500) + '...' : call.transcript}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {sessionCalls.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">No calls in this session yet</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
