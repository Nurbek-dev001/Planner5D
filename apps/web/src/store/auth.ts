import { create } from 'zustand';
import { api, hasTokens, storeTokens, type User } from '../api/client';

interface AuthState {
  user: User | null;
  /** true until the initial session check has finished */
  loading: boolean;
  init: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  loading: true,
  init: async () => {
    if (!hasTokens()) return set({ loading: false });
    try {
      const { user } = await api.me();
      set({ user, loading: false });
    } catch {
      set({ user: null, loading: false });
    }
  },
  login: async (email, password) => {
    const s = await api.login(email, password);
    storeTokens(s);
    set({ user: s.user });
  },
  register: async (email, password, name) => {
    const s = await api.register(email, password, name);
    storeTokens(s);
    set({ user: s.user });
  },
  logout: async () => {
    await api.logout();
    set({ user: null });
  },
}));
