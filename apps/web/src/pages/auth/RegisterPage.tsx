import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';
import { apiClient, ApiError } from '../../services/api-client';
import {
  Utensils,
  Building2,
  User,
  Mail,
  Lock,
  Phone,
  ArrowRight,
  AlertCircle,
  Sparkles,
  Flame,
  ChefHat,
  Store,
} from 'lucide-react';

export const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const { setSession } = useAuthStore();
  const [formData, setFormData] = useState({
    organization_name: '',
    slug: '',
    admin_name: '',
    admin_email: '',
    admin_password: '',
    admin_phone: '',
    plan_id: 'PLAN_OPERATIONS_PRO',
    initial_profile: 'FULL_PANEL',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleNameChange = (name: string) => {
    const slug = name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    setFormData((prev) => ({ ...prev, organization_name: name, slug }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsLoading(true);

    try {
      const data = await apiClient.post('/auth/register', formData);
      const userPayload = {
        id: data.user.id,
        name: data.user.name,
        email: data.user.email,
        phone: data.user.phone,
        tenantId: data.tenantId,
        roleKey: data.user.roleKey,
        permissions: data.user.permissions || [],
        branchScope: data.user.branchScope || null,
        mustChangePassword: false,
      };

      setSession(userPayload, data.accessToken);
      navigate('/onboarding');
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.data.message || 'Error en el registro');
      } else {
        setErrorMessage('No fue posible conectar con el servidor');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#faf8f5] flex flex-col lg:flex-row font-sans text-stone-800">
      {/* SECCIÓN IZQUIERDA: HERO CON IMAGEN GASTRONÓMICA */}
      <div className="relative hidden lg:flex lg:w-1/2 xl:w-5/12 bg-stone-900 overflow-hidden items-end p-12">
        <img
          src="/images/karta-hero.jpg"
          alt="Karta Gastronomía"
          className="absolute inset-0 h-full w-full object-cover object-center opacity-85 transition-transform duration-1000 hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-stone-950 via-stone-950/40 to-transparent" />

        <div className="relative z-10 max-w-xl text-white">
          <div className="inline-flex items-center gap-2 rounded-full bg-orange-500/20 backdrop-blur-md border border-orange-400/30 px-3.5 py-1.5 text-xs font-bold text-orange-200 mb-4 shadow-sm">
            <Sparkles className="h-4 w-4 text-orange-400" />
            Empieza hoy con 14 días gratis
          </div>
          <h1 className="text-3xl xl:text-4xl font-black tracking-tight leading-tight drop-shadow-md">
            Lleva tu restaurante al siguiente nivel con <span className="text-orange-400">Karta</span>.
          </h1>
          <p className="mt-3 text-sm text-stone-300 leading-relaxed drop-shadow">
            Carta digital interactiva, cocina conectada en tiempo real y cobros automáticos para negocios gastronómicos que buscan crecer sin fricción.
          </p>
        </div>
      </div>

      {/* SECCIÓN DERECHA: REGISTRO DE RESTAURANTE */}
      <div className="flex-1 flex flex-col justify-center px-6 py-12 sm:px-10 lg:px-14 xl:px-16 bg-[#faf8f5] overflow-y-auto">
        <div className="mx-auto w-full max-w-xl">
          {/* Logo Karta */}
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
            <Link
              to="/login"
              className="flex-1 py-2.5 rounded-xl text-stone-600 hover:text-stone-900 text-center transition"
            >
              Iniciar Sesión
            </Link>
            <button
              type="button"
              className="flex-1 py-2.5 rounded-xl bg-white text-stone-900 shadow-sm transition"
            >
              Registrarse
            </button>
          </div>

          {/* Tarjeta de Registro */}
          <div className="bg-white rounded-3xl p-8 shadow-xl shadow-stone-200/50 border border-stone-100">
            <div className="mb-6">
              <h2 className="text-xl font-bold tracking-tight text-stone-900">
                Crear Cuenta de Restaurante
              </h2>
              <p className="text-xs text-stone-500 mt-1">
                Configuración inmediata de tu marca y sede principal en Colombia
              </p>
            </div>

            {errorMessage && (
              <div className="mb-5 flex items-start gap-3 rounded-2xl bg-rose-50 border border-rose-200 p-3.5 text-xs text-rose-700">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
                <span>{errorMessage}</span>
              </div>
            )}

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                    Nombre del Restaurante
                  </label>
                  <div className="relative rounded-xl">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                      <Building2 className="h-4 w-4 text-stone-400" />
                    </div>
                    <input
                      type="text"
                      required
                      value={formData.organization_name}
                      onChange={(e) => handleNameChange(e.target.value)}
                      placeholder="Ej. Trattoria Gourmet"
                      className="block w-full rounded-xl bg-stone-50 border border-stone-200 pl-10 pr-3.5 py-2.5 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:bg-white transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                    Identificador / Slug
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.slug}
                    onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                    placeholder="trattoria-gourmet"
                    className="block w-full rounded-xl bg-stone-50 border border-stone-200 px-3.5 py-2.5 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:bg-white transition font-mono text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                    Nombre del Propietario / Admin
                  </label>
                  <div className="relative rounded-xl">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                      <User className="h-4 w-4 text-stone-400" />
                    </div>
                    <input
                      type="text"
                      required
                      value={formData.admin_name}
                      onChange={(e) => setFormData({ ...formData, admin_name: e.target.value })}
                      placeholder="Carolina Restrepo"
                      className="block w-full rounded-xl bg-stone-50 border border-stone-200 pl-10 pr-3.5 py-2.5 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:bg-white transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                    WhatsApp Móvil (Colombia)
                  </label>
                  <div className="relative rounded-xl">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                      <Phone className="h-4 w-4 text-emerald-500" />
                    </div>
                    <input
                      type="tel"
                      required
                      value={formData.admin_phone}
                      onChange={(e) => setFormData({ ...formData, admin_phone: e.target.value })}
                      placeholder="3001234567"
                      className="block w-full rounded-xl bg-stone-50 border border-stone-200 pl-10 pr-3.5 py-2.5 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:bg-white transition font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                      value={formData.admin_email}
                      onChange={(e) => setFormData({ ...formData, admin_email: e.target.value })}
                      placeholder="admin@trattoria.co"
                      className="block w-full rounded-xl bg-stone-50 border border-stone-200 pl-10 pr-3.5 py-2.5 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:bg-white transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                    Contraseña (mínimo 8 caracteres)
                  </label>
                  <div className="relative rounded-xl">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                      <Lock className="h-4 w-4 text-stone-400" />
                    </div>
                    <input
                      type="password"
                      required
                      value={formData.admin_password}
                      onChange={(e) => setFormData({ ...formData, admin_password: e.target.value })}
                      placeholder="••••••••••••"
                      className="block w-full rounded-xl bg-stone-50 border border-stone-200 pl-10 pr-3.5 py-2.5 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:bg-white transition"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div>
                  <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                    Perfil Operativo
                  </label>
                  <select
                    value={formData.initial_profile}
                    onChange={(e) => setFormData({ ...formData, initial_profile: e.target.value })}
                    className="w-full rounded-xl bg-stone-50 border border-stone-200 px-3.5 py-2.5 text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:bg-white transition"
                  >
                    <option value="FULL_PANEL">Panel Completo (Salón, Cocina y Domicilios)</option>
                    <option value="DINING_ROOM">Restaurante con Salón y Meseros</option>
                    <option value="WHATSAPP_SIMPLE">Pedidos Rápidos por WhatsApp</option>
                    <option value="MENU_ONLY">Solo Menú Digital</option>
                    <option value="ENTERPRISE_MULTI">Multi-sucursal Completo</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                    Plan Inicial
                  </label>
                  <select
                    value={formData.plan_id}
                    onChange={(e) => setFormData({ ...formData, plan_id: e.target.value })}
                    className="w-full rounded-xl bg-stone-50 border border-stone-200 px-3.5 py-2.5 text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:bg-white transition"
                  >
                    <option value="PLAN_OPERATIONS_PRO">Operations Pro (Recomendado)</option>
                    <option value="PLAN_STARTER_WHATSAPP">Starter WhatsApp</option>
                    <option value="PLAN_ENTERPRISE_DINING">Enterprise Dining</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-600 to-amber-500 py-3.5 px-4 text-sm font-bold text-white shadow-lg shadow-orange-500/25 hover:shadow-orange-500/40 hover:from-orange-500 hover:to-amber-400 transition disabled:opacity-50 mt-4"
              >
                {isLoading ? (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <>
                    Crear Restaurante y Comenzar
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
