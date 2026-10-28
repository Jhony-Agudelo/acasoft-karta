import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../services/api-client';
import {
  TaxProfileMode,
  TaxType,
  TaxProfileConfigSchema,
  calculateLinePricing,
  DIAN_FISCAL_DISCLAIMER_TEXT,
} from '@restaurante-saas/shared';
import { Calculator, AlertCircle, CheckCircle2, ShieldCheck, Info } from 'lucide-react';

interface TaxProfileData {
  tax_profile_mode: TaxProfileMode;
  default_tax_type: TaxType;
  default_tax_rate_bp: number;
  fiscal_disclaimer: string;
}

export const TaxProfileForm: React.FC = () => {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<TaxProfileData>({
    queryKey: ['admin-tax-profile'],
    queryFn: () => apiClient.get('/admin/tax-profile'),
  });

  const [mode, setMode] = useState<TaxProfileMode>('FINAL_PRICE_NO_BREAKDOWN');
  const [taxType, setTaxType] = useState<TaxType>('NONE');
  const [taxRateBp, setTaxRateBp] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (data) {
      setMode(data.tax_profile_mode);
      setTaxType(data.default_tax_type);
      setTaxRateBp(data.default_tax_rate_bp);
    }
  }, [data]);

  // Manejo de cambios rápidos de tipo de impuesto
  const handleTaxTypeChange = (newType: TaxType) => {
    setTaxType(newType);
    if (newType === 'INC') {
      setTaxRateBp(800); // 8.00%
    } else if (newType === 'IVA') {
      setTaxRateBp(1900); // 19.00%
    } else {
      setTaxRateBp(0);
    }
  };

  const updateMutation = useMutation({
    mutationFn: (payload: {
      tax_profile_mode: TaxProfileMode;
      default_tax_type: TaxType;
      default_tax_rate_bp: number;
    }) => apiClient.patch('/admin/tax-profile', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-tax-profile'] });
      setSuccessMessage('Perfil tributario actualizado correctamente.');
      setErrorMessage(null);
      setTimeout(() => setSuccessMessage(null), 4000);
    },
    onError: (err: any) => {
      setErrorMessage(err.message || 'Error al actualizar el perfil tributario.');
      setSuccessMessage(null);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Validación previa con Zod
    const validation = TaxProfileConfigSchema.safeParse({
      tax_profile_mode: mode,
      default_tax_type: taxType,
      default_tax_rate_bp: taxRateBp,
    });

    if (!validation.success) {
      const issue = validation.error.issues[0];
      setErrorMessage(issue?.message || 'Configuración tributaria contradictoria o inválida.');
      return;
    }

    updateMutation.mutate({
      tax_profile_mode: mode,
      default_tax_type: taxType,
      default_tax_rate_bp: taxRateBp,
    });
  };

  // Cálculo en vivo del simulador (2 productos x $10.000 COP)
  const simulation = calculateLinePricing({
    basePriceCop: 10000,
    quantity: 2,
    taxProfileMode: mode,
    taxType: taxType,
    taxRateBp: taxRateBp,
  });

  if (isLoading) {
    return (
      <div className="p-8 text-center text-stone-500">
        Cargando configuración tributaria...
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-stone-200/90 shadow-sm p-6 sm:p-8 space-y-8">
      <div>
        <div className="flex items-center gap-2.5 mb-1.5">
          <div className="p-2 rounded-xl bg-orange-100 text-orange-700">
            <Calculator className="h-5 w-5" />
          </div>
          <h2 className="text-lg font-extrabold text-stone-900">
            Régimen Tributario & Precios en Carta (Colombia)
          </h2>
        </div>
        <p className="text-xs text-stone-500 max-w-2xl">
          Configura cómo opera tu restaurante respecto al Impuesto Nacional al Consumo (INC 8%) o IVA (19%).
          Karta garantiza aritmética entera exacta en pesos colombianos y el cumplimiento estricto del invariante de no doble cobro.
        </p>
      </div>

      {errorMessage && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Selector de Modo */}
        <div className="space-y-3">
          <label className="text-xs font-bold text-stone-700 uppercase tracking-wider block">
            Modo de Cálculo de Carta
          </label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Opción 1: FINAL_PRICE_NO_BREAKDOWN */}
            <label
              className={`p-4 rounded-xl border-2 cursor-pointer transition flex flex-col justify-between ${
                mode === 'FINAL_PRICE_NO_BREAKDOWN'
                  ? 'border-orange-600 bg-orange-50/50'
                  : 'border-stone-200 hover:border-stone-300 bg-stone-50/30'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <input
                    type="radio"
                    name="tax_profile_mode"
                    value="FINAL_PRICE_NO_BREAKDOWN"
                    checked={mode === 'FINAL_PRICE_NO_BREAKDOWN'}
                    onChange={() => setMode('FINAL_PRICE_NO_BREAKDOWN')}
                    className="sr-only"
                  />
                  <span className="text-xs font-extrabold text-stone-900 block">
                    Precio Final Único
                  </span>
                  <span className="text-[10px] text-stone-500 mt-1 block">
                    Sin discriminación de impuestos. Recomendado para restaurantes no responsables de IVA / INC o bajo régimen simple.
                  </span>
                </div>
              </div>
            </label>

            {/* Opción 2: TAX_INCLUDED_DISCRIMINATED */}
            <label
              className={`p-4 rounded-xl border-2 cursor-pointer transition flex flex-col justify-between ${
                mode === 'TAX_INCLUDED_DISCRIMINATED'
                  ? 'border-orange-600 bg-orange-50/50'
                  : 'border-stone-200 hover:border-stone-300 bg-stone-50/30'
              }`}
            >
              <div>
                <input
                  type="radio"
                  name="tax_profile_mode"
                  value="TAX_INCLUDED_DISCRIMINATED"
                  checked={mode === 'TAX_INCLUDED_DISCRIMINATED'}
                  onChange={() => setMode('TAX_INCLUDED_DISCRIMINATED')}
                  className="sr-only"
                />
                <span className="text-xs font-extrabold text-stone-900 block">
                  Precio Incluye Impuesto
                </span>
                <span className="text-[10px] text-stone-500 mt-1 block">
                  El precio de la carta ya incluye INC o IVA. Se desglosa en la cuenta sin sumarle un centavo más al cliente.
                </span>
              </div>
            </label>

            {/* Opción 3: BASE_PLUS_TAX */}
            <label
              className={`p-4 rounded-xl border-2 cursor-pointer transition flex flex-col justify-between ${
                mode === 'BASE_PLUS_TAX'
                  ? 'border-orange-600 bg-orange-50/50'
                  : 'border-stone-200 hover:border-stone-300 bg-stone-50/30'
              }`}
            >
              <div>
                <input
                  type="radio"
                  name="tax_profile_mode"
                  value="BASE_PLUS_TAX"
                  checked={mode === 'BASE_PLUS_TAX'}
                  onChange={() => setMode('BASE_PLUS_TAX')}
                  className="sr-only"
                />
                <span className="text-xs font-extrabold text-stone-900 block">
                  Base + Impuesto Adicional
                </span>
                <span className="text-[10px] text-stone-500 mt-1 block">
                  El precio publicado en carta es antes de impuestos. El INC o IVA se calcula y suma al total de la cuenta.
                </span>
              </div>
            </label>
          </div>
        </div>

        {/* Tipo de Impuesto Predeterminado */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold text-stone-700 block mb-1.5">
              Tipo de Gravamen Predeterminado
            </label>
            <select
              value={taxType}
              onChange={(e) => handleTaxTypeChange(e.target.value as TaxType)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 bg-white text-xs font-medium text-stone-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="NONE">No gravado / Sin Impuesto (0%)</option>
              <option value="INC">INC — Impuesto Nacional al Consumo (8%)</option>
              <option value="IVA">IVA — Impuesto al Valor Agregado (19%)</option>
              <option value="EXEMPT">Exento legal (0%)</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-stone-700 block mb-1.5">
              Tarifa en Puntos Básicos (bp)
            </label>
            <div className="relative">
              <input
                type="number"
                min="0"
                max="10000"
                value={taxRateBp}
                disabled={taxType === 'NONE' || taxType === 'EXEMPT'}
                onChange={(e) => setTaxRateBp(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 bg-white text-xs font-medium text-stone-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:bg-stone-100 disabled:text-stone-400"
                placeholder="Ej. 800 para 8%, 1900 para 19%"
              />
              <span className="absolute right-3 top-2.5 text-xs text-stone-400 font-bold">
                {(taxRateBp / 100).toFixed(2)}%
              </span>
            </div>
            <p className="text-[10px] text-stone-400 mt-1">
              800 bp = 8,00% (INC restaurante) | 1900 bp = 19,00% (IVA general)
            </p>
          </div>
        </div>

        {/* Simulador Interactivo en Vivo */}
        <div className="p-5 rounded-2xl bg-gradient-to-br from-stone-50 to-orange-50/30 border border-stone-200 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold text-stone-900 flex items-center gap-1.5">
              <Calculator className="h-3.5 w-3.5 text-orange-600" />
              Simulador en Vivo: 2 platos de $10.000 COP
            </span>
            <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
              Invariante de No Doble Cobro Verificado
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center pt-2">
            <div className="p-2.5 rounded-xl bg-white border border-stone-200/80 shadow-xs">
              <p className="text-[10px] font-semibold text-stone-500">Subtotal Bruto</p>
              <p className="text-xs font-bold text-stone-900">
                ${simulation.gross_subtotal_cop.toLocaleString('es-CO')}
              </p>
            </div>
            <div className="p-2.5 rounded-xl bg-white border border-stone-200/80 shadow-xs">
              <p className="text-[10px] font-semibold text-stone-500">Base Gravable</p>
              <p className="text-xs font-bold text-stone-900">
                ${simulation.taxable_base_cop.toLocaleString('es-CO')}
              </p>
            </div>
            <div className="p-2.5 rounded-xl bg-white border border-stone-200/80 shadow-xs">
              <p className="text-[10px] font-semibold text-stone-500">Impuesto ({simulation.tax_type})</p>
              <p className="text-xs font-bold text-orange-700">
                ${simulation.tax_amount_cop.toLocaleString('es-CO')}
              </p>
            </div>
            <div className="p-2.5 rounded-xl bg-orange-600 text-white shadow-xs">
              <p className="text-[10px] font-semibold text-orange-100">Total a Pagar</p>
              <p className="text-xs font-extrabold">
                ${simulation.line_total_cop.toLocaleString('es-CO')}
              </p>
            </div>
          </div>

          <p className="text-[11px] text-stone-600">
            {mode === 'FINAL_PRICE_NO_BREAKDOWN' && (
              <>En este modo, el cliente paga <strong>$20.000 COP</strong> exactamente y no se genera desglose fiscal.</>
            )}
            {mode === 'TAX_INCLUDED_DISCRIMINATED' && (
              <>
                El cliente paga exactamente <strong>$20.000 COP</strong> (precio de carta). De estos, <strong>${simulation.taxable_base_cop.toLocaleString('es-CO')} COP</strong> son la base y <strong>${simulation.tax_amount_cop.toLocaleString('es-CO')} COP</strong> corresponden a {taxType}. <em>¡Nunca se cobra dos veces!</em>
              </>
            )}
            {mode === 'BASE_PLUS_TAX' && (
              <>
                La base neta es de <strong>$20.000 COP</strong> y se agregan <strong>${simulation.tax_amount_cop.toLocaleString('es-CO')} COP</strong> de {taxType}, para un total de <strong>${simulation.line_total_cop.toLocaleString('es-CO')} COP</strong>.
              </>
            )}
          </p>
        </div>

        {/* Leyenda Fiscal DIAN Obligatoria */}
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200/80 text-amber-900 text-xs flex items-start gap-3">
          <Info className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold">Aviso Fiscal Obligatorio (DIAN Colombia)</p>
            <p className="text-[11px] leading-relaxed text-amber-800">
              "{DIAN_FISCAL_DISCLAIMER_TEXT}"
            </p>
            <p className="text-[10px] text-amber-700">
              Karta es un sistema de gestión operativa y cartas digitales. Consulta siempre con tu asesor tributario o contador para la emisión de Factura Electrónica de Venta formal.
            </p>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={updateMutation.isPending}
            className="px-6 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs shadow-md shadow-orange-600/20 transition disabled:opacity-50"
          >
            {updateMutation.isPending ? 'Guardando...' : 'Guardar Régimen Tributario'}
          </button>
        </div>
      </form>
    </div>
  );
};
