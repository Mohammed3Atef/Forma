import { useEffect, useRef, useState } from 'react';
import { cx } from '../cx';
import { SiteLink, useSite } from '../nav';
import { useSiteT } from '../hooks/useSiteLang';
import { Icon } from './Icon';
import { Sr, Wrap } from './layout';
import { LangToggle } from './LangToggle';
import { ButtonArrow, buttonClass, SiteButton } from './SiteButton';

export const WORDMARK = '/website/forma-wordmark.webp';

/** Primary nav targets (design site.js LINKS): home sections + the contact page. */
export function useNavLinks() {
  const { page } = useSite();
  const home = page === 'home' ? '' : '/';
  return [
    { key: 'product', to: `${home}#workspace` },
    { key: 'how', to: `${home}#how` },
    { key: 'coaches', to: `${home}#day` },
    { key: 'pricing', to: `${home}#pricing` },
    { key: 'contact', to: '/contact' },
  ] as const;
}

const navLink =
  'rounded-full px-[14px] py-[10px] font-mono text-[12px] uppercase tracking-[.06em] no-underline transition-[color,background] duration-200 hover:bg-[rgba(255,238,228,.05)] hover:text-earth rtl:font-site-ar rtl:normal-case rtl:tracking-normal';

const roundBtn = 'grid h-11 w-11 cursor-pointer place-items-center rounded-full border border-site-line2 bg-transparent text-earth';

/** Fixed top bar (design #nav) + the full-screen mobile menu (design .msheet). */
export function SiteNav() {
  const { t } = useSiteT();
  const { page } = useSite();
  const links = useNavLinks();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const burgerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Menu open: lock page scroll, focus the close button; Escape closes and returns focus to the burger.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focus = window.setTimeout(() => closeRef.current?.focus(), 50);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      burgerRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.clearTimeout(focus);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <>
      <header
        id="nav"
        className={cx(
          'fixed inset-x-0 top-0 z-50 border-b transition-[background,border-color,backdrop-filter] duration-300',
          scrolled ? 'border-site-line bg-[rgba(12,10,9,.8)] backdrop-blur-[14px] backdrop-saturate-[1.2]' : 'border-transparent',
        )}
      >
        <Wrap className="flex h-[72px] items-center gap-5">
          <SiteLink to={page === 'home' ? '#top' : '/'} aria-label={t('shell.nav.homeLabel')} className="flex flex-none items-center">
            <img src={WORDMARK} alt="Forma" width={94} height={30} className="h-[30px] w-auto" />
          </SiteLink>
          <nav aria-label={t('shell.nav.primary')} className="mx-auto hidden items-center gap-[2px] min-[1000px]:flex">
            {links.map((l) => (
              <SiteLink key={l.key} to={l.to} className={cx(navLink, page === l.key ? 'text-earth' : 'text-earth-muted')}>
                {t(`shell.nav.${l.key}`)}
              </SiteLink>
            ))}
          </nav>
          <div className="ms-auto flex items-center gap-[6px] min-[1000px]:ms-0">
            <LangToggle testId="website-lang-toggle" />
            <SiteButton variant="ghost" auth="login" className="hidden min-[1000px]:inline-flex" testId="website-login">
              {t('shell.login')}
            </SiteButton>
            <SiteButton sm auth="signup" className="hidden min-[600px]:inline-flex" testId="website-cta-primary">
              <span>{t('shell.start')}</span>
            </SiteButton>
            <button ref={burgerRef} type="button" aria-expanded={open} aria-controls="msheet" onClick={() => setOpen(true)} className={cx(roundBtn, 'min-[1000px]:hidden')}>
              <Icon name="menu" />
              <Sr>{t('shell.menu')}</Sr>
            </button>
          </div>
        </Wrap>
      </header>

      <div
        id="msheet"
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        className={cx(
          'fixed inset-0 z-[60] bg-[rgba(8,6,5,.6)] backdrop-blur-[6px] transition-opacity duration-300',
          open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
        )}
      >
        <div
          className={cx(
            'absolute inset-0 flex flex-col overflow-y-auto bg-surface px-[clamp(20px,5vw,40px)] pb-7 transition-transform duration-[400ms] ease-card',
            "before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(70%_40%_at_80%_0%,rgba(255,139,2,.14),transparent_70%)] before:content-['']",
            open ? 'translate-y-0' : '-translate-y-3',
          )}
        >
          <div className="relative flex h-[72px] items-center justify-between">
            <img src={WORDMARK} alt="Forma" className="h-7 w-auto" />
            <div className="flex gap-2">
              <LangToggle />
              <button ref={closeRef} type="button" onClick={close} className={roundBtn}>
                <Icon name="x" />
                <Sr>{t('shell.close')}</Sr>
              </button>
            </div>
          </div>
          <div className="relative mt-7 flex flex-col">
            {links.map((l, i) => (
              <SiteLink
                key={l.key}
                to={l.to}
                onClick={close}
                style={{ transitionDelay: `${60 + i * 45}ms` }}
                className={cx(
                  'flex items-center justify-between border-b border-site-line px-[2px] py-[18px] font-display text-[26px] font-semibold tracking-[-.02em] text-earth no-underline transition-[opacity,transform] duration-[400ms] ease-card',
                  open ? 'translate-y-0 opacity-100' : 'translate-y-[10px] opacity-0',
                )}
              >
                <span>{t(`shell.nav.${l.key}`)}</span>
                <Icon name="arrowR" className="text-site-tx3" />
              </SiteLink>
            ))}
          </div>
          <div className="relative mt-auto flex flex-col gap-3 pt-7">
            <SiteLink to="" auth="signup" onClick={close} className={buttonClass('primary')}>
              <span>{t('shell.start')}</span>
              <ButtonArrow />
            </SiteLink>
            <SiteLink to="" auth="login" onClick={close} className={buttonClass('secondary')}>
              {t('shell.login')}
            </SiteLink>
          </div>
        </div>
      </div>
    </>
  );
}
