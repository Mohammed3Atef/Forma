import type { AccountStatus, CoachOnboarding, Permission, Role } from '@/types';
import { refreshSession, setAccessToken } from '@/services/platformApi';
import { trpc } from '@/services/trpc';

/**
 * Client for the Mongo-backed auth API (`trpc.auth.*`). This IS the live auth
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
    const body = await trpc.auth.signup.mutate({ email, password, displayName, phone, role: 'coach' });
    setAccessToken(body.accessToken);
    return body.user as MongoUserRecord;
  },

  async signIn(email: string, password: string): Promise<MongoUserRecord> {
    const body = await trpc.auth.login.mutate({ email, password });
    setAccessToken(body.accessToken);
    return body.user as MongoUserRecord;
  },

  async signOutUser(): Promise<void> {
    await trpc.auth.logout.mutate().catch(() => undefined);
    setAccessToken(null);
  },

  async me(): Promise<MongoUserRecord> {
    return trpc.auth.me.query() as Promise<MongoUserRecord>;
  },

  /** Call on app load: exchanges the refresh cookie (if any) for a fresh access token. */
  async restoreSession(): Promise<boolean> {
    return refreshSession();
  },

  async updateProfile(
    patch: Partial<Pick<MongoUserRecord, 'displayName' | 'phone' | 'photoUrl' | 'timezone' | 'currency'>>,
  ): Promise<MongoUserRecord> {
    return trpc.auth.updateProfile.mutate(patch) as Promise<MongoUserRecord>;
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await trpc.auth.changePassword.mutate({ currentPassword, newPassword });
  },

  async requestPasswordReset(email: string): Promise<void> {
    await trpc.auth.requestPasswordReset.mutate({ email });
  },

  async confirmPasswordReset(token: string, newPassword: string): Promise<void> {
    await trpc.auth.confirmPasswordReset.mutate({ token, newPassword });
  },
};
