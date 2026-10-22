import { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SectionTabs } from '@/components/ui/SectionTabs';
import { Skeleton } from '@/components/ui/Skeleton';
import { useSession } from '@/services/auth/sessionStore';
import type { BusinessTabProps } from './parts';

export const BUSINESS_TABS = ['overview', 'renewals', 'packages', 'exports'] as const;
export type BusinessTab = (typeof BUSINESS_TABS)[number];
export const businessTabOf = (v: string | null): BusinessTab => (BUSINESS_TABS as readonly string[]).includes(v ?? '') ? (v as BusinessTab) : 'overview';

// Each tab is its own chunk: opening Business loads only the one on screen (budget §9).
const TAB_VIEW: Record<BusinessTab, React.LazyExoticComponent<(p: BusinessTabProps) => JSX.Element>> = {
  overview: lazy(() => import('./OverviewTab')),
  renewals: lazy(() => import('./RenewalsTab')),
  packages: lazy(() => import('./PackagesTab')),
  exports: lazy(() => import('./ExportsTab')),
};
const PANEL_ID = 'business-panel';

/**
 * Me › Business (B3.8, blueprint §6.7) — "a report, not a daily tab" (doc 16 P7): this month in
 * truthful figures (Booked · Due · Lost, per currency — `lib/coachBusiness`), the renewals and lapsed
 * clients to act on (Renew right here), the packages a coach offers, and row-level exports. It
 * replaces the Revenue, Reports and Client Plans pages (their URLs redirect here). The tab lives in
 * the URL (`?tab=`), so Back, a reload and links restore it.
 */
export function CoachBusiness() {
  const { t } = useTranslation();
  const coachId = useSession((s) => s.account?.id ?? '');
  const [params, setParams] = useSearchParams();
  const tab = businessTabOf(params.get('tab'));
  const View = TAB_VIEW[tab];

  return (
    <div className="w-full pb-6 pt-3" data-testid="coach-business" data-tab={tab}>
      <header className="mb-3">
        <h1 className="t-title">{t('business.title')}</h1>
        <p className="mt-0.5 hidden text-[14px] text-earth-muted sm:block">{t('business.subtitle')}</p>
      </header>

      <SectionTabs
        className="mb-4"
        label={t('business.sections')}
        panelId={PANEL_ID}
        testIdPrefix="biz-tab"
        active={tab}
        onChange={(next) => setParams(next === 'overview' ? {} : { tab: next }, { replace: true })}
        tabs={BUSINESS_TABS.map((key) => ({ key, label: t(`business.tabs.${key}`) }))}
      />

      <div role="tabpanel" id={PANEL_ID} aria-labelledby={`${PANEL_ID}-tab-${tab}`}>
        <Suspense
          fallback={
            <div className="space-y-3" aria-busy="true">
              <Skeleton className="h-32 w-full rounded-ui-surface" />
              <Skeleton className="h-14 w-full rounded-ui-control" />
            </div>
          }
        >
          <View key={tab} coachId={coachId} />
        </Suspense>
      </div>
    </div>
  );
}
