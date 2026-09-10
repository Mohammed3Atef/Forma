import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { VercelResponse } from '@vercel/node';
import { refreshTokensCol } from './mongodb.js';
import type { AccountStatus, Role } from './types.js';

const ACCESS_TOKEN_TTL_SEC = 15 * 60; // 15 minutes — kept in memory on the client, never persisted
const REFRESH_TOKEN_TTL_SEC = 30 * 24 * 60 * 60; // 30 days — httpOnly cookie, rotated on every use
const REFRESH_COOKIE_NAME = 'forma_rt';

function accessSecret(): string {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) throw new Error('JWT_ACCESS_SECRET is not set');
  return secret;
}

export interface AccessPayload {
  sub: string;
  role: Role;
  accountStatus: AccountStatus;
}

export function signAccessToken(user: { id: string; role: Role; accountStatus: AccountStatus }): string {
  return jwt.sign({ role: user.role, accountStatus: user.accountStatus }, accessSecret(), {
    subject: user.id,
    expiresIn: ACCESS_TOKEN_TTL_SEC,
  });
}

export function verifyAccessToken(token: string): AccessPayload {
  const decoded = jwt.verify(token, accessSecret());
  if (typeof decoded === 'string' || !decoded.sub) throw new Error('Malformed access token');
  return { sub: decoded.sub, role: decoded.role as Role, accountStatus: decoded.accountStatus as AccountStatus };
}

function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function serializeCookie(name: string, value: string, maxAgeSec: number): string {
  const parts = [`${name}=${value}`, 'Path=/api/auth', 'HttpOnly', 'SameSite=Strict', `Max-Age=${maxAgeSec}`];
  if (process.env.NODE_ENV === 'production') parts.push('Secure');
  return parts.join('; ');
}

/** Issues a brand-new access + refresh token pair, storing the refresh token (hashed) in Mongo. */
export async function issueSession(
  res: VercelResponse,
  user: { id: string; role: Role; accountStatus: AccountStatus },
): Promise<{ accessToken: string }> {
  const accessToken = signAccessToken(user);
  const raw = crypto.randomBytes(48).toString('hex');
  const col = await refreshTokensCol();
  await col.insertOne({
    _id: hashToken(raw),
    userId: user.id,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SEC * 1000),
    revoked: false,
  });
  res.setHeader('Set-Cookie', serializeCookie(REFRESH_COOKIE_NAME, raw, REFRESH_TOKEN_TTL_SEC));
  return { accessToken };
}

/** Revokes the old refresh token and issues a new pair (rotation on every refresh). */
export async function rotateSession(
  res: VercelResponse,
  rawOldToken: string,
  user: { id: string; role: Role; accountStatus: AccountStatus },
): Promise<{ accessToken: string }> {
  const col = await refreshTokensCol();
  await col.updateOne({ _id: hashToken(rawOldToken) }, { $set: { revoked: true } });
  return issueSession(res, user);
}

export async function findValidRefreshToken(rawToken: string) {
  const col = await refreshTokensCol();
  const doc = await col.findOne({ _id: hashToken(rawToken) });
  if (!doc || doc.revoked || doc.expiresAt.getTime() < Date.now()) return null;
  return doc;
}

export async function revokeRefreshToken(rawToken: string): Promise<void> {
  const col = await refreshTokensCol();
  await col.updateOne({ _id: hashToken(rawToken) }, { $set: { revoked: true } });
}

/** Revokes every session for a user — called on password change/reset. */
export async function revokeAllUserSessions(userId: string): Promise<void> {
  const col = await refreshTokensCol();
  await col.updateMany({ userId, revoked: false }, { $set: { revoked: true } });
}

export function clearRefreshCookie(res: VercelResponse): void {
  res.setHeader('Set-Cookie', serializeCookie(REFRESH_COOKIE_NAME, '', 0));
}

export function readRefreshCookie(cookies: Partial<Record<string, string>> | undefined): string | null {
  return cookies?.[REFRESH_COOKIE_NAME] ?? null;
}

export function hashRawToken(raw: string): string {
  return hashToken(raw);
}

export function generateRawToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}
