import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import type { NoteVisibility } from '@/types';

/**
 * B0 / CO-02, CO-21: every coach note is either PRIVATE (coach-only, the
 * default) or explicitly shared with the client. The server enforces it; this
 * makes the choice visible wherever a coach writes or reads a note.
 */
export function NoteVisibilityToggle({ value, onChange }: { value: NoteVisibility; onChange: (v: NoteVisibility) => void }) {
  const { t } = useTranslation();
  const shared = value === 'client';
  return (
    <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl border border-line-soft px-3 py-2.5">
      <input
        type="checkbox"
        data-testid="note-visibility-toggle"
        className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
        checked={shared}
        onChange={(e) => onChange(e.target.checked ? 'client' : 'private')}
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{t('trust.notes.visibleToClient')}</span>
        <span className="block text-[12px] text-earth-muted" data-testid="note-visibility-hint">
          {t(shared ? 'trust.notes.sharedHint' : 'trust.notes.privateHint')}
        </span>
      </span>
    </label>
  );
}

/** Legacy notes with no visibility are private (matches the server). */
export function NoteVisibilityBadge({ visibility }: { visibility?: NoteVisibility }) {
  const { t } = useTranslation();
  const shared = visibility === 'client';
  return (
    <span
      data-testid="note-visibility-badge"
      data-visibility={shared ? 'client' : 'private'}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium ${shared ? 'bg-brand/10 text-brand-light' : 'bg-surface-raised text-earth-muted'}`}
    >
      <Icon name={shared ? 'user' : 'shield'} size={11} />
      {t(shared ? 'trust.notes.shared' : 'trust.notes.private')}
    </span>
  );
}
