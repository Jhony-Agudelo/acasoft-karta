import React from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';
import { useBrandStore } from '../../stores/brand.store';
import { useBranchCapabilities } from '../../hooks/use-branch-capabilities';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../services/api-client';
import {
  Sparkles,
  UtensilsCrossed,
  Truck,
  ShoppingBag,
  Flame,
  Wine,
  BookOpen,
  Boxes,
  Users2,
  Sliders,
  Store,
  ArrowRight,
  ShieldCheck,
  Activity,
} from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const { user, currentBranchId } = useAuthStore();
  const { settings } = useBrandStore();
  const { capabilities, operatingProfile, hasModule, activeFulfillments } = useBranchCapabilities();

  const { data: auditEvents = [] } = useQuery<any[]>({
    queryKey: ['recent-audit-events'],
    queryFn: () => apiClient.get('/admin/audit?limit=5'),
    enabled: !!user,
  });

  const activeModulesCount = Object.values(capabilities).filter(Boolean).length;

  const modulesList = [
    { title: 'Salón y Mesas', desc: 'Control de mesas y comensales', path: '/dining', icon: UtensilsCrossed, key: 'dining' },
    { title: 'Domicilios', desc: 'Despacho de pedidos a domicilio', path: '/delivery', icon: Truck, key: 'delivery' },
    { title: 'Para Llevar', desc: 'Pedidos para recoger en local', path: '/pickup', icon: ShoppingBag, key: 'takeaway' },
    { title: 'Pantalla Cocina (KDS)', desc: 'Gestión en línea de comandas', path: '/kds', icon: Flame, key: 'kitchen.kds' },
    { title: 'Comandas Bar', desc: 'Despacho en barra y coctelería', path: '/bar-kds', icon: Wine, key: 'bar.kds' },
    { title: 'Carta & Menú Digital', desc: 'Platos, categorías y precios', path: '/menu', icon: BookOpen, key: 'menu.digital' },
    { title: 'Inventario Lite', desc: 'Control de existencias y mermas', path: '/inventory', icon: Boxes, key: 'inventory.lite' },
    { title: 'Fidelidad & Clientes', desc: 'Historial y puntos de comensales', path: '/customers', icon: Users2, key: 'crm.loyalty' },
  ];

  return (
    <div className="space-y-8 animate-fade-in font-sans">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-slate-900 to-slate-800 border border-slate-800 p-6 sm:p-8">
        <div className="absolute right-0 top-0 h-full w-1/3 bg-gradient-to-l from-sky-500/10 to-transparent pointer-events-none" />
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full bg-sky-500/10 border border-sky-500/20 px-3 py-1 text-xs font-semibold text-sky-400 mb-3">
            <Sparkles className="h-3.5 w-3.5" />
            Restaurante SaaS v2.4.0 — Fase 01 Operativa
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            Bienvenido, {user?.name || 'Administrador'}
          </h1>
          <p className="mt-2 text-xs sm:text-sm text-slate-300">
            Gestionando <strong className="text-white">{settings.display_name}</strong> bajo perfil operativo{' '}
            <strong className="text-sky-400 font-mono">{operatingProfile || 'FULL_PANEL'}</strong>.
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl p-5 bg-slate-900/60 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Módulos Activos</span>
            <Sliders className="h-4 w-4 text-sky-400" />
          </div>
          <div className="text-2xl font-black text-white">{activeModulesCount} <span className="text-xs text-slate-500 font-normal">/ 16</span></div>
          <p className="text-[11px] text-slate-400 mt-1">Configurados según perfil</p>
        </div>

        <div className="rounded-2xl p-5 bg-slate-900/60 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Canales Activos</span>
            <Store className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-white">{activeFulfillments.length} <span className="text-xs text-slate-500 font-normal">canales</span></div>
          <p className="text-[11px] text-slate-400 mt-1">
            {activeFulfillments.join(', ') || 'Sin canales'}
          </p>
        </div>

        <div className="rounded-2xl p-5 bg-slate-900/60 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Seguridad RLS</span>
            <ShieldCheck className="h-4 w-4 text-purple-400" />
          </div>
          <div className="text-lg font-bold text-white">Aislamiento Activo</div>
          <p className="text-[11px] text-slate-400 mt-1">Tenant context validado</p>
        </div>

        <div className="rounded-2xl p-5 bg-slate-900/60 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Rol de Usuario</span>
            <Users2 className="h-4 w-4 text-amber-400" />
          </div>
          <div className="text-lg font-bold text-white">{user?.roleKey || 'TENANT_ADMIN'}</div>
          <p className="text-[11px] text-slate-400 mt-1">Acceso administrativo</p>
        </div>
      </div>

      {/* Operación Rápida por Módulos */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">
            Accesos Directos a Módulos Operativos
          </h2>
          <Link
            to="/admin/capabilities"
            className="text-xs font-semibold text-sky-400 hover:text-sky-300 inline-flex items-center gap-1"
          >
            Ajustar Capacidades
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {modulesList.map((item) => {
            const enabled = hasModule(item.key);
            const Icon = item.icon;
            return (
              <Link
                key={item.key}
                to={item.path}
                className={`rounded-2xl p-5 border transition-all flex flex-col justify-between ${
                  enabled
                    ? 'bg-slate-900/60 border-slate-800 hover:border-sky-500/50 hover:bg-slate-800/60 shadow-sm'
                    : 'bg-slate-900/30 border-slate-800/40 opacity-50'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="h-10 w-10 rounded-xl bg-slate-800 flex items-center justify-center text-sky-400">
                      <Icon className="h-5 w-5" />
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        enabled ? 'bg-sky-500/20 text-sky-400' : 'bg-slate-800 text-slate-500'
                      }`}
                    >
                      {enabled ? 'ACTIVO' : 'INACTIVO'}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-white">{item.title}</h3>
                  <p className="text-xs text-slate-400 mt-1 leading-snug">{item.desc}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Registro de Auditoría Reciente */}
      <div className="rounded-3xl bg-slate-900/40 border border-slate-800 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-sky-400" />
            <h2 className="text-xs font-bold text-white uppercase tracking-wider">
              Auditoría y Trazabilidad Reciente
            </h2>
          </div>
          <span className="text-[11px] text-slate-500">Últimos eventos registrados</span>
        </div>

        {auditEvents.length === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center">
            No hay eventos registrados recientemente.
          </p>
        ) : (
          <div className="divide-y divide-slate-800 text-xs">
            {auditEvents.map((ev) => (
              <div key={ev.id} className="py-2.5 flex items-center justify-between">
                <div>
                  <span className="font-semibold text-white mr-2">{ev.action}</span>
                  <span className="text-slate-400 font-mono text-[11px]">{ev.entity_type}</span>
                </div>
                <span className="text-slate-500 text-[11px]">
                  {new Date(ev.created_at).toLocaleTimeString('es-CO')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
