import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { fetchUserProfile, updateUserProfile } from '@/lib/supabase-sync';
import { getCampaigns } from '@/lib/storage';
import { Profile } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  User, Mail, Shield, Clock, Copy, LogOut, Check, Save, 
  MapPin, Globe, Fingerprint, Calendar, Loader2, Sparkles,
  Zap, FolderKanban
} from 'lucide-react';
import { toast } from 'sonner';

export default function Account() {
  const { user, signOut } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState('');
  
  const campaigns = getCampaigns();
  const ownedCampaigns = campaigns.filter(c => c.role === 'owner');

  useEffect(() => {
    if (user) {
      loadProfile();
    }
  }, [user]);

  const loadProfile = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await fetchUserProfile(user.id);
      if (data) {
        setProfile(data);
        setDisplayName(data.display_name || '');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const res = await updateUserProfile(user.id, { display_name: displayName });
      if (res.success) {
        toast.success(res.message);
        loadProfile();
      } else {
        toast.error(res.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const copyId = () => {
    if (!user) return;
    navigator.clipboard.writeText(user.id);
    toast.success('User ID copied to clipboard');
  };

  if (loading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary/40" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4">
      {/* Header / Hero */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary/10 via-background to-accent/5 border border-border/50 p-8">
        <div className="absolute top-0 right-0 p-8 opacity-5">
           <User className="w-64 h-64" />
        </div>
        
        <div className="relative flex flex-col md:flex-row items-center gap-8">
          <div className="relative group">
            <div className="w-32 h-32 rounded-2xl bg-primary/20 flex items-center justify-center border-2 border-primary/20 group-hover:border-primary/40 transition-colors">
              <User className="w-16 h-16 text-primary" />
            </div>
            <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-lg bg-background border border-border flex items-center justify-center shadow-lg">
              <Sparkles className="w-4 h-4 text-amber-500" />
            </div>
          </div>
          
          <div className="flex-1 text-center md:text-left">
            <h1 className="text-3xl font-black mb-2">{profile?.display_name || 'Anonymous User'}</h1>
            <div className="flex flex-wrap justify-center md:justify-start gap-4">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Mail className="w-4 h-4" />
                {user?.email}
              </div>
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Calendar className="w-4 h-4" />
                Joined {user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'Lately'}
              </div>
            </div>
          </div>
          
          <Button variant="destructive" onClick={() => signOut()} className="gap-2 backdrop-blur-md">
            <LogOut className="w-4 h-4" /> Sign Out
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
        {/* Left Col: Profile Form */}
        <div className="md:col-span-7 space-y-6">
          <section className="glass-card p-6">
            <h2 className="text-lg font-bold mb-6 flex items-center gap-2">
              <Fingerprint className="w-5 h-5 text-primary" />
              General Information
            </h2>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Display Name</label>
                <div className="flex gap-2">
                  <Input 
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    placeholder="Enter your name..."
                    className="h-11 bg-background/50"
                  />
                  <Button onClick={handleUpdate} disabled={saving || displayName === profile?.display_name} className="h-11 px-6 gap-2">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Email Address</label>
                <Input 
                  value={user?.email || ''} 
                  disabled 
                  className="h-11 bg-muted/30 border-dashed opacity-70"
                />
                <p className="text-[10px] text-muted-foreground italic ml-1">Email changes are currently disabled for your account.</p>
              </div>

              <div className="space-y-2 pt-4">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Unique Identifier</label>
                <div className="flex items-center gap-2 p-3 rounded-xl bg-muted/30 border border-border/50">
                  <code className="text-xs font-mono text-muted-foreground flex-1 break-all">{user?.id}</code>
                  <button onClick={copyId} className="p-2 hover:bg-background rounded-lg transition-colors text-muted-foreground hover:text-primary">
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Right Col: Stats & Status */}
        <div className="md:col-span-5 space-y-6">
          <section className="glass-card p-6 border-primary/20 bg-primary/5">
            <h2 className="text-lg font-bold mb-6 flex items-center gap-2">
              <Zap className="w-5 h-5 text-primary" />
              Usage Overview
            </h2>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-background/50 p-4 rounded-2xl border border-border/50">
                <span className="text-[10px] font-bold text-muted-foreground block mb-1">CAMPAIGNS</span>
                <span className="text-2xl font-black">{campaigns.length}</span>
              </div>
              <div className="bg-background/50 p-4 rounded-2xl border border-border/50">
                <span className="text-[10px] font-bold text-muted-foreground block mb-1">OWNED</span>
                <span className="text-2xl font-black">{ownedCampaigns.length}</span>
              </div>
            </div>

            <div className="mt-6 p-4 rounded-2xl bg-primary/10 border border-primary/20">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold">Cloud Sync Status</span>
                <span className="text-[10px] bg-green-500 text-white px-2 py-0.5 rounded-full font-bold">ACTIVE</span>
              </div>
              <p className="text-[11px] text-muted-foreground">Your data is being backed up to Supabase in real-time. Last sync happened just now.</p>
            </div>
          </section>

          <section className="glass-card p-6">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5 text-primary" />
              Activity Status
            </h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Account Tier</span>
                <span className="font-bold flex items-center gap-1.5 text-amber-600">
                  <Shield className="w-3.5 h-3.5" /> Team Lead
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Last Session</span>
                <span className="font-medium">
                  {profile?.last_active ? new Date(profile.last_active).toLocaleDateString() : 'Today'}
                </span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
