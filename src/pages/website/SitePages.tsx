import { SiteShell } from './components/SiteShell';
import { useSiteT } from './hooks/useSiteLang';
import type { LegalDocKey } from './legal';
import { useSearchParams } from 'react-router-dom';
import { AuthPage, AuthStandalone } from './sections/Auth';
import { ContactPage } from './sections/Contact';
import { LegalPage } from './sections/Legal';
import { AppStory } from './sections/AppStory';
import { Build } from './sections/Build';
import { Business } from './sections/Business';
import { Checkins } from './sections/Checkins';
import { CoachLed } from './sections/CoachLed';
import { Day } from './sections/Day';
import { FinalCta } from './sections/FinalCta';
import { Hero } from './sections/Hero';
import { How } from './sections/How';
import { SvgDefs } from './components/SvgDefs';
import { Messages } from './sections/Messages';
import { Pricing } from './sections/Pricing';
import { Progress } from './sections/Progress';
import { SystemMap } from './sections/SystemMap';
import { Workspace } from './sections/Workspace';

const HOME_TITLE = 'Forma — Every client. Every plan. One place.';
const DESCRIPTION =
  'Forma is the coach-led platform for independent fitness coaches: clients, programs, progress, check-ins and messaging in one place.';

export function SiteHome() {
  return (
    <SiteShell page="home" title={HOME_TITLE} description={DESCRIPTION} testId="website-home">
      {/* k = position on the page (selects the ambient motifs) */}
      <SvgDefs />
      <Hero k={0} />
      <How k={1} />
      <Workspace k={2} />
      <Build k={3} />
      <AppStory k={4} />
      <Progress k={5} />
      <Checkins k={6} />
      <Messages k={7} />
      <Business k={8} />
      <Day k={9} />
      <CoachLed k={10} />
      <SystemMap k={11} />
      <Pricing k={12} />
      <FinalCta k={13} />
    </SiteShell>
  );
}

export function SiteContact() {
  return (
    <SiteShell page="contact" title="Contact — Forma" description={DESCRIPTION} testId="website-contact">
      <ContactPage />
    </SiteShell>
  );
}

const LEGAL_TITLES: Record<LegalDocKey, [string, string]> = {
  terms: ['Terms of Service', 'شروط الخدمة'],
  privacy: ['Privacy Policy', 'سياسة الخصوصية'],
  cookies: ['Cookie Policy', 'سياسة ملفات الارتباط'],
};

export function SiteLegal({ doc }: { doc: LegalDocKey }) {
  const { lang } = useSiteT();
  return (
    <SiteShell page="legal" title={`${LEGAL_TITLES[doc][lang === 'ar' ? 1 : 0]} — Forma`} description={DESCRIPTION} testId="website-legal">
      <LegalPage doc={doc} />
    </SiteShell>
  );
}

/** Installed PWA (opened from the home screen) — behaves like an app, not a brochure. */
const isStandalone =
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true);

/** /login (and every unknown signed-out deep link): sign in or create a coach account. */
export function SiteAuth() {
  const { t } = useSiteT();
  const [params] = useSearchParams();
  const ns = params.get('signup') === '1' ? 'auth.signup' : 'auth.signin';
  return (
    <SiteShell page="auth" title={t(`${ns}.pageTitle`)} description={DESCRIPTION} testId="website-auth" chrome={!isStandalone}>
      {isStandalone ? <AuthStandalone /> : <AuthPage />}
    </SiteShell>
  );
}
