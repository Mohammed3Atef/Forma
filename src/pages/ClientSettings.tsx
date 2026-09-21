import { Navigate } from 'react-router-dom';

/**
 * `/settings/app` is a legacy deep link — the Preferences section it used to
 * own now lives as a tab inside the unified `Settings` workspace at `/settings`.
 */
export function ClientSettings() {
  return <Navigate to="/settings?tab=preferences" replace />;
}
