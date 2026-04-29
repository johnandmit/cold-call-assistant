import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { pullFromSupabase, pushAllToSupabase, initRealtimeSync } from "@/lib/supabase-sync";
import { useEffect, useState } from "react";

import Layout from "@/components/Layout";
import CallQueue from "@/pages/CallQueue";
import CallScreen from "@/pages/CallScreen";
import CsvManager from "@/pages/CsvManager";
import SettingsPage from "@/pages/Settings";
import Dashboard from "@/pages/Dashboard";
import Campaigns from "@/pages/Campaigns";
import Account from "@/pages/Account";
import Auth from "@/pages/Auth";
import NotFound from "./pages/NotFound";
import EmailReview from "@/pages/EmailReview";
import { supabase } from "@/lib/supabase";

const queryClient = new QueryClient();

// Protected Route Wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [syncing, setSyncing] = useState(true);
  const [syncErrorMsg, setSyncErrorMsg] = useState('');

  useEffect(() => {
    if (!loading && user) {
      // 1. Initial Pull
      pullFromSupabase(user.id).then((hasData) => {
        if (!hasData) {
          pushAllToSupabase(user.id).finally(() => setSyncing(false));
        } else {
          setSyncing(false);
          window.dispatchEvent(new Event('campaign-changed'));
          window.dispatchEvent(new Event('contacts-changed'));
        }
      });

      // 2. Real-time Subscription management
      let currentChannel: any = null;
      
      const refreshSync = () => {
        const settings = JSON.parse(localStorage.getItem('sales-assistant-settings') || '{}');
        const campaignId = settings.activeCampaignId;
        
        if (currentChannel) {
          supabase.removeChannel(currentChannel);
        }
        
        if (campaignId) {
          currentChannel = initRealtimeSync(user.id, campaignId);
        }
      };

      // Initial setup
      refreshSync();

      // Listen for campaign changes (switches)
      window.addEventListener('campaign-changed', refreshSync);

      // 3. Fallback: Pull from cloud when tab becomes visible
      const handleVisibility = () => {
        if (document.visibilityState === 'visible') {
          pullFromSupabase(user.id).then(() => {
            window.dispatchEvent(new Event('campaign-changed'));
            window.dispatchEvent(new Event('storage'));
          });
        }
      };
      document.addEventListener('visibilitychange', handleVisibility);

      const handleError = (e: any) => {
        setSyncErrorMsg(e.detail || 'Unknown sync error');
      };
      window.addEventListener('sync-error', handleError);

      return () => {
        if (currentChannel) supabase.removeChannel(currentChannel);
        window.removeEventListener('campaign-changed', refreshSync);
        document.removeEventListener('visibilitychange', handleVisibility);
        window.removeEventListener('sync-error', handleError);
      };
    } else if (!loading && !user) {
      setSyncing(false);
    }
  }, [user, loading]);

  if (loading || (user && syncing)) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground animate-pulse">Syncing contact database...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" />;
  }

  return (
    <>
      <div className="fixed top-0 left-0 w-full z-[99999] pointer-events-none">
        {syncErrorMsg && (
          <div className="bg-red-600 text-white p-4 font-bold text-center pointer-events-auto">
            CLOUD SYNC FAILED! Database rejected your data: {syncErrorMsg}
            <button onClick={() => setSyncErrorMsg('')} className="ml-4 bg-white/20 px-2 rounded">Dismiss</button>
          </div>
        )}
      </div>
      {children}
    </>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Sonner position="bottom-right" closeButton richColors expand={true} />
        <HashRouter>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
              <Route path="/" element={<CallQueue />} />
              <Route path="/csv" element={<CsvManager />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/campaigns" element={<Campaigns />} />
              <Route path="/emails" element={<EmailReview />} />
              <Route path="/account" element={<Account />} />
            </Route>
            <Route path="/call" element={<ProtectedRoute><CallScreen /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </HashRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
