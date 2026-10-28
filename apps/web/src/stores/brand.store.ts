import { create } from 'zustand';

export interface BrandSettings {
  display_name: string;
  logo_url: string | null;
  banner_url: string | null;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  font_family: string;
  receipt_footer_text: string | null;
  instagram_handle: string | null;
  facebook_url: string | null;
  custom_domain: string | null;
}

interface BrandState {
  settings: BrandSettings;
  setBrandSettings: (settings: Partial<BrandSettings>) => void;
  applyTheme: () => void;
}

const defaultSettings: BrandSettings = {
  display_name: 'Restaurante',
  logo_url: null,
  banner_url: null,
  primary_color: '#0284c7',
  secondary_color: '#f97316',
  accent_color: '#10b981',
  font_family: 'Plus Jakarta Sans',
  receipt_footer_text: '¡Gracias por su compra!',
  instagram_handle: null,
  facebook_url: null,
  custom_domain: null,
};

export const useBrandStore = create<BrandState>((set, get) => ({
  settings: defaultSettings,
  setBrandSettings: (newSettings) => {
    set((state) => {
      const updated = { ...state.settings, ...newSettings };
      if (typeof document !== 'undefined') {
        document.documentElement.style.setProperty('--brand-primary', updated.primary_color);
        document.documentElement.style.setProperty('--brand-secondary', updated.secondary_color);
        document.documentElement.style.setProperty('--brand-accent', updated.accent_color);
      }
      return { settings: updated };
    });
  },
  applyTheme: () => {
    const { settings } = get();
    if (typeof document !== 'undefined') {
      document.documentElement.style.setProperty('--brand-primary', settings.primary_color);
      document.documentElement.style.setProperty('--brand-secondary', settings.secondary_color);
      document.documentElement.style.setProperty('--brand-accent', settings.accent_color);
    }
  },
}));
