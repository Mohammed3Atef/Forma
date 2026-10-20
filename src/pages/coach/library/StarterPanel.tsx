import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { Button } from '@/components/ui/Button';
import { useCanEdit } from './parts';
import { useStarterLibrary } from './useStarterLibrary';

/**
 * The first-run panel (CO-23, EX-08, EX-23): what the starter library is — honestly — and one
 * prominent action to add it, next to creating your own.
 */
export default function StarterPanel({ createLabel, onCreate, createTestId }: { createLabel: string; onCreate?: () => void; createTestId?: string }) {
  const { t } = useTranslation();
  const { canEdit, reason } = useCanEdit();
  const starter = useStarterLibrary();
  return (
    <section className="rounded-ui-surface border border-brand/25 bg-brand/[0.06] p-5 sm:p-6" data-testid="lib-starter">
      <div className="flex items-start gap-3">
        <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-brand/30 bg-brand/10 text-brand sm:flex">
          <Icon name="download" size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-semibold">{t('library.starter.title')}</h2>
          <p className="mt-1 max-w-2xl text-[14px] text-earth-muted">{t('library.starter.body')}</p>
          <ul className="mt-3 grid gap-1.5 text-[13.5px] text-earth-muted sm:grid-cols-2">
            {(['programs', 'exercises', 'foods', 'supplements'] as const).map((k) => (
              <li key={k} className="flex items-start gap-2">
                <Icon name="check" size={15} className="mt-0.5 shrink-0 text-brand" />
                <span>{t(`library.starter.includes.${k}`)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[12.5px] text-earth-subtle">{t('library.starter.honesty')}</p>
          <div className="mt-4 grid gap-2 sm:flex sm:flex-wrap">
            <Button icon="download" pending={starter.pending} disabled={!canEdit} title={reason} onClick={() => void starter.run()} data-testid="load-starter-library">
              {t('starter.load')}
            </Button>
            {onCreate ? (
              <Button variant="secondary" icon="plus" disabled={!canEdit} title={reason} onClick={onCreate} data-testid={createTestId}>
                {createLabel}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
