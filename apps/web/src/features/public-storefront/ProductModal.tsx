import React, { useState, useMemo } from 'react';
import {
  calculateLinePricing,
  validateModifierSelections,
  TaxProfileMode,
  TaxType,
} from '@restaurante-saas/shared';
import { X, Plus, Minus, AlertCircle, Check, Info } from 'lucide-react';
import { CartModifierItem } from '../../stores/cart.store';

interface ProductModalProps {
  product: {
    id: string;
    name: string;
    description?: string | null;
    image_url?: string | null;
    price_cop: number;
    status: string;
    allergen_tags?: string[];
    variants?: Array<{
      id: string;
      name: string;
      price_cop: number;
      status: string;
    }>;
    modifier_groups?: Array<{
      id: string;
      name: string;
      min_selections: number;
      max_selections: number;
      is_required: boolean;
      options: Array<{
        id: string;
        name: string;
        extra_price_cop: number;
        status: 'ACTIVE' | 'OUT_OF_STOCK';
      }>;
    }>;
  };
  taxProfile: {
    tax_profile_mode: TaxProfileMode;
    tax_type?: TaxType;
    tax_rate_bp?: number;
  };
  canOrder: boolean;
  onClose: () => void;
  onAddToCart: (item: {
    product_id: string;
    product_name: string;
    image_url?: string | null;
    variant_id?: string | null;
    variant_name?: string | null;
    unit_price_cop: number;
    quantity: number;
    modifiers: CartModifierItem[];
    notes?: string;
  }) => void;
}

export const ProductModal: React.FC<ProductModalProps> = ({
  product,
  taxProfile,
  canOrder,
  onClose,
  onAddToCart,
}) => {
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    product.variants && product.variants.length > 0 ? product.variants[0]!.id : null,
  );

  // Mapa de opciones elegidas por grupo: groupId -> array de optionIds
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string[]>>(() => {
    const initial: Record<string, string[]> = {};
    if (product.modifier_groups) {
      for (const group of product.modifier_groups) {
        if (group.is_required && group.min_selections >= 1 && group.max_selections === 1) {
          const firstActive = group.options.find((o) => o.status === 'ACTIVE');
          if (firstActive) {
            initial[group.id] = [firstActive.id];
          }
        }
      }
    }
    return initial;
  });
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');

  const selectedVariant = product.variants?.find((v) => v.id === selectedVariantId);
  const basePriceCop = selectedVariant ? selectedVariant.price_cop : product.price_cop;

  // Flatten de modificadores seleccionados con su extra_price_cop y group_id
  const selectedModifiersList: CartModifierItem[] = useMemo(() => {
    const list: CartModifierItem[] = [];
    if (!product.modifier_groups) return list;

    for (const group of product.modifier_groups) {
      const chosenIds = selectedOptions[group.id] || [];
      for (const optId of chosenIds) {
        const opt = group.options.find((o) => o.id === optId);
        if (opt) {
          list.push({
            id: opt.id,
            group_id: group.id,
            name: opt.name,
            extra_price_cop: opt.extra_price_cop,
          });
        }
      }
    }
    return list;
  }, [product.modifier_groups, selectedOptions]);

  // Validación de modificadores
  const modifierValidation = useMemo(() => {
    return validateModifierSelections(product.modifier_groups || [], selectedOptions);
  }, [product.modifier_groups, selectedOptions]);

  // Cálculo en vivo de línea
  const pricing = useMemo(() => {
    return calculateLinePricing({
      basePriceCop,
      modifiers: selectedModifiersList,
      quantity,
      taxProfileMode: taxProfile.tax_profile_mode,
      taxType: taxProfile.tax_type || 'NONE',
      taxRateBp: taxProfile.tax_rate_bp ?? 0,
    });
  }, [basePriceCop, selectedModifiersList, quantity, taxProfile]);

  const handleToggleOption = (
    groupId: string,
    optionId: string,
    maxSelections: number,
  ) => {
    const current = selectedOptions[groupId] || [];
    if (current.includes(optionId)) {
      setSelectedOptions({
        ...selectedOptions,
        [groupId]: current.filter((id) => id !== optionId),
      });
    } else {
      if (maxSelections === 1) {
        // Selección única (radio behavior)
        setSelectedOptions({
          ...selectedOptions,
          [groupId]: [optionId],
        });
      } else {
        if (current.length < maxSelections) {
          setSelectedOptions({
            ...selectedOptions,
            [groupId]: [...current, optionId],
          });
        }
      }
    }
  };

  const handleConfirm = () => {
    if (!canOrder || !modifierValidation.isValid) return;

    onAddToCart({
      product_id: product.id,
      product_name: product.name,
      image_url: product.image_url,
      variant_id: selectedVariant?.id || null,
      variant_name: selectedVariant?.name || null,
      unit_price_cop: basePriceCop,
      quantity,
      modifiers: selectedModifiersList,
      notes: notes.trim() || undefined,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-stone-900/60 backdrop-blur-xs p-0 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl border border-stone-200 shadow-2xl w-full max-w-lg overflow-hidden animate-slide-up sm:animate-scale-in max-h-[90vh] flex flex-col">
        {/* Header con foto opcional */}
        <div className="relative">
          {product.image_url ? (
            <div className="h-44 w-full bg-stone-100 overflow-hidden">
              <img
                src={product.image_url}
                alt={product.name}
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="h-24 w-full bg-gradient-to-r from-orange-600 to-amber-500" />
          )}

          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-1.5 rounded-full bg-white/80 hover:bg-white text-stone-700 backdrop-blur-xs shadow-md transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1">
          <div>
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-extrabold text-stone-900">{product.name}</h2>
              <span className="text-base font-black text-stone-900 whitespace-nowrap">
                ${basePriceCop.toLocaleString('es-CO')}
              </span>
            </div>
            {product.description && (
              <p className="text-xs text-stone-600 mt-1 leading-relaxed">
                {product.description}
              </p>
            )}

            {/* Alérgenos */}
            {product.allergen_tags && product.allergen_tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {product.allergen_tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[10px] font-medium bg-stone-100 text-stone-600 px-2 py-0.5 rounded-md"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Variantes si existen */}
          {product.variants && product.variants.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-stone-100">
              <label className="text-xs font-bold text-stone-800 uppercase tracking-wider block">
                Selecciona una opción
              </label>
              <div className="space-y-1.5">
                {product.variants.map((v) => (
                  <label
                    key={v.id}
                    className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition ${
                      selectedVariantId === v.id
                        ? 'border-orange-600 bg-orange-50/50 text-orange-950 font-bold'
                        : 'border-stone-200 text-stone-700 hover:bg-stone-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="product_variant"
                        checked={selectedVariantId === v.id}
                        onChange={() => setSelectedVariantId(v.id)}
                        className="text-orange-600 focus:ring-orange-500"
                      />
                      <span className="text-xs">{v.name}</span>
                    </div>
                    <span className="text-xs font-bold font-mono">
                      ${v.price_cop.toLocaleString('es-CO')}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Grupos de Modificadores */}
          {product.modifier_groups && product.modifier_groups.length > 0 && (
            <div className="space-y-4 pt-2 border-t border-stone-100">
              {product.modifier_groups.map((group) => {
                const chosen = selectedOptions[group.id] || [];
                const isGroupSatisfied =
                  chosen.length >= group.min_selections &&
                  chosen.length <= group.max_selections;

                return (
                  <div key={group.id} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-stone-900 block">
                          {group.name}
                        </span>
                        <span className="text-[10px] text-stone-500">
                          {group.is_required
                            ? `Obligatorio (mínimo ${group.min_selections}, máximo ${group.max_selections})`
                            : `Opcional (hasta ${group.max_selections})`}
                        </span>
                      </div>
                      {group.is_required && (
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                            isGroupSatisfied
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                        >
                          {isGroupSatisfied ? 'Listo' : 'Requerido'}
                        </span>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      {group.options.map((opt) => {
                        const isSelected = chosen.includes(opt.id);
                        return (
                          <label
                            key={opt.id}
                            className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition ${
                              isSelected
                                ? 'border-orange-600 bg-orange-50/40 text-stone-900 font-semibold'
                                : 'border-stone-200 text-stone-700 hover:bg-stone-50'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <input
                                type={group.max_selections === 1 ? 'radio' : 'checkbox'}
                                name={`group-${group.id}`}
                                checked={isSelected}
                                onChange={() =>
                                  handleToggleOption(
                                    group.id,
                                    opt.id,
                                    group.max_selections,
                                  )
                                }
                                className="text-orange-600 focus:ring-orange-500 rounded"
                              />
                              <span className="text-xs">{opt.name}</span>
                            </div>
                            {opt.extra_price_cop > 0 && (
                              <span className="text-xs font-mono font-bold text-stone-700">
                                +${opt.extra_price_cop.toLocaleString('es-CO')}
                              </span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Notas especiales */}
          {canOrder && (
            <div className="pt-2 border-t border-stone-100">
              <label className="text-xs font-bold text-stone-700 block mb-1">
                Instrucciones especiales para cocina (opcional)
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ej. Sin cebolla, término medio, salsa aparte..."
                className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
              />
            </div>
          )}
        </div>

        {/* Footer adaptativo según capability ordering */}
        <div className="p-4 sm:p-5 border-t border-stone-100 bg-stone-50/70">
          {!canOrder ? (
            /* NIVEL 0: MENU_ONLY (Carta digital sin compras) */
            <div className="text-center py-2 space-y-1">
              <div className="inline-flex items-center gap-1.5 text-xs font-bold text-stone-700">
                <Info className="h-4 w-4 text-orange-600" />
                Carta Digital Informativa
              </div>
              <p className="text-[11px] text-stone-500">
                Para realizar tu pedido, comunícate directamente con el establecimiento o acércate a la barra.
              </p>
            </div>
          ) : (
            /* NIVEL 1+: ordering activo */
            <div className="flex items-center gap-3">
              {/* Stepper de cantidad */}
              <div className="flex items-center border border-stone-200 rounded-xl bg-white shadow-2xs">
                <button
                  type="button"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="p-2 text-stone-500 hover:text-stone-900"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="w-8 text-center text-xs font-extrabold text-stone-900">
                  {quantity}
                </span>
                <button
                  type="button"
                  onClick={() => setQuantity(quantity + 1)}
                  className="p-2 text-stone-500 hover:text-stone-900"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Botón de Agregar al Pedido */}
              <button
                type="button"
                id="btn-add-to-cart"
                onClick={handleConfirm}
                disabled={!modifierValidation.isValid}
                className="flex-1 py-3 px-4 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-black text-xs shadow-md shadow-orange-600/20 transition flex items-center justify-between disabled:opacity-50"
              >
                <span>
                  {!modifierValidation.isValid
                    ? 'Selecciona las opciones requeridas'
                    : 'Agregar al pedido'}
                </span>
                <span className="font-mono text-sm">
                  ${pricing.line_total_cop.toLocaleString('es-CO')}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
