import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';
import { apiClient, ApiError } from '../../services/api-client';
import {
  Utensils,
  Lock,
  Mail,
  ArrowRight,
  AlertCircle,
  Sparkles,
  ChefHat,
  Flame,
  Zap,
  Crown,
  Building2,
  CreditCard,
  UtensilsCrossed,
  Truck,
  ShieldCheck,
  Check,
  Eye,
  EyeOff,
  Store,
  HelpCircle,
} from 'lucide-react';

interface TestRole {
  id: string;
  name: string;
  roleKey: string;
  badge: string;
  email: string;
  password: string;
  icon: React.ComponentType<{ className?: string }>;
  accentBorder: string;
  accentBg: string;
  accentText: string;
  badgeClass: string;
  summary: string;
  capabilities: string[];
  suggestedRoute: string;
}

const TEST_ROLES: TestRole[] = [
  {
    id: 'TENANT_ADMIN',
    name: 'Carlos Propietario',
    roleKey: 'TENANT_ADMIN',
    badge: 'ADMIN / PROPIETARIO',
    email: 'admin@karta.co',
    password: 'Password123!',
    icon: Crown,
    accentBorder: 'border-orange-500',
    accentBg: 'bg-orange-50',
    accentText: 'text-orange-600',
    badgeClass: 'bg-orange-100 text-orange-800 border-orange-200',
    summary: 'Control maestro de la organización: configuración general, menú, capacidades, personal, tributación y reportes financieros.',
    capabilities: ['Control Total', 'Capacidades Modulares', 'Reportes & Conciliación', 'Menú & Precios', 'Salón & KDS'],
    suggestedRoute: '/dashboard',
  },
  {
    id: 'BRANCH_MANAGER',
    name: 'Laura Gerente',
    roleKey: 'BRANCH_MANAGER',
    badge: 'GERENTE DE SEDE',
    email: 'gerente@karta.co',
    password: 'Password123!',
    icon: Building2,
    accentBorder: 'border-blue-500',
    accentBg: 'bg-blue-50',
    accentText: 'text-blue-600',
    badgeClass: 'bg-blue-100 text-blue-800 border-blue-200',
    summary: 'Operación de sede: anulación supervisada de cobros (void), resoluciones contables (cortesía/castigo) y reapertura de cuentas.',
    capabilities: ['Anulación de Pagos (Void)', 'Reapertura Contable / Mesas', 'Resoluciones Especiales', 'Salón & KDS', 'Reportes de Sede'],
    suggestedRoute: '/dining',
  },
  {
    id: 'CASHIER',
    name: 'Mateo Cajero',
    roleKey: 'CASHIER',
    badge: 'CAJERO / CAJA',
    email: 'cajero@karta.co',
    password: 'Password123!',
    icon: CreditCard,
    accentBorder: 'border-emerald-500',
    accentBg: 'bg-emerald-50',
    accentText: 'text-emerald-600',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    summary: 'Liquidación de pre-cuentas de salón, cobros en caja (efectivo con cálculo de cambio, datáfono, transferencia) y cierre de cuentas.',
    capabilities: ['Cobro en Caja (Cash/POS)', 'Cálculo de Cambio', 'Pre-Cuentas Térmicas', 'Panel de Pedidos', 'Cierre de Cuentas'],
    suggestedRoute: '/dining',
  },
  {
    id: 'WAITER',
    name: 'Juan Mesero',
    roleKey: 'WAITER',
    badge: 'MESERO / SALÓN',
    email: 'mesero@karta.co',
    password: 'Password123!',
    icon: UtensilsCrossed,
    accentBorder: 'border-purple-500',
    accentBg: 'bg-purple-50',
    accentText: 'text-purple-600',
    badgeClass: 'bg-purple-100 text-purple-800 border-purple-200',
    summary: 'Plano interactivo de mesas en tiempo real, apertura con PIN, comanda móvil rápida, confirmación 1-tap de pedidos QR y división por persona.',
    capabilities: ['Plano de Mesas en Vivo', 'Comandas Móviles', 'Confirmación 1-Tap QR', 'División x Persona', 'Traslado de Mesas'],
    suggestedRoute: '/dining',
  },
  {
    id: 'KITCHEN',
    name: 'Andrea Chef Cocina',
    roleKey: 'KITCHEN',
    badge: 'COCINA / KDS',
    email: 'cocina@karta.co',
    password: 'Password123!',
    icon: ChefHat,
    accentBorder: 'border-amber-500',
    accentBg: 'bg-amber-50',
    accentText: 'text-amber-600',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
    summary: 'Pantalla KDS en vivo (SSE): recepción de comandas de salón y domicilios, avance a "En Preparación" y "Listo para Servir".',
    capabilities: ['Pantalla KDS Viva (SSE)', 'Avance de Estados Cocina', 'Temporizadores de Comanda', 'Filtrado por Estación'],
    suggestedRoute: '/kds',
  },
  {
    id: 'PLATFORM_ADMIN',
    name: 'Sophia SaaS Admin',
    roleKey: 'PLATFORM_ADMIN',
    badge: 'SUPERADMIN SAAS',
    email: 'superadmin@karta.co',
    password: 'Password123!',
    icon: ShieldCheck,
    accentBorder: 'border-rose-500',
    accentBg: 'bg-rose-50',
    accentText: 'text-rose-600',
    badgeClass: 'bg-rose-100 text-rose-800 border-rose-200',
    summary: 'Administración SaaS de la plataforma: gestión de planes comerciales, módulos, estado de suscripciones y auditoría global.',
    capabilities: ['Planes Comerciales', 'Entitlements SaaS', 'Auditoría Global', 'Configuración de Red'],
    suggestedRoute: '/admin/capabilities',
  },
];

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { setSession, setUser } = useAuthStore();
  const [email, setEmail] = useState('admin@karta.co');
  const [password, setPassword] = useState('Password123!');
  const [selectedRole, setSelectedRole] = useState<TestRole>(TEST_ROLES[0]!);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSelectRole = (role: TestRole) => {
    setSelectedRole(role);
    setEmail(role.email);
    setPassword(role.password);
    setErrorMessage(null);
  };

  const performLogin = async (loginEmail: string, loginPassword: string, targetRoute?: string) => {
    setErrorMessage(null);
    setIsLoading(true);

    try {
      const data = await apiClient.post('/auth/session', {
        email: loginEmail,
        password: loginPassword,
      });

      const userPayload = {
        id: data.user.id,
        name: data.user.name,
        email: data.user.email,
        phone: data.user.phone,
        tenantId: data.tenantId,
        roleKey: data.user.roleKey,
        permissions: data.user.permissions || [],
        branchScope: data.user.branchScope || null,
        mustChangePassword: data.user.mustChangePassword,
      };

      setSession(userPayload, data.accessToken);

      if (data.user.mustChangePassword) {
        navigate('/change-password');
      } else {
        navigate(targetRoute || '/dashboard');
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.data.errorCode === 'PASSWORD_CHANGE_REQUIRED') {
          setUser({
            id: '',
            name: '',
            email: loginEmail,
            phone: '',
            tenantId: '',
            roleKey: '',
            permissions: [],
            branchScope: null,
            mustChangePassword: true,
          });
          navigate('/change-password');
          return;
        }
        setErrorMessage(err.data.message || 'Credenciales inválidas');
      } else {
        setErrorMessage('No fue posible conectar con el servidor');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await performLogin(email, password, selectedRole?.suggestedRoute);
  };

  return (
    <div className="min-h-screen bg-[#faf8f5] flex flex-col lg:flex-row font-sans text-stone-800">
      {/* SECCIÓN IZQUIERDA: HERO CON IMAGEN GASTRONÓMICA */}
      <div className="relative hidden lg:flex lg:w-5/12 xl:w-1/2 bg-stone-900 overflow-hidden items-end p-12">
        <img
          src="/images/karta-hero.jpg"
          alt="Restaurante Karta y Experiencia Gastronómica"
          className="absolute inset-0 h-full w-full object-cover object-center opacity-85 transition-transform duration-1000 hover:scale-105"
        />
        {/* Degradado cálido para legibilidad */}
        <div className="absolute inset-0 bg-gradient-to-t from-stone-950 via-stone-950/50 to-transparent" />

        <div className="relative z-10 max-w-xl text-white">
          <div className="inline-flex items-center gap-2 rounded-full bg-orange-500/20 backdrop-blur-md border border-orange-400/30 px-3.5 py-1.5 text-xs font-bold text-orange-200 mb-4 shadow-sm">
            <Flame className="h-4 w-4 text-orange-400" />
            Sistema Operativo Gastronómico Modular en Colombia
          </div>
          <h1 className="text-3xl xl:text-4xl font-black tracking-tight leading-tight drop-shadow-md">
            El ritmo de tu cocina, salón y caja, <span className="text-orange-400">en perfecta sincronía</span>.
          </h1>
          <p className="mt-4 text-xs xl:text-sm text-stone-300 leading-relaxed drop-shadow">
            Gestiona planos de mesas, comandas móviles, autopedidos QR con PIN, pantalla KDS de cocina, pagos manuales combinados y división informativa por comensal desde una sola plataforma.
          </p>

          <div className="mt-8 flex flex-wrap gap-2.5">
            {[
              { label: 'Salón & Meseros', icon: UtensilsCrossed },
              { label: 'Cocina KDS', icon: ChefHat },
              { label: 'Caja & Pre-Cuentas', icon: CreditCard },
              { label: 'Domicilios & Reparto', icon: Store },
            ].map((f, i) => {
              const Icon = f.icon;
              return (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded-xl bg-white/10 backdrop-blur-md border border-white/15 px-3 py-1.5 text-xs font-semibold text-white shadow-sm"
                >
                  <Icon className="h-3.5 w-3.5 text-orange-300" />
                  {f.label}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* SECCIÓN DERECHA: FORMULARIO Y SELECTOR DE ROLES */}
      <div className="flex-1 flex flex-col justify-center px-4 py-8 sm:px-8 lg:px-10 xl:px-14 bg-[#faf8f5] overflow-y-auto">
        <div className="mx-auto w-full max-w-xl">
          {/* Logo y Nombre Karta */}
          <div className="flex items-center justify-between gap-3 mb-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-tr from-orange-600 to-amber-500 text-white shadow-lg shadow-orange-500/30">
                <Utensils className="h-6 w-6" />
              </div>
              <div>
                <span className="text-2xl font-black tracking-tight text-stone-900">
                  Karta<span className="text-orange-600">.</span>
                </span>
                <span className="block text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                  Sistema Operativo Gastronómico
                </span>
              </div>
            </div>

            <div className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-stone-200/70 text-[11px] font-bold text-stone-600">
              <Sparkles className="h-3.5 w-3.5 text-orange-600" />
              Entorno Demo Activo
            </div>
          </div>

          {/* Selector de Pestañas: Iniciar o Registrarse */}
          <div className="flex rounded-2xl bg-stone-200/80 p-1 mb-5 text-xs font-bold">
            <button
              type="button"
              className="flex-1 py-2 rounded-xl bg-white text-stone-900 shadow-sm transition"
            >
              Iniciar Sesión
            </button>
            <Link
              to="/register"
              className="flex-1 py-2 rounded-xl text-stone-600 hover:text-stone-900 text-center transition"
            >
              Registrarse
            </Link>
          </div>

          {/* TARJETA PRINCIPAL */}
          <div className="bg-white rounded-3xl p-6 sm:p-7 shadow-xl shadow-stone-200/50 border border-stone-200/80">
            {/* SECCIÓN 1: INICIO RÁPIDO POR ROL */}
            <div className="mb-6 rounded-2xl bg-gradient-to-br from-stone-50 to-orange-50/50 border border-stone-200/90 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-orange-600 text-white shadow-sm">
                    <Zap className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-extrabold text-stone-900 tracking-tight">
                      Inicio Rápido por Rol para Pruebas
                    </h3>
                    <p className="text-[11px] text-stone-500">
                      Selecciona un rol operativo para probar sus permisos y vistas específicas:
                    </p>
                  </div>
                </div>
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 border border-orange-200">
                  {TEST_ROLES.length} Roles Listos
                </span>
              </div>

              {/* Grid de Botones de Rol */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                {TEST_ROLES.map((role) => {
                  const Icon = role.icon;
                  const isSelected = selectedRole.id === role.id;
                  return (
                    <button
                      key={role.id}
                      type="button"
                      onClick={() => handleSelectRole(role)}
                      className={`flex flex-col items-start p-2.5 rounded-xl border text-left transition-all relative ${
                        isSelected
                          ? `${role.accentBg} ${role.accentBorder} ring-2 ring-orange-500/30 shadow-sm`
                          : 'bg-white border-stone-200 hover:border-stone-300 hover:bg-stone-50/80'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-1">
                        <div
                          className={`flex h-6 w-6 items-center justify-center rounded-lg ${
                            isSelected ? 'bg-white shadow-xs text-stone-900' : 'bg-stone-100 text-stone-600'
                          }`}
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </div>
                        {isSelected && (
                          <div className="flex h-4 w-4 items-center justify-center rounded-full bg-orange-600 text-white">
                            <Check className="h-2.5 w-2.5" />
                          </div>
                        )}
                      </div>
                      <span className="text-[11px] font-bold text-stone-900 line-clamp-1 leading-tight">
                        {role.name}
                      </span>
                      <span className="text-[9px] font-semibold text-stone-500 line-clamp-1">
                        {role.roleKey}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Tarjeta de Información del Rol Seleccionado */}
              {selectedRole && (
                <div className="rounded-xl bg-white border border-stone-200/90 p-3 shadow-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-stone-100">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md border ${selectedRole.badgeClass}`}>
                        {selectedRole.badge}
                      </span>
                      <span className="text-xs font-bold text-stone-900">
                        {selectedRole.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-[11px] text-stone-500 font-mono">
                      <span>{selectedRole.email}</span>
                      <span>•</span>
                      <span className="text-stone-700 font-semibold">{selectedRole.password}</span>
                    </div>
                  </div>

                  <p className="text-[11px] text-stone-600 mt-2 leading-relaxed">
                    {selectedRole.summary}
                  </p>

                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mr-1">
                      Capacidades:
                    </span>
                    {selectedRole.capabilities.map((cap, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-md bg-stone-100 text-stone-700"
                      >
                        {cap}
                      </span>
                    ))}
                  </div>

                  {/* Botón de Acceso Rápido 1-Clic */}
                  <div className="mt-3 pt-2.5 border-t border-stone-100 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1 text-[11px] text-stone-500">
                      <HelpCircle className="h-3.5 w-3.5 text-stone-400" />
                      <span>Destino sugerido: <strong className="text-stone-700 font-mono">{selectedRole.suggestedRoute}</strong></span>
                    </div>

                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={() => performLogin(selectedRole.email, selectedRole.password, selectedRole.suggestedRoute)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-900 hover:bg-black text-white text-xs font-bold shadow-sm transition disabled:opacity-50"
                    >
                      <Zap className="h-3 w-3 text-orange-400 fill-orange-400" />
                      Acceder en 1-Clic como {selectedRole.name.split(' ')[0]}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* SECCIÓN 2: FORMULARIO DE INGRESO MANUAL */}
            <div className="relative mb-5 flex items-center justify-center">
              <div className="border-t border-stone-200 w-full" />
              <span className="bg-white px-3 text-[11px] font-bold uppercase tracking-wider text-stone-400 shrink-0">
                O credenciales directas
              </span>
            </div>

            {errorMessage && (
              <div className="mb-4 flex items-start gap-3 rounded-2xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
                <span>{errorMessage}</span>
              </div>
            )}

            <form className="space-y-3.5" onSubmit={handleSubmit}>
              <div>
                <label className="block text-[11px] font-bold text-stone-700 uppercase tracking-wider mb-1">
                  Correo Electrónico
                </label>
                <div className="relative rounded-xl">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                    <Mail className="h-4 w-4 text-stone-400" />
                  </div>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="usuario@karta.co"
                    className="block w-full rounded-xl bg-stone-50 border border-stone-200 pl-10 pr-3.5 py-2.5 text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:bg-white transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-stone-700 uppercase tracking-wider mb-1">
                  Contraseña
                </label>
                <div className="relative rounded-xl">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                    <Lock className="h-4 w-4 text-stone-400" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="block w-full rounded-xl bg-stone-50 border border-stone-200 pl-10 pr-10 py-2.5 text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:bg-white transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-stone-400 hover:text-stone-600 transition"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs pt-0.5">
                <span className="text-stone-500">¿Clave temporal de staff?</span>
                <span className="text-orange-600 font-semibold">Podrás renovarla al ingresar</span>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-600 to-amber-500 py-3 px-4 text-sm font-bold text-white shadow-lg shadow-orange-500/25 hover:shadow-orange-500/40 hover:from-orange-500 hover:to-amber-400 transition disabled:opacity-50 mt-1"
              >
                {isLoading ? (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <>
                    Ingresar con {email}
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-5 border-t border-stone-100 pt-4 text-center">
              <p className="text-xs text-stone-500">
                ¿No tienes una cuenta aún?{' '}
                <Link to="/register" className="font-bold text-orange-600 hover:text-orange-500">
                  Crea tu restaurante aquí
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
