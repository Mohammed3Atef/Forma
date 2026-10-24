import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet } from '@/components/Sheet';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/Icon';

export interface AddTarget {
  key: string;
  title: ReactNode;
  meta?: ReactNode;
}

/**
 * The last step of "Use in a client plan" (B3.7), inside the client's own editor: where the item
 * goes — a day (or one of its named sections) / a meal, or a new one. Choosing adds it to the plan
 * as an unsaved change; nothing is saved until the coach saves the plan. `missing` explains an item
 * that no longer exists instead of adding anything.
 */
export function LibraryAddPrompt({
  open,
  title,
  hint,
  targets,
  newLabel,
  onPick,
  onCancel,
  missing,
  testId,
}: {
  open: boolean;
  title: string;
  hint: string;
  targets: AddTarget[];
  newLabel: string;
  /** A target's key, or `null` for a new day / meal. */
  onPick: (key: string | null) => void;
  onCancel: () => void;
  missing?: string | null;
  testId: string;
}) {
  const { t } = useTranslation();
  return (
    <Sheet open={open} onClose={onCancel} size="md" title={title}>
      <div className="space-y-3" data-testid={testId}>
        {missing ? (
          <>
            <p className="rounded-ui-control border border-warn/40 bg-warn/10 px-3 py-2 text-[13.5px] text-warn" role="alert" data-testid={`${testId}-missing`}>
              {missing}
            </p>
            <Button variant="secondary" fullWidth onClick={onCancel}>
              {t('common.close')}
            </Button>
          </>
        ) : (
          <>
            <p className="text-[13.5px] text-earth-muted">{hint}</p>
            <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-ui-surface border border-white/[0.07]">
              {targets.map((tg) => (
                <li key={tg.key}>
                  <button type="button" className="flex min-h-ui-hit w-full items-center gap-3 px-3 py-2.5 text-start hover:bg-white/[0.03]" data-testid={`${testId}-target`} onClick={() => onPick(tg.key)}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{tg.title}</span>
                      {tg.meta ? <span className="block truncate text-[12.5px] text-earth-subtle">{tg.meta}</span> : null}
                    </span>
                    <Icon name="plus" size={16} className="shrink-0 text-brand" />
                  </button>
                </li>
              ))}
              <li>
                <button type="button" className="flex min-h-ui-hit w-full items-center gap-3 px-3 py-2.5 text-start hover:bg-white/[0.03]" data-testid={`${testId}-new`} onClick={() => onPick(null)}>
                  <span className="min-w-0 flex-1 font-medium text-brand">{newLabel}</span>
                  <Icon name="plus" size={16} className="shrink-0 text-brand" />
                </button>
              </li>
            </ul>
            <Button variant="ghost" fullWidth onClick={onCancel} data-testid={`${testId}-cancel`}>
              {t('common.cancel')}
            </Button>
          </>
        )}
      </div>
    </Sheet>
  );
}
