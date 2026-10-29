import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../services/api-client';
import { formatMoneyCop } from '@restaurante-saas/shared';
import {
  X,
  Search,
  Plus,
  Minus,
  Trash2,
  Send,
  AlertCircle,
  ChefHat,
  UtensilsCrossed,
  Sparkles,
} from 'lucide-react';

interface WaiterOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  accountId: string;
  tableCode: string;
  accountCode: string;
  accountVersion: number;
  onSuccess: () => void;
}

interface CartItemEntry {
  tempId: string;
  productId: string;
  productName: string;
  variantId?: string | null;
  variantName?: string | null;
  unitPriceCop: number;
  quantity: number;
  notes?: string;
  modifiers: Array<{ group_id: string; option_id: string }>;
}

export const WaiterOrderModal: React.FC<WaiterOrderModalProps> = ({
  isOpen,
  onClose,
  accountId,
  tableCode,
  accountCode,
  accountVersion,
  onSuccess,
}) => {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<CartItemEntry[]>([]);
  const [orderNotes, setOrderNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentVersion, setCurrentVersion] = useState<number>(accountVersion);

  // Sincronizar version recibida por props
  React.useEffect(() => {
    setCurrentVersion(accountVersion);
  }, [accountVersion]);

  // Cargar categorías y productos
  const { data: categories = [] } = useQuery<any[]>({
    queryKey: ['admin-categories'],
    queryFn: () => apiClient.get('/admin/categories'),
    enabled: isOpen,
  });

  const { data: products = [], isLoading: isLoadingProducts } = useQuery<any[]>({
    queryKey: ['admin-products'],
    queryFn: () => apiClient.get('/admin/products'),
    enabled: isOpen,
  });

  // Filtrar productos activos
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (p.status === 'ARCHIVED') return false;
      if (selectedCategoryId && p.category_id !== selectedCategoryId) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [products, selectedCategoryId, searchQuery]);

  if (!isOpen) return null;

  const addItemToCart = (product: any, variant?: any) => {
    const tempId = `${product.id}-${variant?.id || 'base'}`;
    const unitPrice = variant ? variant.price_cop : product.price_cop;

    setCart((prev) => {
      const existing = prev.find((it) => it.tempId === tempId);
      if (existing) {
        return prev.map((it) =>
          it.tempId === tempId ? { ...it, quantity: it.quantity + 1 } : it,
        );
      }
      return [
        ...prev,
        {
          tempId,
          productId: product.id,
          productName: product.name,
          variantId: variant?.id || null,
          variantName: variant?.name || null,
          unitPriceCop: unitPrice,
          quantity: 1,
          modifiers: [],
          notes: '',
        },
      ];
    });
  };

  const updateQuantity = (tempId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((it) => {
          if (it.tempId === tempId) {
            const newQty = it.quantity + delta;
            return newQty > 0 ? { ...it, quantity: newQty } : null;
          }
          return it;
        })
        .filter(Boolean) as CartItemEntry[],
    );
  };

  const updateItemNotes = (tempId: string, notes: string) => {
    setCart((prev) =>
      prev.map((it) => (it.tempId === tempId ? { ...it, notes } : it)),
    );
  };

  const orderSubtotalCop = cart.reduce(
    (sum, it) => sum + it.unitPriceCop * it.quantity,
    0,
  );

  const handleSubmitOrder = async () => {
    if (cart.length === 0) return;
    setError(null);
    setIsSubmitting(true);

    try {
      const payload = {
        expected_account_version: currentVersion,
        notes: orderNotes.trim() || null,
        items: cart.map((it) => ({
          product_id: it.productId,
          variant_id: it.variantId || null,
          quantity: it.quantity,
          modifiers: it.modifiers,
          notes: it.notes?.trim() || null,
        })),
      };

      const res = await apiClient.post(`/accounts/${accountId}/orders`, payload);

      if (res.account?.version) {
        setCurrentVersion(res.account.version);
      }

      setCart([]);
      setOrderNotes('');
      onSuccess();
      onClose();
    } catch (err: any) {
      if (err?.response?.data?.errorCode === 'ACCOUNT_VERSION_CONFLICT') {
        const serverVersion = err?.response?.data?.current_version;
        if (serverVersion) setCurrentVersion(serverVersion);
        setError(
          'La cuenta fue actualizada por otro mesero o caja. Versión sincronizada, por favor confirma el envío nuevamente.',
        );
      } else {
        setError(
          err?.response?.data?.message ||
            err?.message ||
            'No se pudo enviar la comanda a la cuenta.',
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/70 backdrop-blur-xs p-3 sm:p-6 overflow-hidden">
      <div className="bg-white rounded-3xl max-w-6xl w-full h-[90vh] flex flex-col shadow-2xl border border-stone-200 overflow-hidden animate-slide-up">
        {/* TopBar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100 bg-stone-50/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-orange-600 text-white flex items-center justify-center font-black text-sm shadow-md shadow-orange-500/20">
              {tableCode}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-stone-900 text-base">
                  Tomar Comanda — Mesa {tableCode}
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-stone-200 text-stone-700 font-mono">
                  {accountCode}
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-mono">
                  v{currentVersion}
                </span>
              </div>
              <p className="text-xs text-stone-500">
                Selecciona los platos o bebidas para enviar de inmediato a Cocina KDS
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Error notification */}
        {error && (
          <div className="px-6 py-2.5 bg-amber-50 border-b border-amber-200 text-xs text-amber-800 flex items-center gap-2 shrink-0">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Dual Panel Body */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Panel Izquierdo: Catálogo y Búsqueda */}
          <div className="flex-1 flex flex-col min-w-0 border-r border-stone-100">
            {/* Buscador y Categorías */}
            <div className="p-4 border-b border-stone-100 space-y-3 bg-white shrink-0">
              <div className="relative">
                <Search className="absolute left-3.5 top-3 h-4 w-4 text-stone-400" />
                <input
                  type="text"
                  placeholder="Buscar producto por nombre o descripción..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-stone-50 border border-stone-200 text-xs text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-orange-500 transition"
                />
              </div>

              {/* Categorías Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                <button
                  onClick={() => setSelectedCategoryId(null)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                    selectedCategoryId === null
                      ? 'bg-orange-600 text-white shadow-xs'
                      : 'bg-stone-100 text-stone-600 hover:bg-stone-200/70'
                  }`}
                >
                  Todos ({products.length})
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategoryId(cat.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                      selectedCategoryId === cat.id
                        ? 'bg-orange-600 text-white shadow-xs'
                        : 'bg-stone-100 text-stone-600 hover:bg-stone-200/70'
                    }`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Grid de Productos */}
            <div className="flex-1 overflow-y-auto p-4">
              {isLoadingProducts ? (
                <div className="flex items-center justify-center h-48 text-stone-400 text-xs">
                  Cargando catálogo...
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="text-center py-12 text-stone-400 text-xs space-y-2">
                  <UtensilsCrossed className="h-8 w-8 mx-auto text-stone-300" />
                  <p>No se encontraron productos disponibles en esta categoría.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {filteredProducts.map((p) => {
                    const isOutOfStock = p.status === 'OUT_OF_STOCK';
                    return (
                      <div
                        key={p.id}
                        className={`p-3.5 rounded-2xl border text-left flex flex-col justify-between transition ${
                          isOutOfStock
                            ? 'bg-stone-50 border-stone-200 opacity-60'
                            : 'bg-white border-stone-200/80 hover:border-orange-300 hover:shadow-md'
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="font-extrabold text-stone-900 text-xs leading-snug line-clamp-2">
                              {p.name}
                            </h4>
                            {isOutOfStock && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">
                                Agotado
                              </span>
                            )}
                          </div>
                          {p.description && (
                            <p className="text-[11px] text-stone-400 line-clamp-1">
                              {p.description}
                            </p>
                          )}
                        </div>

                        <div className="pt-3 flex items-center justify-between mt-auto">
                          <span className="text-xs font-mono font-bold text-stone-900">
                            {formatMoneyCop(p.price_cop)}
                          </span>

                          {p.variants && p.variants.length > 0 ? (
                            <div className="flex items-center gap-1">
                              {p.variants.map((v: any) => (
                                <button
                                  key={v.id}
                                  type="button"
                                  disabled={isOutOfStock}
                                  onClick={() => addItemToCart(p, v)}
                                  className="text-[10px] font-bold px-2 py-1 rounded-lg bg-orange-50 text-orange-600 hover:bg-orange-100 border border-orange-200 transition"
                                >
                                  + {v.name}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <button
                              type="button"
                              disabled={isOutOfStock}
                              onClick={() => addItemToCart(p)}
                              className="h-8 w-8 rounded-xl bg-orange-50 hover:bg-orange-600 text-orange-600 hover:text-white border border-orange-200 hover:border-orange-600 flex items-center justify-center transition shadow-xs disabled:opacity-50"
                            >
                              <Plus className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Panel Derecho: Carrito de Comanda */}
          <div className="w-96 flex flex-col bg-stone-50/60 shrink-0">
            {/* Header comanda */}
            <div className="p-4 border-b border-stone-200/80 bg-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <ChefHat className="h-4 w-4 text-orange-600" />
                <h4 className="font-extrabold text-stone-900 text-xs">
                  Ítems de esta Comanda
                </h4>
              </div>
              <span className="text-xs font-bold text-orange-600">
                {cart.reduce((sum, it) => sum + it.quantity, 0)} ítem(s)
              </span>
            </div>

            {/* Lista de ítems en carrito */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
              {cart.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-stone-400 p-6 space-y-2">
                  <UtensilsCrossed className="h-8 w-8 text-stone-300" />
                  <p className="text-xs font-bold text-stone-500">
                    Aún no has agregado ningún plato
                  </p>
                  <p className="text-[11px]">
                    Haz clic en "+" en los productos del catálogo para armar la comanda.
                  </p>
                </div>
              ) : (
                cart.map((it) => (
                  <div
                    key={it.tempId}
                    className="p-3 rounded-2xl bg-white border border-stone-200/90 shadow-xs space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h5 className="font-bold text-stone-900 text-xs">
                          {it.productName}
                        </h5>
                        {it.variantName && (
                          <span className="text-[10px] font-semibold text-stone-500">
                            ({it.variantName})
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-mono font-bold text-stone-900">
                        {formatMoneyCop(it.unitPriceCop * it.quantity)}
                      </span>
                    </div>

                    {/* Notas para cocina */}
                    <input
                      type="text"
                      placeholder="Nota para cocina (ej. sin picante)..."
                      value={it.notes || ''}
                      onChange={(e) => updateItemNotes(it.tempId, e.target.value)}
                      className="w-full px-2.5 py-1 text-[11px] rounded-lg bg-stone-50 border border-stone-200 focus:outline-none focus:ring-1 focus:ring-orange-500"
                    />

                    {/* Controles de cantidad */}
                    <div className="flex items-center justify-between pt-1">
                      <button
                        onClick={() => updateQuantity(it.tempId, -it.quantity)}
                        className="text-[10px] font-bold text-rose-600 hover:underline flex items-center gap-1"
                      >
                        <Trash2 className="h-3 w-3" />
                        Quitar
                      </button>

                      <div className="flex items-center gap-2 border border-stone-200 rounded-lg bg-stone-50 px-2 py-0.5">
                        <button
                          onClick={() => updateQuantity(it.tempId, -1)}
                          className="text-stone-500 hover:text-stone-900"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="text-xs font-bold font-mono w-4 text-center">
                          {it.quantity}
                        </span>
                        <button
                          onClick={() => updateQuantity(it.tempId, 1)}
                          className="text-stone-500 hover:text-stone-900"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer con Total y Botón de Enviar a Cocina */}
            <div className="p-4 border-t border-stone-200 bg-white space-y-3 shrink-0">
              <input
                type="text"
                placeholder="Observación general para la comanda..."
                value={orderNotes}
                onChange={(e) => setOrderNotes(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl bg-stone-50 border border-stone-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />

              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-stone-600">Subtotal Comanda:</span>
                <span className="font-black text-stone-900 text-sm font-mono">
                  {formatMoneyCop(orderSubtotalCop)}
                </span>
              </div>

              <button
                type="button"
                disabled={cart.length === 0 || isSubmitting}
                onClick={handleSubmitOrder}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-700 hover:to-amber-600 text-white font-extrabold text-xs shadow-md shadow-orange-600/25 transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                <span>
                  {isSubmitting
                    ? 'Enviando comanda a cocina...'
                    : 'Confirmar y Enviar a Cocina KDS'}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
