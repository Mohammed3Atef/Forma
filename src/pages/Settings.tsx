import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ActivityLevel, Goal } from '@/types';
import { useSettings } from '@/stores/settingsStore';
import { useSession } from '@/services/auth/sessionStore';
import { cloudAvailable } from '@/data/dataSource';
import { fetchMyAssessment } from '@/services/platform/clientCoachApi';
import { assessmentStatus } from '@/lib/assessment';
import { SyncStatusBadge } from '@/components/SyncStatusBadge';
import { ClientSubscriptionSection } from '@/components/ClientSubscriptionSection';
import { CoachInfoCard } from '@/components/CoachInfoCard';
import { AvatarPicker } from '@/components/AvatarPicker';
import { Icon } from '@/components/Icon';
import { TopBar } from '@/components/TopBar';

const GOALS: Goal[] = ['muscle_gain', 'fat_loss', 'recomp', 'maintenance', 'strength'];
const ACTIVITY: ActivityLevel[] = ['sedentary', 'light', 'moderate', 'active', 'very_active'];

/** Lean client Profile: identity, subscription, assessment summary, coach. Settings live at /settings/app. */
export function Settings() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const profile = useSettings((s) => s.profile);
  const settings = useSettings((s) => s.settings);
  const updateProfile = useSettings((s) => s.updateProfile);
  const account = useSession((s) => s.account);
  const updateContact = useSession((s) => s.updateContact);
  const updateSelf = useSession((s) => s.updateSelf);

  const accountPhone = account?.phone ?? '';
  const [phone, setPhone] = useState(accountPhone);
  useEffect(() => { setPhone(accountPhone); }, [accountPhone]);

  const uid = account?.id ?? '';
  const cloud = cloudAvailable() && !!uid && uid !== 'local-user';
  const assessment = useQuery({ queryKey: ['assessment', uid], queryFn: () => fetchMyAssessment(uid), enabled: cloud });
  const aStatus = assessmentStatus(assessment.data);

  if (!profile || !settings) return null;

  const memberSince = new Date(profile.createdAt).toLocaleDateString(settings.locale === 'ar' ? 'ar-EG' : 'en-US', { month: 'short', year: 'numeric' });

  return (
    <div className="anim-rise space-y-4 pb-4">
      <TopBar
        title={t('gt.profile')}
        eyebrow={t('gt.athlete')}
        right={
          <div className="flex items-center gap-1.5">
            <SyncStatusBadge />
            <button type="button" data-testid="open-settings" aria-label={t('settings.title')} onClick={() => navigate('/settings/app')} className="icon-btn h-[42px] w-[42px]">
              <Icon name="settings" size={20} />
            </button>
          </div>
        }
      />

      {/* Identity summary + avatar */}
      <div className="card space-y-3">
        {cloud ? (
          <AvatarPicker name={profile.name} photoUrl={account?.photoUrl} folder={`Forma/${uid}/avatar`} onChange={(url) => void updateSelf({ photoUrl: url })} />
        ) : null}
        <div>
          <h2 className="truncate font-display text-lg font-semibold">{profile.name}</h2>
          <p className="font-mono text-[11.5px] text-earth-muted">{t('gt.memberSince', { date: memberSince, unit: t('common.kg') })}</p>
        </div>
      </div>

      {/* Subscription (self-hides until a coach sets a term) */}
      <ClientSubscriptionSection />

      {/* Your coach */}
      <CoachInfoCard />

      {/* Assessment summary */}
      {cloud && assessment.data && (
        <button type="button" data-testid="profile-assessment" onClick={() => navigate('/assessment')} className="card-tap flex w-full items-center gap-3 text-start">
          <span className="row-av bg-brand/15 text-brand"><Icon name="list" size={18} /></span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium">{t('assessment.title')}</span>
            <span className="block text-[13px] text-earth-muted">{t('assessment.lastUpdated')}: {assessment.data.updatedAt ? new Date(assessment.data.updatedAt).toLocaleDateString(i18n.language) : '—'}</span>
          </span>
          <span className="chip">{t(`assessment.status.${aStatus}`)}</span>
          <Icon name="chevron" size={16} className="text-earth-subtle" />
        </button>
      )}

      {/* Identity / body */}
      <section className="card space-y-3">
        <h2 className="font-bold">{t('settings.profile')}</h2>
        <div>
          <label className="label">{t('settings.name')}</label>
          <input className="input" value={profile.name} onChange={(e) => void updateProfile({ name: e.target.value })} />
        </div>
        {cloud && (
          <div>
            <label className="label">{t('settings.phone')}</label>
            <input className="input" type="tel" inputMode="tel" dir="ltr" data-testid="settings-phone" value={phone} onChange={(e) => setPhone(e.target.value)} onBlur={() => { if (phone.trim() !== accountPhone) void updateContact(phone); }} />
          </div>
        )}
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="label">{t('settings.age')}</label>
            <input className="input" inputMode="numeric" value={profile.age} onChange={(e) => void updateProfile({ age: Number(e.target.value) || 0 })} />
          </div>
          <div>
            <label className="label">{t('settings.weight')}</label>
            <input className="input" inputMode="decimal" value={profile.weightKg} onChange={(e) => void updateProfile({ weightKg: Number(e.target.value) || 0 })} />
          </div>
          <div>
            <label className="label">{t('settings.height')}</label>
            <input className="input" inputMode="decimal" value={profile.heightCm} onChange={(e) => void updateProfile({ heightCm: Number(e.target.value) || 0 })} />
          </div>
        </div>
        <div>
          <label className="label">{t('settings.goal')}</label>
          <select className="input" value={profile.goal} onChange={(e) => void updateProfile({ goal: e.target.value as Goal })}>
            {GOALS.map((g) => <option key={g} value={g}>{t(`settings.goals.${g}`)}</option>)}
          </select>
        </div>
        <div>
          <label className="label">{t('settings.activity')}</label>
          <select className="input" value={profile.activityLevel} onChange={(e) => void updateProfile({ activityLevel: e.target.value as ActivityLevel })}>
            {ACTIVITY.map((a) => <option key={a} value={a}>{t(`settings.activities.${a}`)}</option>)}
          </select>
        </div>
      </section>
    </div>
  );
}
