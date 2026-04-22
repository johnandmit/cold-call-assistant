import { useState, useEffect } from 'react';
import Papa from 'papaparse';
import { Campaign, Contact, CampaignMember } from '@/types';
import { 
  getCampaigns, createCampaign, renameCampaign, deleteCampaign,
  getActiveCampaignId, setActiveCampaignId, ensureCampaigns,
  getCampaignLeadCount, updateCampaignColor, CAMPAIGN_COLORS, getContacts,
  getFolders, createFolder, renameFolder, deleteFolder, moveCampaignToFolder
} from '@/lib/storage';
import { fetchCampaignMembers, joinCampaign, transferOwnership, leaveCampaign } from '@/lib/supabase-sync';
import { Folder as FolderType } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  FolderKanban, Plus, Trash2, Check, X, Users,
  Download, Share, UserPlus, Shield, ExternalLink, 
  Copy, Crown, Activity, LogOut
} from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { toast } from 'sonner';
import MemberStatsModal from '@/components/MemberStatsModal';
import { BarChart2 } from 'lucide-react';

export default function Campaigns() {
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [activeId, setActiveId] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(CAMPAIGN_COLORS[0]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [showExporter, setShowExporter] = useState(false);
  const [exportSelection, setExportSelection] = useState<Set<string>>(new Set());
  
  // Dashboard / Management State
  const [members, setMembers] = useState<CampaignMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [showOwnershipConfirm, setShowOwnershipConfirm] = useState<string | null>(null);
  const [selectedMemberForStats, setSelectedMemberForStats] = useState<CampaignMember | null>(null);
  
  // Folders State
  const [folders, setFolders] = useState<FolderType[]>([]);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [movingId, setMovingId] = useState<string | null>(null);
  const [draggedCampaignId, setDraggedCampaignId] = useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null); // 'unorganized' or folder.id

  useEffect(() => {
    refresh();
    window.addEventListener('campaign-changed', refresh);
    window.addEventListener('storage', refresh); // Handle broad sync pulls from App.tsx
    return () => {
      window.removeEventListener('campaign-changed', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const selectedCampaign = campaigns.find(c => c.id === activeId);

  useEffect(() => {
    if (activeId) {
      loadMembers(activeId);
    }
  }, [activeId]);

  const loadMembers = async (id: string) => {
    setLoadingMembers(true);
    try {
      const data = await fetchCampaignMembers(id);
      setMembers(data);
    } finally {
      setLoadingMembers(false);
    }
  };

  const refresh = () => {
    const freshCampaigns = getCampaigns();
    setCampaigns(freshCampaigns);
    setFolders(getFolders());
    const currId = getActiveCampaignId();
    setActiveId(currId);
    
    // Refresh member list if we have an active campaign
    if (currId) {
      loadMembers(currId);
    }
    
    // Auto-select all campaigns in exporter by default if empty
    if (exportSelection.size === 0) {
      setExportSelection(new Set(freshCampaigns.map(c => c.id)));
    }
  };

  const handleJoinCampaign = async () => {
    if (!joinCode.trim()) return toast.error('Please enter a Campaign ID');
    setIsJoining(true);
    try {
      const res = await joinCampaign(joinCode);
      if (res.success) {
        toast.success(res.message);
        setJoinCode('');
        refresh();
      } else {
        toast.error(res.message);
      }
    } finally {
      setIsJoining(false);
    }
  };

  const handleTransferOwnership = async (newOwnerId: string) => {
    if (!activeId) return;
    const res = await transferOwnership(activeId, newOwnerId);
    if (res.success) {
      toast.success(res.message);
      setShowOwnershipConfirm(null);
      refresh();
      loadMembers(activeId);
    } else {
      toast.error(res.message);
    }
  };

  const handleLeaveOrRemove = async (campaignId: string, memberId: string, isSelf: boolean) => {
    const campaign = campaigns.find(c => c.id === campaignId);
    if (!campaign) return;

    const action = isSelf ? 'leave' : 'remove';
    const msg = isSelf 
      ? `Are you sure you want to leave "${campaign.name}"?`
      : `Are you sure you want to remove this member from "${campaign.name}"?`;

    if (!window.confirm(msg)) return;

    const res = await leaveCampaign(campaignId, memberId);
    if (res.success) {
      toast.success(res.message);
      if (isSelf && campaignId === activeId) {
        // Switch to a different campaign if we left the current one
        const others = getCampaigns().filter(c => c.id !== campaignId);
        if (others.length > 0) setActiveCampaignId(others[0].id);
      }
      refresh();
      if (activeId === campaignId) loadMembers(campaignId);
    } else {
      toast.error(res.message);
    }
  };

  const handleCreateFolder = () => {
    if (!newFolderName.trim()) return;
    createFolder(newFolderName.trim());
    setNewFolderName('');
    setCreatingFolder(false);
    refresh();
    toast.success('Folder created');
  };

  const handleSwitch = (id: string) => {
    setActiveCampaignId(id);
    setActiveId(id);
    const campaign = campaigns.find(c => c.id === id);
    toast.success(`Switched to "${campaign?.name}"`);
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

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedCampaignId(id);
    e.dataTransfer.setData('campaignId', id);
    e.dataTransfer.effectAllowed = 'move';
    
    // Create a ghost image or just let default happen
    const target = e.currentTarget as HTMLElement;
    target.style.opacity = '0.4';
  };

  const handleDragEnd = (e: React.DragEvent) => {
    setDraggedCampaignId(null);
    setDragOverFolderId(null);
    const target = e.currentTarget as HTMLElement;
    target.style.opacity = '1';
  };

  const handleDrop = (e: React.DragEvent, folderId: string | null) => {
    e.preventDefault();
    setDragOverFolderId(null);
    const campaignId = e.dataTransfer.getData('campaignId') || draggedCampaignId;
    
    if (campaignId) {
      moveCampaignToFolder(campaignId, folderId);
      refresh();
      toast.success('Campaign moved');
    }
  };

  const renderCampaignCard = (campaign: Campaign) => {
    const isActive = campaign.id === activeId;
    const isShared = campaign.role === 'member';
    const leadCount = getCampaignLeadCount(campaign.id);

    return (
      <div
        key={campaign.id}
        draggable
        onDragStart={(e) => handleDragStart(e, campaign.id)}
        onDragEnd={handleDragEnd}
        className={`group relative p-3 rounded-xl border transition-all cursor-pointer ${
          isActive 
            ? 'bg-primary/5 border-primary shadow-sm' 
            : 'bg-glass border-white/5 hover:border-white/10 hover:bg-white/5'
        } ${draggedCampaignId === campaign.id ? 'opacity-40 grayscale-[0.5]' : ''}`}
        onClick={() => handleSwitch(campaign.id)}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div 
              className="w-1.5 h-8 rounded-full flex-shrink-0" 
              style={{ backgroundColor: campaign.color }} 
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className={`font-bold text-sm truncate ${isActive ? 'text-primary' : ''}`}>
                  {campaign.name}
                </span>
                {campaign.role === 'owner' ? (
                  <Crown className="w-3 h-3 text-amber-500 flex-shrink-0" />
                ) : (
                  <Shield className="w-3 h-3 text-blue-500 opacity-60 flex-shrink-0" />
                )}
              </div>
              <p className="text-[10px] text-muted-foreground truncate font-medium">
                {leadCount} leads • {isShared ? (campaign.ownerEmail || 'Shared') : 'Local'}
              </p>
            </div>
          </div>
          
          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-all">
             {folders.length > 0 && (
               <div className="relative" onClick={e => e.stopPropagation()}>
                 <Popover>
                   <PopoverTrigger asChild>
                     <Button variant="ghost" size="sm" className="h-7 w-7 p-0 hover:bg-primary/10">
                       <FolderKanban className="w-3 h-3" />
                     </Button>
                   </PopoverTrigger>
                   <PopoverContent className="w-auto p-1" align="end">
                     <div className="bg-popover rounded-lg p-1 min-w-[140px] z-[100]">
                       <p className="px-2 py-1 text-[9px] font-black uppercase text-muted-foreground/50 border-b border-border/50 mb-1">Move to Folder</p>
                       <button 
                         onClick={() => { moveCampaignToFolder(campaign.id, null); refresh(); }}
                         className="w-full text-left px-2 py-1.5 text-[10px] hover:bg-primary/10 hover:text-primary rounded font-bold transition-colors"
                       >
                         UNGROUPED
                       </button>
                       {folders.map(f => (
                         <button 
                           key={f.id}
                           onClick={() => { moveCampaignToFolder(campaign.id, f.id); refresh(); }}
                           className="w-full text-left px-2 py-1.5 text-[10px] hover:bg-primary/10 hover:text-primary rounded font-bold transition-colors"
                         >
                           {f.name.toUpperCase()}
                         </button>
                       ))}
                     </div>
                   </PopoverContent>
                 </Popover>
               </div>
             )}
             <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e) => { e.stopPropagation(); setShowExporter(true); }}>
               <Download className="w-3 h-3" />
             </Button>
             {!isShared && (
               <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive/60 hover:text-destructive hover:bg-destructive/5" onClick={(e) => { e.stopPropagation(); handleDelete(campaign.id); }}>
                 <Trash2 className="w-3 h-3" />
               </Button>
             )}
          </div>
        </div>
      </div>
    );
  };
  
  const handleExport = (campaignId?: string | Set<string>) => {
    let exportData: any[] = [];
    const allCampaigns = getCampaigns();
    
    let campaignsToExport: Campaign[] = [];

    if (typeof campaignId === 'string') {
      const c = allCampaigns.find(c => c.id === campaignId);
      if (c) campaignsToExport.push(c);
    } else if (campaignId instanceof Set) {
      campaignsToExport = allCampaigns.filter(c => campaignId.has(c.id));
    } else {
      campaignsToExport = allCampaigns; // Export All default
    }

    if (campaignsToExport.length === 0) {
      toast.error('No campaigns selected for export');
      return;
    }

    campaignsToExport.forEach(campaign => {
      const contacts = getContacts(campaign.id);
      exportData.push(...contacts.map(c => ({
        campaign: campaign.name,
        ...formatContactForExport(c)
      })));
    });

    if (exportData.length === 0) {
      toast.error('No leads to export');
      return;
    }

    const csv = Papa.unparse(exportData);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    let fileName = '';
    if (typeof campaignId === 'string' && campaignsToExport.length === 1) {
      fileName = `campaign-${campaignsToExport[0].name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`;
    } else if (campaignsToExport.length === allCampaigns.length) {
      fileName = 'all-campaigns';
    } else {
      // Multiple campaigns, e.g. "Barbershops-Tradies"
      const names = campaignsToExport.slice(0, 3).map(c => c.name.replace(/[^a-z0-9]/gi, '').toLowerCase());
      fileName = `campaigns-${names.join('-')}${campaignsToExport.length > 3 ? '-etc' : ''}`;
    }
    
    a.download = `${fileName}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exported');
    setShowExporter(false);
  };


  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Campaign List */}
        <div className="lg:col-span-4 space-y-6">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-xl font-bold flex items-center gap-2">
              <FolderKanban className="w-5 h-5 text-primary" />
              Campaigns
            </h1>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => setCreatingFolder(true)} className="h-8 w-8 p-0" title="New Folder">
                <Plus className="w-4 h-4 text-muted-foreground" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setCreating(true)} className="h-8 w-8 p-0" disabled={creating} title="New Campaign">
                <ExternalLink className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Create Folder */}
          {creatingFolder && (
            <div className="glass-card p-4 transition-all animate-in fade-in slide-in-from-top-2 border-primary/20">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">New Folder</h3>
                <button onClick={() => setCreatingFolder(false)}><X className="w-3.5 h-3.5" /></button>
              </div>
              <div className="flex gap-2">
                <Input
                  value={newFolderName}
                  onChange={e => setNewFolderName(e.target.value)}
                  placeholder="e.g. Real Estate"
                  className="h-8 text-xs"
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
                />
                <Button onClick={handleCreateFolder} size="sm" className="h-8 px-3">Add</Button>
              </div>
            </div>
          )}

          {/* Create / Join Actions */}
          {creating ? (
            <div className="glass-card p-4 transition-all animate-in fade-in slide-in-from-top-2">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">New Campaign</h3>
                <button onClick={() => setCreating(false)}><X className="w-3.5 h-3.5" /></button>
              </div>
              <Input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="e.g. Real Estate NZ"
                className="h-9 text-sm mb-3"
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
              />
              <div className="flex gap-1.5 mb-4 justify-between">
                {CAMPAIGN_COLORS.map(color => (
                  <button
                    key={color}
                    onClick={() => setNewColor(color)}
                    className={`w-6 h-6 rounded-md transition-all ${newColor === color ? 'ring-2 ring-primary ring-offset-2 ring-offset-background scale-110' : 'hover:scale-105'}`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
              <Button onClick={handleCreate} size="sm" className="w-full gap-2">
                <Check className="w-3.5 h-3.5" /> Create
              </Button>
            </div>
          ) : (
            <div className="glass-card p-4">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5">
                <UserPlus className="w-3 h-3" />
                Join Shared Campaign
              </h3>
              <div className="flex gap-2">
                <Input 
                  placeholder="Paste Campaign ID..." 
                  value={joinCode}
                  onChange={e => setJoinCode(e.target.value)}
                  className="h-8 text-xs font-mono"
                />
                <Button size="sm" onClick={handleJoinCampaign} disabled={isJoining || !joinCode.trim()} className="h-8 px-3">
                  {isJoining ? '...' : 'Join'}
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
            {/* Folders */}
            {folders.map(folder => {
              const folderCampaigns = campaigns.filter(c => c.folderId === folder.id);
              const isOver = dragOverFolderId === folder.id;

              return (
                <div 
                  key={folder.id} 
                  className={`space-y-2 p-2 rounded-xl border-2 transition-all ${
                    isOver 
                      ? 'border-primary bg-primary/5 shadow-[0_0_15px_rgba(var(--primary-rgb),0.1)] ring-2 ring-primary/20' 
                      : (draggedCampaignId ? 'border-dashed border-white/10 bg-white/5' : 'border-transparent')
                  }`}
                  onDragOver={(e) => { e.preventDefault(); setDragOverFolderId(folder.id); }}
                  onDragLeave={() => setDragOverFolderId(null)}
                  onDrop={(e) => handleDrop(e, folder.id)}
                >
                  <div className="flex items-center justify-between px-1 group/folder">
                    <h3 className={`text-[10px] font-black uppercase tracking-[0.2em] transition-colors ${isOver ? 'text-primary' : 'text-muted-foreground/50'}`}>
                       {folder.name} ({folderCampaigns.length})
                    </h3>
                    <button 
                      onClick={() => { if(window.confirm('Delete folder?')) { deleteFolder(folder.id); refresh(); } }} 
                      className="opacity-0 group-hover/folder:opacity-100 text-[9px] font-bold text-destructive/40 hover:text-destructive transition-all"
                    >
                      REMOVE
                    </button>
                  </div>
                  <div className="space-y-2">
                    {folderCampaigns.map(c => renderCampaignCard(c))}
                    {folderCampaigns.length === 0 && !draggedCampaignId && <p className="text-[10px] italic text-muted-foreground/30 px-3">Empty folder</p>}
                    {draggedCampaignId && folderCampaigns.length === 0 && <div className="h-12 border border-dashed border-primary/20 rounded-lg flex items-center justify-center text-[10px] text-primary/40 font-bold uppercase tracking-widest">Drop Here</div>}
                  </div>
                </div>
              );
            })}

            {/* Unorganized */}
            <div 
              className={`space-y-2 p-2 rounded-xl border-2 transition-all ${
                dragOverFolderId === 'unorganized'
                  ? 'border-primary bg-primary/5' 
                  : (draggedCampaignId ? 'border-dashed border-white/10 bg-white/5' : 'border-transparent')
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragOverFolderId('unorganized'); }}
              onDragLeave={() => setDragOverFolderId(null)}
              onDrop={(e) => handleDrop(e, null)}
            >
              {(folders.length > 0) && (
                <div className="px-1">
                  <h3 className={`text-[10px] font-black uppercase tracking-[0.2em] transition-colors ${dragOverFolderId === 'unorganized' ? 'text-primary' : 'text-muted-foreground/50'}`}>
                    Unorganized
                  </h3>
                </div>
              )}
              <div className="space-y-2">
                {campaigns.filter(c => !c.folderId).map(c => renderCampaignCard(c))}
                {draggedCampaignId && campaigns.filter(c => !c.folderId).length === 0 && <div className="h-12 border border-dashed border-primary/20 rounded-lg flex items-center justify-center text-[10px] text-primary/40 font-bold uppercase tracking-widest">Drop Here</div>}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Campaign Dashboard */}
        <div className="lg:col-span-8">
          {selectedCampaign ? (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
              {/* Header */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 glass-card p-6 border-t-4" style={{ borderColor: selectedCampaign.color }}>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="text-2xl font-bold">{selectedCampaign.name}</h2>
                    {selectedCampaign.role === 'owner' ? (
                      <span className="text-[10px] bg-amber-500/20 text-amber-600 px-2 py-0.5 rounded-full font-bold flex items-center gap-1 border border-amber-500/20">
                        <Crown className="w-3 h-3" /> ADMIN
                      </span>
                    ) : (
                      <span className="text-[10px] bg-blue-500/20 text-blue-600 px-2 py-0.5 rounded-full font-bold flex items-center gap-1 border border-blue-500/20">
                        <Shield className="w-3 h-3" /> MEMBER
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">Campaign created on {new Date(selectedCampaign.createdAt).toLocaleDateString()}</p>
                </div>
                
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => {
                    navigator.clipboard.writeText(selectedCampaign.id);
                    toast.success('Campaign ID copied!');
                  }} className="gap-2 h-9">
                    <Copy className="w-3.5 h-3.5" /> ID: {selectedCampaign.id.slice(0, 8)}...
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleExport(selectedCampaign.id)} className="gap-2 h-9">
                    <Download className="w-3.5 h-3.5" /> Export
                  </Button>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="glass-card p-4">
                  <span className="text-[10px] uppercase font-black tracking-widest text-muted-foreground mb-1 block">Role</span>
                  <div className="flex items-center gap-2">
                    {selectedCampaign.role === 'owner' ? (
                       <Crown className="w-4 h-4 text-amber-500" />
                    ) : (
                       <Shield className="w-4 h-4 text-blue-500" />
                    )}
                    <span className="font-bold text-lg">{selectedCampaign.role === 'owner' ? 'ADMIN' : 'MEMBER'}</span>
                  </div>
                </div>
                <div className="glass-card p-4">
                  <span className="text-[10px] uppercase font-black tracking-widest text-muted-foreground mb-1 block">Total Leads</span>
                  <span className="text-2xl font-black">{getCampaignLeadCount(selectedCampaign.id)}</span>
                </div>
                <div className="glass-card p-4">
                  <span className="text-[10px] uppercase font-black tracking-widest text-muted-foreground mb-1 block">Team Size</span>
                  <span className="text-2xl font-black">{members.length}</span>
                </div>
                <div className="glass-card p-4">
                   <span className="text-[10px] uppercase font-black tracking-widest text-muted-foreground mb-1 block">Owner Contact</span>
                   <div className="truncate">
                     <p className="text-sm font-bold truncate">{selectedCampaign.ownerName || 'Admin'}</p>
                     <p className="text-[9px] text-muted-foreground truncate">{selectedCampaign.ownerEmail}</p>
                   </div>
                </div>
              </div>

              {/* Team Activity Section */}
              <div className="glass-card overflow-hidden">
                <div className="p-4 border-b border-border bg-muted/30 flex items-center justify-between">
                  <h3 className="text-sm font-bold flex items-center gap-2">
                    <Activity className="w-4 h-4 text-primary" />
                    Team & Activity
                  </h3>
                  {loadingMembers && <div className="w-4 h-4 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />}
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-[10px] uppercase font-bold text-muted-foreground bg-muted/10">
                      <tr>
                        <th className="px-6 py-3">Member</th>
                        <th className="px-6 py-3">Role</th>
                        <th className="px-6 py-3">Last Active</th>
                        <th className="px-6 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {members.map(member => (
                        <tr 
                          key={member.id} 
                          className="hover:bg-accent/20 transition-colors cursor-pointer"
                          onClick={() => setSelectedMemberForStats(member)}
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold">
                                {member.email.slice(0, 2).toUpperCase()}
                              </div>
                              <div className="flex flex-col">
                                <span className="font-medium">{member.email}</span>
                                {member.id === user?.id && <span className="text-[9px] text-primary font-bold">(YOU)</span>}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${member.role === 'owner' ? 'bg-amber-500/10 text-amber-600' : 'bg-muted text-muted-foreground'}`}>
                              {member.role === 'owner' ? 'ADMIN' : 'MEMBER'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-xs font-medium text-muted-foreground">
                            {member.last_active ? new Date(member.last_active).toLocaleString(undefined, {
                              month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                            }) : 'Joined'}
                          </td>
                          <td className="px-6 py-4 text-right">
                             <div className="flex justify-end gap-1" onClick={e => e.stopPropagation()}>
                               <Button 
                                 variant="ghost" 
                                 size="sm" 
                                 onClick={() => setSelectedMemberForStats(member)} 
                                 className="h-8 w-8 p-0 text-primary/60 hover:text-primary hover:bg-primary/5 transition-opacity"
                                 title="View Statistics"
                               >
                                 <BarChart2 className="w-4 h-4" />
                               </Button>
                               {selectedCampaign.role === 'owner' && member.id !== user?.id && (
                                 <Button 
                                   variant="ghost" 
                                   size="sm" 
                                   onClick={() => setShowOwnershipConfirm(member.id)} 
                                   className="h-8 px-2 text-[10px] text-amber-600 hover:text-amber-700 hover:bg-amber-50 gap-1.5 font-bold"
                                 >
                                   <Crown className="w-3 h-3" /> PROMOTE
                                 </Button>
                               )}
                               {selectedCampaign.role === 'owner' && member.id !== user?.id && (
                                 <Button 
                                   variant="ghost" 
                                   size="sm" 
                                   onClick={() => handleLeaveOrRemove(selectedCampaign.id, member.id, false)} 
                                   className="h-8 w-8 p-0 text-destructive/60 hover:text-destructive hover:bg-destructive/5"
                                 >
                                   <X className="w-4 h-4" />
                                 </Button>
                               )}
                               {member.id === user?.id && member.role !== 'owner' && (
                                 <Button 
                                   variant="ghost" 
                                   size="sm" 
                                   onClick={() => handleLeaveOrRemove(selectedCampaign.id, member.id, true)} 
                                   className="h-8 px-3 text-[10px] text-destructive/60 hover:text-destructive hover:bg-destructive/5 font-bold"
                                 >
                                   <LogOut className="w-3.5 h-3.5 mr-1" /> LEAVE
                                 </Button>
                               )}
                             </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {members.length === 0 && !loadingMembers && (
                  <div className="p-12 text-center text-muted-foreground flex flex-col items-center">
                    <Users className="w-8 h-8 mb-2 opacity-20" />
                    <p className="text-xs">No other members yet. Share your Campaign ID to collaborate!</p>
                  </div>
                )}
              </div>

              {/* Ownership Confirmation Modal (Inline) */}
              {showOwnershipConfirm && (
                <div className="glass-card p-6 border-amber-500 animate-in zoom-in-95 bg-amber-50/10">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                       <Shield className="w-5 h-5 text-amber-600" />
                    </div>
                    <div>
                      <h3 className="font-bold">Transfer Campaign Ownership?</h3>
                      <p className="text-xs text-muted-foreground">
                        This will promote <strong>{members.find(m => m.id === showOwnershipConfirm)?.email}</strong> to owner. 
                        You will be demoted to a regular calling member.
                      </p>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setShowOwnershipConfirm(null)}>Cancel</Button>
                    <Button size="sm" className="bg-amber-600 hover:bg-amber-700" onClick={() => handleTransferOwnership(showOwnershipConfirm)}>
                      Yes, Transfer Ownership
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-12 text-center glass-card border-dashed">
              <div className="w-16 h-16 rounded-3xl bg-muted/50 flex items-center justify-center mb-4">
                <FolderKanban className="w-8 h-8 text-muted-foreground/40" />
              </div>
              <h2 className="text-xl font-bold mb-2">Manage Your Campaigns</h2>
              <p className="text-sm text-muted-foreground max-w-sm">
                Select a campaign from the sidebar to view its performance dashboard, manage team members, and handle data synchronization.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Export Options Dialog - Abstracted but keeping standard modal feel */}
      {showExporter && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in">
          <div className="glass-card w-full max-w-lg p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Bulk Export Data</h3>
              <button onClick={() => setShowExporter(false)}><X className="w-4 h-4" /></button>
            </div>
            <p className="text-sm text-muted-foreground mb-6">Combine multiple campaigns into a single master CSV file for offline analysis.</p>
            
            <div className="space-y-2 mb-8 max-h-[300px] overflow-auto pr-2">
              {campaigns.map(c => (
                <label key={c.id} className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-accent/40 cursor-pointer transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: c.color }} />
                    <span className="text-sm font-medium">{c.name}</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={exportSelection.has(c.id)}
                    onChange={(e) => {
                      const next = new Set(exportSelection);
                      if (e.target.checked) next.add(c.id); else next.delete(c.id);
                      setExportSelection(next);
                    }}
                    className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                </label>
              ))}
            </div>

            <div className="flex gap-3">
              <Button onClick={() => handleExport(exportSelection)} className="flex-1 gap-2" disabled={exportSelection.size === 0}>
                <Download className="w-4 h-4" /> Export Selected ({exportSelection.size})
              </Button>
              <Button variant="outline" onClick={() => setShowExporter(false)} className="flex-1">
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* Member Stats Modal */}
      {selectedMemberForStats && (
        <MemberStatsModal 
          member={selectedMemberForStats} 
          onClose={() => setSelectedMemberForStats(null)} 
        />
      )}
    </div>
  );
}

function formatContactForExport(c: Contact) {
  return {
    'First Name': c.firstName,
    'Last Name': c.lastName,
    'Phone': c.phone,
    'Category': c.category || '',
    'Notes': c.notes || '',
    'Created At': c.createdAt,
    'Last Call': c.lastCallDate || '',
    'Times Called': c.timesCalled || 0,
    'Disposition': c.disposition || '',
  };
}
