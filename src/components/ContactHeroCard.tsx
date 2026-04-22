import { Contact } from '@/types';
import { Star, MapPin, Globe, Phone, ExternalLink, Copy, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { updateContact } from '@/lib/storage';
import { useState, useEffect } from 'react';

interface Props {
  contact: Contact;
  onStartCall: () => void;
}

export default function ContactHeroCard({ contact, onStartCall }: Props) {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) setCurrentUserId(session.user.id);
    });
  }, []);

  if (!contact) {
    return (
      <div className="glass-card p-8 flex flex-col items-center justify-center text-center gap-3 animate-fade-in">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
          <User className="w-6 h-6 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <h3 className="font-semibold text-foreground">No leads available</h3>
          <p className="text-sm text-muted-foreground max-w-[240px]">
            Try clearing your filters or importing a new CSV to get started.
          </p>
        </div>
      </div>
    );
  }

  const isOwnedByOther = contact.assigned_user_id && contact.assigned_user_id !== currentUserId;
  const isOwnedByMe = contact.assigned_user_id && contact.assigned_user_id === currentUserId;

  const handleRelease = () => {
    if (!window.confirm('Release this lead? This will allow other team members to call it.')) return;
    updateContact(contact.id, {
      assigned_user_id: undefined,
      assigned_user_email: undefined,
      assigned_user_name: undefined
    });
    toast.success('Lead released to team');
  };

  const tierClass = contact.outreach_tier === 1 ? 'badge-tier1' : contact.outreach_tier === 2 ? 'badge-tier2' : 'badge-tier3';
  const tierLabel = `Tier ${contact.outreach_tier}${contact.outreach_tier === 1 ? ' 🔥' : ''}`;
  const urgencyColor = contact.average_urgency === 'High' ? 'text-destructive' : contact.average_urgency === 'Medium' ? 'text-warning' : 'text-muted-foreground';
  const hasWebsite = !!contact.website;

  const copyPhone = () => {
    navigator.clipboard.writeText(contact.phone);
    toast.success('Phone number copied');
  };

  return (
    <div className="glass-card p-6 animate-fade-in">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">{contact.name}</h2>
          <button onClick={copyPhone} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors mt-1 group">
            <Phone className="w-4 h-4" />
            <span className="font-mono text-sm">{contact.phone}</span>
            <Copy className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className={tierClass}>{tierLabel}</span>
          {hasWebsite ? (
            <span className="text-xs bg-success/20 text-success border border-success/30 px-2 py-0.5 rounded-md font-medium">✓ Has Website</span>
          ) : (
            <span className="text-xs bg-destructive/20 text-destructive border border-destructive/30 px-2 py-0.5 rounded-md font-medium">✗ No Website</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {contact.rating > 0 && (
          <div className="glass-card p-3">
            <div className="text-xs text-muted-foreground mb-1">Rating</div>
            <div className="flex items-center gap-1">
              <Star className="w-4 h-4 text-warning fill-warning" />
              <span className="font-semibold">{contact.rating}</span>
              {contact.review_count > 0 && <span className="text-xs text-muted-foreground">({contact.review_count})</span>}
            </div>
          </div>
        )}
        {contact.conversion_confidence_score > 0 && (
          <div className="glass-card p-3">
            <div className="text-xs text-muted-foreground mb-1">Conversion</div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${contact.conversion_confidence_score}%` }}
                />
              </div>
              <span className="text-sm font-semibold">{contact.conversion_confidence_score}%</span>
            </div>
          </div>
        )}
        {contact.average_urgency && (
          <div className="glass-card p-3">
            <div className="text-xs text-muted-foreground mb-1">Urgency</div>
            <span className={`font-semibold text-sm ${urgencyColor}`}>{contact.average_urgency}</span>
          </div>
        )}
        {contact.opening_hours && (
          <div className="glass-card p-3">
            <div className="text-xs text-muted-foreground mb-1">Hours</div>
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3 text-muted-foreground" />
              <span className="text-xs truncate">{contact.opening_hours}</span>
            </div>
          </div>
        )}
      </div>

      {contact.address && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <MapPin className="w-4 h-4 shrink-0" />
          <span>{contact.address}</span>
          {contact.google_maps_url && (
            <a href={contact.google_maps_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80 transition-colors">
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
        </div>
      )}

      {contact.notes && (
        <div className="border-t border-border/50 pt-3 mt-3">
          <p className="text-sm text-muted-foreground">{contact.notes}</p>
        </div>
      )}

      {isOwnedByOther && (
        <div className="bg-muted/50 border border-border/50 rounded-lg p-3 my-4 flex items-center gap-3">
          <Clock className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            Claimed by <span className="font-semibold text-foreground">{contact.assigned_user_name || contact.assigned_user_email}</span>
          </span>
        </div>
      )}

      {isOwnedByMe && (
        <Button 
          variant="outline" 
          onClick={handleRelease}
          className="w-full mt-4 border-primary/30 text-primary hover:bg-primary/5 h-12 text-base rounded-lg"
        >
          Release Lead to Team
        </Button>
      )}

      <Button 
        onClick={onStartCall} 
        disabled={isOwnedByOther}
        className={`w-full mt-2 font-semibold h-12 text-base rounded-lg ${
          isOwnedByOther 
            ? 'bg-muted text-muted-foreground cursor-not-allowed' 
            : 'bg-success hover:bg-success/90 text-success-foreground'
        }`}
      >
        {isOwnedByOther ? 'Lead Owned by Teammate' : 'Start Call'}
      </Button>
    </div>
  );
}
