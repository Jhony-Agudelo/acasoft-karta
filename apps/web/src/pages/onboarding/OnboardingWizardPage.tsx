import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';
import { useBrandStore } from '../../stores/brand.store';
import { apiClient } from '../../services/api-client';
import {
  Sparkles,
  Building2,
  Sliders,
  Wallet,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Store,
  Phone,
  QrCode,
  Palette,
  Check,
} from 'lucide-react';
import { OPERATING_PROFILES } from '@restaurante-saas/shared';

export const OnboardingWizardPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentBranchId } = useAuthStore();
  const { setBrandSettings } = useBrandStore();

  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Paso 1: Marca y Sucursal
  const [brandName, setBrandName] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#0284c7');
  const [secondaryColor, setSecondaryColor] = useState('#f97316');
  const [branchAddress, setBranchAddress] = useState('Carrera 7 # 71-21');
  const [branchCity, setBranchCity] = useState('Bogotá');
  const [branchWhatsApp, setBranchWhatsApp] = useState('3001234567');

  // Paso 2: Perfil Operativo
  const [selectedProfile, setSelectedProfile] = useState<string>('FULL_PANEL');

  // Paso 3: Métodos de Pago
  const [nequiPhone, setNequiPhone] = useState('3001234567');
  const [daviplataPhone, setDaviplataPhone] = useState('3001234567');
  const [brebKey, setBrebKey] = useState('');
  const [customInstructions, setCustomInstructions] = useState(
    'Por favor enviar comprobante de pago por WhatsApp con el número de pedido.',
  );

  // Cargar datos actuales de marca
  useEffect(() => {
    apiClient.get('/admin/brand').then((brand) => {
      if (brand) {
        setBrandName(brand.display_name || '');
        if (brand.primary_color) setPrimaryColor(brand.primary_color);
        if (brand.secondary_color) setSecondaryColor(brand.secondary_color);
      }
    }).catch(() => {});
  }, []);

  const handleFinishOnboarding = async () => {
    setIsSubmitting(true);
    try {
      // 1. Guardar Brand Settings
      await apiClient.patch('/admin/brand', {
        display_name: brandName,
        primary_color: primaryColor,
        secondary_color: secondaryColor,
        receipt_footer_text: `¡Gracias por preferir a ${brandName}!`,
      });

      setBrandSettings({
        display_name: brandName,
        primary_color: primaryColor,
        secondary_color: secondaryColor,
      });

      // 2. Aplicar Perfil Operativo a la Sucursal Activa
      if (currentBranchId) {
        await apiClient.put(`/admin/branches/${currentBranchId}/profile/${selectedProfile}`, {});

        // 3. Configurar Instrucciones de Pago en DELIVERY y PICKUP
        const paymentPayload = {
          payment_policy: 'OFFLINE_ONLY',
          require_payment_before_preparation: false,
          payment_instructions_json: {
            nequi_phone: nequiPhone ? `+57${nequiPhone}` : undefined,
            daviplata_phone: daviplataPhone ? `+57${daviplataPhone}` : undefined,
            bre_b_key: brebKey || undefined,
            custom_instructions: customInstructions,
          },
        };

        await apiClient.patch(
          `/admin/branches/${currentBranchId}/channel-policies/DELIVERY`,
          paymentPayload,
        );
        await apiClient.patch(
          `/admin/branches/${currentBranchId}/channel-policies/PICKUP`,
          paymentPayload,
        );
      }

      navigate('/dashboard');
    } catch (error) {
      console.error('Error al finalizar onboarding:', error);
      // Aun así navegar al dashboard
      navigate('/dashboard');
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentProfileData = OPERATING_PROFILES[selectedProfile as keyof typeof OPERATING_PROFILES];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between py-8 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-4xl mx-auto w-full">
        {/* Header con Stepper */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 rounded-full bg-sky-500/10 border border-sky-500/20 px-4 py-1.5 text-xs font-semibold text-sky-400 mb-2">
            <Sparkles className="h-4 w-4" />
            Asistente de Configuración Inicial
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            Prepara tu Restaurante en 3 Pasos
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            Personaliza tu identidad, activa los módulos para tu modelo de negocio y conecta métodos de cobro
          </p>

          {/* Stepper Dots */}
          <div className="flex items-center justify-center gap-3 sm:gap-6 mt-6">
            {[
              { num: 1, label: 'Marca & Sede', icon: Building2 },
              { num: 2, label: 'Perfil Operativo', icon: Sliders },
              { num: 3, label: 'Métodos de Pago', icon: Wallet },
            ].map((s) => {
              const active = step === s.num;
              const completed = step > s.num;
              const Icon = s.icon;
              return (
                <div key={s.num} className="flex items-center gap-2">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-xl text-xs font-bold transition-all ${
                      completed
                        ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                        : active
                        ? 'bg-sky-500 text-white shadow-md shadow-sky-500/20 ring-4 ring-sky-500/10'
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}
                  >
                    {completed ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  </div>
                  <span
                    className={`text-xs font-semibold hidden sm:inline ${
                      active ? 'text-white' : completed ? 'text-slate-300' : 'text-slate-500'
                    }`}
                  >
                    {s.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Wizard Card Content */}
        <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 sm:p-10 shadow-2xl">
          {/* PASO 1: MARCA Y SUCURSAL */}
          {step === 1 && (
            <div className="space-y-6 animate-fade-in">
              <div className="border-b border-slate-800 pb-4">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-sky-400" />
                  Identidad Visual y Sede Principal
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Define los colores con los que tus comensales reconocerán tu carta digital y facturas.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                    Nombre Comercial
                  </label>
                  <input
                    type="text"
                    value={brandName}
                    onChange={(e) => setBrandName(e.target.value)}
                    placeholder="Ej. El Buen Sabor"
                    className="w-full rounded-xl bg-slate-800 border border-slate-700 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Palette className="h-3.5 w-3.5 text-sky-400" />
                      Color Primario
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        className="h-10 w-12 rounded-lg cursor-pointer bg-transparent border-0"
                      />
                      <span className="text-xs font-mono text-slate-300">{primaryColor}</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Palette className="h-3.5 w-3.5 text-orange-400" />
                      Color Secundario
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={secondaryColor}
                        onChange={(e) => setSecondaryColor(e.target.value)}
                        className="h-10 w-12 rounded-lg cursor-pointer bg-transparent border-0"
                      />
                      <span className="text-xs font-mono text-slate-300">{secondaryColor}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Live Preview Card */}
              <div className="rounded-2xl p-4 border border-slate-800 bg-slate-950/60 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="h-12 w-12 rounded-xl flex items-center justify-center font-bold text-white shadow-md text-lg"
                    style={{ backgroundColor: primaryColor }}
                  >
                    {brandName ? brandName.charAt(0).toUpperCase() : 'R'}
                  </div>
                  <div>
                    <span className="text-sm font-bold text-white block">
                      {brandName || 'Tu Restaurante'}
                    </span>
                    <span className="text-xs text-slate-400">Previsualización de marca en vivo</span>
                  </div>
                </div>
                <div
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white shadow-sm"
                  style={{ backgroundColor: secondaryColor }}
                >
                  Pedir por WhatsApp
                </div>
              </div>

              {/* Datos de Sede */}
              <div className="pt-4 border-t border-slate-800 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <Store className="h-3.5 w-3.5 text-slate-400" />
                    Dirección Sede
                  </label>
                  <input
                    type="text"
                    value={branchAddress}
                    onChange={(e) => setBranchAddress(e.target.value)}
                    className="w-full rounded-xl bg-slate-800 border border-slate-700 px-3.5 py-2 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Ciudad
                  </label>
                  <input
                    type="text"
                    value={branchCity}
                    onChange={(e) => setBranchCity(e.target.value)}
                    className="w-full rounded-xl bg-slate-800 border border-slate-700 px-3.5 py-2 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5 text-emerald-400" />
                    WhatsApp Recepción Pedidos
                  </label>
                  <input
                    type="text"
                    value={branchWhatsApp}
                    onChange={(e) => setBranchWhatsApp(e.target.value)}
                    className="w-full rounded-xl bg-slate-800 border border-slate-700 px-3.5 py-2 text-sm text-white font-mono"
                  />
                </div>
              </div>
            </div>
          )}

          {/* PASO 2: PERFIL OPERATIVO */}
          {step === 2 && (
            <div className="space-y-6 animate-fade-in">
              <div className="border-b border-slate-800 pb-4">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Sliders className="h-5 w-5 text-sky-400" />
                  Elige tu Perfil Operativo
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Configura de un solo clic los módulos ideales para cómo trabaja tu negocio. Puedes modificarlos en cualquier momento.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(OPERATING_PROFILES).map(([key, prof]) => {
                  const selected = selectedProfile === key;
                  return (
                    <div
                      key={key}
                      onClick={() => setSelectedProfile(key)}
                      className={`cursor-pointer rounded-2xl p-4 border transition-all relative ${
                        selected
                          ? 'bg-sky-500/10 border-sky-500 shadow-lg shadow-sky-500/10 ring-1 ring-sky-500'
                          : 'bg-slate-800/60 border-slate-700 hover:border-slate-600'
                      }`}
                    >
                      {selected && (
                        <div className="absolute top-4 right-4 flex h-6 w-6 items-center justify-center rounded-full bg-sky-500 text-white">
                          <Check className="h-3.5 w-3.5" />
                        </div>
                      )}
                      <h3 className="text-sm font-bold text-white">{prof.name}</h3>
                      <p className="text-xs text-slate-400 mt-1 pr-6">{prof.description}</p>

                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {prof.module_keys.slice(0, 5).map((mod) => (
                          <span
                            key={mod}
                            className="inline-block rounded-md bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-300"
                          >
                            {mod}
                          </span>
                        ))}
                        {prof.module_keys.length > 5 && (
                          <span className="inline-block rounded-md bg-slate-800/50 px-2 py-0.5 text-[10px] text-slate-500">
                            +{prof.module_keys.length - 5} más
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {currentProfileData && (
                <div className="rounded-2xl p-4 bg-slate-950/70 border border-slate-800 text-xs text-slate-300">
                  <span className="font-bold text-sky-400 block mb-1">
                    Configuración de {currentProfileData.name}:
                  </span>
                  <div className="flex flex-wrap gap-4 mt-2">
                    <span>
                      Módulos incluidos: <strong>{currentProfileData.module_keys.length} módulos</strong>
                    </span>
                    <span>
                      Cobro inicial en Pickup/Delivery:{' '}
                      <strong>{currentProfileData.default_pickup_delivery_policy}</strong>
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* PASO 3: MÉTODOS DE PAGO COLOMBIANOS */}
          {step === 3 && (
            <div className="space-y-6 animate-fade-in">
              <div className="border-b border-slate-800 pb-4">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Wallet className="h-5 w-5 text-emerald-400" />
                  Cuentas de Cobro Digital en Colombia
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Los clientes que hagan pedidos por WhatsApp o carta digital verán estos datos para realizar sus transferencias inmediatas.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Nequi */}
                <div className="rounded-2xl p-4 bg-slate-800/70 border border-slate-700/80">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-6 w-6 rounded-md bg-purple-500/20 text-purple-400 flex items-center justify-center font-black text-xs">
                      N
                    </div>
                    <span className="text-xs font-bold text-white uppercase tracking-wider">
                      Cuenta Nequi
                    </span>
                  </div>
                  <input
                    type="tel"
                    value={nequiPhone}
                    onChange={(e) => setNequiPhone(e.target.value)}
                    placeholder="3001234567"
                    className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3.5 py-2 text-sm text-white font-mono"
                  />
                </div>

                {/* DaviPlata */}
                <div className="rounded-2xl p-4 bg-slate-800/70 border border-slate-700/80">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-6 w-6 rounded-md bg-rose-500/20 text-rose-400 flex items-center justify-center font-black text-xs">
                      D
                    </div>
                    <span className="text-xs font-bold text-white uppercase tracking-wider">
                      Cuenta DaviPlata
                    </span>
                  </div>
                  <input
                    type="tel"
                    value={daviplataPhone}
                    onChange={(e) => setDaviplataPhone(e.target.value)}
                    placeholder="3001234567"
                    className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3.5 py-2 text-sm text-white font-mono"
                  />
                </div>

                {/* Llave Bre-B */}
                <div className="rounded-2xl p-4 bg-slate-800/70 border border-slate-700/80 md:col-span-2">
                  <div className="flex items-center gap-2 mb-2">
                    <QrCode className="h-4 w-4 text-sky-400" />
                    <span className="text-xs font-bold text-white uppercase tracking-wider">
                      Llave Bre-B del Banco de la República (Interoperable)
                    </span>
                  </div>
                  <input
                    type="text"
                    value={brebKey}
                    onChange={(e) => setBrebKey(e.target.value)}
                    placeholder="Ej. NIT 901234567 o Identificador Bre-B"
                    className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3.5 py-2 text-sm text-white"
                  />
                </div>

                {/* Instrucciones Adicionales */}
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                    Instrucciones para el Comensal
                  </label>
                  <textarea
                    rows={2}
                    value={customInstructions}
                    onChange={(e) => setCustomInstructions(e.target.value)}
                    className="w-full rounded-xl bg-slate-800 border border-slate-700 p-3 text-xs text-white"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Stepper Navigation Buttons */}
          <div className="mt-8 pt-6 border-t border-slate-800 flex items-center justify-between">
            {step > 1 ? (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-4 py-2.5 text-xs font-semibold text-slate-300 hover:bg-slate-800 transition"
              >
                <ArrowLeft className="h-4 w-4" />
                Paso Anterior
              </button>
            ) : (
              <div />
            )}

            {step < 3 ? (
              <button
                type="button"
                onClick={() => setStep(step + 1)}
                className="inline-flex items-center gap-2 rounded-xl bg-sky-500 hover:bg-sky-400 px-6 py-2.5 text-xs font-semibold text-white shadow-lg shadow-sky-500/25 transition"
              >
                Siguiente Paso
                <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleFinishOnboarding}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 px-6 py-2.5 text-xs font-semibold text-white shadow-lg shadow-emerald-500/25 transition disabled:opacity-50"
              >
                {isSubmitting ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Finalizar y Comenzar a Operar
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
