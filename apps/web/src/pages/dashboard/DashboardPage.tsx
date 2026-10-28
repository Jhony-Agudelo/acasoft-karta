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
  ChefHat,
  TrendingUp,
} from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const { user } = useAuthStore();
  const { settings } = useBrandStore();
  const { capabilities, operatingProfile, hasModule, activeFulfillments } = useBranchCapabilities();

  const { data: auditData } = useQuery<any>({
    queryKey: ['recent-audit-events'],
    queryFn: () => apiClient.get('/admin/audit-events?limit=5'),
    enabled: !!user,
  });

  const auditEvents: any[] = Array.isArray(auditData)
    ? auditData
    : Array.isArray(auditData?.items)
    ? auditData.items
    : [];

  const activeModulesCount = Object.values(capabilities).filter(Boolean).length;

  const modulesList = [
    { title: 'Salón y Mesas', desc: 'Plano de mesas, cuentas y comensales', path: '/dining', icon: UtensilsCrossed, key: 'dining', phase: 'Fase 02' },
    { title: 'Pantalla Cocina (KDS)', desc: 'Despacho de comandas en vivo', path: '/kds', icon: Flame, key: 'kitchen', phase: 'Fase 03' },
    { title: 'Domicilios & WhatsApp', desc: 'Recepción y mensajería de envíos', path: '/delivery', icon: Truck, key: 'delivery', phase: 'Fase 04' },
    { title: 'Carta & Menú Digital', desc: 'Precios, categorías y platos en línea', path: '/menu', icon: BookOpen, key: 'ordering', phase: 'Fase 02' },
    { title: 'Para Llevar (Pickup)', desc: 'Mostrador de recogida express', path: '/pickup', icon: ShoppingBag, key: 'channel.pickup', phase: 'Fase 04' },
    { title: 'Seguimiento SSE', desc: 'Actualización en tiempo real del pedido', path: '/tracking', icon: Sparkles, key: 'tracking', phase: 'Fase 03B' },
  ];

  return (
    <div className="space-y-8 animate-fade-in font-sans">
      {/* Banner Principal Cálido con Imagen Gastronómica */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-stone-900 via-stone-900 to-stone-800 text-white shadow-xl shadow-stone-300/40 border border-stone-200/50 p-6 sm:p-10 flex flex-col md:flex-row items-center justify-between gap-6">
        {/* Imagen sutil de fondo en el banner */}
        <img
          src="/images/karta-hero.jpg"
          alt="Karta Gastronomía"
          className="absolute inset-0 h-full w-full object-cover object-right opacity-25 mix-blend-luminosity pointer-events-none"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-stone-950 via-stone-950/80 to-transparent" />

        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full bg-orange-500/20 backdrop-blur-md border border-orange-400/30 px-3.5 py-1.5 text-xs font-bold text-orange-200 mb-3">
            <Sparkles className="h-3.5 w-3.5 text-orange-400" />
            Karta SaaS v2.4.0 — Núcleo Multi-tenant Operativo
          </div>
          <h1 className="text-2xl sm:text-4xl font-black tracking-tight leading-tight">
            Bienvenido, <span className="text-orange-400">{user?.name || 'Administrador'}</span>
          </h1>
          <p className="mt-2 text-xs sm:text-sm text-stone-300 leading-relaxed">
            Operando <strong className="text-white">{settings.display_name || 'Karta Bistro'}</strong> bajo el perfil{' '}
            <strong className="text-orange-300 font-mono">{operatingProfile || 'FULL_PANEL'}</strong> con aislamiento RLS verificado.
          </p>
        </div>

        <div className="relative z-10 shrink-0 flex flex-col sm:flex-row gap-3">
          <Link
            to="/admin/capabilities"
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-xs font-bold text-white shadow-lg shadow-orange-500/30 transition"
          >
            <Sliders className="h-4 w-4" />
            Configurar Módulos
          </Link>
          <Link
            to="/admin/settings"
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 text-xs font-bold text-white transition"
          >
            Ajustes
          </Link>
        </div>
      </div>

      {/* Tarjetas KPI Vivas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-3xl p-6 bg-white border border-stone-200/80 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between text-stone-500 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Módulos Activos</span>
            <div className="h-9 w-9 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center">
              <Sliders className="h-4 w-4" />
            </div>
          </div>
          <div className="text-3xl font-black text-stone-900">
            {activeModulesCount} <span className="text-xs font-semibold text-stone-400">/ 16</span>
          </div>
          <p className="text-xs text-stone-500 mt-1">Configurados según perfil</p>
        </div>

        <div className="rounded-3xl p-6 bg-white border border-stone-200/80 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between text-stone-500 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Canales Activos</span>
            <div className="h-9 w-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Store className="h-4 w-4" />
            </div>
          </div>
          <div className="text-3xl font-black text-stone-900">
            {activeFulfillments.length}{' '}
            <span className="text-xs font-semibold text-stone-400">canales</span>
          </div>
          <p className="text-xs text-emerald-700 font-semibold mt-1 truncate">
            {activeFulfillments.join(', ') || 'Sin canales'}
          </p>
        </div>

        <div className="rounded-3xl p-6 bg-white border border-stone-200/80 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between text-stone-500 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Seguridad PostgreSQL</span>
            <div className="h-9 w-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <ShieldCheck className="h-4 w-4" />
            </div>
          </div>
          <div className="text-xl font-black text-stone-900 mt-1">RLS Multi-Tenant</div>
          <p className="text-xs text-purple-700 font-semibold mt-1">Aislamiento por sede y actor</p>
        </div>

        <div className="rounded-3xl p-6 bg-white border border-stone-200/80 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between text-stone-500 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Rol de Usuario</span>
            <div className="h-9 w-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Users2 className="h-4 w-4" />
            </div>
          </div>
          <div className="text-xl font-black text-stone-900 mt-1">{user?.roleKey || 'TENANT_ADMIN'}</div>
          <p className="text-xs text-amber-700 font-semibold mt-1">Control maestro de sucursales</p>
        </div>
      </div>

      {/* Módulos Operativos */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-extrabold text-stone-900 tracking-tight">
              Módulos del Sistema Operativo
            </h2>
            <p className="text-xs text-stone-500">
              Acceso a las áreas funcionales de tu restaurante
            </p>
          </div>
          <Link
            to="/admin/capabilities"
            className="text-xs font-bold text-orange-600 hover:text-orange-700 inline-flex items-center gap-1.5"
          >
            Modificar Perfil
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {modulesList.map((item) => {
            const enabled = hasModule(item.key);
            const Icon = item.icon;
            return (
              <Link
                key={item.key}
                to={item.path}
                className={`rounded-3xl p-6 border transition-all flex flex-col justify-between ${
                  enabled
                    ? 'bg-white border-stone-200/80 hover:border-orange-300 hover:shadow-md shadow-sm'
                    : 'bg-stone-50/60 border-stone-200/50 opacity-60'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="h-11 w-11 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center">
                      <Icon className="h-5 w-5" />
                    </div>
                    <span
                      className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full ${
                        enabled
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-stone-200 text-stone-600'
                      }`}
                    >
                      {enabled ? 'ACTIVO' : 'INACTIVO'}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-stone-900">{item.title}</h3>
                  <p className="text-xs text-stone-500 mt-1 leading-relaxed">{item.desc}</p>
                </div>

                <div className="mt-5 pt-3 border-t border-stone-100 flex items-center justify-between text-[11px] font-semibold text-stone-400">
                  <span>{item.phase}</span>
                  <span className="text-orange-600 flex items-center gap-1 group-hover:translate-x-1 transition">
                    Ver <ArrowRight className="h-3 w-3" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Auditoría Reciente */}
      <div className="rounded-3xl bg-white border border-stone-200/80 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-stone-100">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-orange-600" />
            <h2 className="text-xs font-bold text-stone-900 uppercase tracking-wider">
              Trazabilidad y Auditoría en Tiempo Real
            </h2>
          </div>
          <span className="text-[11px] text-stone-400">Eventos de seguridad y operación</span>
        </div>

        {auditEvents.length === 0 ? (
          <p className="text-xs text-stone-400 py-4 text-center">
            No se han registrado eventos recientes en esta sucursal.
          </p>
        ) : (
          <div className="divide-y divide-stone-100 text-xs">
            {auditEvents.map((ev) => (
              <div key={ev.id} className="py-2.5 flex items-center justify-between">
                <div>
                  <span className="font-bold text-stone-800 mr-2">{ev.action}</span>
                  <span className="text-stone-500 font-mono text-[11px]">{ev.entity_type}</span>
                </div>
                <span className="text-stone-400 text-[11px]">
                  {new Date(ev.occurred_at || ev.created_at || Date.now()).toLocaleTimeString('es-CO')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
