import { NavLink } from 'react-router-dom';
import { List, FileSpreadsheet, Settings, Zap, BarChart3, FolderKanban } from 'lucide-react';
import { useEffect, useState, useCallback } from 'react';
import { getCampaigns, getActiveCampaignId, ensureCampaigns } from '@/lib/storage';
import { Campaign } from '@/types';

const navItems = [
  { to: '/campaigns', icon: FolderKanban, label: 'Campaigns' },
  { to: '/', icon: List, label: 'Queue' },
  { to: '/csv', icon: FileSpreadsheet, label: 'CSV' },
  { to: '/dashboard', icon: BarChart3, label: 'Stats' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export default function AppSidebar() {
  const [activeCampaign, setActiveCampaign] = useState<Campaign | null>(null);

  const refresh = useCallback(() => {
    ensureCampaigns();
    const id = getActiveCampaignId();
    const campaigns = getCampaigns();
    setActiveCampaign(campaigns.find(c => c.id === id) || null);
  }, []);

  useEffect(() => {
    refresh();
    // Listen for custom campaign-change events instead of polling
    window.addEventListener('campaign-changed', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('campaign-changed', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [refresh]);

  return (
    <aside className="w-[68px] min-h-screen bg-card/50 border-r border-border flex flex-col items-center py-4 gap-1">
      <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center mb-2">
        <Zap className="w-5 h-5 text-primary" />
      </div>
      {/* Active campaign indicator */}
      {activeCampaign && (
        <NavLink to="/campaigns" className="mb-3 flex flex-col items-center gap-0.5 group">
          <div
            className="w-6 h-6 rounded-md group-hover:scale-110 transition-transform"
            style={{ backgroundColor: activeCampaign.color }}
          />
          <span className="text-[8px] font-medium text-muted-foreground max-w-[60px] truncate text-center leading-tight">
            {activeCampaign.name}
          </span>
        </NavLink>
      )}
      {navItems.map(item => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          className={({ isActive }) =>
            `w-12 h-12 rounded-lg flex flex-col items-center justify-center gap-0.5 transition-all duration-200 ${
              isActive
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            }`
          }
        >
          <item.icon className="w-5 h-5" />
          <span className="text-[9px] font-medium">{item.label}</span>
        </NavLink>
      ))}
    </aside>
  );
}
