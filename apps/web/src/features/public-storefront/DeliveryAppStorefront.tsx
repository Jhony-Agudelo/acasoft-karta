import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
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
  X,
  Bike,
  Star,
  Flame,
  ShieldCheck,
  Check,
  Share2,
  Sparkles,
  CreditCard,
  MessageCircle,
} from 'lucide-react';
import { formatMoneyCop, DIAN_FISCAL_DISCLAIMER_TEXT } from '@restaurante-saas/shared';
import { CartItem } from '../../stores/cart.store';

export interface DeliveryAppStorefrontProps {
  tenant: any;
  currentBranch: any;
  branches: any[];
  restaurantSlug: string;
  categories: any[];
  canOrder: boolean;
  cartItems: CartItem[];
  cartSummary: {
    totalItems: number;
    grossSubtotalCop: number;
    netSubtotalCop: number;
    taxAmountCop: number;
    lineTotalCop: number;
  };
  onSelectProduct: (product: any) => void;
  onOpenCart: () => void;
  onOpenCheckout: () => void;
  onQuickUpdateQuantity?: (productId: string, delta: number) => void;
}

export function getCategoryEmoji(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('hamburguesa') || n.includes('burger')) return '🍔';
  if (n.includes('pizza')) return '🍕';
  if (n.includes('entrada') || n.includes('acompañ') || n.includes('papa')) return '🍟';
  if (n.includes('bebida') || n.includes('refresco') || n.includes('jugo') || n.includes('gaseosa')) return '🥤';
  if (n.includes('postre') || n.includes('dulce') || n.includes('torta') || n.includes('brownie')) return '🍰';
  if (n.includes('carne') || n.includes('fuerte') || n.includes('parrilla') || n.includes('picada') || n.includes('asado')) return '🥩';
  if (n.includes('pasta')) return '🍝';
  if (n.includes('ensalada')) return '🥗';
  if (n.includes('taco') || n.includes('mexican')) return '🌮';
  if (n.includes('sushi') || n.includes('oriental')) return '🍣';
  if (n.includes('cafe') || n.includes('café')) return '☕';
  return '🍽️';
}

export const DeliveryAppStorefront: React.FC<DeliveryAppStorefrontProps> = ({
  tenant,
  currentBranch,
  branches,
  restaurantSlug,
  categories,
  canOrder,
  cartItems,
  cartSummary,
  onSelectProduct,
  onOpenCart,
  onOpenCheckout,
  onQuickUpdateQuantity,
}) => {
  const brand = tenant?.brand_settings || {};
  const [deliveryMode, setDeliveryMode] = useState<'DELIVERY' | 'TAKEOUT'>('DELIVERY');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  // Mapear cantidades en carrito por product_id para mostrar badges en tiempo real
  const cartQuantitiesByProduct = useMemo(() => {
    const map: Record<string, number> = {};
    for (const it of cartItems) {
      map[it.product_id] = (map[it.product_id] || 0) + it.quantity;
    }
    return map;
  }, [cartItems]);

  // Filtrado de categorías y productos
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

  // Platos destacados / Más pedidos (primeros 5 productos del menú)
  const featuredProducts = useMemo(() => {
    const list: any[] = [];
    for (const cat of categories) {
      for (const prod of cat.products || []) {
        if (prod.status === 'ACTIVE' && list.length < 5) {
          list.push({ ...prod, categoryName: cat.name });
        }
      }
    }
    return list;
  }, [categories]);

  // Copiar enlace de compartir
  const handleShareLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  // WhatsApp del restaurante para dudas
  const branchPhoneClean = currentBranch?.phone_whatsapp_e164 || currentBranch?.phone || '';
  const branchWhatsappLink = branchPhoneClean
    ? `https://wa.me/${branchPhoneClean.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
        `¡Hola! Estoy viendo la carta digital de ${tenant?.name || 'Karta'} y tengo una consulta sobre el menú.`,
      )}`
    : null;

  return (
    <div
      className="min-h-screen bg-[#fcfbf9] text-stone-900 font-sans pb-32 selection:bg-orange-500 selection:text-white"
      style={
        {
          '--brand-primary': brand.primary_color || '#ea580c',
          '--brand-secondary': brand.secondary_color || '#f97316',
        } as React.CSSProperties
      }
    >
      {/* =========================================================
          1. TOP APP BAR (Sticky Mobile First Header)
          ========================================================= */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-stone-200/80 shadow-xs">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          {/* Logo y Nombre */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-2xl bg-gradient-to-tr from-orange-600 to-amber-500 shadow-xs overflow-hidden flex items-center justify-center shrink-0 border border-orange-200/60">
              {brand.logo_url ? (
                <img
                  src={brand.logo_url}
                  alt={tenant?.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-white font-black text-lg">
                  {(tenant?.name || 'K').charAt(0)}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h1 className="font-extrabold text-sm sm:text-base text-stone-900 truncate">
                  {tenant?.name || 'Karta Gastro'}
                </h1>
                <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-emerald-500 text-white shrink-0">
                  <Check className="h-2.5 w-2.5 stroke-[3]" />
                </span>
              </div>
              <div className="flex items-center gap-1 text-[11px] text-stone-500 truncate">
                <Store className="h-3 w-3 text-orange-600 shrink-0" />
                <span className="font-semibold text-stone-700 truncate">
                  {currentBranch?.name || 'Sede Principal'}
                </span>
                {currentBranch?.is_open_now ? (
                  <span className="text-emerald-700 font-bold ml-1 flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Abierto
                  </span>
                ) : (
                  <span className="text-stone-400 font-medium ml-1">Cerrado</span>
                )}
              </div>
            </div>
          </div>

          {/* Botones de Acción (Compartir y Canasta) */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleShareLink}
              title="Copiar enlace del menú"
              className="p-2 rounded-xl border border-stone-200 text-stone-600 hover:text-stone-900 hover:bg-stone-100 transition relative"
            >
              {isCopied ? (
                <Check className="h-4 w-4 text-emerald-600" />
              ) : (
                <Share2 className="h-4 w-4" />
              )}
              {isCopied && (
                <span className="absolute -bottom-7 right-0 text-[10px] font-bold bg-stone-900 text-white px-2 py-0.5 rounded-md whitespace-nowrap shadow-md">
                  ¡Copiado!
                </span>
              )}
            </button>

            {/* Botón Canasta Top */}
            <button
              onClick={onOpenCart}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl font-bold text-xs transition shadow-xs ${
                cartSummary.totalItems > 0
                  ? 'bg-orange-600 text-white hover:bg-orange-700 shadow-orange-600/20'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              <div className="relative">
                <ShoppingBag className="h-4 w-4" />
                {cartSummary.totalItems > 0 && (
                  <span className="absolute -top-2 -right-2 h-4 w-4 rounded-full bg-stone-950 text-white text-[9px] font-black flex items-center justify-center border-2 border-white">
                    {cartSummary.totalItems}
                  </span>
                )}
              </div>
              <span className="hidden sm:inline font-mono">
                {cartSummary.totalItems > 0
                  ? `$${cartSummary.lineTotalCop.toLocaleString('es-CO')}`
                  : 'Canasta'}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* =========================================================
          2. HERO PROMO & RESTAURANT BANNER
          ========================================================= */}
      <div className="max-w-4xl mx-auto px-4 pt-4 space-y-4">
        {/* Banner Cover con Imagen Gourmet */}
        <div className="relative rounded-3xl overflow-hidden shadow-md h-44 sm:h-56 bg-stone-900">
          <img
            src={
              brand.cover_url ||
              'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1200&q=80'
            }
            alt="Restaurante"
            className="w-full h-full object-cover opacity-85"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-stone-950/90 via-stone-950/40 to-transparent" />

          {/* Badge de App de Delivery */}
          <div className="absolute top-3.5 left-3.5 flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/95 backdrop-blur-md text-stone-900 text-xs font-black shadow-md">
            <Bike className="h-3.5 w-3.5 text-orange-600" />
            <span>Delivery & Takeout Oficial</span>
          </div>

          {/* Selector de Modo: Domicilio vs Para Recoger */}
          <div className="absolute bottom-3.5 inset-x-3.5 flex justify-center">
            <div className="inline-flex p-1 rounded-2xl bg-black/60 backdrop-blur-md border border-white/15 text-xs font-bold shadow-xl">
              <button
                onClick={() => setDeliveryMode('DELIVERY')}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl transition ${
                  deliveryMode === 'DELIVERY'
                    ? 'bg-orange-600 text-white shadow-md'
                    : 'text-stone-300 hover:text-white'
                }`}
              >
                <Bike className="h-3.5 w-3.5" />
                <span>A Domicilio</span>
              </button>
              <button
                onClick={() => setDeliveryMode('TAKEOUT')}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl transition ${
                  deliveryMode === 'TAKEOUT'
                    ? 'bg-orange-600 text-white shadow-md'
                    : 'text-stone-300 hover:text-white'
                }`}
              >
                <ShoppingBag className="h-3.5 w-3.5" />
                <span>Para Recoger</span>
              </button>
            </div>
          </div>
        </div>

        {/* Barra de Información del Servicio (Estilo Rappi / Uber Eats) */}
        <div className="bg-white rounded-2xl p-4 border border-stone-200/90 shadow-xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            {/* Tiempos y Costos */}
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-1.5 font-bold text-stone-800">
                <Clock className="h-4 w-4 text-orange-600" />
                <span>
                  {deliveryMode === 'DELIVERY' ? '30 - 45 min' : 'Listo en 20 min'}
                </span>
              </div>
              <span className="text-stone-300">•</span>
              <div className="flex items-center gap-1.5 font-bold text-stone-800">
                <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                <span>4.9</span>
                <span className="text-stone-400 font-normal">(500+ pedidos)</span>
              </div>
              <span className="text-stone-300">•</span>
              <div className="flex items-center gap-1.5 font-semibold text-stone-600">
                <MapPin className="h-4 w-4 text-stone-400" />
                <span>
                  {deliveryMode === 'DELIVERY'
                    ? 'Cobertura en la ciudad'
                    : currentBranch?.address || 'Sede Principal'}
                </span>
              </div>
            </div>

            {/* Canal WhatsApp directo */}
            {branchWhatsappLink && (
              <a
                href={branchWhatsappLink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 font-bold transition text-[11px]"
              >
                <MessageCircle className="h-3.5 w-3.5 text-emerald-600" />
                <span>Chat WhatsApp</span>
              </a>
            )}
          </div>

          {/* Métodos de Pago Aceptados (Chips) */}
          <div className="pt-2.5 border-t border-stone-100 flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="text-stone-400 font-bold mr-1">Pagos recibidos:</span>
            <span className="px-2 py-0.5 rounded-lg bg-stone-100 text-stone-700 font-semibold border border-stone-200/60">
              📱 Nequi
            </span>
            <span className="px-2 py-0.5 rounded-lg bg-stone-100 text-stone-700 font-semibold border border-stone-200/60">
              📱 Daviplata
            </span>
            <span className="px-2 py-0.5 rounded-lg bg-stone-100 text-stone-700 font-semibold border border-stone-200/60">
              🔑 Llave Bre-B
            </span>
            <span className="px-2 py-0.5 rounded-lg bg-stone-100 text-stone-700 font-semibold border border-stone-200/60">
              🏦 Bancolombia
            </span>
            <span className="px-2 py-0.5 rounded-lg bg-stone-100 text-stone-700 font-semibold border border-stone-200/60">
              💵 Efectivo
            </span>
          </div>

          {/* Selector de sedes si hay más de 1 */}
          {branches.length > 1 && (
            <div className="pt-2 border-t border-stone-100 flex items-center gap-2 overflow-x-auto text-xs">
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
          )}
        </div>

        {/* Buscador de Platos */}
        <div className="relative shadow-xs rounded-2xl">
          <Search className="absolute left-4 top-3.5 h-4 w-4 text-stone-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar hamburguesas, pizzas, bebidas, adiciones..."
            className="w-full pl-11 pr-10 py-3 text-xs sm:text-sm rounded-2xl border border-stone-200 bg-white text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition shadow-xs"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3.5 top-3.5 text-stone-400 hover:text-stone-700 p-0.5"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* =========================================================
            3. CARROUSEL: LOS MÁS PEDIDOS / RECOMENDADOS DEL CHEF
            ========================================================= */}
        {!searchQuery && featuredProducts.length > 0 && (
          <div className="space-y-2.5 pt-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Flame className="h-4 w-4 text-orange-600 fill-orange-500" />
                <h2 className="font-extrabold text-sm sm:text-base text-stone-900">
                  Los Más Pedidos
                </h2>
              </div>
              <span className="text-[11px] font-bold text-orange-600">Recomendados</span>
            </div>

            <div className="flex gap-3.5 overflow-x-auto pb-2 scrollbar-none snap-x">
              {featuredProducts.map((prod) => {
                const qtyInCart = cartQuantitiesByProduct[prod.id] || 0;
                return (
                  <div
                    key={`feat-${prod.id}`}
                    onClick={() => onSelectProduct(prod)}
                    className="w-48 sm:w-56 shrink-0 bg-white rounded-2xl border border-stone-200/90 shadow-xs hover:shadow-md transition cursor-pointer overflow-hidden flex flex-col justify-between snap-start group"
                  >
                    <div>
                      {/* Foto del plato destacado */}
                      <div className="relative h-28 sm:h-32 w-full bg-stone-100 overflow-hidden">
                        <img
                          src={
                            prod.image_url ||
                            'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=600&q=80'
                          }
                          alt={prod.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                        />
                        <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-orange-600 text-white text-[9px] font-black uppercase tracking-wider shadow-sm flex items-center gap-1">
                          <Flame className="h-2.5 w-2.5" />
                          Top
                        </span>
                        {qtyInCart > 0 && (
                          <span className="absolute top-2 right-2 h-6 w-6 rounded-full bg-stone-900 text-white text-[11px] font-black flex items-center justify-center border-2 border-white shadow-md">
                            {qtyInCart}
                          </span>
                        )}
                      </div>

                      <div className="p-3 space-y-1">
                        <h3 className="font-extrabold text-xs text-stone-900 line-clamp-1 group-hover:text-orange-600 transition">
                          {prod.name}
                        </h3>
                        {prod.description && (
                          <p className="text-[10px] text-stone-500 line-clamp-2 leading-tight">
                            {prod.description}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="p-3 pt-0 flex items-center justify-between">
                      <span className="text-xs font-black text-stone-900 font-mono">
                        ${prod.price_cop.toLocaleString('es-CO')}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectProduct(prod);
                        }}
                        className="px-2.5 py-1 rounded-xl bg-orange-50 hover:bg-orange-600 text-orange-700 hover:text-white font-extrabold text-[11px] border border-orange-200 hover:border-orange-600 transition flex items-center gap-1"
                      >
                        <Plus className="h-3 w-3 stroke-[3]" />
                        <span>Pedir</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* =========================================================
            4. BARRA STICKY DE CATEGORÍAS (Emojis + Conteo)
            ========================================================= */}
        <div className="sticky top-16 z-30 bg-[#fcfbf9]/95 backdrop-blur-md py-2.5 border-b border-stone-200/60 -mx-4 px-4">
          <div className="flex gap-2 overflow-x-auto scrollbar-none">
            <button
              onClick={() => setActiveCategoryId(null)}
              className={`px-3.5 py-2 rounded-2xl text-xs font-extrabold transition whitespace-nowrap shadow-xs flex items-center gap-1.5 ${
                activeCategoryId === null
                  ? 'bg-stone-900 text-white shadow-stone-900/20'
                  : 'bg-white text-stone-700 hover:bg-stone-100 border border-stone-200'
              }`}
            >
              <span>🔥</span>
              <span>Todo el Menú</span>
            </button>
            {categories.map((c: any) => {
              const active = activeCategoryId === c.id;
              const emoji = getCategoryEmoji(c.name);
              const count = c.products?.length || 0;
              return (
                <button
                  key={c.id}
                  onClick={() => setActiveCategoryId(c.id)}
                  className={`px-3.5 py-2 rounded-2xl text-xs font-extrabold transition whitespace-nowrap shadow-xs flex items-center gap-1.5 ${
                    active
                      ? 'bg-orange-600 text-white shadow-orange-600/20'
                      : 'bg-white text-stone-700 hover:bg-stone-100 border border-stone-200'
                  }`}
                >
                  <span>{emoji}</span>
                  <span>{c.name}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                      active ? 'bg-orange-800 text-orange-100' : 'bg-stone-100 text-stone-500'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* =========================================================
            5. FEED DE PRODUCTOS (Estilo App de Comida a Domicilio)
            ========================================================= */}
        <div className="space-y-8 pt-2">
          {filteredCategories.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-stone-200 p-8 space-y-3">
              <div className="h-12 w-12 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center mx-auto">
                <Search className="h-6 w-6" />
              </div>
              <p className="text-sm font-bold text-stone-800">No encontramos coincidencias</p>
              <p className="text-xs text-stone-400 max-w-sm mx-auto">
                Intenta con otra palabra clave o limpia el filtro para ver todos los platos disponibles.
              </p>
              <button
                onClick={() => {
                  setSearchQuery('');
                  setActiveCategoryId(null);
                }}
                className="px-4 py-2 rounded-xl bg-orange-600 text-white font-bold text-xs"
              >
                Ver todo el menú
              </button>
            </div>
          ) : (
            filteredCategories.map((category: any) => (
              <section key={category.id} className="space-y-3">
                {/* Cabecera de Categoría */}
                <div className="flex items-center justify-between border-b border-stone-200/80 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{getCategoryEmoji(category.name)}</span>
                    <div>
                      <h2 className="text-base sm:text-lg font-black text-stone-900 leading-tight">
                        {category.name}
                      </h2>
                      {category.description && (
                        <p className="text-[11px] text-stone-500">{category.description}</p>
                      )}
                    </div>
                  </div>
                  <span className="text-xs font-mono font-bold text-stone-400">
                    {category.products.length} platos
                  </span>
                </div>

                {/* Grid de Platos (1 col en móvil, 2 en pantallas medianas) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {category.products.map((prod: any) => {
                    const isOutOfStock = prod.status === 'OUT_OF_STOCK';
                    const qtyInCart = cartQuantitiesByProduct[prod.id] || 0;
                    const hasModifiers =
                      (prod.modifier_groups && prod.modifier_groups.length > 0) ||
                      (prod.variants && prod.variants.length > 0);

                    return (
                      <div
                        key={prod.id}
                        onClick={() => onSelectProduct(prod)}
                        className={`bg-white rounded-2xl border p-3.5 sm:p-4 shadow-xs hover:shadow-md transition cursor-pointer flex gap-3.5 items-center justify-between group ${
                          isOutOfStock
                            ? 'border-stone-200/60 bg-stone-50/70 opacity-70'
                            : 'border-stone-200/90 hover:border-orange-300'
                        }`}
                      >
                        {/* Información del plato */}
                        <div className="flex-1 min-w-0 pr-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h3 className="text-sm font-extrabold text-stone-900 group-hover:text-orange-600 transition leading-snug">
                              {prod.name}
                            </h3>
                            {isOutOfStock && (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-stone-200 text-stone-600">
                                Agotado
                              </span>
                            )}
                          </div>

                          {prod.description && (
                            <p className="text-[11px] text-stone-500 line-clamp-2 mt-1 leading-snug">
                              {prod.description}
                            </p>
                          )}

                          <div className="flex items-center gap-2 mt-2.5">
                            <span className="text-sm font-black text-stone-900 font-mono">
                              ${prod.price_cop.toLocaleString('es-CO')} COP
                            </span>
                            {hasModifiers && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-orange-50 text-orange-700 border border-orange-200/60">
                                Personalizable
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Foto del plato con botón + / Badge */}
                        <div className="relative shrink-0">
                          <div className="h-22 w-22 sm:h-24 sm:w-24 rounded-2xl bg-stone-100 overflow-hidden border border-stone-200/70 shadow-xs">
                            <img
                              src={
                                prod.image_url ||
                                'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80'
                              }
                              alt={prod.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                            />
                          </div>

                          {/* Botón flotante para agregar / estado en canasta */}
                          {!isOutOfStock && canOrder && (
                            <div className="absolute -bottom-2 -right-2">
                              {qtyInCart > 0 ? (
                                <div className="h-7 px-2 rounded-xl bg-stone-900 text-white font-extrabold text-xs flex items-center gap-1 shadow-md border border-white">
                                  <span>{qtyInCart}</span>
                                  <Plus className="h-3 w-3 stroke-[3]" />
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onSelectProduct(prod);
                                  }}
                                  className="h-8 w-8 rounded-xl bg-orange-600 hover:bg-orange-700 text-white flex items-center justify-center shadow-md shadow-orange-600/30 transition transform active:scale-90"
                                >
                                  <Plus className="h-4 w-4 stroke-[3]" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </div>

        {/* =========================================================
            6. FOOTER LEGAL & GARANTÍA DIAN
            ========================================================= */}
        <div className="pt-10 border-t border-stone-200 space-y-4 text-center">
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
            especifícalo en las notas de tu pedido.
          </p>
          <div className="flex items-center justify-center gap-1.5 text-[11px] font-bold text-stone-400">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            <span>Karta Delivery OS • Pedidos Directos Seguros</span>
          </div>
        </div>
      </div>

      {/* =========================================================
          7. FLOATING BOTTOM APP BAR (Rappi / Uber Eats Style)
          ========================================================= */}
      {canOrder && cartSummary.totalItems > 0 && (
        <aside 
          aria-label="Barra flotante de canasta activa"
          className="fixed bottom-4 inset-x-4 sm:max-w-lg sm:mx-auto z-40 animate-slide-up"
        >
          <button
            onClick={onOpenCart}
            className="w-full flex items-center justify-between p-4 rounded-2xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 text-white font-extrabold text-xs shadow-2xl shadow-orange-600/40 transition transform active:scale-98 border border-white/20"
          >
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-xl bg-white/20 backdrop-blur-xs flex items-center justify-center font-mono font-black text-xs">
                {cartSummary.totalItems}
              </div>
              <div className="text-left">
                <span className="block font-black text-sm leading-tight">Ver mi Canasta</span>
                <span className="text-[10px] text-orange-100 font-medium">
                  {deliveryMode === 'DELIVERY' ? 'Domicilio' : 'Para recoger'} • Toca para revisar
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 font-mono text-sm font-black bg-white/20 px-3 py-1.5 rounded-xl backdrop-blur-xs">
              <span>${cartSummary.lineTotalCop.toLocaleString('es-CO')}</span>
              <ChevronRight className="h-4 w-4" />
            </div>
          </button>
        </aside>
      )}
    </div>
  );
};
