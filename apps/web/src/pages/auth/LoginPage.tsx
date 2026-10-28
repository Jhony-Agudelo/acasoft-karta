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
  CheckCircle2,
  Store,
  Flame,
  Zap,
} from 'lucide-react';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { setSession, setUser } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fillDemoCredentials = () => {
    setEmail('admin@karta.co');
    setPassword('Password123!');
    setErrorMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsLoading(true);

    try {
      const data = await apiClient.post('/auth/session', { email, password });

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
        navigate('/dashboard');
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.data.errorCode === 'PASSWORD_CHANGE_REQUIRED') {
          setUser({
            id: '',
            name: '',
            email,
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

  return (
    <div className="min-h-screen bg-[#faf8f5] flex flex-col lg:flex-row font-sans text-stone-800">
      {/* SECCIÓN IZQUIERDA: HERO CON IMAGEN GASTRONÓMICA (SEGÚN MOCKUP) */}
      <div className="relative hidden lg:flex lg:w-1/2 xl:w-7/12 bg-stone-900 overflow-hidden items-end p-12">
        <img
          src="/images/karta-hero.jpg"
          alt="Restaurante Karta y Experiencia Gastronómica"
          className="absolute inset-0 h-full w-full object-cover object-center opacity-85 transition-transform duration-1000 hover:scale-105"
        />
        {/* Degradado cálido para legibilidad */}
        <div className="absolute inset-0 bg-gradient-to-t from-stone-950 via-stone-950/40 to-transparent" />

        <div className="relative z-10 max-w-xl text-white">
          <div className="inline-flex items-center gap-2 rounded-full bg-orange-500/20 backdrop-blur-md border border-orange-400/30 px-3.5 py-1.5 text-xs font-bold text-orange-200 mb-4 shadow-sm">
            <Flame className="h-4 w-4 text-orange-400" />
            Sistema Operativo para Restaurantes en Colombia
          </div>
          <h1 className="text-4xl xl:text-5xl font-black tracking-tight leading-tight drop-shadow-md">
            El ritmo de tu cocina y salón, <span className="text-orange-400">en perfecta armonía</span>.
          </h1>
          <p className="mt-4 text-sm text-stone-300 leading-relaxed drop-shadow">
            Gestiona comandas, mesas, pagos directos con Nequi, DaviPlata y Bre-B, cocina KDS y pedidos por WhatsApp desde una sola plataforma ágil y viva.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            {[
              { label: 'Salón & Meseros', icon: Utensils },
              { label: 'Cocina KDS', icon: ChefHat },
              { label: 'Domicilios & WhatsApp', icon: Store },
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

      {/* SECCIÓN DERECHA: TARJETA INICIAR O REGISTRARSE (SEGÚN MOCKUP) */}
      <div className="flex-1 flex flex-col justify-center px-6 py-12 sm:px-10 lg:px-14 xl:px-20 bg-[#faf8f5]">
        <div className="mx-auto w-full max-w-md">
          {/* Logo y Nombre Karta */}
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-orange-600 to-amber-500 text-white shadow-lg shadow-orange-500/30">
              <Utensils className="h-6 w-6" />
            </div>
            <div>
              <span className="text-2xl font-black tracking-tight text-stone-900">
                Karta<span className="text-orange-600">.</span>
              </span>
              <span className="block text-xs font-semibold uppercase tracking-wider text-stone-500">
                Sistema Operativo Gastronómico
              </span>
            </div>
          </div>

          {/* Selector de Pestañas: Iniciar o Registrarse */}
          <div className="flex rounded-2xl bg-stone-200/80 p-1 mb-6 text-xs font-bold">
            <button
              type="button"
              className="flex-1 py-2.5 rounded-xl bg-white text-stone-900 shadow-sm transition"
            >
              Iniciar Sesión
            </button>
            <Link
              to="/register"
              className="flex-1 py-2.5 rounded-xl text-stone-600 hover:text-stone-900 text-center transition"
            >
              Registrarse
            </Link>
          </div>

          {/* Tarjeta de Formulario */}
          <div className="bg-white rounded-3xl p-8 shadow-xl shadow-stone-200/50 border border-stone-100">
            <div className="mb-6">
              <h2 className="text-xl font-bold tracking-tight text-stone-900">
                ¡Bienvenido de vuelta!
              </h2>
              <p className="text-xs text-stone-500 mt-1">
                Ingresa tus credenciales para administrar tu restaurante
              </p>
            </div>

            {/* Botón de Relleno Rápido de Demo (Responde a la duda del usuario) */}
            <div className="mb-6 rounded-2xl bg-orange-50/80 border border-orange-200/60 p-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-orange-900">
                  <Sparkles className="h-4 w-4 text-orange-600" />
                  Acceso Demo Preconfigurado
                </div>
                <button
                  type="button"
                  onClick={fillDemoCredentials}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-orange-700 bg-orange-100 hover:bg-orange-200/80 px-2.5 py-1 rounded-lg transition"
                >
                  <Zap className="h-3 w-3" />
                  Cargar Datos
                </button>
              </div>
              <p className="text-[11px] text-orange-800/80 mt-1">
                Email: <strong className="font-mono">admin@karta.co</strong> | Clave:{' '}
                <strong className="font-mono">Password123!</strong>
              </p>
            </div>

            {errorMessage && (
              <div className="mb-5 flex items-start gap-3 rounded-2xl bg-rose-50 border border-rose-200 p-3.5 text-xs text-rose-700">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
                <span>{errorMessage}</span>
              </div>
            )}

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
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
                    placeholder="admin@karta.co"
                    className="block w-full rounded-xl bg-stone-50 border border-stone-200 pl-10 pr-3.5 py-2.5 text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:bg-white transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                  Contraseña
                </label>
                <div className="relative rounded-xl">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                    <Lock className="h-4 w-4 text-stone-400" />
                  </div>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="block w-full rounded-xl bg-stone-50 border border-stone-200 pl-10 pr-3.5 py-2.5 text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:bg-white transition"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-xs pt-1">
                <span className="text-stone-500">¿Clave temporal de staff?</span>
                <span className="text-orange-600 font-semibold">Podrás renovarla al ingresar</span>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-600 to-amber-500 py-3 px-4 text-sm font-bold text-white shadow-lg shadow-orange-500/25 hover:shadow-orange-500/40 hover:from-orange-500 hover:to-amber-400 transition disabled:opacity-50 mt-2"
              >
                {isLoading ? (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <>
                    Ingresar al Restaurante
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 border-t border-stone-100 pt-5 text-center">
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
