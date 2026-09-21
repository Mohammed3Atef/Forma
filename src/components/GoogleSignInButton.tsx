import { useEffect, useId, useRef } from 'react';

/**
 * Google Identity Services "Sign in with Google" button. Loads the GIS
 * script once (shared across mounts), then renders Google's own button into
 * a div and forwards the returned ID token — verification happens server-side
 * in `auth.googleSignIn`, this component never trusts the token itself.
 */

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: { client_id: string; callback: (resp: { credential: string }) => void }) => void;
          renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

let scriptPromise: Promise<void> | null = null;
function loadGoogleScript(): Promise<void> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) { resolve(); return; }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Sign-In'));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export function GoogleSignInButton({ onCredential, disabled }: { onCredential: (idToken: string) => void; disabled?: boolean }) {
  const containerId = useId().replace(/:/g, '');
  const ref = useRef<HTMLDivElement>(null);
  const onCredentialRef = useRef(onCredential);
  onCredentialRef.current = onCredential;

  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId || !ref.current) return;
    let cancelled = false;
    void loadGoogleScript().then(() => {
      if (cancelled || !ref.current || !window.google) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (resp) => onCredentialRef.current(resp.credential),
      });
      window.google.accounts.id.renderButton(ref.current, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        width: 320,
        text: 'continue_with',
        shape: 'pill',
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!import.meta.env.VITE_GOOGLE_CLIENT_ID) return null;

  return <div id={containerId} ref={ref} data-testid="google-signin-button" className={`flex justify-center ${disabled ? 'pointer-events-none opacity-40' : ''}`} />;
}
