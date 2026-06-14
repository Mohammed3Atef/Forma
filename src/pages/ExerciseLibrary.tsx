import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useWorkout } from '@/stores/workoutStore';
import { Icon } from '@/components/Icon';
import { TopBar } from '@/components/TopBar';
import { muscleColor, muscleLabel } from '@/lib/muscle';
import { prByExercise } from '@/lib/calc';

export function ExerciseLibrary() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const plan = useWorkout((s) => s.plan);
  const logs = useWorkout((s) => s.logs);
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('All');

  const prs = useMemo(() => prByExercise(logs), [logs]);

  // Derive a category per exercise from the first plan-day that contains it
  // (day title's leading word, e.g. "Push A" → "Push").
  const { categories, categoryOf } = useMemo(() => {
    const map = new Map<string, string>();
    const cats = new Set<string>();
    plan?.days.forEach((d) => {
      const c = d.title.split(/\s+/)[0];
      cats.add(c);
      d.exerciseIds.forEach((id) => {
        if (!map.has(id)) map.set(id, c);
      });
    });
    return { categories: ['All', ...Array.from(cats)], categoryOf: map };
  }, [plan]);

  const list = useMemo(() => {
    if (!plan) return [];
    const q = search.trim().toLowerCase();
    return Object.values(plan.exercises)
      .filter((ex) => cat === 'All' || categoryOf.get(ex.id) === cat)
      .filter((ex) => !q || ex.name.toLowerCase().includes(q) || ex.targetMuscle.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [plan, search, cat, categoryOf]);

  if (!plan) return <p className="pt-10 text-center text-earth-muted">{t('progress.noData')}</p>;

  return (
    <div className="anim-rise">
      <TopBar
        title={t('gt.exerciseLibrary')}
        eyebrow={t('gt.movementsN', { n: Object.keys(plan.exercises).length })}
        onBack={() => navigate('/settings')}
      />

      <div className="relative mb-3">
        <span className="absolute inset-y-0 left-3 flex items-center text-earth-subtle rtl:left-auto rtl:right-3">
          <Icon name="search" size={18} />
        </span>
        <input className="input pl-10 rtl:pl-4 rtl:pr-10" placeholder={t('gt.searchExercises')} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="-mx-5 mb-1 flex gap-2 overflow-x-auto px-5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {categories.map((c) => (
          <button key={c} type="button" onClick={() => setCat(c)} className={`chip ${cat === c ? 'chip-on' : ''}`}>
            {c === 'All' ? t('gt.all') : c}
          </button>
        ))}
      </div>

      <div>
        {list.map((ex) => {
          const pr = prs.get(ex.id);
          return (
            <button key={ex.id} type="button" onClick={() => navigate(`/workout/exercise/${ex.id}`)} className="row w-full text-start">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: muscleColor(ex.targetMuscle) }} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-medium tracking-[-0.01em]">{ex.name}</p>
                <p className="font-mono text-[11.5px] text-earth-muted">{muscleLabel(ex.targetMuscle, t)}</p>
              </div>
              {pr && <span className="font-mono text-[12px] text-earth-muted">{pr.e1rm}{t('common.kg')}</span>}
              <Icon name="chevron" size={16} className="text-earth-subtle" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
