import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Server, Truck, FileSpreadsheet, Wrench,
  Calculator, Activity, GitCompare, ChevronLeft, ChevronRight, Menu, X
} from 'lucide-react';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/equipment', icon: Server, label: 'Equipment Library' },
  { to: '/fleet', icon: Truck, label: 'Fleet Manager' },
  { to: '/pricelists', icon: FileSpreadsheet, label: 'Price Lists' },
  { to: '/maintenance', icon: Wrench, label: 'PM Planner' },
  { to: '/analysis', icon: Calculator, label: 'TCO Analysis' },
  { to: '/lifecycle', icon: Activity, label: 'Life Analysis' },
  { to: '/scenarios', icon: GitCompare, label: 'Scenarios' },
];

export default function Layout({ children }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  const current = navItems.find(n => n.to === location.pathname) || navItems[0];

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50
        flex flex-col bg-white border-r border-gray-200
        transition-all duration-300 ease-in-out
        ${collapsed ? 'w-[72px]' : 'w-64'}
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 h-16 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-brand-500 text-white font-bold text-sm flex-shrink-0">
            PM
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <div className="font-bold text-gray-900 text-sm">PMtool</div>
              <div className="text-[10px] text-gray-500 leading-tight">Generator TCO Platform</div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) => `
                flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                transition-all duration-150
                ${isActive
                  ? 'bg-brand-50 text-brand-700 shadow-sm'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }
                ${collapsed ? 'justify-center' : ''}
              `}
            >
              <Icon size={20} className="flex-shrink-0" />
              {!collapsed && <span>{label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden lg:flex items-center justify-center h-12 border-t border-gray-100 text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="flex items-center gap-4 h-16 px-4 lg:px-8 bg-white border-b border-gray-200 flex-shrink-0">
          <button
            onClick={() => setMobileOpen(true)}
            className="lg:hidden p-2 -ml-2 text-gray-500 hover:text-gray-700"
          >
            <Menu size={20} />
          </button>
          <div>
            <h1 className="text-lg font-bold text-gray-900">{current.label}</h1>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <div className="p-4 lg:p-8 max-w-[1600px] mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
