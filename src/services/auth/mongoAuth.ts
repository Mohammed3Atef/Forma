import type { AccountStatus, CoachOnboarding, Permission, Role } from '@/types';
import { apiFetch, refreshSession, setAccessToken } from '@/services/platformApi';

/**
 * Client for the Mongo-backed auth API (`/api/auth/*`). This IS the live auth
 * path — see `sessionStore.ts`. Every other `src/services/platform/*.ts` file
 * now goes through the same shared token store in `@/services/platformApi`.
 */

export interface MongoUserRecord {
  id: string;
  email: string;
  displayName: string;
  phone?: string;
  photoUrl?: string;
  timezone?: string;
  mustChangePassword?: boolean;
  role: Role;
  accountStatus: AccountStatus;
  permissions: Permission[];
  featureFlags: Record<string, boolean>;
  createdBy: string;
  assignedCoachId?: string;
  displayNameLower?: string;
  inviteCode?: string;
  bio?: string;
  specialty?: string;
  yearsExperience?: number;
  instagram?: string;
  whatsapp?: string;
  currency?: string;
  onboarding?: CoachOnboarding;
  createdAt: number;
  updatedAt: number;
}

export const mongoAuth = {
  /** Coach self-registration only — client accounts come from the invite flow. */
  async signUpCoach(email: string, password: string, displayName: string, phone?: string): Promise<MongoUserRecord> {
    const body = await apiFetch<{ user: MongoUserRecord; accessToken: string }>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, displayName, phone, role: 'coach' }),
    });
    setAccessToken(body.accessToken);
    return body.user;
  },

  async signIn(email: string, password: string): Promise<MongoUserRecord> {
    const body = await apiFetch<{ user: MongoUserRecord; accessToken: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setAccessToken(body.accessToken);
    return body.user;
  },

  async signOutUser(): Promise<void> {
    await apiFetch('/auth/logout', { method: 'POST' }).catch(() => undefined);
    setAccessToken(null);
  },

  async me(): Promise<MongoUserRecord> {
    return apiFetch<MongoUserRecord>('/auth/me', { method: 'GET' });
  },

  /** Call on app load: exchanges the refresh cookie (if any) for a fresh access token. */
  async restoreSession(): Promise<boolean> {
    return refreshSession();
  },

  async updateProfile(
    patch: Partial<Pick<MongoUserRecord, 'displayName' | 'phone' | 'photoUrl' | 'timezone' | 'currency'>>,
  ): Promise<MongoUserRecord> {
    return apiFetch<MongoUserRecord>('/auth/update-profile', { method: 'PATCH', body: JSON.stringify(patch) });
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await apiFetch('/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) });
  },

  async requestPasswordReset(email: string): Promise<void> {
    await apiFetch('/auth/request-password-reset', { method: 'POST', body: JSON.stringify({ email }) });
  },

  async confirmPasswordReset(token: string, newPassword: string): Promise<void> {
    await apiFetch('/auth/confirm-password-reset', { method: 'POST', body: JSON.stringify({ token, newPassword }) });
  },
};
