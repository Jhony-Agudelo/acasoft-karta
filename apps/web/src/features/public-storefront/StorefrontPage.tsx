import React, { useState, useMemo } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../services/api-client';
import { useCartStore } from '../../stores/cart.store';
import { ProductModal } from './ProductModal';
import { CheckoutModal } from './CheckoutModal';
import { DeliveryAppStorefront } from './DeliveryAppStorefront';
import {
  DIAN_FISCAL_DISCLAIMER_TEXT,
  TaxProfileMode,
  TaxType,
} from '@restaurante-saas/shared';
import {
  Search,
  Store,
  Clock,
  Phone,
  MapPin,
  ShoppingBag,
  Info,
  ChevronRight,
  Plus,
  Minus,
  Trash2,
  X,
  AlertTriangle,
  Send,
  UtensilsCrossed,
} from 'lucide-react';


export const StorefrontPage: React.FC = () => {
  const { restaurantSlug = '', branchSlug } = useParams<{
    restaurantSlug: string;
    branchSlug?: string;
  }>();

  const [searchParams] = useSearchParams();
  const qrToken = searchParams.get('qr');

  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [isCartDrawerOpen, setIsCartDrawerOpen] = useState(false);
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);

  // 0. Resolver datos del QR si fue escaneado en mesa
  const { data: qrData } = useQuery({
    queryKey: ['public-qr-data', qrToken],
    queryFn: () => apiClient.get(`/public/qr/${qrToken}`),
    enabled: !!qrToken,
  });

  // 1. Obtener datos de la marca y sucursales
  const { data: storeInfo, isLoading: isLoadingStore } = useQuery({
    queryKey: ['public-restaurant-branches', restaurantSlug],
    queryFn: () => apiClient.get(`/public/${restaurantSlug}/branches`),
    enabled: !!restaurantSlug,
  });

  const tenant = storeInfo?.tenant;
  const brand = tenant?.brand_settings || {};
  const branches = storeInfo?.branches || [];

  // Determinar si la sesión proviene de un QR físico de mesa
  const isTableQr = Boolean(qrToken && (qrData ? qrData.target_type === 'DINING_TABLE' : true));

  // Resolver sucursal activa:
  // Si es un QR de mesa física, se BLOQUEA obligatoriamente a la sucursal de la mesa (qrData.branch_slug)
  // para evitar que el comensal cambie de sede y pierda la mesa física
  const currentBranch = useMemo(() => {
    if (isTableQr && qrData?.branch_slug) {
      const match = branches.find(
        (b: any) => b.slug === qrData.branch_slug || b.id === qrData.branch_id,
      );
      if (match) return match;
    }
    if (branchSlug) {
      return branches.find((b: any) => b.slug === branchSlug) || branches[0];
    }
    return branches.find((b: any) => b.is_default) || branches[0];
  }, [branches, branchSlug, isTableQr, qrData]);

  // 2. Obtener menú público sincronizado con la sucursal activa
  const activeBranchSlug = currentBranch?.slug || branchSlug;
  const { data: menuData, isLoading: isLoadingMenu } = useQuery({
    queryKey: ['public-restaurant-menu', restaurantSlug, activeBranchSlug],
    queryFn: () =>
      apiClient.get(
        `/public/${restaurantSlug}/menu${activeBranchSlug ? `?branchSlug=${activeBranchSlug}` : ''}`,
      ),
    enabled: !!restaurantSlug,
  });

  // Verificar si la sucursal tiene habilitado el módulo ordering o si está en mesa física
  const canOrder = Boolean(currentBranch?.capabilities?.ordering || isTableQr);

  // Store de Carrito: AISLAMIENTO ESTRICTO ENTRE PEDIDOS EN MESA Y DOMICILIO/RECOGIDA
  // Cada mesa física tiene su propia clave de carrito para evitar contaminación entre mesas o pedidos anteriores
  const storeKey = useMemo(() => {
    const branchPart = currentBranch?.slug || 'branch';
    if (isTableQr && qrToken) {
      const tablePart = qrData?.table_id ? `table-${qrData.table_id}` : `qr-${qrToken.slice(0, 16)}`;
      return `${restaurantSlug}/${branchPart}/${tablePart}`;
    }
    return `${restaurantSlug}/${branchPart}/takeout`;
  }, [restaurantSlug, currentBranch?.slug, isTableQr, qrToken, qrData?.table_id]);

  const cartStore = useCartStore();
  const cartItems = cartStore.getCartItems(storeKey);
  const cartSummary = cartStore.getCartSummary(storeKey);

  const taxProfile = {
    tax_profile_mode: (tenant?.tax_profile_mode ||
      'FINAL_PRICE_NO_BREAKDOWN') as TaxProfileMode,
    tax_type: (tenant?.default_tax_type || 'NONE') as TaxType,
    tax_rate_bp: tenant?.default_tax_rate_bp ?? 0,
  };

  // Filtrado de categorías y productos
  const categories = menuData?.categories || [];
  const filteredCategories = useMemo(() => {
    return categories
      .map((cat: any) => {
        const prods = (cat.products || []).filter((p: any) => {
          if (!searchQuery.trim()) return true;
          const q = searchQuery.toLowerCase();
          return (
            p.name.toLowerCase().includes(q) ||
            p.description?.toLowerCase().includes(q)
          );
        });
        return {
          ...cat,
          products: prods,
        };
      })
      .filter((cat: any) => {
        if (activeCategoryId && cat.id !== activeCategoryId) return false;
        return cat.products.length > 0;
      });
  }, [categories, activeCategoryId, searchQuery]);

  // Generar mensaje de pedido para WhatsApp
  const handleSendWhatsAppOrder = () => {
    if (!currentBranch?.phone) return;

    let text = `¡Hola! Quiero realizar un pedido en *${tenant?.name || 'Karta'}* (Sede ${currentBranch.name}):\n\n`;
    cartItems.forEach((it, idx) => {
      text += `*${it.quantity}x ${it.product_name}*`;
      if (it.variant_name) text += ` (${it.variant_name})`;
      text += ` — $${it.pricing.line_total_cop.toLocaleString('es-CO')}\n`;
      if (it.modifiers.length > 0) {
        text += `   + Adiciones: ${it.modifiers.map((m) => m.name).join(', ')}\n`;
      }
      if (it.notes) {
        text += `   Notas: _${it.notes}_\n`;
      }
    });

    text += `\n*Total estimado:* $${cartSummary.lineTotalCop.toLocaleString('es-CO')} COP\n`;
    text += `\n_${DIAN_FISCAL_DISCLAIMER_TEXT}_`;

    const cleanPhone = currentBranch.phone.replace(/[^0-9]/g, '');
    const url = `https://wa.me/57${cleanPhone}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  if (isLoadingStore || isLoadingMenu) {
    return (
      <div className="min-h-screen bg-[#faf8f5] flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="h-10 w-10 rounded-2xl bg-orange-600 animate-pulse mx-auto" />
          <p className="text-xs font-bold text-stone-600">Cargando menú digital...</p>
        </div>
      </div>
    );
  }

  // =========================================================================
  // MODO DELIVERY & PEDIDOS POR WHATSAPP (Cuando NO es QR de mesa física)
  // Brinda una experiencia de App de Comida moderna (estilo Rappi / Uber Eats)
  // =========================================================================
  if (!isTableQr) {
    return (
      <>
        <DeliveryAppStorefront
          tenant={tenant}
          currentBranch={currentBranch}
          branches={branches}
          restaurantSlug={restaurantSlug}
          categories={categories}
          canOrder={canOrder}
          cartItems={cartItems}
          cartSummary={cartSummary}
          onSelectProduct={(prod) => setSelectedProduct(prod)}
          onOpenCart={() => setIsCartDrawerOpen(true)}
          onOpenCheckout={() => setIsCheckoutModalOpen(true)}
        />

        {/* Modal de Detalle de Producto & Selección */}
        {selectedProduct && (
          <ProductModal
            product={selectedProduct}
            taxProfile={taxProfile}
            canOrder={canOrder}
            onClose={() => setSelectedProduct(null)}
            onAddToCart={(item) => cartStore.addItem(storeKey, item, taxProfile)}
          />
        )}

        {/* Drawer del Carrito */}
        {isCartDrawerOpen && (
          <div className="fixed inset-0 z-50 flex justify-end bg-stone-900/60 backdrop-blur-xs animate-fade-in">
            <div className="w-full max-w-md bg-white h-full flex flex-col justify-between shadow-2xl animate-slide-left">
              {/* Header del carrito */}
              <div className="flex items-center justify-between p-5 border-b border-stone-100">
                <div className="flex items-center gap-2">
                  <ShoppingBag className="h-5 w-5 text-orange-600" />
                  <h3 className="font-extrabold text-stone-900 text-base">
                    Mi Canasta de Pedido
                  </h3>
                  <span className="text-xs font-bold text-stone-400">
                    ({cartSummary.totalItems} ítems)
                  </span>
                </div>
                <button
                  onClick={() => setIsCartDrawerOpen(false)}
                  className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Lista de Ítems */}
              <div className="flex-1 overflow-y-auto p-5 space-y-3.5">
                {cartItems.map((it) => (
                  <div
                    key={it.id}
                    className="p-3.5 rounded-2xl border border-stone-200/90 bg-stone-50/50 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="text-xs font-bold text-stone-900">{it.product_name}</h4>
                        {it.variant_name && (
                          <p className="text-[10px] text-stone-500">{it.variant_name}</p>
                        )}
                        {it.modifiers.length > 0 && (
                          <p className="text-[10px] text-stone-500">
                            + {it.modifiers.map((m) => m.name).join(', ')}
                          </p>
                        )}
                        {it.notes && (
                          <p className="text-[10px] text-amber-700 italic">"{it.notes}"</p>
                        )}
                      </div>
                      <span className="text-xs font-bold text-stone-900 font-mono">
                        ${it.pricing.line_total_cop.toLocaleString('es-CO')}
                      </span>
                    </div>

                    {/* Controles de cantidad */}
                    <div className="flex items-center justify-between pt-1">
                      <button
                        onClick={() => cartStore.removeItem(storeKey, it.id)}
                        className="text-[10px] font-bold text-rose-600 hover:underline"
                      >
                        Eliminar
                      </button>
                      <div className="flex items-center gap-2 border border-stone-200 rounded-lg bg-white px-2 py-0.5">
                        <button
                          onClick={() =>
                            cartStore.updateQuantity(
                              storeKey,
                              it.id,
                              it.quantity - 1,
                              taxProfile,
                            )
                          }
                          className="text-stone-500 hover:text-stone-900"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="text-xs font-bold w-4 text-center">
                          {it.quantity}
                        </span>
                        <button
                          onClick={() =>
                            cartStore.updateQuantity(
                              storeKey,
                              it.id,
                              it.quantity + 1,
                              taxProfile,
                            )
                          }
                          className="text-stone-500 hover:text-stone-900"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Footer con Total y Enviar a Checkout */}
              <div className="p-5 border-t border-stone-100 bg-stone-50 space-y-3">
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between text-stone-500">
                    <span>Subtotal productos</span>
                    <span>${cartSummary.netSubtotalCop.toLocaleString('es-CO')}</span>
                  </div>
                  {cartSummary.taxAmountCop > 0 && (
                    <div className="flex justify-between text-stone-500 text-[11px]">
                      <span>Impuestos ({taxProfile.tax_type})</span>
                      <span>${cartSummary.taxAmountCop.toLocaleString('es-CO')}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-black text-sm text-stone-900 pt-1 border-t border-stone-200">
                    <span>Total estimado</span>
                    <span>${cartSummary.lineTotalCop.toLocaleString('es-CO')} COP</span>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setIsCartDrawerOpen(false);
                    setIsCheckoutModalOpen(true);
                  }}
                  className="w-full py-3.5 rounded-2xl bg-orange-600 hover:bg-orange-700 text-white font-extrabold text-xs shadow-lg shadow-orange-600/25 transition flex items-center justify-center gap-2"
                >
                  <Send className="h-4 w-4" />
                  <span>Continuar con el pedido</span>
                </button>

                <button
                  onClick={() => {
                    if (window.confirm('¿Deseas vaciar todos los productos del pedido?')) {
                      cartStore.clearCart(storeKey);
                    }
                  }}
                  className="w-full text-center text-xs font-bold text-stone-400 hover:text-rose-600 transition pt-1"
                >
                  Vaciar canasta
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal de Checkout con Selección de Zona */}
        {currentBranch && (
          <CheckoutModal
            isOpen={isCheckoutModalOpen}
            onClose={() => setIsCheckoutModalOpen(false)}
            branchId={currentBranch.id}
            storeKey={storeKey}
            restaurantSlug={restaurantSlug}
            paymentInstructions={currentBranch.payment_instructions_json}
            cartItems={cartItems}
            cartSummary={cartSummary}
            taxProfile={taxProfile}
          />
        )}
      </>
    );
  }

  return (
    <div
      className="min-h-screen bg-[#faf8f5] text-stone-800 font-sans pb-28 selection:bg-orange-500 selection:text-white"
      style={
        {
          '--brand-primary': brand.primary_color || '#B93815',
          '--brand-secondary': brand.secondary_color || '#F79009',
        } as React.CSSProperties
      }
    >
      {/* Portada / Cover Hero */}
      <div className="relative h-44 sm:h-56 w-full bg-stone-900 overflow-hidden">
        {brand.cover_url ? (
          <img
            src={brand.cover_url}
            alt="Portada del restaurante"
            className="w-full h-full object-cover opacity-80"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-tr from-stone-900 via-stone-800 to-orange-950 flex items-center justify-center">
            <span className="text-stone-700 font-black text-6xl opacity-30 select-none">
              {tenant?.name || 'Karta'}
            </span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
      </div>

      {/* Contenedor Principal */}
      <div className="max-w-4xl mx-auto px-4 -mt-16 sm:-mt-20 relative z-10 space-y-6">
        {/* Banner de Mesa Activa si escaneó QR */}
        {qrData?.target_type === 'DINING_TABLE' && (
          <div className="p-4 rounded-3xl bg-gradient-to-r from-amber-500 to-orange-600 text-white flex items-center justify-between shadow-lg">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-white/20 backdrop-blur-xs flex items-center justify-center font-black">
                <UtensilsCrossed className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-black text-sm">
                  Estás pidiendo en la {qrData.label || 'Mesa del Salón'}
                </h3>
                <p className="text-xs text-white/90">
                  Tus platos se enviarán a la cuenta abierta de tu mesa para ser preparados en cocina.
                </p>
              </div>
            </div>
            <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-white/25 text-white uppercase tracking-wider">
              En Mesa
            </span>
          </div>
        )}

        {/* Tarjeta de Identidad del Restaurante */}
        <div className="bg-white rounded-3xl p-5 sm:p-7 border border-stone-200/90 shadow-md space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              {/* Logo */}
              <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-2xl bg-white border-2 border-stone-100 shadow-md overflow-hidden flex items-center justify-center shrink-0">
                {brand.logo_url ? (
                  <img
                    src={brand.logo_url}
                    alt={tenant?.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full bg-gradient-to-tr from-orange-600 to-amber-500 text-white font-black text-2xl flex items-center justify-center">
                    {(tenant?.name || 'K').charAt(0)}
                  </div>
                )}
              </div>

              <div>
                <h1 className="text-xl sm:text-2xl font-black text-stone-900 leading-tight">
                  {tenant?.name}
                </h1>
                {brand.description && (
                  <p className="text-xs text-stone-500 line-clamp-2 mt-0.5 max-w-md">
                    {brand.description}
                  </p>
                )}
              </div>
            </div>

            {/* Insignia Abierto / Cerrado */}
            <div className="flex items-center gap-2 self-start sm:self-auto">
              {currentBranch?.is_open_now ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  Abierto ahora
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-stone-100 text-stone-600 border border-stone-200">
                  <span className="h-2 w-2 rounded-full bg-stone-400" />
                  Cerrado en este momento
                </span>
              )}
            </div>
          </div>

          {/* Información de la Sucursal */}
          <div className="pt-3 border-t border-stone-100 flex flex-wrap items-center gap-y-2 gap-x-5 text-xs text-stone-600">
            {currentBranch && (
              <>
                <div className="flex items-center gap-1.5 font-bold text-stone-800">
                  <Store className="h-3.5 w-3.5 text-orange-600" />
                  <span>Sede {currentBranch.name}</span>
                </div>
                {currentBranch.address && (
                  <div className="flex items-center gap-1.5 text-stone-500">
                    <MapPin className="h-3.5 w-3.5 text-stone-400" />
                    <span>{currentBranch.address}</span>
                  </div>
                )}
                {currentBranch.phone && (
                  <a
                    href={`tel:${currentBranch.phone}`}
                    className="flex items-center gap-1.5 text-stone-500 hover:text-orange-600 transition"
                  >
                    <Phone className="h-3.5 w-3.5 text-stone-400" />
                    <span>{currentBranch.phone}</span>
                  </a>
                )}
              </>
            )}
          </div>

          {/* MODO MESA FÍSICA: Bloquear selector de sedes y mostrar badge fijo de salón */}
          {isTableQr ? (
            <div className="pt-2 flex flex-wrap items-center gap-2 text-xs">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 text-amber-950 font-extrabold shadow-2xs">
                <UtensilsCrossed className="h-4 w-4 text-orange-600" />
                <span>{qrData?.label || 'Mesa del Salón'}</span>
                <span className="text-stone-300">•</span>
                <span className="text-stone-700 font-semibold">{currentBranch?.name}</span>
                <span className="ml-1 px-2 py-0.5 rounded-full bg-amber-200/60 text-amber-900 text-[10px] uppercase tracking-wider font-black">
                  Atención en Mesa
                </span>
              </div>
            </div>
          ) : (
            /* MODO DOMICILIO / TAKE-OUT: Selector de sedes disponible si hay más de 1 */
            branches.length > 1 && (
              <div className="pt-2 flex items-center gap-2 overflow-x-auto text-xs">
                <span className="text-stone-400 font-bold shrink-0">Otras Sedes:</span>
                {branches.map((b: any) => (
                  <Link
                    key={b.id}
                    to={`/r/${restaurantSlug}/b/${b.slug}`}
                    className={`px-3 py-1 rounded-xl font-bold whitespace-nowrap transition ${
                      b.slug === currentBranch?.slug
                        ? 'bg-orange-600 text-white shadow-2xs'
                        : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                    }`}
                  >
                    {b.name}
                  </Link>
                ))}
              </div>
            )
          )}
        </div>

        {/* Buscador & Barra de Categorías Sticky */}
        <div className="sticky top-3 z-30 space-y-3">
          {/* Buscador */}
          <div className="relative shadow-md rounded-2xl">
            <Search className="absolute left-4 top-3 h-4 w-4 text-stone-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar platos o bebidas en la carta..."
              className="w-full pl-11 pr-4 py-2.5 text-xs sm:text-sm rounded-2xl border border-stone-200 bg-white/95 backdrop-blur-md text-stone-900 focus:outline-none focus:ring-2 focus:ring-orange-500 shadow-sm"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3.5 top-3 text-stone-400 hover:text-stone-700"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Carrusel de Categorías */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => setActiveCategoryId(null)}
              className={`px-4 py-2 rounded-2xl text-xs font-bold transition whitespace-nowrap shadow-xs ${
                activeCategoryId === null
                  ? 'bg-stone-900 text-white'
                  : 'bg-white text-stone-700 hover:bg-stone-100 border border-stone-200'
              }`}
            >
              Todo el Menú
            </button>
            {categories.map((c: any) => {
              const active = activeCategoryId === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => setActiveCategoryId(c.id)}
                  className={`px-4 py-2 rounded-2xl text-xs font-bold transition whitespace-nowrap shadow-xs flex items-center gap-1.5 ${
                    active
                      ? 'bg-orange-600 text-white'
                      : 'bg-white text-stone-700 hover:bg-stone-100 border border-stone-200'
                  }`}
                >
                  <span>{c.name}</span>
                  {!c.is_currently_available && (
                    <span title="Fuera de horario">
                      <Clock className="h-3 w-3 text-amber-300" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Listado de Platos por Categoría */}
        <div className="space-y-8">
          {filteredCategories.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-stone-200 p-8 space-y-2">
              <Search className="h-8 w-8 text-stone-300 mx-auto" />
              <p className="text-sm font-bold text-stone-800">No encontramos coincidencias</p>
              <p className="text-xs text-stone-400">
                Prueba buscando con otro término o limpia los filtros.
              </p>
            </div>
          ) : (
            filteredCategories.map((category: any) => (
              <div key={category.id} className="space-y-3.5">
                <div className="flex items-center justify-between border-b border-stone-200/80 pb-2">
                  <div>
                    <h2 className="text-base sm:text-lg font-black text-stone-900">
                      {category.name}
                    </h2>
                    {category.description && (
                      <p className="text-xs text-stone-500">{category.description}</p>
                    )}
                  </div>
                  {!category.is_currently_available && (
                    <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Disponible según horario
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {category.products.map((prod: any) => {
                    const isOutOfStock = prod.status === 'OUT_OF_STOCK';
                    return (
                      <div
                        key={prod.id}
                        onClick={() => setSelectedProduct(prod)}
                        className={`bg-white rounded-2xl border p-4 shadow-xs hover:shadow-md transition cursor-pointer flex gap-3.5 items-center justify-between ${
                          isOutOfStock
                            ? 'border-stone-200/60 bg-stone-50/70 opacity-75'
                            : 'border-stone-200/90 hover:border-orange-300'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-stone-900 truncate">
                              {prod.name}
                            </h3>
                            {isOutOfStock && (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-stone-200 text-stone-600">
                                Agotado
                              </span>
                            )}
                          </div>
                          {prod.description && (
                            <p className="text-[11px] text-stone-500 line-clamp-2 mt-0.5 leading-snug">
                              {prod.description}
                            </p>
                          )}
                          <p className="text-xs font-black text-stone-900 mt-2">
                            ${prod.price_cop.toLocaleString('es-CO')} COP
                          </p>
                        </div>

                        {/* Foto miniatura opcional si existe */}
                        {prod.image_url && (
                          <div className="h-20 w-20 sm:h-24 sm:w-24 rounded-xl bg-stone-100 overflow-hidden shrink-0 border border-stone-100">
                            <img
                              src={prod.image_url}
                              alt={prod.name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Pie de Página Legal & Fiscal DIAN */}
        <div className="pt-8 border-t border-stone-200 space-y-4 text-center">
          <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200/80 text-amber-900 text-xs max-w-2xl mx-auto space-y-1">
            <div className="flex items-center justify-center gap-1.5 font-bold">
              <Info className="h-4 w-4 text-amber-700" />
              <span>Aviso Legal & Fiscal DIAN</span>
            </div>
            <p className="text-[11px] text-amber-800 leading-relaxed">
              "{DIAN_FISCAL_DISCLAIMER_TEXT}"
            </p>
          </div>

          <p className="text-[10px] text-stone-400">
            Aviso de alérgenos: si tienes restricciones o alergias alimentarias, por favor
            notifícalo a nuestro equipo antes de ordenar.
          </p>
          <p className="text-[10px] font-bold text-stone-400">
            Powered by Karta — Sistema Operativo Gastronómico
          </p>
        </div>
      </div>

      {/* Modal de Detalle de Producto & Selección */}
      {selectedProduct && (
        <ProductModal
          product={selectedProduct}
          taxProfile={taxProfile}
          canOrder={canOrder}
          onClose={() => setSelectedProduct(null)}
          onAddToCart={(item) => cartStore.addItem(storeKey, item, taxProfile)}
        />
      )}

      {/* Barra Flotante de Carrito (SOLO SI canOrder === true y hay items) */}
      {canOrder && cartSummary.totalItems > 0 && (
        <div className="fixed bottom-4 inset-x-4 sm:max-w-md sm:mx-auto z-40 animate-slide-up">
          <button
            onClick={() => setIsCartDrawerOpen(true)}
            className="w-full flex items-center justify-between p-4 rounded-2xl bg-orange-600 hover:bg-orange-700 text-white font-extrabold text-xs shadow-xl shadow-orange-600/30 transition transform active:scale-98"
          >
            <div className="flex items-center gap-2.5">
              <div className="h-7 w-7 rounded-xl bg-white/20 flex items-center justify-center font-mono font-black text-xs">
                {cartSummary.totalItems}
              </div>
              <span>Ver mi pedido</span>
            </div>
            <div className="flex items-center gap-2 font-mono text-sm font-black">
              <span>${cartSummary.lineTotalCop.toLocaleString('es-CO')} COP</span>
              <ChevronRight className="h-4 w-4 text-white/80" />
            </div>
          </button>
        </div>
      )}

      {/* Drawer del Carrito */}
      {isCartDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-stone-900/60 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-md bg-white h-full flex flex-col justify-between shadow-2xl animate-slide-left">
            {/* Header del carrito */}
            <div className="flex items-center justify-between p-5 border-b border-stone-100">
              <div className="flex items-center gap-2">
                {isTableQr ? (
                  <UtensilsCrossed className="h-5 w-5 text-orange-600" />
                ) : (
                  <ShoppingBag className="h-5 w-5 text-orange-600" />
                )}
                <h3 className="font-extrabold text-stone-900 text-base">
                  {isTableQr ? `Comanda — ${qrData?.label || 'Mesa del Salón'}` : 'Mi Pedido'}
                </h3>
                <span className="text-xs font-bold text-stone-400">
                  ({cartSummary.totalItems} ítems)
                </span>
              </div>
              <button
                onClick={() => setIsCartDrawerOpen(false)}
                className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Lista de Ítems */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3.5">
              {cartItems.map((it) => (
                <div
                  key={it.id}
                  className="p-3.5 rounded-2xl border border-stone-200/90 bg-stone-50/50 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-bold text-stone-900">{it.product_name}</h4>
                      {it.variant_name && (
                        <p className="text-[10px] text-stone-500">{it.variant_name}</p>
                      )}
                      {it.modifiers.length > 0 && (
                        <p className="text-[10px] text-stone-500">
                          + {it.modifiers.map((m) => m.name).join(', ')}
                        </p>
                      )}
                      {it.notes && (
                        <p className="text-[10px] text-amber-700 italic">"{it.notes}"</p>
                      )}
                    </div>
                    <span className="text-xs font-bold text-stone-900 font-mono">
                      ${it.pricing.line_total_cop.toLocaleString('es-CO')}
                    </span>
                  </div>

                  {/* Controles de cantidad */}
                  <div className="flex items-center justify-between pt-1">
                    <button
                      onClick={() => cartStore.removeItem(storeKey, it.id)}
                      className="text-[10px] font-bold text-rose-600 hover:underline"
                    >
                      Eliminar
                    </button>
                    <div className="flex items-center gap-2 border border-stone-200 rounded-lg bg-white px-2 py-0.5">
                      <button
                        onClick={() =>
                          cartStore.updateQuantity(
                            storeKey,
                            it.id,
                            it.quantity - 1,
                            taxProfile,
                          )
                        }
                        className="text-stone-500 hover:text-stone-900"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="text-xs font-bold w-4 text-center">
                        {it.quantity}
                      </span>
                      <button
                        onClick={() =>
                          cartStore.updateQuantity(
                            storeKey,
                            it.id,
                            it.quantity + 1,
                            taxProfile,
                          )
                        }
                        className="text-stone-500 hover:text-stone-900"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer con Total y Enviar a WhatsApp */}
            <div className="p-5 border-t border-stone-100 bg-stone-50 space-y-3">
              <div className="space-y-1 text-xs">
                <div className="flex justify-between text-stone-500">
                  <span>Subtotal</span>
                  <span>${cartSummary.netSubtotalCop.toLocaleString('es-CO')}</span>
                </div>
                {cartSummary.taxAmountCop > 0 && (
                  <div className="flex justify-between text-stone-500 text-[11px]">
                    <span>Impuestos ({taxProfile.tax_type})</span>
                    <span>${cartSummary.taxAmountCop.toLocaleString('es-CO')}</span>
                  </div>
                )}
                <div className="flex justify-between font-black text-sm text-stone-900 pt-1 border-t border-stone-200">
                  <span>Total</span>
                  <span>${cartSummary.lineTotalCop.toLocaleString('es-CO')} COP</span>
                </div>
              </div>

              <button
                onClick={() => {
                  setIsCartDrawerOpen(false);
                  setIsCheckoutModalOpen(true);
                }}
                className="w-full py-3.5 rounded-2xl bg-orange-600 hover:bg-orange-700 text-white font-extrabold text-xs shadow-lg shadow-orange-600/25 transition flex items-center justify-center gap-2"
              >
                {isTableQr ? (
                  <>
                    <UtensilsCrossed className="h-4 w-4" />
                    <span>Enviar comanda a la mesa</span>
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    <span>Continuar con el pedido</span>
                  </>
                )}
              </button>

              <button
                onClick={() => {
                  if (window.confirm('¿Deseas vaciar todos los productos del pedido?')) {
                    cartStore.clearCart(storeKey);
                  }
                }}
                className="w-full text-center text-xs font-bold text-stone-400 hover:text-rose-600 transition pt-1"
              >
                Vaciar carrito
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Checkout con Selección de Zona o Comanda de Mesa */}
      {currentBranch && (
        <CheckoutModal
          isOpen={isCheckoutModalOpen}
          onClose={() => setIsCheckoutModalOpen(false)}
          branchId={currentBranch.id}
          storeKey={storeKey}
          restaurantSlug={restaurantSlug}
          paymentInstructions={currentBranch.payment_instructions_json}
          cartItems={cartItems}
          cartSummary={cartSummary}
          taxProfile={taxProfile}
          tableQrInfo={
            isTableQr && qrToken
              ? { qrToken, label: qrData?.label || 'Mesa del Salón' }
              : undefined
          }
        />
      )}
    </div>
  );
};
