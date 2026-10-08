import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { applyLocale } from '@/i18n';
import { Button, CountBadge, IconButton, LinkButton } from '@/components/ui/Button';
import { StatusChip } from '@/components/ui/Pill';
import { SegmentedControl, Tabs } from '@/components/ui/Tabs';
import { SearchField, TextInput } from '@/components/ui/Field';
import { NumericField } from '@/components/ui/NumericField';
import { SecondLanguageField } from '@/components/ui/SecondLanguageField';
import { Banner, BannerRegion } from '@/components/ui/Banner';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { OfflineState, ScreenState, StaleNotice } from '@/components/ui/ScreenState';
import { SyncStatus } from '@/components/ui/SyncStatus';
import { MediaViewer } from '@/components/media/MediaViewer';
import { useBannerSlot } from '@/stores/bannerRegionStore';
import { playVideo, viewImages, viewMedia } from '@/stores/mediaViewerStore';
import { mediaRef } from '@/lib/mediaRef';
import { formatBytes, formatDate, formatNumber, formatRelative } from '@/lib/format';
import { semanticParent } from '@/lib/navContract';

/**
 * DEV-ONLY foundation showcase (B1.16) at /__foundation — every B1 primitive
 * in one place, so the kit can be checked at 390 / 430 / 768 / 1024 / 1440 in
 * English and Arabic before B2 builds screens on it. Never shipped: App only
 * imports it behind `import.meta.env.DEV`.
 */
const SAMPLE = {
  en: { title: 'Foundation', body: 'Train with intent. Every set, every meal, one calm place.', name: 'Aya Hassan' },
  ar: { title: 'الأساس', body: 'تدرّب بنيّة واضحة. كل مجموعة وكل وجبة في مكان واحد هادئ.', name: 'آية حسن' },
};

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} data-testid={`fs-${id}`} className="space-y-3 border-t border-line pt-5">
      <h2 className="t-tag text-earth-muted">{title}</h2>
      {children}
    </section>
  );
}

function DemoNotice({ id, priority, tone, text }: { id: string; priority: number; tone: 'danger' | 'warning' | 'brand'; text: string }) {
  const show = useBannerSlot(id, priority, true);
  return show ? (
    <Banner tone={tone} icon="info" testId={`fs-notice-${id}`}>
      {text}
    </Banner>
  ) : null;
}

export function FoundationShowcase() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const s = lang.startsWith('ar') ? SAMPLE.ar : SAMPLE.en;
  const [seg, setSeg] = useState<'day' | 'week' | 'month'>('week');
  const [tab, setTab] = useState('overview');
  const [weight, setWeight] = useState<number | null>(72.5);
  const [ar, setAr] = useState('');
  const [pending, setPending] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    // A local sample image (blob:) so the viewer works with no network.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="#241E1A"/><circle cx="300" cy="360" r="140" fill="#FF8B02"/></svg>`;
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, []);

  return (
    <div className="min-h-dvh bg-surface text-earth" data-testid="foundation-showcase">
      <div className="mx-auto max-w-3xl space-y-6 px-4 pb-24 pt-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="t-tag text-brand-hover">B1 · DEV</p>
            <h1 className="t-display truncate">{s.title}</h1>
          </div>
          <SegmentedControl
            label="Language"
            value={(lang === 'ar-eg' ? 'ar-eg' : lang.startsWith('ar') ? 'ar' : 'en') as 'en' | 'ar' | 'ar-eg'}
            onChange={(l) => void applyLocale(l)}
            options={[
              { value: 'en', label: 'EN' },
              { value: 'ar', label: 'عربي' },
              { value: 'ar-eg', label: 'مصري' },
            ]}
            testIdPrefix="fs-lang"
            className="w-48"
          />
        </header>

        <Section id="type" title="Type roles">
          <p className="t-display">{s.title}</p>
          <p className="t-title">{s.name}</p>
          <p className="t-body">{s.body}</p>
          <p className="t-caption text-earth-muted">{formatDate(Date.now(), lang, 'full')} · {formatRelative(Date.now() - 5 * 60_000, lang)}</p>
          <p className="t-numeric">
            {formatNumber(1234567.89, lang)} · {formatBytes(3_400_000, lang)}
          </p>
        </Section>

        <Section id="color" title="Colour · radius · elevation">
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
            {['bg', 'surface', 'surface-raised', 'surface-interactive', 'accent', 'success', 'warning', 'error'].map((c) => (
              <div key={c} className="space-y-1">
                <div className="h-10 rounded-ui-control border border-line" style={{ background: `rgb(var(--ui-${c}))` }} />
                <p className="truncate text-[11px] text-earth-subtle">{c}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            {['ui-control', 'ui-surface', 'ui-surface-lg', 'ui-pill'].map((r) => (
              <div key={r} className={`flex h-14 w-24 items-center justify-center border border-line bg-surface-raised text-[11px] rounded-${r}`}>
                {r}
              </div>
            ))}
          </div>
        </Section>

        <Section id="buttons" title="Buttons">
          <div className="flex flex-wrap gap-2">
            <Button>{t('common.save')}</Button>
            <Button variant="secondary">{t('common.cancel')}</Button>
            <Button variant="tonal" icon="plus">{t('coachDash.addClient')}</Button>
            <Button variant="ghost">{t('common.retry')}</Button>
            <Button variant="danger">{t('common.delete')}</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm">{t('common.save')}</Button>
            <Button size="lg" pending={pending} onClick={() => { setPending(true); setTimeout(() => setPending(false), 1500); }} data-testid="fs-pending">
              {t('common.save')}
            </Button>
            <Button offline>{t('common.save')}</Button>
            <LinkButton to="/__foundation#buttons" size="sm">{t('common.next')}</LinkButton>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <IconButton icon="bell" label={t('notifications.title')} badge={<CountBadge count={12} className="absolute -end-0.5 -top-0.5" />} data-testid="fs-iconbutton" />
            <IconButton icon="close" size="sm" label={t('common.dismiss')} />
            <IconButton icon="chevron" label={t('common.next')} />
            <CountBadge count={3} />
          </div>
        </Section>

        <Section id="status" title="Status · tabs · segments">
          <div className="flex flex-wrap gap-2">
            <StatusChip tone="ok">{t('subscription.status.active')}</StatusChip>
            <StatusChip tone="warn">{t('subscription.status.frozen')}</StatusChip>
            <StatusChip tone="bad">{t('subscription.status.expired')}</StatusChip>
            <StatusChip tone="info">{t('subscription.status.trial', { defaultValue: 'Trial' })}</StatusChip>
            <StatusChip tone="mute">{t('subscription.status.none', { defaultValue: '—' })}</StatusChip>
          </div>
          <Tabs
            tabs={[
              { key: 'overview', label: t('workspace.tabs.overview') },
              { key: 'workout', label: t('workspace.tabs.workout') },
              { key: 'nutrition', label: t('workspace.tabs.nutrition') },
              { key: 'checkins', label: t('workspace.tabs.checkins') },
            ]}
            active={tab}
            onChange={setTab}
            testIdPrefix="fs-tab"
          />
          <SegmentedControl
            label="Range"
            value={seg}
            onChange={setSeg}
            options={[
              { value: 'day', label: '1D' },
              { value: 'week', label: '1W' },
              { value: 'month', label: '1M' },
            ]}
            className="max-w-xs"
          />
        </Section>

        <Section id="fields" title="Fields">
          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput label={t('settings.name')} defaultValue={s.name} helper={t('auth.pwHint')} />
            <TextInput label={t('settings.email')} type="email" error={t('common.errorGeneric')} defaultValue="aya@" />
            <SearchField label={t('coach.searchClients')} srOnlyLabel placeholder={t('coach.searchClients')} />
            <NumericField label={t('progress.weight', { defaultValue: 'Weight' })} value={weight} onChange={setWeight} step={0.5} stepper suffix="kg" testId="fs-numeric" />
          </div>
          <SecondLanguageField lang="ar" value={ar} onChange={setAr} testId="fs-second-lang" />
        </Section>

        <Section id="banners" title="Banners · one region">
          <BannerRegion>
            <DemoNotice id="announcement" priority={10} tone="brand" text={s.body} />
            <DemoNotice id="conflict" priority={100} tone="warning" text={t('trust.sync.conflictTitle')} />
            <DemoNotice id="subscription" priority={90} tone="danger" text={t('subscription.bannerExpired')} />
          </BannerRegion>
          <Banner tone="success" icon="check" title={t('common.save')} onDismiss={() => undefined}>
            {s.body}
          </Banner>
        </Section>

        <Section id="states" title="Screen states">
          <div className="grid gap-3 sm:grid-cols-2">
            <LoadingState variant="list" count={2} />
            <OfflineState onRetry={() => undefined} />
            <ErrorState onRetry={() => undefined} />
            <EmptyState icon="user" title={t('states.emptyTitle')} message={s.body} />
          </div>
          <ScreenState loading={false} error hasData testId="fs-stale">
            <div className="card text-sm">{s.body}</div>
          </ScreenState>
          <StaleNotice online={false} />
        </Section>

        <Section id="sync" title="Sync status">
          <div className="flex flex-wrap items-center gap-3">
            <SyncStatus variant="inline" />
          </div>
          <div className="card">
            <SyncStatus variant="detail" />
          </div>
        </Section>

        <Section id="media" title="Media viewer">
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon="image" disabled={!imageUrl} onClick={() => imageUrl && viewImages([imageUrl, imageUrl], 0)} data-testid="fs-open-image">
              {t('media.kind.image')}
            </Button>
            <Button variant="secondary" icon="video" onClick={() => playVideo('https://drive.google.com/file/d/x/view')} data-testid="fs-open-video">
              {t('media.kind.video')}
            </Button>
            <Button variant="secondary" icon="list" onClick={() => viewMedia(mediaRef('https://cdn.example/plan.pdf', 'file', { name: 'plan.pdf' }))} data-testid="fs-open-file">
              {t('media.kind.file')}
            </Button>
          </div>
        </Section>

        <Section id="nav" title="Navigation contract">
          <ul className="space-y-1 text-[13px]">
            {['/coach/client/c1/checkins', '/coach/messages/c1', '/workout/routine/d1', '/check-in/2026-10-05'].map((p) => (
              <li key={p} className="flex flex-wrap justify-between gap-2 border-b border-line py-1.5">
                <span className="t-numeric" dir="ltr">{p}</span>
                <span className="t-numeric text-earth-muted" dir="ltr">↑ {semanticParent(p, p.startsWith('/coach') ? 'coach' : 'client')}</span>
              </li>
            ))}
          </ul>
        </Section>
      </div>
      <MediaViewer />
    </div>
  );
}
