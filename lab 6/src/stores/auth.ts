import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { AuthResponse, User } from '@/types/api';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  setSession: (session: AuthResponse) => void;
  clear: () => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      setSession: ({ user, tokens }) => set({ user, ...tokens }),
      clear: () => set({ user: null, accessToken: null, refreshToken: null }),
    }),
    { name: 'task-manager-session', storage: createJSONStorage(() => sessionStorage) },
  ),
);
