import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getContacts, getCalls, getActiveCampaignId } from '@/lib/storage';
import { getSessions, getActiveSession, startSession, endActiveSession } from '@/lib/session';
import { Contact, Call, Session, CampaignMember } from '@/types';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Phone, PhoneOff, PhoneMissed, CheckCircle, Users, Clock, Star, Play, Square, ChevronRight, ChevronDown, BarChart3, MapPin, Globe, FileText, ThumbsUp, ThumbsDown, User, ShieldCheck } from 'lucide-react';
import { fetchCampaignMembers } from '@/lib/supabase-sync';
import { supabase } from '@/lib/supabase';

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
  
  const [members, setMembers] = useState<CampaignMember[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null); // null = Team Overview
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    const campaignId = getActiveCampaignId();
    setContacts(getContacts());
    setCalls(getCalls());
    setSessions(getSessions());
    
    if (campaignId) {
      fetchCampaignMembers(campaignId).then(setMembers).catch(console.error);
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setCurrentUserId(session?.user?.id || null);
    });
  }, []);

  const activeSession = getActiveSession();

  const handleStartSession = async () => {
    const s = await startSession();
    setSessions(getSessions());
    setViewingSessionId(s.id);
  };

  const handleEndSession = () => {
    endActiveSession();
    setSessions(getSessions());
    setViewingSessionId(null);
  };

  // Filtered data based on selection
  const filteredSessions = useMemo(() => {
    if (!selectedUserId) return sessions;
    return sessions.filter(s => s.userId === selectedUserId);
  }, [sessions, selectedUserId]);

  const filteredCalls = useMemo(() => {
    if (!selectedUserId) return calls;
    return calls.filter(c => c.userId === selectedUserId);
  }, [calls, selectedUserId]);

  const overallStats = useMemo(() => {
    const total = contacts.length;
    // For "Called" we show how many unique contacts this person (or team) touched
    const callsFromTarget = filteredCalls;
    const uniqueCalledIds = new Set(callsFromTarget.map(c => c.contact_id));
    const called = uniqueCalledIds.size;
    
    const remaining = total - contacts.filter(c => c.called).length;
    const notInterested = contacts.filter(c => c.not_interested && (!selectedUserId || filteredCalls.some(f => f.contact_id === c.id))).length;
    
    const trueCalls = filteredCalls.filter(c => 
      !c.actions_taken.includes('no_answer') && 
      !c.actions_taken.includes('phone_not_working') && 
      !c.actions_taken.includes('revert_uncalled')
    );
    const totalCalls = trueCalls.length;
    
    const withFollowUpCount = contacts.filter(c => c.follow_up_date && (!selectedUserId || filteredCalls.some(f => f.contact_id === c.id))).length;

    return { total, called, remaining, notInterested, withFollowUp: withFollowUpCount, totalCalls };
  }, [contacts, filteredCalls, selectedUserId]);

  // Overall outcome aggregation
  const overallOutcomes = useMemo(() => {
    const outcomes: Record<string, number> = {};
    filteredSessions.forEach(s => {
      Object.entries(s.outcomes).forEach(([k, v]) => {
        outcomes[k] = (outcomes[k] || 0) + v;
      });
    });
    return Object.entries(outcomes).sort((a, b) => b[1] - a[1]);
  }, [filteredSessions]);

  // Average call rating
  const avgRating = useMemo(() => {
    const rated = filteredCalls.filter(c => c.call_rating > 0);
    if (rated.length === 0) return 0;
    return rated.reduce((sum, c) => sum + c.call_rating, 0) / rated.length;
  }, [filteredCalls]);

  // Niche performance
  const nichePerformance = useMemo(() => {
    const niches: Record<string, { total: number; interested: number; avgRating: number; ratings: number[] }> = {};
    filteredCalls.forEach(c => {
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
  }, [filteredCalls, contacts]);

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

  const selectedMember = members.find(m => m.id === selectedUserId);

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 border-r border-border bg-card/30 flex flex-col shrink-0">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Team Stats</h2>
          <Users className="w-4 h-4 text-muted-foreground" />
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          <button
            onClick={() => setSelectedUserId(null)}
            className={`w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 transition-all ${
              selectedUserId === null ? 'bg-primary/10 text-primary font-semibold shadow-sm' : 'hover:bg-accent/50 text-muted-foreground'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span className="text-sm">Team Overview</span>
          </button>
          
          <div className="pt-2 pb-1 px-4 text-[10px] uppercase font-bold text-muted-foreground/60 tracking-widest">
            Members
          </div>

          {[...members].sort((a, b) => {
            if (a.id === currentUserId) return -1;
            if (b.id === currentUserId) return 1;
            return a.email.localeCompare(b.email);
          }).map(member => (
            <button
              key={member.id}
              onClick={() => setSelectedUserId(member.id)}
              className={`w-full text-left px-4 py-3 rounded-lg flex items-center justify-between transition-all group ${
                selectedUserId === member.id ? 'bg-primary/10 text-primary font-semibold shadow-sm' : 'hover:bg-accent/50 text-muted-foreground'
              }`}
            >
              <div className="flex items-center gap-3 truncate">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                  selectedUserId === member.id ? 'bg-primary/20' : 'bg-muted group-hover:bg-accent'
                }`}>
                  <User className="w-4 h-4" />
                </div>
                <div className="flex flex-col truncate">
                  <span className="text-sm truncate">
                    {member.id === currentUserId ? 'Me' : (member.display_name || member.email.split('@')[0])}
                  </span>
                  <span className="text-[10px] opacity-60 truncate">{member.email}</span>
                </div>
              </div>
              {member.role === 'owner' && <ShieldCheck className="w-3 h-3 text-warning shrink-0" title="Admin" />}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-5xl mx-auto">
          <div className="flex items-center gap-4 mb-8">
            <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="gap-1 h-8">
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
            <div>
              <h1 className="text-2xl font-bold leading-tight">
                {selectedUserId === null ? 'Team Overview' : 
                 selectedUserId === currentUserId ? 'My Stats' : 
                 `${selectedMember?.display_name || selectedMember?.email?.split('@')[0]}'s Performance`}
              </h1>
              <p className="text-xs text-muted-foreground">Detailed metrics and session history</p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {activeSession ? (
                <>
                  <div className="hidden md:flex flex-col items-end mr-2">
                    <span className="text-[10px] uppercase font-bold text-success/80">Recording Live</span>
                    <span className="text-xs font-medium">{activeSession.name}</span>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleEndSession} className="gap-2 h-9 border-destructive/20 hover:bg-destructive/10 text-destructive">
                    <Square className="w-3.5 h-3.5" /> End Session
                  </Button>
                </>
              ) : (
                <Button variant="default" size="sm" onClick={handleStartSession} className="gap-2 h-9 shadow-lg shadow-primary/20">
                  <Play className="w-3.5 h-3.5" /> Start New Session
                </Button>
              )}
            </div>
          </div>

          {/* Session navigation */}
          {!viewingSession && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
              {/* Overall Stats */}
              <div className="mb-8">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div className="glass-card p-5 text-center transition-all hover:translate-y-[-2px]">
                    <Users className="w-5 h-5 mx-auto mb-2 text-primary" />
                    <div className="text-2xl font-bold">{overallStats.total}</div>
                    <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Leads</div>
                  </div>
                  <div className="glass-card p-5 text-center transition-all hover:translate-y-[-2px]">
                    <Phone className="w-5 h-5 mx-auto mb-2 text-success" />
                    <div className="text-2xl font-bold">{overallStats.totalCalls}</div>
                    <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Calls Made</div>
                  </div>
                  <div className="glass-card p-5 text-center transition-all hover:translate-y-[-2px]">
                    <Clock className="w-5 h-5 mx-auto mb-2 text-warning" />
                    <div className="text-2xl font-bold">{overallStats.remaining}</div>
                    <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Remaining</div>
                  </div>
                  <div className="glass-card p-5 text-center transition-all hover:translate-y-[-2px]">
                    <Star className="w-5 h-5 mx-auto mb-2 text-warning" />
                    <div className="text-2xl font-bold">{avgRating > 0 ? avgRating.toFixed(1) : '—'}</div>
                    <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Avg Rating</div>
                  </div>
                  <div className="glass-card p-5 text-center transition-all hover:translate-y-[-2px]">
                    <CheckCircle className="w-5 h-5 mx-auto mb-2 text-primary" />
                    <div className="text-2xl font-bold">{overallStats.withFollowUp}</div>
                    <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Interested</div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Overall Outcomes */}
                {overallOutcomes.length > 0 && (
                  <div>
                    <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground/80 mb-3 ml-1">Success Metrics</h2>
                    <div className="glass-card p-6 space-y-4">
                      {overallOutcomes.map(([outcome, count]) => {
                        const info = OUTCOME_LABELS[outcome] || { label: outcome, icon: Phone, color: 'text-muted-foreground' };
                        const Icon = info.icon;
                        const total = overallOutcomes.reduce((s, [, c]) => s + c, 0);
                        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                        return (
                          <div key={outcome} className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Icon className={`w-3.5 h-3.5 ${info.color}`} />
                                <span className="text-sm font-medium">{info.label}</span>
                              </div>
                              <span className="text-xs font-mono text-muted-foreground">{count} calls ({pct}%)</span>
                            </div>
                            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                              <div className={`h-full rounded-full transition-all duration-1000 ${
                                outcome === 'interested' ? 'bg-success' : 
                                outcome === 'not_interested' ? 'bg-destructive' : 'bg-primary'
                              }`} style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Niche Performance */}
                {nichePerformance.length > 0 && (
                  <div>
                    <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground/80 mb-3 ml-1">Niche Performance</h2>
                    <div className="glass-card overflow-hidden border">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-muted/30 border-b border-border">
                            <th className="text-left p-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">Category</th>
                            <th className="text-center p-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">Conv.</th>
                            <th className="text-center p-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">Rating</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/40">
                          {nichePerformance.map(n => (
                            <tr key={n.name} className="hover:bg-accent/20 transition-colors">
                              <td className="p-3">
                                <div className="font-semibold text-xs">{n.name}</div>
                                <div className="text-[10px] text-muted-foreground">{n.total} calls</div>
                              </td>
                              <td className="p-3 text-center">
                                <span className={`text-xs font-bold ${n.convRate >= 20 ? 'text-success' : 'text-muted-foreground'}`}>{n.convRate}%</span>
                              </td>
                              <td className="p-3 text-center font-mono text-xs">{n.avgRating}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {/* Sessions List */}
              <div className="mt-8">
                <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground/80 mb-3 ml-1">Session History</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {filteredSessions.slice().reverse().map(session => (
                    <button
                      key={session.id}
                      onClick={() => setViewingSessionId(session.id)}
                      className="glass-card p-4 flex items-center justify-between hover:bg-accent/30 hover:border-primary/40 transition-all text-left relative overflow-hidden group"
                    >
                      <div className="absolute top-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <ChevronRight className="w-3.5 h-3.5 text-primary" />
                      </div>
                      <div className="flex-1 truncate pr-6">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-sm truncate">{session.name}</span>
                          {session.id === activeSession?.id && (
                            <span className="flex items-center gap-1 text-[9px] font-bold bg-success/10 text-success px-1.5 py-0.5 rounded-full animate-pulse">
                              <span className="w-1 h-1 rounded-full bg-success" /> LIVE
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {session.callsMade}</span>
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" /> 
                            <span className="truncate max-w-[120px]">{session.userEmail || 'Anonymous'}</span>
                          </span>
                        </div>
                      </div>
                    </button>
                  ))}
                  {filteredSessions.length === 0 && (
                    <div className="col-span-full py-12 text-center glass-card border-dashed">
                      <BarChart3 className="w-8 h-8 mx-auto mb-3 opacity-20" />
                      <p className="text-sm text-muted-foreground italic">No sessions found for this member</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Single Session View */}
          {viewingSession && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-500">
              <Button variant="ghost" size="sm" onClick={() => setViewingSessionId(null)} className="gap-2 mb-6 h-8 text-xs">
                <ArrowLeft className="w-3.5 h-3.5" /> Back to History
              </Button>

              <div className="glass-card p-6 mb-8 border-l-4 border-l-primary">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-2xl font-bold tracking-tight">{viewingSession.name}</h2>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {new Date(viewingSession.startedAt).toLocaleString()}</span>
                      {viewingSession.userEmail && (
                        <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" /> {viewingSession.userEmail}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-black text-primary/40 uppercase tracking-tighter">Session Log</div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-background/50 rounded-xl p-4 border border-border/50 text-center">
                    <div className="text-2xl font-black">{viewingSession.callsMade}</div>
                    <div className="text-[10px] font-bold uppercase text-muted-foreground">Calls Made</div>
                  </div>
                  <div className="bg-background/50 rounded-xl p-4 border border-border/50 text-center">
                    <div className="text-2xl font-black">{sessionAvgRating > 0 ? sessionAvgRating.toFixed(1) : '—'}</div>
                    <div className="text-[10px] font-bold uppercase text-muted-foreground">Avg Rating</div>
                  </div>
                  <div className="bg-background/50 rounded-xl p-4 border border-border/50 text-center">
                    <div className="text-2xl font-black text-success">
                      {viewingSession.outcomes['interested'] || 0}
                    </div>
                    <div className="text-[10px] font-bold uppercase text-muted-foreground">Successes</div>
                  </div>
                </div>
              </div>

              {/* Session Calls Table */}
              <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground/80 mb-3 ml-1">Activity Log</h3>
              <div className="space-y-3">
                {sessionCalls.map(call => {
                  const isExpanded = expandedCallId === call.id;
                  const callContact = contacts.find(co => co.id === call.contact_id);
                  const outcomeInfo = OUTCOME_LABELS[callContact?.call_outcome || ''] || { label: 'Completed', icon: Phone, color: 'text-primary' };
                  
                  return (
                    <div key={call.id} className={`glass-card overflow-hidden transition-all duration-300 ${isExpanded ? 'ring-2 ring-primary/20 bg-accent/10' : 'hover:bg-accent/30'}`}>
                      <button
                        onClick={() => setExpandedCallId(isExpanded ? null : call.id)}
                        className="w-full p-4 flex items-center gap-4 text-left"
                      >
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isExpanded ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                          <Phone className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm truncate">{call.contact_name}</span>
                            {call.category && <span className="text-[10px] bg-muted px-2 py-0.5 rounded-full text-muted-foreground font-medium">{call.category}</span>}
                          </div>
                          <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                            <Clock className="w-3 h-3" /> {new Date(call.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            <span className="opacity-30">|</span>
                            <span>{Math.floor(call.duration_seconds / 60)}m {call.duration_seconds % 60}s</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="hidden sm:flex items-center gap-1.5 pr-2 border-r border-border/50 mr-2">
                            {call.call_success === true && <ThumbsUp className="w-4 h-4 text-success" />}
                            {call.call_success === false && <ThumbsDown className="w-4 h-4 text-destructive" />}
                            {call.call_rating > 0 && (
                              <div className="flex items-center text-warning font-bold text-xs ml-1">
                                <Star className="w-3.5 h-3.5 fill-current mr-1" /> {call.call_rating}
                              </div>
                            )}
                          </div>
                          {isExpanded ? <ChevronDown className="w-4 h-4 text-primary" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                        </div>
                      </button>
                      
                      {isExpanded && (
                        <div className="border-t border-border/50 p-5 space-y-5 animate-in slide-in-from-top-2 duration-300">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-3">
                              <h4 className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">Contact Detail</h4>
                              <div className="grid grid-cols-1 gap-2 text-xs">
                                <div className="flex items-center gap-2 text-foreground font-medium">
                                  <Phone className="w-3.5 h-3.5 text-muted-foreground" /> {callContact?.phone}
                                </div>
                                {callContact?.address && (
                                  <div className="flex items-center gap-2 text-muted-foreground">
                                    <MapPin className="w-3.5 h-3.5" /> <span className="truncate">{callContact.address}</span>
                                  </div>
                                )}
                                {callContact?.website && (
                                  <div className="flex items-center gap-2">
                                    <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                                    <a href={callContact.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate">{callContact.website}</a>
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="space-y-3">
                              <h4 className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">Result Detail</h4>
                              <div className="flex flex-wrap gap-2">
                                <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                                  outcomeInfo.color.includes('success') ? 'bg-success/10 border-success/20 text-success' :
                                  outcomeInfo.color.includes('destructive') ? 'bg-destructive/10 border-destructive/20 text-destructive' :
                                  'bg-primary/10 border-primary/20 text-primary'
                                }`}>
                                  <outcomeInfo.icon className="w-3 h-3" /> {outcomeInfo.label}
                                </div>
                                {call.call_success !== undefined && (
                                  <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                                    call.call_success ? 'bg-success/10 border-success/20 text-success' : 'bg-destructive/10 border-destructive/20 text-destructive'
                                  }`}>
                                    {call.call_success ? <ThumbsUp className="w-3 h-3" /> : <ThumbsDown className="w-3 h-3" />}
                                    {call.call_success ? 'Successful Handoff' : 'Unsuccessful'}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          {call.notes && (
                            <div className="space-y-2">
                              <h4 className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground flex items-center gap-1.5">
                                <FileText className="w-3 h-3" /> Interaction Summary
                              </h4>
                              <p className="text-sm bg-background/50 rounded-xl p-4 border border-border/50 leading-relaxed italic text-foreground/90">
                                "{call.notes}"
                              </p>
                            </div>
                          )}

                          {call.transcript && (
                            <div className="space-y-2">
                              <h4 className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">Live Transcript Draft</h4>
                              <p className="text-[11px] text-muted-foreground/70 bg-background/30 rounded-xl p-4 border border-border/30 max-h-48 overflow-y-auto whitespace-pre-wrap leading-loose">
                                {call.transcript}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {sessionCalls.length === 0 && (
                  <div className="py-12 text-center glass-card border-dashed">
                    <Phone className="w-8 h-8 mx-auto mb-3 opacity-20" />
                    <p className="text-sm text-muted-foreground italic">No calls recorded in this session</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
