import { useState, useEffect, useCallback } from 'react';
import { PendingEmail, SenderAccount, getPendingEmails, updatePendingEmail, deletePendingEmail, regenerateEmail, sendToWebhook } from '@/lib/email';
import { getActiveCampaignId, getCampaigns } from '@/lib/storage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  Mail, Send, X, RotateCcw, Loader2, CheckCircle2, XCircle,
  Clock, Trash2, ChevronRight, MessageSquare, User, AlertTriangle,
  Sparkles, PenLine, Eye
} from 'lucide-react';

type ViewMode = 'list' | 'detail';

export default function EmailReview() {
  const [emails, setEmails] = useState<PendingEmail[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingSubject, setEditingSubject] = useState('');
  const [editingBody, setEditingBody] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  const campaignId = getActiveCampaignId();

  const refresh = useCallback(() => {
    if (!campaignId) return;
    const fetched = getPendingEmails(campaignId);
    setEmails(fetched);
  }, [campaignId]);

  useEffect(() => {
    refresh();
    // Poll for webhook responses (emails in 'generating' state)
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, [refresh]);

  const selectedEmail = emails.find(e => e.id === selectedId) || null;

  const selectEmail = (email: PendingEmail) => {
    setSelectedId(email.id);
    setEditingSubject(email.subject);
    setEditingBody(email.body);
    setIsEditing(false);
    setShowFeedback(false);
    setFeedbackText('');
    setViewMode('detail');
  };

  const handleSaveEdits = () => {
    if (!selectedEmail || !campaignId) return;
    updatePendingEmail(campaignId, selectedEmail.id, {
      subject: editingSubject,
      body: editingBody,
    });
    setIsEditing(false);
    refresh();
    toast.success('Email updated');
  };

  const handleSend = () => {
    if (!selectedEmail || !campaignId) return;
    updatePendingEmail(campaignId, selectedEmail.id, { status: 'sent' });
    refresh();
    toast.success('Email marked as sent!', {
      description: `To: ${selectedEmail.contactEmail}`,
      icon: <Send className="w-4 h-4" />,
    });
  };

  const handleSkip = () => {
    if (!selectedEmail || !campaignId) return;
    updatePendingEmail(campaignId, selectedEmail.id, { status: 'skipped' });
    refresh();
    toast.info('Email skipped');
  };

  const handleDelete = (emailId: string) => {
    if (!campaignId) return;
    deletePendingEmail(campaignId, emailId);
    if (selectedId === emailId) {
      setSelectedId(null);
      setViewMode('list');
    }
    refresh();
    toast.success('Email deleted');
  };

  const handleRegenerate = async () => {
    if (!selectedEmail || !campaignId || !feedbackText.trim()) {
      toast.warning('Please provide feedback for regeneration');
      return;
    }

    setIsRegenerating(true);
    try {
      updatePendingEmail(campaignId, selectedEmail.id, { status: 'generating' });
      refresh();

      const response = await regenerateEmail(selectedEmail, feedbackText.trim());

      updatePendingEmail(campaignId, selectedEmail.id, {
        subject: response.subject,
        body: response.body,
        status: 'pending',
      });

      setEditingSubject(response.subject);
      setEditingBody(response.body);
      setFeedbackText('');
      setShowFeedback(false);
      refresh();
      toast.success('Email regenerated!');
    } catch (err: any) {
      updatePendingEmail(campaignId, selectedEmail.id, {
        status: 'error',
        errorMessage: err.message,
      });
      refresh();
      toast.error('Regeneration failed', { description: err.message });
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleRetry = async (email: PendingEmail) => {
    if (!campaignId) return;

    updatePendingEmail(campaignId, email.id, { status: 'generating', errorMessage: undefined });
    refresh();

    try {
      const campaigns = getCampaigns();
      const campaign = campaigns.find(c => c.id === campaignId);

      const response = await sendToWebhook({
        notes: email.callNotes || 'No notes taken during call.',
        recipientEmail: email.contactEmail || 'placeholder@example.com',
        recipientName: email.contactName || 'Valued Client',
        senderAccount: email.senderAccount,
        contactPhone: email.contactPhone || 'N/A',
        contactWebsite: email.contactWebsite || 'N/A',
        contactAddress: email.contactAddress || 'N/A',
        callOutcome: email.callOutcome || 'completed',
        callDate: email.callDate || new Date().toISOString(),
        campaignName: campaign?.name || 'Default Campaign',
      });

      updatePendingEmail(campaignId, email.id, {
        subject: response.subject,
        body: response.body,
        status: 'pending',
      });
      refresh();
      toast.success('Email generated successfully!');
    } catch (err: any) {
      updatePendingEmail(campaignId, email.id, {
        status: 'error',
        errorMessage: err.message,
      });
      refresh();
      toast.error('Retry failed', { description: err.message });
    }
  };

  const pendingCount = emails.filter(e => e.status === 'pending' || e.status === 'generating').length;
  const sentCount = emails.filter(e => e.status === 'sent').length;
  const errorCount = emails.filter(e => e.status === 'error').length;

  const getStatusIcon = (status: PendingEmail['status']) => {
    switch (status) {
      case 'generating': return <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />;
      case 'pending': return <Clock className="w-3.5 h-3.5 text-warning" />;
      case 'sent': return <CheckCircle2 className="w-3.5 h-3.5 text-success" />;
      case 'skipped': return <XCircle className="w-3.5 h-3.5 text-muted-foreground" />;
      case 'error': return <AlertTriangle className="w-3.5 h-3.5 text-destructive" />;
    }
  };

  const getStatusBadge = (status: PendingEmail['status']) => {
    const styles: Record<string, string> = {
      generating: 'bg-primary/10 text-primary border-primary/20',
      pending: 'bg-warning/10 text-warning border-warning/20',
      sent: 'bg-success/10 text-success border-success/20',
      skipped: 'bg-muted text-muted-foreground border-border',
      error: 'bg-destructive/10 text-destructive border-destructive/20',
    };
    const labels: Record<string, string> = {
      generating: 'Generating...',
      pending: 'Pending Review',
      sent: 'Sent',
      skipped: 'Skipped',
      error: 'Error',
    };
    return (
      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium border flex items-center gap-1 ${styles[status]}`}>
        {getStatusIcon(status)}
        {labels[status]}
      </span>
    );
  };

  // Empty state
  if (emails.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-50px)] gap-4 text-center px-6">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Mail className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-xl font-bold">No emails queued</h2>
        <p className="text-muted-foreground text-sm max-w-sm">
          After a call, select "Queue Follow-up Email" in the post-call modal to generate AI-composed emails for review.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-50px)]">
      {/* Left Panel — Email List */}
      <div className={`${viewMode === 'detail' ? 'hidden md:flex' : 'flex'} w-full md:w-[380px] flex-col border-r border-border bg-card/20`}>
        {/* Stats bar */}
        <div className="px-4 py-3 border-b border-border/50 bg-card/50">
          <h1 className="text-lg font-bold flex items-center gap-2 mb-2">
            <Mail className="w-5 h-5 text-primary" />
            Email Review
          </h1>
          <div className="flex gap-3 text-xs">
            {pendingCount > 0 && (
              <span className="flex items-center gap-1 text-warning">
                <Clock className="w-3 h-3" /> {pendingCount} pending
              </span>
            )}
            {sentCount > 0 && (
              <span className="flex items-center gap-1 text-success">
                <CheckCircle2 className="w-3 h-3" /> {sentCount} sent
              </span>
            )}
            {errorCount > 0 && (
              <span className="flex items-center gap-1 text-destructive">
                <AlertTriangle className="w-3 h-3" /> {errorCount} failed
              </span>
            )}
          </div>
        </div>

        {/* Email list */}
        <div className="flex-1 overflow-y-auto">
          {emails.map(email => (
            <div
              key={email.id}
              onClick={() => selectEmail(email)}
              className={`px-4 py-3 border-b border-border/30 cursor-pointer transition-all duration-200 hover:bg-accent/50 ${
                selectedId === email.id ? 'bg-primary/5 border-l-2 border-l-primary' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <span className="font-medium text-sm truncate flex-1">{email.contactName}</span>
                {getStatusBadge(email.status)}
              </div>
              <p className="text-xs text-muted-foreground truncate mb-1">
                {email.subject || 'Generating email...'}
              </p>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-0.5">
                  <User className="w-2.5 h-2.5" />
                  {email.senderAccount === 'john' ? 'John' : 'Silva'}
                </span>
                <span>→</span>
                <span className="truncate">{email.contactEmail || 'No email'}</span>
                <span className="ml-auto">{new Date(email.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>

              {/* Error retry */}
              {email.status === 'error' && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 text-xs h-7 w-full gap-1 border-destructive/30 text-destructive hover:bg-destructive/10"
                  onClick={(e) => { e.stopPropagation(); handleRetry(email); }}
                >
                  <RotateCcw className="w-3 h-3" /> Retry
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Right Panel — Email Detail */}
      <div className={`${viewMode === 'list' && !selectedEmail ? 'hidden md:flex' : 'flex'} flex-1 flex-col min-w-0`}>
        {selectedEmail ? (
          <>
            {/* Detail header */}
            <div className="px-6 py-3 border-b border-border/50 bg-card/30 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <Button
                  variant="ghost"
                  size="sm"
                  className="md:hidden h-8 w-8 p-0"
                  onClick={() => setViewMode('list')}
                >
                  <ChevronRight className="w-4 h-4 rotate-180" />
                </Button>
                <div className="min-w-0">
                  <h2 className="font-semibold text-sm truncate">Email to {selectedEmail.contactName}</h2>
                  <p className="text-xs text-muted-foreground truncate">
                    From: {selectedEmail.senderAccount === 'john' ? 'John' : 'Silva'} → {selectedEmail.contactEmail || 'No recipient'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {getStatusBadge(selectedEmail.status)}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                  onClick={() => handleDelete(selectedEmail.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Email content */}
            <div className="flex-1 overflow-y-auto p-6">
              {selectedEmail.status === 'generating' ? (
                <div className="flex flex-col items-center justify-center h-full gap-4">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 text-primary animate-spin" />
                  </div>
                  <p className="text-sm text-muted-foreground">AI is composing your email...</p>
                  <p className="text-xs text-muted-foreground/60">This usually takes 10-30 seconds</p>
                </div>
              ) : selectedEmail.status === 'error' ? (
                <div className="flex flex-col items-center justify-center h-full gap-4">
                  <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
                    <AlertTriangle className="w-6 h-6 text-destructive" />
                  </div>
                  <p className="text-sm font-medium text-destructive">Failed to generate email</p>
                  <p className="text-xs text-muted-foreground">{selectedEmail.errorMessage}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    onClick={() => handleRetry(selectedEmail)}
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Retry Generation
                  </Button>
                </div>
              ) : (
                <div className="max-w-2xl mx-auto space-y-6">
                  {/* Call context card */}
                  <div className="glass-card p-4 space-y-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Call Context</h4>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">Contact:</span>{' '}
                        <span className="font-medium">{selectedEmail.contactName}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Outcome:</span>{' '}
                        <span className="font-medium capitalize">{selectedEmail.callOutcome.replace(/_/g, ' ')}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Phone:</span>{' '}
                        <span className="font-mono">{selectedEmail.contactPhone}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Date:</span>{' '}
                        <span>{new Date(selectedEmail.callDate).toLocaleDateString()}</span>
                      </div>
                    </div>
                    {selectedEmail.callNotes && (
                      <div className="pt-2 border-t border-border/50">
                        <span className="text-xs text-muted-foreground">Notes:</span>
                        <p className="text-xs mt-1 whitespace-pre-wrap">{selectedEmail.callNotes}</p>
                      </div>
                    )}
                  </div>

                  {/* Subject */}
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">
                      Subject Line
                    </label>
                    {isEditing ? (
                      <Input
                        value={editingSubject}
                        onChange={e => setEditingSubject(e.target.value)}
                        className="bg-input border-border text-sm font-medium"
                      />
                    ) : (
                      <div className="glass-card p-3 text-sm font-medium">{selectedEmail.subject}</div>
                    )}
                  </div>

                  {/* Body */}
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">
                      Email Body
                    </label>
                    {isEditing ? (
                      <Textarea
                        value={editingBody}
                        onChange={e => setEditingBody(e.target.value)}
                        className="bg-input border-border text-sm min-h-[300px] leading-relaxed"
                      />
                    ) : (
                      <div className="glass-card p-4 text-sm whitespace-pre-wrap leading-relaxed">
                        {selectedEmail.body}
                      </div>
                    )}
                  </div>

                  {/* AI Regeneration Section */}
                  {showFeedback && (
                    <div className="glass-card p-4 space-y-3 border-primary/20 animate-fade-in">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-primary" />
                        <h4 className="text-sm font-semibold">Regenerate with Feedback</h4>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Tell the AI how you'd like the email changed. It will rewrite it with your feedback.
                      </p>
                      <Textarea
                        value={feedbackText}
                        onChange={e => setFeedbackText(e.target.value)}
                        placeholder="e.g. Make it shorter and more casual, mention the pricing we discussed..."
                        className="bg-input border-border text-sm min-h-[80px]"
                      />
                      <div className="flex gap-2">
                        <Button
                          onClick={handleRegenerate}
                          disabled={isRegenerating || !feedbackText.trim()}
                          className="gap-1.5 text-xs"
                          size="sm"
                        >
                          {isRegenerating ? (
                            <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Regenerating...</>
                          ) : (
                            <><Sparkles className="w-3.5 h-3.5" /> Regenerate</>
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs"
                          onClick={() => { setShowFeedback(false); setFeedbackText(''); }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Action bar */}
            {selectedEmail.status === 'pending' && (
              <div className="px-6 py-3 border-t border-border bg-card/50 flex items-center gap-2 shrink-0">
                {isEditing ? (
                  <>
                    <Button onClick={handleSaveEdits} size="sm" className="gap-1.5 text-xs">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Save Changes
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs"
                      onClick={() => {
                        setEditingSubject(selectedEmail.subject);
                        setEditingBody(selectedEmail.body);
                        setIsEditing(false);
                      }}
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <Button onClick={handleSend} className="gap-1.5 text-xs flex-1 md:flex-none" size="sm">
                      <Send className="w-3.5 h-3.5" /> Send Email
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs"
                      onClick={() => setIsEditing(true)}
                    >
                      <PenLine className="w-3.5 h-3.5" /> Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs"
                      onClick={() => setShowFeedback(!showFeedback)}
                    >
                      <Sparkles className="w-3.5 h-3.5" /> Regenerate
                    </Button>
                    <div className="flex-1" />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 text-xs text-muted-foreground"
                      onClick={handleSkip}
                    >
                      <X className="w-3.5 h-3.5" /> Skip
                    </Button>
                  </>
                )}
              </div>
            )}

            {/* Sent/skipped status bar */}
            {(selectedEmail.status === 'sent' || selectedEmail.status === 'skipped') && (
              <div className={`px-6 py-3 border-t flex items-center gap-2 shrink-0 ${
                selectedEmail.status === 'sent' ? 'bg-success/5 border-success/20' : 'bg-muted/30 border-border'
              }`}>
                {selectedEmail.status === 'sent' ? (
                  <span className="text-xs text-success flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" /> This email has been sent
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <XCircle className="w-4 h-4" /> This email was skipped
                  </span>
                )}
                <div className="flex-1" />
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground gap-1"
                  onClick={() => {
                    updatePendingEmail(campaignId, selectedEmail.id, { status: 'pending' });
                    refresh();
                  }}
                >
                  <RotateCcw className="w-3 h-3" /> Revert to Pending
                </Button>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
            <Eye className="w-10 h-10 opacity-30" />
            <p className="text-sm">Select an email to review</p>
          </div>
        )}
      </div>
    </div>
  );
}
