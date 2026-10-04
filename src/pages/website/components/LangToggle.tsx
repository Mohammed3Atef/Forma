import { cx } from '../cx';
import { useSiteT, useToggleLang } from '../hooks/useSiteLang';
import { Icon } from './Icon';

/**
 * Language switch: globe + the name of the language you'd switch TO, each in
 * its own script's face (العربية in the Arabic face, English in Poppins).
 */
export function LangToggle({ testId, className }: { testId?: string; className?: string }) {
  const { t, lang } = useSiteT();
  const toggle = useToggleLang();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={t('shell.lang.aria')}
      data-testid={testId}
      lang={lang === 'ar' ? 'en' : 'ar'}
      className={cx(
        'inline-flex h-[38px] cursor-pointer items-center gap-[7px] rounded-full border border-site-line2 bg-[rgba(255,238,228,.04)] pe-[14px] ps-[11px] text-[13px] font-medium leading-[normal] text-earth-muted transition-[color,background,border-color] duration-200 hover:border-site-line3 hover:bg-[rgba(255,238,228,.08)] hover:text-earth',
        lang === 'ar' ? 'font-sans' : 'font-site-ar text-[14px]',
        className,
      )}
    >
      <Icon name="globe" size={16} className="text-brand-hover" />
      <span>{t('shell.lang.label')}</span>
    </button>
  );
}
