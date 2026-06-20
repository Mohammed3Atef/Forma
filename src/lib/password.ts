/**
 * Password policy for Forma accounts: at least 8 characters and at least one
 * number. Returns an i18n suffix (`auth.pw<Code>`) describing the first failure,
 * or null when valid.
 */
export type PasswordErrorCode = 'TooShort' | 'NeedsNumber';

export function passwordError(pwd: string): PasswordErrorCode | null {
  if (pwd.length < 8) return 'TooShort';
  if (!/[0-9]/.test(pwd)) return 'NeedsNumber';
  return null;
}

export function passwordValid(pwd: string): boolean {
  return passwordError(pwd) === null;
}
