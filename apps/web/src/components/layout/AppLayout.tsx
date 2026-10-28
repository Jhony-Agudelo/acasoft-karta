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
  Sparkles,
  QrCode,
  MapPin,
  Users,
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
    { label: 'Panel de Pedidos', path: '/panel/lite', icon: Sparkles, alwaysShow: true },
    { label: 'Menú & Carta', path: '/menu', icon: BookOpen, alwaysShow: true },
    { label: 'Códigos QR', path: '/admin/qr-codes', icon: QrCode, alwaysShow: true },
    { label: 'Salón y Mesas', path: '/dining', icon: UtensilsCrossed, module: 'dining' },
    { label: 'Domicilios', path: '/delivery', icon: Truck, module: 'delivery' },
    { label: 'Para Llevar', path: '/pickup', icon: ShoppingBag, module: 'channel.pickup' },
    { label: 'Cocina KDS', path: '/kds', icon: Flame, module: 'kitchen' },
  ];

  const filteredNavItems = navItems.filter((item) => {
    if (item.alwaysShow) return true;
    if (item.module) return hasModule(item.module);
    return true;
  });

  return (
    <div className="flex h-screen bg-[#faf8f5] text-stone-800 overflow-hidden font-sans">
      {/* Sidebar Desktop (Estilo Luminoso y Cálido) */}
      <aside className="hidden lg:flex flex-col w-64 bg-white border-r border-stone-200/90 shrink-0 shadow-sm">
        {/* Brand Header */}
        <div className="flex items-center gap-3 px-6 h-18 border-b border-stone-100 py-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-tr from-orange-600 to-amber-500 text-white font-black shadow-md shadow-orange-500/25 text-lg">
            K
          </div>
          <div className="flex flex-col overflow-hidden">
            <span className="font-extrabold text-stone-900 text-base truncate leading-tight">
              {settings.display_name || 'Karta Bistro'}
            </span>
            <span className="text-[11px] font-semibold text-orange-600">
              Karta SaaS
            </span>
          </div>
        </div>

        {/* Branch Selector */}
        <div className="px-4 py-3.5 border-b border-stone-100 bg-stone-50/60">
          <label className="text-[10px] font-bold tracking-wider text-stone-500 uppercase mb-1.5 flex items-center gap-1.5">
            <Store className="h-3 w-3 text-orange-600" />
            Sucursal Activa
          </label>
          <div className="relative">
            <select
              value={currentBranchId || ''}
              onChange={(e) => setCurrentBranchId(e.target.value)}
              className="w-full appearance-none rounded-xl bg-white border border-stone-200 px-3 py-2 text-xs font-semibold text-stone-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500 transition"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} {b.is_main ? '(Principal)' : ''}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-3.5 w-3.5 text-stone-400" />
          </div>
        </div>

        {/* Dynamic Navigation */}
        <nav className="flex-1 overflow-y-auto px-3.5 py-4 space-y-1">
          <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-stone-400">
            Operación Diaria
          </div>
          {filteredNavItems.map((item) => {
            const Icon = item.icon;
            const active = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                  active
                    ? 'bg-orange-50 text-orange-600 border border-orange-200 shadow-sm'
                    : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100/70'
                }`}
              >
                <Icon className={`h-4 w-4 ${active ? 'text-orange-600' : 'text-stone-400'}`} />
                {item.label}
              </Link>
            );
          })}

          <Link
            to="/admin/delivery-zones"
            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
              location.pathname === '/admin/delivery-zones'
                ? 'bg-orange-50 text-orange-600 border border-orange-200 shadow-sm'
                : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100/70'
            }`}
          >
            <MapPin className="h-4 w-4 text-stone-400" />
            Zonas de Domicilio
          </Link>
          <Link
            to="/admin/customers"
            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
              location.pathname === '/admin/customers'
                ? 'bg-orange-50 text-orange-600 border border-orange-200 shadow-sm'
                : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100/70'
            }`}
          >
            <Users className="h-4 w-4 text-stone-400" />
            Directorio de Clientes
          </Link>
          <Link
            to="/admin/capabilities"
            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
              location.pathname === '/admin/capabilities'
                ? 'bg-orange-50 text-orange-600 border border-orange-200 shadow-sm'
                : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100/70'
            }`}
          >
            <Sliders className="h-4 w-4 text-stone-400" />
            Capacidades & Perfiles
          </Link>
          <Link
            to="/admin/settings"
            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
              location.pathname === '/admin/settings'
                ? 'bg-orange-50 text-orange-600 border border-orange-200 shadow-sm'
                : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100/70'
            }`}
          >
            <Settings className="h-4 w-4 text-stone-400" />
            Ajustes del Restaurante
          </Link>
        </nav>

        {/* User Card */}
        <div className="p-4 border-t border-stone-100 bg-stone-50/70 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-8 w-8 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center text-xs font-bold uppercase shrink-0">
              {user?.name.charAt(0) || 'U'}
            </div>
            <div className="truncate">
              <p className="text-xs font-bold text-stone-800 truncate">{user?.name || 'Administrador'}</p>
              <p className="text-[10px] text-stone-500 truncate">{user?.roleKey || 'TENANT_ADMIN'}</p>
            </div>
          </div>
          <button
            onClick={logout}
            title="Cerrar Sesión"
            className="p-1.5 rounded-lg text-stone-400 hover:text-rose-600 hover:bg-rose-50 transition"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>

      {/* Main Container */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile TopBar */}
        <header className="lg:hidden flex items-center justify-between px-4 h-16 bg-white border-b border-stone-200 shadow-sm">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-600 text-white font-black text-sm">
              K
            </div>
            <span className="font-bold text-sm text-stone-900 truncate max-w-[160px]">
              {settings.display_name || 'Karta'}
            </span>
          </div>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-xl bg-stone-100 text-stone-700"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </header>

        {/* Mobile Slide-in Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-sm flex">
            <div className="w-4/5 max-w-xs bg-white h-full p-5 flex flex-col justify-between shadow-2xl">
              <div>
                <div className="flex items-center justify-between pb-4 border-b border-stone-100">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-600 text-white font-bold text-sm">
                      K
                    </div>
                    <span className="font-extrabold text-stone-900 text-base">
                      {settings.display_name || 'Karta'}
                    </span>
                  </div>
                  <button onClick={() => setMobileMenuOpen(false)}>
                    <X className="h-5 w-5 text-stone-400" />
                  </button>
                </div>
                <nav className="mt-4 space-y-1">
                  {filteredNavItems.map((item) => (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold text-stone-700 hover:bg-orange-50 hover:text-orange-600"
                    >
                      <item.icon className="h-4 w-4 text-stone-400" />
                      {item.label}
                    </Link>
                  ))}
                  <div className="pt-4 border-t border-stone-100 mt-4 space-y-1">
                    <Link
                      to="/admin/delivery-zones"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold text-stone-700"
                    >
                      <MapPin className="h-4 w-4" />
                      Zonas de Domicilio
                    </Link>
                    <Link
                      to="/admin/customers"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold text-stone-700"
                    >
                      <Users className="h-4 w-4" />
                      Directorio de Clientes
                    </Link>
                    <Link
                      to="/admin/capabilities"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold text-stone-700"
                    >
                      <Sliders className="h-4 w-4" />
                      Capacidades & Perfiles
                    </Link>
                    <Link
                      to="/admin/settings"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold text-stone-700"
                    >
                      <Settings className="h-4 w-4" />
                      Ajustes del Restaurante
                    </Link>
                  </div>
                </nav>
              </div>
              <button
                onClick={logout}
                className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-rose-50 text-rose-600 border border-rose-200 text-xs font-bold"
              >
                <LogOut className="h-4 w-4" />
                Cerrar Sesión
              </button>
            </div>
            <div className="flex-1" onClick={() => setMobileMenuOpen(false)} />
          </div>
        )}

        {/* Page Viewport */}
        <main className="flex-1 overflow-y-auto bg-[#faf8f5] p-5 sm:p-8">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};
