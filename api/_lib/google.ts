import { OAuth2Client } from 'google-auth-library';

/**
 * Verifies a Google Identity Services ID token (the `credential` string the
 * frontend's Sign-In-With-Google button hands back) and returns the verified
 * profile. Throws if the token is missing, expired, or wasn't issued for this
 * app's client id — never trust an unverified token's claims.
 */

let client: OAuth2Client | null = null;
function oauthClient(): OAuth2Client {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error('GOOGLE_CLIENT_ID is not set');
  if (!client) client = new OAuth2Client(clientId);
  return client;
}

export interface GoogleProfile {
  email: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
}

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleProfile> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error('GOOGLE_CLIENT_ID is not set');
  const ticket = await oauthClient().verifyIdToken({ idToken, audience: clientId });
  const payload = ticket.getPayload();
  if (!payload?.email) throw new Error('Google token has no email');
  return {
    email: payload.email,
    emailVerified: payload.email_verified ?? false,
    name: payload.name,
    picture: payload.picture,
  };
}
