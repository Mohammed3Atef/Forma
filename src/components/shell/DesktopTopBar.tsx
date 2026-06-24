import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/services/auth/sessionStore';
import { Avatar } from '@/components/Avatar';
import { Icon } from '@/components/Icon';
import { NotificationBell } from '@/components/NotificationBell';

/**
 * Desktop/tablet top bar (≥ md): coach client-search, notifications bell, and an
 * account avatar that opens settings. Hidden on mobile (BrandBar takes over).
 */
export function DesktopTopBar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const account = useSession((s) => s.account);
  const role = account?.role;
  const [q, setQ] = useState('');
  const settingsTo = role === 'coach' ? '/coach/settings' : '/admin/settings';

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    if (role === 'coach') navigate(`/coach/clients?q=${encodeURIComponent(q.trim())}`);
  };

  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-surface/85 px-6 py-3 backdrop-blur-md lg:px-8">
      {role === 'coach' && (
        <form onSubmit={onSearch} className="relative w-full max-w-xs">
          <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-earth-subtle">
            <Icon name="search" size={16} />
          </span>
          <input
            className="input h-10 py-0 ps-9"
            data-testid="coach-topbar-search"
            placeholder={t('coach.searchClients')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </form>
      )}
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
