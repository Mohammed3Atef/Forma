import { useTranslation } from 'react-i18next';
import type { LocalizedText } from '@/types';
import { Sheet } from './Sheet';
import { useLocalized } from '@/hooks/useLocalized';

/** Coach's reference info from the sheet: general guidance + the RPE/RIR scale. */
const GENERAL: { title: LocalizedText; body: LocalizedText }[] = [
  {
    title: { en: 'Warm-up sets', ar: 'مجموعات التسخين' },
    body: {
      en: 'Done before the real working sets with light weight or an empty bar. They are NOT counted as working sets.',
      ar: 'مجموعات بتكون قبل مجموعات الشغل الفعلية بأوزان خفيفة أو بالبار فاضى وبتكون مش محسوبة من مجموعات الشغل الفعلية.',
    },
  },
  {
    title: { en: 'Working sets', ar: 'مجموعات الشغل' },
    body: {
      en: 'The real sets with proper weight and effort — these are the ones that count throughout the plan.',
      ar: 'مجموعات الشغل بالأوزان الفعلية المناسبة والجهد المناسب وهي المجموعات المقصودة على مدار الخطة.',
    },
  },
  {
    title: { en: 'Loading pattern', ar: 'إزاي أزود أوزاني' },
    body: {
      en: 'Increase the weight when you can do more than the required reps (e.g. ~5 extra). Increase gradually.',
      ar: 'يتم زيادة الأوزان لو الوزن اللى لعبت بيه أقدر أجيب بيه أكتر من العدات المطلوبة (خمس عدات مثلاً)، والزيادة تكون تدريجية.',
    },
  },
  {
    title: { en: 'Rest between sets', ar: 'الراحة بين المجموعات' },
    body: {
      en: 'Listed in the table. Respect the rest between sets to keep performance and effort high.',
      ar: 'مدرجة في الجدول — يجب الاهتمام بالراحة بين المجموعات للحفاظ على الأداء والمجهود الجيد.',
    },
  },
  {
    title: { en: 'RPE', ar: 'مقياس RPE' },
    body: {
      en: 'A scale for how hard each set is, based on how much energy you had left in it.',
      ar: 'مقياس بيستخدم لقياس مدى الجهد المبذول وصعوبة كل مجموعة بناءً على مدى الطاقة في كل مجموعة.',
    },
  },
  {
    title: { en: 'RIR', ar: 'العدات الباقية RIR' },
    body: {
      en: 'Reps In Reserve — how many reps you had left in the tank after finishing the set.',
      ar: 'العدات الباقية في طاقتك بعد إنهاء المجموعة.',
    },
  },
];

const RPE_RIR: { rir: number; rpe: number; desc: LocalizedText }[] = [
  { rir: 0, rpe: 10, desc: { en: 'Maximum effort — no rep left after the required reps (muscular failure).', ar: 'أقصى جهد — مش ممكن تجيب ولا عدة بعد العدات المطلوبة (الفشل العضلي).' } },
  { rir: 1, rpe: 9, desc: { en: '1 more rep left in the tank.', ar: 'فيه عدة في طاقتك تقدر تجيبها بعد العدات المطلوبة.' } },
  { rir: 2, rpe: 8, desc: { en: '2 more reps left in the tank.', ar: 'فيه عدتين في طاقتك بعد العدات المطلوبة.' } },
  { rir: 3, rpe: 7, desc: { en: '3 more reps left in the tank.', ar: 'فيه ٣ عدات في طاقتك بعد العدات المطلوبة.' } },
  { rir: 4, rpe: 6, desc: { en: '4 more reps left in the tank.', ar: 'فيه ٤ عدات في طاقتك بعد العدات المطلوبة.' } },
  { rir: 5, rpe: 5, desc: { en: '5 more reps left in the tank.', ar: 'فيه ٥ عدات في طاقتك بعد العدات المطلوبة.' } },
];

export function TrainingGuideSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const loc = useLocalized();

  return (
    <Sheet open={open} onClose={onClose} title={t('guide.title')}>
      <div className="max-h-[70vh] space-y-4 overflow-y-auto">
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-slate-300">{t('guide.general')}</h3>
          {GENERAL.map((g) => (
            <div key={g.title.en} className="rounded-xl bg-surface-raised/40 p-3">
              <p className="text-sm font-semibold">{loc(g.title)}</p>
              <p className="mt-0.5 text-xs text-slate-400">{loc(g.body)}</p>
            </div>
          ))}
        </div>

        <div>
          <h3 className="mb-2 text-sm font-bold text-slate-300">{t('guide.rpeRir')}</h3>
          <div className="overflow-hidden rounded-xl ring-1 ring-white/10">
            <div className="grid grid-cols-[auto_auto_1fr] gap-x-3 bg-surface-raised px-3 py-2 text-[10px] uppercase text-slate-400">
              <span>RIR</span>
              <span>RPE</span>
              <span>{t('guide.meaning')}</span>
            </div>
            {RPE_RIR.map((r) => (
              <div key={r.rir} className="grid grid-cols-[auto_auto_1fr] items-center gap-x-3 border-t border-white/5 px-3 py-2 text-sm">
                <span className="w-6 text-center font-bold text-warn">{r.rir}</span>
                <span className="w-6 text-center font-bold text-brand-light">{r.rpe}</span>
                <span className="text-xs text-slate-300">{loc(r.desc)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Sheet>
  );
}
