import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { TaxProfileMode, TaxType, calculateLinePricing } from '@restaurante-saas/shared';

export interface CartModifierItem {
  id: string;
  name: string;
  extra_price_cop: number;
}

export interface CartItem {
  id: string; // Unique draft id (e.g. product_id + variant_id + sorted modifiers)
  product_id: string;
  product_name: string;
  image_url?: string | null;
  variant_id?: string | null;
  variant_name?: string | null;
  unit_price_cop: number;
  quantity: number;
  modifiers: CartModifierItem[];
  notes?: string;
  pricing: ReturnType<typeof calculateLinePricing>;
}

interface CartStoreState {
  // Keyed by storeKey (e.g. restaurantSlug or `${restaurantSlug}/${branchSlug}`)
  cartsByStore: Record<string, CartItem[]>;

  addItem: (
    storeKey: string,
    item: Omit<CartItem, 'pricing' | 'id'>,
    taxProfile: {
      tax_profile_mode: TaxProfileMode;
      tax_type?: TaxType;
      tax_rate_bp?: number;
    },
  ) => void;

  updateQuantity: (
    storeKey: string,
    itemId: string,
    quantity: number,
    taxProfile: {
      tax_profile_mode: TaxProfileMode;
      tax_type?: TaxType;
      tax_rate_bp?: number;
    },
  ) => void;

  removeItem: (storeKey: string, itemId: string) => void;

  clearCart: (storeKey: string) => void;
  clearAllTakeoutCarts: (restaurantSlug?: string) => void;

  getCartItems: (storeKey: string) => CartItem[];

  getCartSummary: (storeKey: string) => {
    totalItems: number;
    grossSubtotalCop: number;
    netSubtotalCop: number;
    taxAmountCop: number;
    lineTotalCop: number;
  };
}

function generateCartItemId(
  productId: string,
  variantId?: string | null,
  modifiers: CartModifierItem[] = [],
  notes = '',
): string {
  const modIds = modifiers
    .map((m) => m.id)
    .sort()
    .join('-');
  return `${productId}:${variantId || 'base'}:${modIds}:${notes.trim()}`;
}

export const useCartStore = create<CartStoreState>()(
  persist(
    (set, get) => ({
      cartsByStore: {},

      addItem: (storeKey, itemData, taxProfile) => {
        const itemId = generateCartItemId(
          itemData.product_id,
          itemData.variant_id,
          itemData.modifiers,
          itemData.notes,
        );

        const currentCarts = get().cartsByStore;
        const currentItems = currentCarts[storeKey] || [];
        const existingIndex = currentItems.findIndex((it) => it.id === itemId);

        let newItems: CartItem[];

        if (existingIndex >= 0) {
          const existing = currentItems[existingIndex]!;
          const newQty = existing.quantity + itemData.quantity;
          const pricing = calculateLinePricing({
            basePriceCop: itemData.unit_price_cop,
            modifiers: itemData.modifiers,
            quantity: newQty,
            taxProfileMode: taxProfile.tax_profile_mode,
            taxType: taxProfile.tax_type || 'NONE',
            taxRateBp: taxProfile.tax_rate_bp ?? 0,
          });

          newItems = [...currentItems];
          newItems[existingIndex] = {
            ...existing,
            quantity: newQty,
            pricing,
          };
        } else {
          const pricing = calculateLinePricing({
            basePriceCop: itemData.unit_price_cop,
            modifiers: itemData.modifiers,
            quantity: itemData.quantity,
            taxProfileMode: taxProfile.tax_profile_mode,
            taxType: taxProfile.tax_type || 'NONE',
            taxRateBp: taxProfile.tax_rate_bp ?? 0,
          });

          const newItem: CartItem = {
            ...itemData,
            id: itemId,
            pricing,
          };
          newItems = [...currentItems, newItem];
        }

        set({
          cartsByStore: {
            ...currentCarts,
            [storeKey]: newItems,
          },
        });
      },

      updateQuantity: (storeKey, itemId, quantity, taxProfile) => {
        const currentCarts = get().cartsByStore;
        const currentItems = currentCarts[storeKey] || [];

        if (quantity <= 0) {
          get().removeItem(storeKey, itemId);
          return;
        }

        const newItems = currentItems.map((it) => {
          if (it.id !== itemId) return it;
          const pricing = calculateLinePricing({
            basePriceCop: it.unit_price_cop,
            modifiers: it.modifiers,
            quantity,
            taxProfileMode: taxProfile.tax_profile_mode,
            taxType: taxProfile.tax_type || 'NONE',
            taxRateBp: taxProfile.tax_rate_bp ?? 0,
          });
          return {
            ...it,
            quantity,
            pricing,
          };
        });

        set({
          cartsByStore: {
            ...currentCarts,
            [storeKey]: newItems,
          },
        });
      },

      removeItem: (storeKey, itemId) => {
        const currentCarts = get().cartsByStore;
        const currentItems = currentCarts[storeKey] || [];
        set({
          cartsByStore: {
            ...currentCarts,
            [storeKey]: currentItems.filter((it) => it.id !== itemId),
          },
        });
      },

      clearCart: (storeKey) => {
        const currentCarts = get().cartsByStore;
        const { [storeKey]: _, ...rest } = currentCarts;
        set({ cartsByStore: rest });
      },

      clearAllTakeoutCarts: (restaurantSlug?: string) => {
        const currentCarts = get().cartsByStore;
        const nextCarts = { ...currentCarts };
        for (const key of Object.keys(nextCarts)) {
          if (
            key.endsWith('/takeout') &&
            (!restaurantSlug || key.startsWith(`${restaurantSlug}/`))
          ) {
            delete nextCarts[key];
          }
        }
        set({ cartsByStore: nextCarts });
      },

      getCartItems: (storeKey) => {
        return get().cartsByStore[storeKey] || [];
      },

      getCartSummary: (storeKey) => {
        const items = get().cartsByStore[storeKey] || [];
        return items.reduce(
          (acc, item) => ({
            totalItems: acc.totalItems + item.quantity,
            grossSubtotalCop: acc.grossSubtotalCop + item.pricing.gross_subtotal_cop,
            netSubtotalCop: acc.netSubtotalCop + item.pricing.net_subtotal_cop,
            taxAmountCop: acc.taxAmountCop + item.pricing.tax_amount_cop,
            lineTotalCop: acc.lineTotalCop + item.pricing.line_total_cop,
          }),
          {
            totalItems: 0,
            grossSubtotalCop: 0,
            netSubtotalCop: 0,
            taxAmountCop: 0,
            lineTotalCop: 0,
          },
        );
      },
    }),
    {
      name: 'karta-public-carts-v1',
      storage: {
        getItem: (name) => {
          if (typeof window === 'undefined' || !window.localStorage) return null;
          const str = localStorage.getItem(name);
          return str ? JSON.parse(str) : null;
        },
        setItem: (name, value) => {
          if (typeof window === 'undefined' || !window.localStorage) return;
          localStorage.setItem(name, JSON.stringify(value));
        },
        removeItem: (name) => {
          if (typeof window === 'undefined' || !window.localStorage) return;
          localStorage.removeItem(name);
        },
      },
    },
  ),
);
