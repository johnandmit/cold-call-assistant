import { useState, useEffect } from 'react';
import { Campaign } from '@/types';
import {
  getCampaigns, createCampaign, renameCampaign, deleteCampaign,
  getActiveCampaignId, setActiveCampaignId, ensureCampaigns,
  getCampaignLeadCount, updateCampaignColor, CAMPAIGN_COLORS,
} from '@/lib/storage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FolderKanban, Plus, Trash2, Pencil, Check, X, Users, Calendar, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [activeId, setActiveId] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(CAMPAIGN_COLORS[0]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  useEffect(() => {
    const id = ensureCampaigns();
    setActiveId(id);
    setCampaigns(getCampaigns());
  }, []);

  const refresh = () => {
    setCampaigns(getCampaigns());
    setActiveId(getActiveCampaignId());
  };

  const handleCreate = () => {
    if (!newName.trim()) {
      toast.error('Campaign name is required');
      return;
    }
    const campaign = createCampaign(newName.trim(), newColor);
    setActiveCampaignId(campaign.id);
    setCreating(false);
    setNewName('');
    setNewColor(CAMPAIGN_COLORS[(campaigns.length + 1) % CAMPAIGN_COLORS.length]);
    refresh();
    toast.success(`Created "${campaign.name}"`);
  };

  const handleSwitch = (id: string) => {
    setActiveCampaignId(id);
    setActiveId(id);
    const campaign = campaigns.find(c => c.id === id);
    toast.success(`Switched to "${campaign?.name}"`);
  };

  const handleRename = (id: string) => {
    if (!editName.trim()) return;
    renameCampaign(id, editName.trim());
    setEditingId(null);
    refresh();
    toast.success('Campaign renamed');
  };

  const handleDelete = (id: string) => {
    const campaign = campaigns.find(c => c.id === id);
    if (!campaign) return;
    const count = getCampaignLeadCount(id);
    const msg = count > 0
      ? `Delete "${campaign.name}" and its ${count} leads? This cannot be undone.`
      : `Delete "${campaign.name}"? This cannot be undone.`;
    if (!window.confirm(msg)) return;

    deleteCampaign(id);

    // If we deleted the active campaign, switch to another
    if (id === activeId) {
      const remaining = getCampaigns();
      if (remaining.length > 0) {
        setActiveCampaignId(remaining[0].id);
      } else {
        // Create a new default
        const def = createCampaign('Default');
        setActiveCampaignId(def.id);
      }
    }
    refresh();
    toast.success(`Deleted "${campaign.name}"`);
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
            <FolderKanban className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Campaigns</h1>
            <p className="text-sm text-muted-foreground">Each campaign is an isolated workspace with its own leads, calls, and stats.</p>
          </div>
        </div>
        <Button onClick={() => setCreating(true)} className="gap-1.5" disabled={creating}>
          <Plus className="w-4 h-4" />
          New Campaign
        </Button>
      </div>

      {/* Create Campaign */}
      {creating && (
        <div className="glass-card p-5 mb-6 animate-fade-in">
          <h3 className="text-sm font-semibold mb-3">Create Campaign</h3>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Name</label>
              <Input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="e.g. Plumbers Auckland"
                className="bg-input border-border"
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Color</label>
              <div className="flex gap-1.5">
                {CAMPAIGN_COLORS.map(color => (
                  <button
                    key={color}
                    onClick={() => setNewColor(color)}
                    className={`w-7 h-7 rounded-lg transition-all ${newColor === color ? 'ring-2 ring-primary ring-offset-2 ring-offset-background scale-110' : 'hover:scale-105'}`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <Button onClick={handleCreate} size="sm" className="gap-1">
              <Check className="w-3.5 h-3.5" />
              Create
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setCreating(false); setNewName(''); }}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Campaign List */}
      <div className="space-y-2">
        {campaigns.map(campaign => {
          const isActive = campaign.id === activeId;
          const isEditing = editingId === campaign.id;
          const leadCount = getCampaignLeadCount(campaign.id);

          return (
            <div
              key={campaign.id}
              className={`glass-card p-4 transition-all cursor-pointer ${
                isActive ? 'border-primary/40 bg-primary/5' : 'hover:border-primary/20'
              }`}
              onClick={() => !isEditing && handleSwitch(campaign.id)}
            >
              <div className="flex items-center gap-4">
                {/* Color dot */}
                <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: campaign.color }} />

                <div className="flex-1 min-w-0">
                  {isEditing ? (
                    <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                      <Input
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        className="h-8 text-sm bg-input border-border"
                        autoFocus
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleRename(campaign.id);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                      />
                      <button onClick={() => handleRename(campaign.id)} className="text-success p-1">
                        <Check className="w-4 h-4" />
                      </button>
                      <button onClick={() => setEditingId(null)} className="text-muted-foreground p-1">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{campaign.name}</span>
                        {isActive && (
                          <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-medium flex items-center gap-0.5">
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            Active
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {leadCount} lead{leadCount !== 1 ? 's' : ''}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(campaign.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                  {/* Color picker */}
                  <div className="relative group">
                    <button
                      className="w-6 h-6 rounded-md border border-border hover:border-primary/30 transition-colors"
                      style={{ backgroundColor: campaign.color }}
                      title="Change color"
                    />
                    <div className="absolute right-0 top-full mt-1 p-2 bg-card border border-border rounded-lg shadow-lg hidden group-hover:flex gap-1 z-10">
                      {CAMPAIGN_COLORS.map(color => (
                        <button
                          key={color}
                          onClick={() => { updateCampaignColor(campaign.id, color); refresh(); }}
                          className={`w-6 h-6 rounded-md transition-all hover:scale-110 ${campaign.color === color ? 'ring-2 ring-primary' : ''}`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={() => { setEditingId(campaign.id); setEditName(campaign.name); }}
                    className="p-1.5 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                    title="Rename"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  {campaigns.length > 1 && (
                    <button
                      onClick={() => handleDelete(campaign.id)}
                      className="p-1.5 rounded hover:bg-destructive/20 transition-colors text-muted-foreground hover:text-destructive"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {campaigns.length === 0 && (
        <div className="text-center py-12">
          <FolderKanban className="w-12 h-12 mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-muted-foreground">No campaigns yet — create one to get started</p>
        </div>
      )}
    </div>
  );
}
