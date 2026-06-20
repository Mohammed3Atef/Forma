import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet } from '@/components/Sheet';
import { ChangePasswordSheet } from '@/components/ChangePasswordSheet';
import { useSession } from '@/services/auth/sessionStore';

/**
 * One-time prompt shown when an admin/coach-provisioned account (temp password)
 * first signs in: offers to set a new password now or later. Dismissable —
 * the change-password control also lives in Settings.
 */
export function MustChangePasswordPrompt() {
  const { t } = useTranslation();
  const mustChange = useSession((s) => s.account?.mustChangePassword);
  const phone = useSession((s) => s.account?.phone);
  const [dismissed, setDismissed] = useState(false);
  const [changing, setChanging] = useState(false);

  // While the phone is still missing the CompleteAccount gate is showing and
  // already offers the password change — don't double-prompt here.
  if (!mustChange || !phone) return null;

  return (
    <>
      <Sheet open={!dismissed && !changing} onClose={() => setDismissed(true)} title={t('auth.mustChangeTitle')}>
        <p className="text-sm text-earth-muted">{t('auth.mustChangeBody')}</p>
        <div className="mt-3 flex gap-2">
          <button type="button" data-testid="must-change-now" className="btn-primary flex-1" onClick={() => setChanging(true)}>{t('auth.changeNow')}</button>
          <button type="button" className="btn-ghost flex-1" onClick={() => setDismissed(true)}>{t('auth.later')}</button>
        </div>
      </Sheet>
      <ChangePasswordSheet open={changing} onClose={() => { setChanging(false); setDismissed(true); }} />
    </>
  );
}
