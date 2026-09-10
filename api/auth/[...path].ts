import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPathSegments } from '../_lib/routePath.js';
import signupHandler from './_handlers/signup.js';
import loginHandler from './_handlers/login.js';
import refreshHandler from './_handlers/refresh.js';
import logoutHandler from './_handlers/logout.js';
import meHandler from './_handlers/me.js';
import updateProfileHandler from './_handlers/update-profile.js';
import changePasswordHandler from './_handlers/change-password.js';
import requestPasswordResetHandler from './_handlers/request-password-reset.js';
import confirmPasswordResetHandler from './_handlers/confirm-password-reset.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const segments = getPathSegments(req, '/api/auth');
  const [first] = segments;
  switch (first) {
    case 'signup': return signupHandler(req, res);
    case 'login': return loginHandler(req, res);
    case 'refresh': return refreshHandler(req, res);
    case 'logout': return logoutHandler(req, res);
    case 'me': return meHandler(req, res);
    case 'update-profile': return updateProfileHandler(req, res);
    case 'change-password': return changePasswordHandler(req, res);
    case 'request-password-reset': return requestPasswordResetHandler(req, res);
    case 'confirm-password-reset': return confirmPasswordResetHandler(req, res);
    default:
      res.status(404).json({ error: 'Not found' });
  }
}
