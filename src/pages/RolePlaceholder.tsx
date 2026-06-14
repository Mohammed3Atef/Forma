import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { Icon, type IconName } from '@/components/Icon';

/**
 * Stub screen for role surfaces that are scaffolded but not yet built out.
 * Replaced by real screens in later phases.
 */
export function RolePlaceholder({
  titleKey,
  eyebrowKey,
  icon = 'bolt',
}: {
  titleKey: string;
  eyebrowKey?: string;
  icon?: IconName;
}) {
  const { t } = useTranslation();
  return (
    <>
      <TopBar title={t(titleKey)} eyebrow={eyebrowKey ? t(eyebrowKey) : undefined} />
      <div className="card flex flex-col items-center gap-3 py-12 text-center">
        <span className="text-brand">
          <Icon name={icon} size={32} />
        </span>
        <p className="text-sm text-earth-muted">{t('platform.comingSoon')}</p>
      </div>
    </>
  );
}
