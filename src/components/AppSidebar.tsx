import { NavLink } from 'react-router-dom';
import { List, FileSpreadsheet, Settings, Zap, BarChart3 } from 'lucide-react';

const navItems = [
  { to: '/', icon: List, label: 'Queue' },
  { to: '/csv', icon: FileSpreadsheet, label: 'CSV' },
  { to: '/dashboard', icon: BarChart3, label: 'Stats' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export default function AppSidebar() {
  return (
    <aside className="w-[68px] min-h-screen bg-card/50 border-r border-border flex flex-col items-center py-4 gap-1">
      <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center mb-6">
        <Zap className="w-5 h-5 text-primary" />
      </div>
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
