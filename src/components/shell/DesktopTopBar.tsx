import { useNavigate } from 'react-router-dom';
import { useSession } from '@/services/auth/sessionStore';
import { Avatar } from '@/components/Avatar';
import { NotificationBell } from '@/components/NotificationBell';
import { GlobalSearch } from '@/components/ui/GlobalSearch';
import { useCommandStore } from '@/stores/commandStore';

/**
 * Desktop/tablet top bar (≥ md): the single global search (⌘K → command
 * palette), notifications bell, and an account avatar that opens settings.
 * Hidden on mobile (BrandBar takes over). The per-page hero no longer repeats
 * these — they live only here.
 */
export function DesktopTopBar() {
  const navigate = useNavigate();
  const account = useSession((s) => s.account);
  const role = account?.role;
  const openSearch = useCommandStore((s) => s.show);
  const settingsTo = role === 'coach' ? '/coach/settings' : '/admin/settings';

  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-surface/85 px-6 py-3 backdrop-blur-md lg:px-8">
      <GlobalSearch onOpen={openSearch} className="w-full max-w-xs" />
      <div className="ms-auto flex items-center gap-2">
        <NotificationBell />
        <Avatar
          name={account?.displayName || account?.email || ''}
          photoUrl={account?.photoUrl}
          size="sm"
          rounded="rounded-full"
          onClick={() => navigate(settingsTo)}
        />
      </div>
    </header>
  );
}
