import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';
import { CLIENT_NAV, type NavItem } from '@/config/nav';

export function BottomNav({ items = CLIENT_NAV }: { items?: NavItem[] }) {
  const { t } = useTranslation();
  return (
    <nav
      data-testid="bottom-nav"
      className="fixed inset-x-0 bottom-0 z-40 bg-gradient-to-t from-black from-[58%] via-black/90 to-transparent"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-between px-2 pb-2 pt-2.5">
        {items.map((item) => (
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
                  <span className={isActive ? 'text-brand' : ''}>
                    <Icon name={item.icon} size={22} />
                  </span>
                  <span className="font-mono text-[9.5px] uppercase tracking-[0.06em]">
                    {t(`nav.${item.key}`)}
                  </span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
