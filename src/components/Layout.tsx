import { Outlet } from 'react-router-dom';
import AppSidebar from './AppSidebar';
import GlobalSearch from './GlobalSearch';
import { useEffect, useState, useCallback } from 'react';
import { getCampaigns, getActiveCampaignId, ensureCampaigns } from '@/lib/storage';
import { Campaign } from '@/types';
import { Crown, Shield } from 'lucide-react';

export default function Layout() {
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
    <div className="min-h-screen flex w-full bg-background">
      <AppSidebar />
      <main className="flex-1 min-h-screen overflow-auto relative">
        {/* Campaign breadcrumb bar */}
        <div className="flex items-center justify-between px-6 py-2 border-b border-border/50 bg-card/30">
          <div className="flex items-center gap-2">
            {activeCampaign && (
              <>
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: activeCampaign.color }}
                />
                <span className="text-xs font-semibold">
                  {activeCampaign.name}
                </span>
                {activeCampaign.role === 'owner' ? (
                  <span className="text-[9px] bg-amber-500/10 text-amber-600 px-1.5 py-0.5 rounded font-bold border border-amber-500/20 flex items-center gap-0.5 ml-2">
                    <Crown className="w-2 h-2" /> ADMIN
                  </span>
                ) : (
                  <span className="text-[9px] bg-blue-500/10 text-blue-600 px-1.5 py-0.5 rounded font-bold border border-blue-500/20 flex items-center gap-0.5 ml-2">
                    <Shield className="w-2 h-2" /> MEMBER
                  </span>
                )}
              </>
            )}
          </div>
          <GlobalSearch />
        </div>
        <Outlet />
      </main>
    </div>
  );
}
