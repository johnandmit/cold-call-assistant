import { Outlet } from 'react-router-dom';
import AppSidebar from './AppSidebar';

export default function Layout() {
  return (
    <div className="min-h-screen flex w-full bg-background">
      <AppSidebar />
      <main className="flex-1 min-h-screen overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
