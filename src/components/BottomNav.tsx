import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';
import { CLIENT_NAV, type NavItem } from '@/config/nav';
import { useCoachMessageUnread } from '@/hooks/useCoachMessageUnread';

export function BottomNav({ items = CLIENT_NAV }: { items?: NavItem[] }) {
  const { t } = useTranslation();
  const coachUnread = useCoachMessageUnread(); // 0 unless a coach is signed in
  return (
    <nav
      data-testid="bottom-nav"
      className="fixed inset-x-0 bottom-0 z-40 bg-gradient-to-t from-black from-[58%] via-black/90 to-transparent"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="mx-auto flex max-w-md items-end justify-between px-2 pb-2 pt-2.5">
        {items.map((item) =>
          item.center ? (
            <li key={item.key} className="flex flex-1 justify-center">
              <NavLink
                to={item.to}
                end={item.end ?? false}
                data-testid={`nav-${item.key}`}
                aria-label={t(`nav.${item.key}`)}
                className={({ isActive }) =>
                  `-mt-8 flex h-16 w-16 items-center justify-center rounded-full border-4 border-black shadow-deep transition-transform active:scale-95 ${
                    isActive ? 'bg-brand text-black' : 'bg-brand/90 text-black'
                  }`
                }
              >
                <Icon name={item.icon} size={26} />
              </NavLink>
            </li>
          ) : (
            <li key={item.key} className="flex-1">
              <NavLink
                to={item.to}
                end={item.end ?? false}
                data-testid={`nav-${item.key}`}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-1.5 py-1.5 ${isActive ? 'text-white' : 'text-earth-subtle'}`
                }
              >
                {({ isActive }) => (
                  <>
                    <span className={`relative ${isActive ? 'text-brand' : ''}`}>
                      <Icon name={item.icon} size={22} />
                      {item.key === 'coachMessages' && coachUnread > 0 && (
                        <span
                          data-testid="nav-messages-badge"
                          className="absolute -end-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold text-white"
                        >
                          {coachUnread > 9 ? '9+' : coachUnread}
                        </span>
                      )}
                    </span>
                    <span className="font-mono text-[9.5px] uppercase tracking-[0.06em]">
                      {t(`nav.${item.key}`)}
                    </span>
                  </>
                )}
              </NavLink>
            </li>
          ),
        )}
      </ul>
    </nav>
  );
}
