import React, { useState, useEffect, useRef } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';
import { useBrandStore } from '../../stores/brand.store';
import { useBranchCapabilities } from '../../hooks/use-branch-capabilities';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../services/api-client';
import { isPathAllowedForRole } from '../../config/role-navigation.config';
import {
  LayoutDashboard,
  UtensilsCrossed,
  Truck,
  ShoppingBag,
  Flame,
  BookOpen,
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
  BarChart3,
  Receipt,
  Lock,
  Bell,
  BellRing,
  CheckCheck,
  Radio,
  ExternalLink,
} from 'lucide-react';
import { NetworkStatusBanner } from '../common/NetworkStatusBanner';
import { useSseStream } from '../../hooks/use-sse-stream';
import { playNewOrderChime } from '../../features/lite-order-panel/order-sound';
import { CashShiftStatusBadge } from '../../features/cash-shifts/CashShiftStatusBadge';

interface StaffNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  tableCode?: string;
  timestamp: Date;
  read: boolean;
}

interface BranchItem {
  id: string;
  name: string;
  is_main: boolean;
}

export const AppLayout: React.FC = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<StaffNotification[]>([]);
  const [activeToast, setActiveToast] = useState<StaffNotification | null>(null);
  const notifDropdownRef = useRef<HTMLDivElement>(null);

  const location = useLocation();
  const navigate = useNavigate();
  const { user, currentBranchId, setCurrentBranchId, logout } = useAuthStore();
  const { settings } = useBrandStore();
  const { hasModule } = useBranchCapabilities();

  // SSE en tiempo real para alertas globales operativas (Cocina KDS, QR Salón, etc.)
  const sseUrl = currentBranchId ? `/api/v1/branches/${currentBranchId}/orders/events` : '';

  const { isConnected } = useSseStream({
    url: sseUrl,
    authMode: 'jwt',
    enabled: !!currentBranchId && !!user,
    onMessage: (msg) => {
      if (
        msg.type === 'kitchen.order_ready' ||
        msg.type === 'dining.qr_order_requested' ||
        msg.type === 'order.created'
      ) {
        let title = 'Notificación Operativa';
        let message = '';
        let tableCode = msg.data?.table_code || undefined;

        if (msg.type === 'kitchen.order_ready') {
          title = '🍽️ ¡Comanda Lista en Cocina!';
          message = tableCode
            ? `Los platos para la Mesa ${tableCode} están listos para servir.`
            : `El pedido #${msg.data?.order_number || ''} está listo en cocina.`;
        } else if (msg.type === 'dining.qr_order_requested') {
          title = '📱 ¡Pedido QR Solicitado!';
          message = tableCode
            ? `Comensal en Mesa ${tableCode} ha enviado un pedido para confirmar.`
            : `Nuevo pedido comensal #${msg.data?.order_code || ''} recibido.`;
        } else if (msg.type === 'order.created') {
          title = '🔔 Nuevo Pedido Ingresado';
          message = `Pedido #${msg.data?.order_number || ''} creado en el sistema.`;
        }

        const newNotif: StaffNotification = {
          id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          type: msg.type,
          title,
          message,
          tableCode,
          timestamp: new Date(),
          read: false,
        };

        setNotifications((prev) => [newNotif, ...prev.slice(0, 19)]);
        setActiveToast(newNotif);
        playNewOrderChime();
      }
    },
  });

  // Auto-dismiss del toast tras 8 segundos
  useEffect(() => {
    if (!activeToast) return;
    const timer = setTimeout(() => {
      setActiveToast(null);
    }, 8000);
    return () => clearTimeout(timer);
  }, [activeToast]);

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        notifDropdownRef.current &&
        !notifDropdownRef.current.contains(event.target as Node)
      ) {
        setIsNotifOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const handleNotificationClick = (notif: StaffNotification) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n)),
    );
    setIsNotifOpen(false);
    setActiveToast(null);

    if (notif.type === 'kitchen.order_ready' || notif.type === 'dining.qr_order_requested') {
      navigate('/dining');
    } else {
      navigate('/panel');
    }
  };

  // Obtener sucursales filtradas según alcance del usuario
  const { data: rawBranches = [] } = useQuery<BranchItem[]>({
    queryKey: ['branches-list', user?.id, user?.roleKey],
    queryFn: () => apiClient.get('/admin/branches'),
    enabled: !!user,
  });

  // Filtrar adicionalmente en frontend si el usuario tiene branchScope explícito
  const branches = React.useMemo(() => {
    if (!user) return [];
    if (user.roleKey === 'TENANT_ADMIN' || user.roleKey === 'PLATFORM_ADMIN') {
      return rawBranches;
    }
    if (user.branchScope && user.branchScope.length > 0) {
      return rawBranches.filter((b) => user.branchScope?.includes(b.id));
    }
    return rawBranches;
  }, [rawBranches, user]);

  // Si no hay sucursal seleccionada o la actual no es válida para el usuario, seleccionar la primera autorizada
  React.useEffect(() => {
    if (branches.length > 0) {
      const isValidCurrent = branches.some((b) => b.id === currentBranchId);
      if (!currentBranchId || !isValidCurrent) {
        const main = branches.find((b) => b.is_main) || branches[0];
        if (main) {
          setCurrentBranchId(main.id);
        }
      }
    }
  }, [branches, currentBranchId, setCurrentBranchId]);

  // Regla de bloqueo de sucursal: usuarios operativos con 1 sede no pueden cambiar de sede
  const isBranchLocked =
    user?.roleKey !== 'TENANT_ADMIN' &&
    user?.roleKey !== 'PLATFORM_ADMIN' &&
    branches.length === 1;

  // Navegación modular dinámica filtrada por MÓDULO y por ROL
  const navItems = [
    { label: 'Panel Principal', path: '/dashboard', icon: LayoutDashboard },
    { label: 'Panel de Pedidos', path: '/panel', icon: Sparkles, module: 'order_panel' },
    { label: 'Menú & Carta', path: '/menu', icon: BookOpen },
    { label: 'Códigos QR', path: '/admin/qr-codes', icon: QrCode },
    { label: 'Salón y Mesas', path: '/dining', icon: UtensilsCrossed, module: 'dining' },
    { label: 'Domicilios', path: '/delivery', icon: Truck, module: 'delivery' },
    { label: 'Para Llevar', path: '/pickup', icon: ShoppingBag, module: 'channel.pickup' },
    { label: 'Cocina KDS', path: '/kds', icon: Flame, module: 'kitchen' },
    { label: 'Reportes & Conciliación', path: '/reports', icon: BarChart3, module: 'reporting' },
  ];

  const adminNavItems = [
    { label: 'Turnos y Arqueo Caja', path: '/admin/cash-shifts', icon: Receipt, module: 'payments.cash_shifts' },
    { label: 'Zonas de Domicilio', path: '/admin/delivery-zones', icon: MapPin },
    { label: 'Mesas & Portamesas', path: '/admin/dining-tables', icon: UtensilsCrossed, module: 'dining' },
    { label: 'Directorio de Clientes', path: '/admin/customers', icon: Users },
    { label: 'Capacidades & Perfiles', path: '/admin/capabilities', icon: Sliders },
    { label: 'Ajustes del Restaurante', path: '/admin/settings', icon: Settings },
  ];

  const filteredNavItems = navItems.filter((item) => {
    if (!isPathAllowedForRole(item.path, user?.roleKey)) return false;
    if (item.module && !hasModule(item.module)) return false;
    return true;
  });

  const filteredAdminNavItems = adminNavItems.filter((item) => {
    if (!isPathAllowedForRole(item.path, user?.roleKey)) return false;
    if (item.module && !hasModule(item.module)) return false;
    return true;
  });

  const activeBranchName = branches.find((b) => b.id === currentBranchId)?.name || branches[0]?.name || 'Sede Principal';

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

        {/* Branch Selector / Branch Lock Indicator */}
        <div className="px-4 py-3.5 border-b border-stone-100 bg-stone-50/60">
          <label className="text-[10px] font-bold tracking-wider text-stone-500 uppercase mb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Store className="h-3 w-3 text-orange-600" />
              {isBranchLocked ? 'Sede Asignada' : 'Sucursal Activa'}
            </span>
            {isBranchLocked && (
              <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase text-stone-500 bg-stone-200/70 px-1.5 py-0.5 rounded">
                <Lock className="h-2.5 w-2.5 text-stone-400" />
                Fija
              </span>
            )}
          </label>

          {isBranchLocked ? (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-stone-200 shadow-2xs">
              <span className="text-xs font-bold text-stone-800 truncate">
                {activeBranchName}
              </span>
            </div>
          ) : (
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
          )}
        </div>

        {/* Dynamic Navigation */}
        <nav className="flex-1 overflow-y-auto px-3.5 py-4 space-y-1">
          {filteredNavItems.length > 0 && (
            <>
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
            </>
          )}

          {filteredAdminNavItems.length > 0 && (
            <div className="pt-4 mt-2 border-t border-stone-100 space-y-1">
              <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-stone-400">
                Administración
              </div>
              {filteredAdminNavItems.map((item) => {
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
            </div>
          )}
        </nav>

        {/* User Card */}
        <div className="p-4 border-t border-stone-100 bg-stone-50/70 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-8 w-8 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center text-xs font-bold uppercase shrink-0">
              {user?.name.charAt(0) || 'U'}
            </div>
            <div className="truncate">
              <p className="text-xs font-bold text-stone-800 truncate">{user?.name || 'Administrador'}</p>
              <p className="text-[10px] font-semibold text-stone-500 truncate">{user?.roleKey || 'STAFF'}</p>
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

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {/* Banner de Estado de Red / Offline */}
        <NetworkStatusBanner />

        {/* Floating Toast Notification Banner */}
        {activeToast && (
          <div className="fixed top-4 right-4 z-50 max-w-sm w-full bg-white rounded-2xl shadow-2xl border-2 border-orange-500 p-4 transition-all duration-300 animate-slide-up">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
                {activeToast.type === 'kitchen.order_ready' ? (
                  <UtensilsCrossed className="h-5 w-5" />
                ) : (
                  <BellRing className="h-5 w-5 text-amber-600 animate-pulse" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h4 className="font-extrabold text-stone-900 text-xs truncate">
                    {activeToast.title}
                  </h4>
                  <button
                    onClick={() => setActiveToast(null)}
                    className="p-1 rounded-lg text-stone-400 hover:text-stone-700"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="text-[11px] font-medium text-stone-600 mt-0.5 line-clamp-2">
                  {activeToast.message}
                </p>
                <div className="mt-2.5 flex items-center justify-between">
                  <span className="text-[9px] font-bold text-stone-400">
                    Hace un momento
                  </span>
                  <button
                    onClick={() => handleNotificationClick(activeToast)}
                    className="px-2.5 py-1 rounded-lg bg-orange-600 hover:bg-orange-700 text-white font-extrabold text-[10px] shadow-sm flex items-center gap-1 transition"
                  >
                    <span>Ver en Salón</span>
                    <ExternalLink className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Desktop Top Header Bar */}
        <header className="hidden lg:flex items-center justify-between px-8 py-3 bg-white border-b border-stone-200/90 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black uppercase tracking-wider text-stone-400">
                Sede Activa:
              </span>
              <span className="text-xs font-extrabold text-stone-900 bg-stone-100 px-2.5 py-1 rounded-lg">
                {activeBranchName}
              </span>
            </div>

            {/* Live SSE Status Pill */}
            <div
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold border transition ${
                isConnected
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                }`}
              />
              <span>{isConnected ? 'Sincronizado en Vivo' : 'Conectando Stream'}</span>
            </div>

            {/* Cash Shift Status Badge */}
            <CashShiftStatusBadge />
          </div>

          <div className="flex items-center gap-4">
            {/* Notification Bell Button & Dropdown */}
            <div className="relative" ref={notifDropdownRef}>
              <button
                type="button"
                onClick={() => setIsNotifOpen(!isNotifOpen)}
                className={`relative p-2 rounded-xl transition ${
                  isNotifOpen || unreadCount > 0
                    ? 'bg-orange-50 text-orange-600 border border-orange-200'
                    : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
                }`}
                title="Notificaciones de Salón y Cocina"
              >
                {unreadCount > 0 ? (
                  <BellRing className="h-5 w-5 text-orange-600 animate-bounce" />
                ) : (
                  <Bell className="h-5 w-5" />
                )}
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full bg-orange-600 text-[9px] font-black text-white shadow-xs">
                    {unreadCount}
                  </span>
                )}
              </button>

              {/* Notification Popover Dropdown */}
              {isNotifOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-stone-200 overflow-hidden z-50 animate-slide-up">
                  <div className="flex items-center justify-between px-4 py-3 bg-stone-50 border-b border-stone-100">
                    <div className="flex items-center gap-2">
                      <Bell className="h-4 w-4 text-orange-600" />
                      <span className="font-extrabold text-xs text-stone-900">
                        Notificaciones de Salón
                      </span>
                    </div>
                    {unreadCount > 0 && (
                      <button
                        onClick={markAllAsRead}
                        className="text-[10px] font-bold text-orange-600 hover:underline flex items-center gap-1"
                      >
                        <CheckCheck className="h-3 w-3" />
                        <span>Marcar leídas</span>
                      </button>
                    )}
                  </div>

                  <div className="max-h-72 overflow-y-auto divide-y divide-stone-100">
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center text-xs text-stone-400">
                        No hay notificaciones pendientes.
                      </div>
                    ) : (
                      notifications.map((notif) => (
                        <div
                          key={notif.id}
                          onClick={() => handleNotificationClick(notif)}
                          className={`p-3 cursor-pointer hover:bg-orange-50/60 transition flex items-start gap-2.5 ${
                            !notif.read ? 'bg-orange-50/30' : ''
                          }`}
                        >
                          <div
                            className={`p-1.5 rounded-lg shrink-0 mt-0.5 ${
                              notif.type === 'kitchen.order_ready'
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-amber-100 text-amber-700'
                            }`}
                          >
                            <UtensilsCrossed className="h-3.5 w-3.5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-xs text-stone-900 truncate">
                                {notif.title}
                              </span>
                              {!notif.read && (
                                <span className="h-1.5 w-1.5 rounded-full bg-orange-600 shrink-0" />
                              )}
                            </div>
                            <p className="text-[11px] text-stone-600 line-clamp-2 mt-0.5">
                              {notif.message}
                            </p>
                            <span className="text-[9px] font-semibold text-stone-400 mt-1 block">
                              {new Date(notif.timestamp).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Role Badge */}
            <div className="flex items-center gap-2 pl-3 border-l border-stone-200">
              <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500 bg-stone-100 px-2 py-0.5 rounded-md">
                {user?.roleKey}
              </span>
              <span className="text-xs font-bold text-stone-800">
                {user?.name}
              </span>
            </div>
          </div>
        </header>

        {/* Mobile Header */}
        <header className="lg:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-stone-200">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-600 text-white font-bold text-sm">
              K
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-stone-900 text-sm truncate">
                {settings.display_name || 'Karta'}
              </span>
              <span className="text-[10px] text-stone-500 font-semibold truncate">
                {activeBranchName}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <CashShiftStatusBadge />
            {/* Mobile Notification Button */}
            <button
              type="button"
              onClick={() => setIsNotifOpen(!isNotifOpen)}
              className="relative p-2 rounded-xl bg-stone-100 text-stone-700"
              title="Notificaciones"
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full bg-orange-600 text-[9px] font-black text-white">
                  {unreadCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-xl bg-stone-100 text-stone-700"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
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

                {/* Mobile Branch indicator */}
                <div className="mt-3 py-2 px-3 rounded-xl bg-stone-50 border border-stone-200 flex items-center justify-between">
                  <span className="text-xs font-bold text-stone-800 truncate">
                    {activeBranchName}
                  </span>
                  {isBranchLocked && (
                    <span className="text-[9px] font-bold text-stone-500 bg-stone-200/60 px-1.5 py-0.5 rounded">
                      Fija
                    </span>
                  )}
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

                  {filteredAdminNavItems.length > 0 && (
                    <div className="pt-4 border-t border-stone-100 mt-4 space-y-1">
                      <div className="px-3 pb-1 text-[10px] font-bold uppercase text-stone-400">
                        Administración
                      </div>
                      {filteredAdminNavItems.map((item) => (
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
                    </div>
                  )}
                </nav>
              </div>

              <button
                onClick={logout}
                className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-rose-50 text-rose-600 border border-rose-200 text-xs font-bold"
              >
                <LogOut className="h-4 w-4" />
                Cerrar Sesión ({user?.roleKey})
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
