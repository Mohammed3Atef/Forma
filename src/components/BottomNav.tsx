import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Icon, type IconName } from './Icon';

const ITEMS: { to: string; icon: IconName; key: string }[] = [
  { to: '/', icon: 'home', key: 'home' },
  { to: '/workout', icon: 'dumbbell', key: 'workout' },
  { to: '/nutrition', icon: 'meal', key: 'nutrition' },
  { to: '/cardio', icon: 'activity', key: 'cardio' },
  { to: '/progress', icon: 'chart', key: 'progress' },
  { to: '/settings', icon: 'user', key: 'settings' },
];

export function BottomNav() {
  const { t } = useTranslation();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 bg-gradient-to-t from-black from-[58%] via-black/90 to-transparent"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-between px-2 pb-2 pt-2.5">
        {ITEMS.map((item) => (
          <li key={item.key} className="flex-1">
            <NavLink
              to={item.to}
              end={item.to === '/'}
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
