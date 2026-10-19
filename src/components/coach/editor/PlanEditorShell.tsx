import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, IconButton } from '@/components/ui/Button';
import { ActionMenu, type ActionMenuItem } from '@/components/ui/ActionMenu';
import { PlanConflictBanner } from '@/components/coach/PlanEditorStates';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useIsTabletUp } from '@/hooks/useMediaQuery';
import { useKeyboardInset } from '@/hooks/useKeyboardInset';

export interface EditorBarState {
  saving: boolean;
  dirty: boolean;
  justSaved: boolean;
  conflict: boolean;
  saveFailed: boolean;
  canSave: boolean;
}

/**
 * The plan editors' frame (B3.5, blueprint §6.4 shared rules):
 *  - a full-screen task on phones (its own layer above the shell's header and tabs) and a page in
 *    the shell on wider screens;
 *  - one header owning the only Back, the client's name, and the editor's secondary actions;
 *  - a bottom bar with the save state and Save — outside the scrolling body, so it never covers
 *    an input, and lifted above the on-screen keyboard;
 *  - the shared notices: changed elsewhere (CAS conflict), not saved, offline, restored draft.
 * Saving itself stays with `usePlanEditor` (load gate, compare-and-set, drafts — contracts C1–C4).
 */
export function PlanEditorShell({
  testId,
  prefix,
  title,
  subtitle,
  onBack,
  state,
  onSave,
  saveLabel,
  conflict,
  draftRestored,
  draftStale,
  onDiscardDraft,
  headerActions,
  menu,
  notices,
  children,
}: {
  /** Root of the header (the QA suite finds the editor and its Back by this). */
  testId: string;
  /** Test-id prefix of the bar: `<prefix>-save`, `-saving`, `-unsaved`, `-saved`, `-offline`, `-clean`. */
  prefix: string;
  title: string;
  subtitle?: string;
  onBack: () => void;
  /** Omitted before a plan exists (load gate): no Save is rendered (contract C1). */
  state?: EditorBarState;
  onSave?: () => void;
  saveLabel?: string;
  /** The plan's compare-and-set conflict banner; `active` defaults to the bar's conflict state. */
  conflict?: { active?: boolean; onLoadLatest: () => void; onKeepMine: () => void };
  draftRestored?: boolean;
  /** The restored draft was made before the plan changed elsewhere — saving will ask first. */
  draftStale?: boolean;
  onDiscardDraft?: () => void;
  headerActions?: ReactNode;
  menu?: ActionMenuItem[];
  notices?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const tabletUp = useIsTabletUp();
  const keyboard = useKeyboardInset(!tabletUp);
  const online = useOnlineStatus();

  const status = !state ? null : state.saving ? (
    <span className="text-earth-muted" data-testid={`${prefix}-saving`}>{t('settings.saving')}</span>
  ) : state.conflict ? (
    <span className="text-warn" data-testid={`${prefix}-conflict`}>{t('trust.planEditor.barConflict')}</span>
  ) : !online && state.dirty ? (
    <span className="text-warn" data-testid={`${prefix}-offline`}>{t('trust.planEditor.barOffline')}</span>
  ) : state.saveFailed && state.dirty ? (
    <span className="text-danger" data-testid={`${prefix}-failed`}>{t('trust.planEditor.barFailed')}</span>
  ) : state.dirty ? (
    <span className="text-warn" data-testid={`${prefix}-unsaved`}>{t('coachEditor.unsavedIndicator')}</span>
  ) : state.justSaved ? (
    <span className="text-success" data-testid={`${prefix}-saved`}>{t('trust.planEditor.savedVersioned')}</span>
  ) : (
    <span className="text-earth-subtle" data-testid={`${prefix}-clean`}>{t('trust.planEditor.barClean')}</span>
  );

  return (
    <div
      className={tabletUp ? 'pb-2' : 'fixed inset-x-0 top-0 z-ui-task flex flex-col bg-surface'}
      style={tabletUp ? undefined : { bottom: keyboard }}
      data-testid="plan-editor"
      {...(tabletUp ? {} : { role: 'dialog', 'aria-modal': true, 'aria-label': title })}
    >
      <header
        data-testid={testId}
        className={`flex shrink-0 items-center gap-2 ${tabletUp ? 'pb-3 pt-1' : 'border-b border-line-soft px-2 pb-2'}`}
        style={tabletUp ? undefined : { paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}
      >
        <IconButton icon="chevronLeft" label={t('common.back')} onClick={onBack} className="border-transparent" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[17px] font-semibold leading-[1.35] md:text-[22px]">{title}</h1>
          {subtitle && (
            <p className="truncate text-[12.5px] text-earth-muted" data-testid="plan-editor-client">
              <bdi>{subtitle}</bdi>
            </p>
          )}
        </div>
        {headerActions}
        {menu && menu.length > 0 && <ActionMenu label={t('coachEditor.moreActions')} items={menu} testId={`${prefix}-more`} />}
      </header>

      <div className={tabletUp ? 'space-y-3' : 'min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 pb-8 pt-3'} data-testid="plan-editor-body">
        {conflict && (conflict.active ?? state?.conflict) && <PlanConflictBanner pending={!!state?.saving} onLoadLatest={conflict.onLoadLatest} onKeepMine={conflict.onKeepMine} />}
        {!online && state && (
          <p className="rounded-ui-control border border-warn/40 bg-warn/10 px-3 py-2 text-[13px] text-warn" role="status" data-testid="plan-editor-offline-notice">
            {t('trust.planEditor.offlineEditing')}
          </p>
        )}
        {online && state?.saveFailed && !state?.conflict && (
          <p className="rounded-ui-control border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger" role="alert" data-testid="plan-editor-save-failed">
            {t('trust.planEditor.saveFailed')}
          </p>
        )}
        {draftRestored && onDiscardDraft && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-ui-control border border-line bg-surface-raised px-3 py-2 text-[13px]" role="status" data-testid="plan-editor-draft-restored">
            <span className="min-w-0 flex-1 text-earth-muted" data-stale={draftStale || undefined}>
              {t(draftStale ? 'trust.planEditor.draftRestoredStale' : 'trust.planEditor.draftRestored')}
            </span>
            <button type="button" className="font-semibold text-brand hover:underline" data-testid="plan-editor-discard-draft" onClick={onDiscardDraft}>
              {t('trust.planEditor.discardDraft')}
            </button>
          </div>
        )}
        {notices}
        {children}
      </div>

      {state && onSave && (
      <div
        data-testid="plan-editor-bar"
        className={`flex shrink-0 items-center gap-3 bg-surface ${
          tabletUp ? 'sticky bottom-0 z-ui-sticky mt-6 rounded-ui-surface border border-line px-4 py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.35)]' : 'border-t border-line-soft px-4 pt-3'
        }`}
        style={tabletUp ? undefined : { paddingBottom: keyboard ? '0.75rem' : 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        <p className="min-w-0 flex-1 truncate text-[13px] font-medium" role="status" aria-live="polite">
          {status}
        </p>
        <Button data-testid={`${prefix}-save`} pending={state.saving} disabled={!state.canSave} offline={!online} onClick={onSave} className="shrink-0">
          {saveLabel ?? t('coachEditor.saveAssigned')}
        </Button>
      </div>
      )}
    </div>
  );
}
