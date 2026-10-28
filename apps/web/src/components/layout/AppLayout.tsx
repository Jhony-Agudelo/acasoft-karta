import React, { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';
import { useBrandStore } from '../../stores/brand.store';
import { useBranchCapabilities } from '../../hooks/use-branch-capabilities';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../services/api-client';
import {
  LayoutDashboard,
  UtensilsCrossed,
  Truck,
  ShoppingBag,
  Flame,
  Wine,
  BookOpen,
  Boxes,
  Users2,
  Sliders,
  Settings,
  LogOut,
  Menu,
  X,
  Store,
  ChevronDown,
} from 'lucide-react';

interface BranchItem {
  id: string;
  name: string;
  is_main: boolean;
}

export const AppLayout: React.FC = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const { user, currentBranchId, setCurrentBranchId, logout } = useAuthStore();
  const { settings } = useBrandStore();
  const { hasModule } = useBranchCapabilities();

  // Obtener sucursales
  const { data: branches = [] } = useQuery<BranchItem[]>({
    queryKey: ['branches-list'],
    queryFn: () => apiClient.get('/admin/branches'),
    enabled: !!user,
  });

  // Si no hay sucursal seleccionada, seleccionar la principal o primera
  React.useEffect(() => {
    if (!currentBranchId && branches.length > 0) {
      const main = branches.find((b) => b.is_main) || branches[0];
      if (main) {
        setCurrentBranchId(main.id);
      }
    }
  }, [branches, currentBranchId, setCurrentBranchId]);

  // Navegación modular dinámica
  const navItems = [
    { label: 'Panel Principal', path: '/dashboard', icon: LayoutDashboard, alwaysShow: true },
    { label: 'Salón y Mesas', path: '/dining', icon: UtensilsCrossed, module: 'dining' },
    { label: 'Domicilios', path: '/delivery', icon: Truck, module: 'delivery' },
    { label: 'Para Llevar', path: '/pickup', icon: ShoppingBag, module: 'takeaway' },
    { label: 'Pantalla Cocina (KDS)', path: '/kds', icon: Flame, module: 'kitchen.kds' },
    { label: 'Comandas Bar', path: '/bar-kds', icon: Wine, module: 'bar.kds' },
    { label: 'Menú y Carta', path: '/menu', icon: BookOpen, module: 'menu.digital' },
    { label: 'Inventario', path: '/inventory', icon: Boxes, module: 'inventory.lite' },
    { label: 'Clientes y Fidelidad', path: '/customers', icon: Users2, module: 'crm.loyalty' },
  ];

  const filteredNavItems = navItems.filter((item) => {
    if (item.alwaysShow) return true;
    if (item.module) return hasModule(item.module);
    return true;
  });

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Sidebar Desktop */}
      <aside className="hidden lg:flex flex-col w-64 bg-slate-900 border-r border-slate-800 shrink-0">
        {/* Brand Header */}
        <div className="flex items-center gap-3 px-6 h-16 border-b border-slate-800">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-sky-500 to-blue-600 text-white font-bold shadow-md shadow-sky-500/20">
            {settings.display_name.charAt(0).toUpperCase()}
          </div>
          <div className="flex flex-col overflow-hidden">
            <span className="font-bold text-white text-base truncate leading-tight">
              {settings.display_name}
            </span>
            <span className="text-xs text-slate-400">Sistema Operativo</span>
          </div>
        </div>

        {/* Branch Selector */}
        <div className="px-4 py-3 border-b border-slate-800">
          <label className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase mb-1.5 flex items-center gap-1.5">
            <Store className="h-3 w-3 text-sky-400" />
            Sucursal Activa
          </label>
          <div className="relative">
            <select
              value={currentBranchId || ''}
              onChange={(e) => setCurrentBranchId(e.target.value)}
              className="w-full appearance-none rounded-lg bg-slate-800/80 border border-slate-700/80 px-3 py-2 text-xs font-medium text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} {b.is_main ? '(Principal)' : ''}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
          </div>
        </div>

        {/* Dynamic Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Módulos Operativos
          </div>
          {filteredNavItems.map((item) => {
            const Icon = item.icon;
            const active = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  active
                    ? 'bg-sky-500/15 text-sky-400 font-semibold border border-sky-500/30 shadow-sm'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50'
                }`}
              >
                <Icon className={`h-4 w-4 ${active ? 'text-sky-400' : 'text-slate-400'}`} />
                {item.label}
              </Link>
            );
          })}

          <div className="pt-6 px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Configuración & Gestión
          </div>
          <Link
            to="/admin/capabilities"
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
              location.pathname === '/admin/capabilities'
                ? 'bg-sky-500/15 text-sky-400 font-semibold border border-sky-500/30'
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50'
            }`}
          >
            <Sliders className="h-4 w-4" />
            Perfiles & Capacidades
          </Link>
          <Link
            to="/admin/settings"
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
              location.pathname === '/admin/settings'
                ? 'bg-sky-500/15 text-sky-400 font-semibold border border-sky-500/30'
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50'
            }`}
          >
            <Settings className="h-4 w-4" />
            Configuración General
          </Link>
        </nav>

        {/* User Card */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/50 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-8 w-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-200 uppercase shrink-0">
              {user?.name.charAt(0) || 'U'}
            </div>
            <div className="truncate">
              <p className="text-xs font-semibold text-slate-200 truncate">{user?.name}</p>
              <p className="text-[10px] text-slate-400 truncate">{user?.roleKey}</p>
            </div>
          </div>
          <button
            onClick={logout}
            title="Cerrar Sesión"
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>

      {/* Main Container */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile TopBar */}
        <header className="lg:hidden flex items-center justify-between px-4 h-16 bg-slate-900 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500 text-white font-bold text-sm">
              {settings.display_name.charAt(0).toUpperCase()}
            </div>
            <span className="font-bold text-sm text-white truncate max-w-[150px]">
              {settings.display_name}
            </span>
          </div>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-lg bg-slate-800 text-slate-200"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </header>

        {/* Mobile Slide-in Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex">
            <div className="w-4/5 max-w-xs bg-slate-900 h-full p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                  <span className="font-bold text-white text-base">{settings.display_name}</span>
                  <button onClick={() => setMobileMenuOpen(false)}>
                    <X className="h-5 w-5 text-slate-400" />
                  </button>
                </div>
                <nav className="mt-4 space-y-1">
                  {filteredNavItems.map((item) => (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-800"
                    >
                      <item.icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  ))}
                  <div className="pt-4 border-t border-slate-800 mt-4">
                    <Link
                      to="/admin/capabilities"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-300"
                    >
                      <Sliders className="h-4 w-4" />
                      Perfiles & Capacidades
                    </Link>
                    <Link
                      to="/admin/settings"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-300"
                    >
                      <Settings className="h-4 w-4" />
                      Configuración
                    </Link>
                  </div>
                </nav>
              </div>
              <button
                onClick={logout}
                className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20 text-sm font-medium"
              >
                <LogOut className="h-4 w-4" />
                Cerrar Sesión
              </button>
            </div>
            <div className="flex-1" onClick={() => setMobileMenuOpen(false)} />
          </div>
        )}

        {/* Page Viewport */}
        <main className="flex-1 overflow-y-auto bg-slate-950 p-4 md:p-8">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};
