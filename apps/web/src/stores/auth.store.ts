import { create } from 'zustand';
import { apiClient } from '../services/api-client';

export interface UserSession {
  id: string;
  name: string;
  email: string;
  phone: string;
  tenantId: string;
  roleKey: string;
  permissions: string[];
  branchScope: string[] | null;
  mustChangePassword?: boolean;
}

interface AuthState {
  user: UserSession | null;
  currentBranchId: string | null;
  isAuthenticated: boolean;
  mustChangePassword: boolean;
  setUser: (user: UserSession | null) => void;
  setCurrentBranchId: (branchId: string | null) => void;
  setSession: (user: UserSession, token: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => {
  const isBrowser = typeof localStorage !== 'undefined';
  const initialUserJson = isBrowser ? localStorage.getItem('user_session') : null;
  let initialUser: UserSession | null = null;
  if (initialUserJson) {
    try {
      initialUser = JSON.parse(initialUserJson);
    } catch {
      if (isBrowser) localStorage.removeItem('user_session');
    }
  }

  return {
    user: initialUser,
    currentBranchId: isBrowser ? localStorage.getItem('current_branch_id') : null,
    isAuthenticated: !!initialUser,
    mustChangePassword: !!initialUser?.mustChangePassword,
    setUser: (user) => {
      if (isBrowser) {
        if (user) {
          localStorage.setItem('user_session', JSON.stringify(user));
        } else {
          localStorage.removeItem('user_session');
        }
      }
      set({ user, isAuthenticated: !!user, mustChangePassword: !!user?.mustChangePassword });
    },
    setCurrentBranchId: (branchId) => {
      if (isBrowser) {
        if (branchId) {
          localStorage.setItem('current_branch_id', branchId);
        } else {
          localStorage.removeItem('current_branch_id');
        }
      }
      set({ currentBranchId: branchId });
    },
    setSession: (user, token) => {
      apiClient.setToken(token);
      if (isBrowser) {
        localStorage.setItem('user_session', JSON.stringify(user));
      }
      set({
        user,
        isAuthenticated: true,
        mustChangePassword: !!user.mustChangePassword,
      });
    },
    logout: () => {
      apiClient.setToken(null);
      if (isBrowser) {
        localStorage.removeItem('user_session');
        localStorage.removeItem('current_branch_id');
      }
      set({
        user: null,
        currentBranchId: null,
        isAuthenticated: false,
        mustChangePassword: false,
      });
      window.location.href = '/login';
    },
  };
});
