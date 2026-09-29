import { NavLink, Outlet } from 'react-router-dom';
import { CalendarRange, LayoutDashboard, PlusCircle, Users } from 'lucide-react';
import { COMPANY_NAME } from '../../shared/tna.js';
import AccountMenu from './AccountMenu.jsx';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/orders/new', label: 'New T&A', icon: PlusCircle },
  { to: '/users', label: 'User Master', icon: Users },
];

export default function Layout() {
  return (
    <div className="min-h-screen pb-20 md:pb-0">
      <header className="app-header no-print sticky top-0 z-30 border-b border-brand-900/20 bg-brand-700 text-white shadow">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
          <CalendarRange className="h-6 w-6 shrink-0 text-brand-100" aria-hidden />
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-semibold md:text-base">{COMPANY_NAME}</div>
            <div className="text-[11px] uppercase tracking-wider text-brand-100">Time &amp; Action Calendar</div>
          </div>
          <nav className="ml-auto hidden gap-1 md:flex">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    isActive ? 'bg-white/15 text-white' : 'text-brand-100 hover:bg-white/10 hover:text-white'
                  }`
                }
              >
                <Icon className="h-4 w-4" aria-hidden />
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto md:ml-2">
            <AccountMenu />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-3 py-4 sm:px-4 md:py-6">
        <Outlet />
      </main>

      {/* Mobile bottom tab bar */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium ${
                isActive ? 'text-brand-600' : 'text-slate-500'
              }`
            }
          >
            <Icon className="h-5 w-5" aria-hidden />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
