import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route } from "react-router-dom";
import Layout from "@/components/Layout";
import CallQueue from "@/pages/CallQueue";
import CallScreen from "@/pages/CallScreen";
import CsvManager from "@/pages/CsvManager";
import SettingsPage from "@/pages/Settings";
import Dashboard from "@/pages/Dashboard";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<CallQueue />} />
            <Route path="/csv" element={<CsvManager />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/dashboard" element={<Dashboard />} />
          </Route>
          <Route path="/call" element={<CallScreen />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </HashRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
