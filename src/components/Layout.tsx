import { Outlet } from 'react-router-dom';
import AppSidebar from './AppSidebar';
import GlobalSearch from './GlobalSearch';

export default function Layout() {
  return (
    <div className="min-h-screen flex w-full bg-background">
      <AppSidebar />
      <main className="flex-1 min-h-screen overflow-auto relative">
        <div className="absolute top-3 right-4 z-30">
          <GlobalSearch />
        </div>
        <Outlet />
      </main>
    </div>
  );
}
