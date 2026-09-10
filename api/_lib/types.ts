/**
 * Backend-local type mirror of `src/types/index.ts`'s identity model
 * (Role, AccountStatus, Permission, UserRecord). Deliberately duplicated
 * rather than imported across the src/ ↔ api/ boundary — Vite's `@/*` path
 * alias isn't available inside Vercel's per-function bundler, and keeping
 * this file tiny and dependency-free means the api/ bundle stays fast and
 * doesn't depend on frontend build config at all.
 *
 * Keep in sync with src/types/index.ts by hand — this is the exact same
 * discipline the project already uses to keep firestore.rules in sync with
 * src/services/auth/roles.ts.
 */

export type Role = 'super_admin' | 'admin' | 'coach' | 'client';

export type AccountStatus = 'active' | 'suspended' | 'pending' | 'disabled';

export type Permission =
  | 'users.read'
  | 'users.create'
  | 'users.manageRoles'
  | 'users.manageStatus'
  | 'coaches.assign'
  | 'clients.readAll'
  | 'clients.writeAll'
  | 'flags.manage'
  | 'audit.read';

export interface CoachOnboarding {
  profileDone?: boolean;
  firstClientDone?: boolean;
  firstTemplateDone?: boolean;
}

/** Mongo document shape for the `users` collection. `_id` == the account id (a uuid). */
export interface UserDoc {
  _id: string;
  email: string;
  /** Lowercased email — the field the unique index and lookups actually use. */
  emailLower: string;
  passwordHash: string;
  displayName: string;
  displayNameLower?: string;
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

/** The exact shape returned to the frontend — same fields as `UserRecord`, no secrets. */
export type PublicUser = Omit<UserDoc, 'passwordHash' | 'emailLower' | '_id'> & { id: string };

export function toPublicUser(doc: UserDoc): PublicUser {
  const { _id, passwordHash: _passwordHash, emailLower: _emailLower, ...rest } = doc;
  return { id: _id, ...rest };
}

/** One refresh token per signed-in session/device. `_id` is the SHA-256 hash of the raw token. */
export interface RefreshTokenDoc {
  _id: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
  revoked: boolean;
}

/** One outstanding password-reset request. `_id` is the SHA-256 hash of the raw token. */
export interface PasswordResetDoc {
  _id: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
  used: boolean;
}
