import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/Sheet';
import { TagInput } from '@/components/TagInput';
import { ExerciseForm } from '@/components/workout/ExerciseForm';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { blankExercise } from '@/lib/workoutPresets';
import { uid } from '@/lib/utils';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { useSession } from '@/services/auth/sessionStore';
import {
  deleteExercise,
  deleteFood,
  deleteFoodGroup,
  deleteSupplement,
  listExercises,
  listFoodGroups,
  listFoods,
  listSupplements,
  saveExercise,
  saveFood,
  saveFoodGroup,
  saveSupplement,
} from '@/services/platform/coachAssetsApi';
import { confirmDialog } from '@/stores/dialogStore';
import type { Exercise, FoodGroup, LibraryFood, LibrarySupplement } from '@/types';

type Tab = 'exercises' | 'foods' | 'groups' | 'supplements';

/** Coach-owned reusable assets hub: exercises, foods, and food-alternative groups. */
export function CoachExerciseLibrary() {
  const { t } = useTranslation();
  const coachId = useSession((s) => s.account?.id ?? '');
  const [tab, setTab] = useState<Tab>('exercises');

  return (
    <>
      <TopBar testId="coach-library" title={t('coachLib.title')} eyebrow={t('platform.coachPortal')} />
      <div className="mb-4 flex gap-2">
        {(['exercises', 'foods', 'groups', 'supplements'] as Tab[]).map((tb) => (
          <button key={tb} type="button" data-testid={`lib-tab-${tb}`} onClick={() => setTab(tb)} className={`chip ${tab === tb ? 'chip-on' : ''}`}>
            {t(`coachLib.tabs.${tb}`)}
          </button>
        ))}
      </div>
      {tab === 'exercises' && <ExercisesTab coachId={coachId} />}
      {tab === 'foods' && <FoodsTab coachId={coachId} />}
      {tab === 'groups' && <GroupsTab coachId={coachId} />}
      {tab === 'supplements' && <SupplementsTab coachId={coachId} />}
    </>
  );
}

// ---- Exercises -------------------------------------------------------------

function ExercisesTab({ coachId }: { coachId: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const isDesktop = useIsDesktop();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Exercise | null>(null);
  const lib = useQuery({ queryKey: ['exerciseLibrary', coachId], queryFn: () => listExercises(coachId), enabled: !!coachId });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = lib.data ?? [];
    if (!q) return all;
    return all.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.targetMuscle.toLowerCase().includes(q) ||
        (e.category ?? '').toLowerCase().includes(q) ||
        (e.equipment ?? '').toLowerCase().includes(q) ||
        (e.tags ?? []).some((tg) => tg.toLowerCase().includes(q)),
    );
  }, [lib.data, search]);

  const saveMut = useMutation({ mutationFn: (ex: Exercise) => saveExercise(coachId, ex), onSuccess: () => { setEditing(null); void qc.invalidateQueries({ queryKey: ['exerciseLibrary', coachId] }); } });
  const delMut = useMutation({ mutationFn: (id: string) => deleteExercise(coachId, id), onSuccess: () => void qc.invalidateQueries({ queryKey: ['exerciseLibrary', coachId] }) });
  const remove = async (ex: Exercise) => { if (await confirmDialog({ title: t('common.delete'), message: ex.name, danger: true })) delMut.mutate(ex.id); };

  const exerciseColumns: Column<Exercise>[] = [
    { key: 'name', header: t('coachLib.exercise'), cell: (ex) => <span className="font-medium">{ex.name}</span> },
    { key: 'muscle', header: t('coachLib.muscle'), cell: (ex) => <span className="text-earth-subtle">{ex.targetMuscle || '—'}</span> },
    { key: 'cat', header: t('coachLib.category'), cell: (ex) => <span className="text-earth-subtle">{ex.category || '—'}</span> },
    { key: 'equip', header: t('coachLib.equipment'), cell: (ex) => <span className="text-earth-subtle">{ex.equipment || '—'}</span> },
    { key: 'sets', header: t('coachLib.setsReps'), cell: (ex) => <span className="font-mono text-[12px] text-earth-subtle">{ex.workingSets}×{ex.repRange} · {ex.restSec}s</span> },
    { key: 'tags', header: t('coachLib.tags'), cell: (ex) => <span className="text-[12px] text-earth-subtle">{(ex.tags ?? []).join(', ') || '—'}</span> },
    { key: 'actions', header: '', className: 'text-end', cell: (ex) => (
      <button type="button" className="text-danger" aria-label={t('common.delete')} onClick={(e) => { e.stopPropagation(); void remove(ex); }}><Icon name="close" size={16} /></button>
    ) },
  ];

  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-earth-subtle"><Icon name="search" size={18} /></span>
          <input className="input ps-10" data-testid="lib-search" placeholder={t('coachLib.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <button type="button" className="icon-btn h-[42px] w-[42px]" aria-label={t('coachLib.newExercise')} data-testid="lib-new" onClick={() => setEditing(blankExercise())}>
          <Icon name="plus" size={20} />
        </button>
      </div>
      {lib.isLoading ? (
        <p className="py-8 text-center text-sm text-earth-muted">{t('auth.working')}</p>
      ) : isDesktop ? (
        <DataTable
          testId="coach-desktop-library"
          columns={exerciseColumns}
          rows={filtered}
          rowKey={(ex) => ex.id}
          onRowClick={(ex) => setEditing(ex)}
          empty={search ? t('coachLib.noResults') : t('coachLib.empty')}
        />
      ) : filtered.length === 0 ? (
        <div className="card py-10 text-center text-sm text-earth-muted">{search ? t('coachLib.noResults') : t('coachLib.empty')}</div>
      ) : (
        <div className="card divide-y divide-line-soft">
          {filtered.map((ex) => (
            <div key={ex.id} className="flex items-center gap-3 py-2.5" data-testid="lib-item">
              <button type="button" className="min-w-0 flex-1 text-start" onClick={() => setEditing(ex)}>
                <span className="block truncate font-medium">{ex.name}</span>
                <span className="block truncate text-[12px] text-earth-subtle">{[ex.targetMuscle, ex.category, ex.equipment].filter(Boolean).join(' · ') || t('coachLib.noMeta')}</span>
              </button>
              <button type="button" className="text-danger" aria-label={t('common.delete')} onClick={() => void remove(ex)}><Icon name="close" size={18} /></button>
            </div>
          ))}
        </div>
      )}
      <Sheet open={!!editing} onClose={() => setEditing(null)} title={t('coachLib.exercise')}>
        {editing && <ExerciseForm initial={editing} onSave={(ex) => saveMut.mutate(ex)} />}
      </Sheet>
    </>
  );
}

// ---- Foods -----------------------------------------------------------------

interface FoodFormState { id: string | null; name: string; quantity: string; calories: string; protein: string; carbs: string; fats: string; category: string; tags: string[] }
const blankFoodForm = (): FoodFormState => ({ id: null, name: '', quantity: '', calories: '', protein: '', carbs: '', fats: '', category: '', tags: [] });
const numv = (s: string) => Math.max(0, Number(s) || 0);

function FoodsTab({ coachId }: { coachId: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const isDesktop = useIsDesktop();
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<FoodFormState | null>(null);
  const foods = useQuery({ queryKey: ['foods', coachId], queryFn: () => listFoods(coachId), enabled: !!coachId });
  const editFood = (f: LibraryFood) => setForm({ id: f.id, name: f.name.en, quantity: f.quantity, calories: String(f.calories), protein: String(f.protein), carbs: String(f.carbs), fats: String(f.fats), category: f.category ?? '', tags: f.tags ?? [] });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = foods.data ?? [];
    if (!q) return all;
    return all.filter((f) => f.name.en.toLowerCase().includes(q) || (f.category ?? '').toLowerCase().includes(q) || (f.tags ?? []).some((tg) => tg.toLowerCase().includes(q)));
  }, [foods.data, search]);

  const saveMut = useMutation({ mutationFn: (f: LibraryFood) => saveFood(coachId, f), onSuccess: () => { setForm(null); void qc.invalidateQueries({ queryKey: ['foods', coachId] }); } });
  const delMut = useMutation({ mutationFn: (id: string) => deleteFood(coachId, id), onSuccess: () => void qc.invalidateQueries({ queryKey: ['foods', coachId] }) });
  const remove = async (f: LibraryFood) => { if (await confirmDialog({ title: t('common.delete'), message: f.name.en, danger: true })) delMut.mutate(f.id); };

  const foodColumns: Column<LibraryFood>[] = [
    { key: 'name', header: t('coachFoods.food'), cell: (f) => <span className="font-medium">{f.name.en}</span> },
    { key: 'serving', header: t('coachFoods.serving'), cell: (f) => <span className="text-earth-subtle">{f.quantity || '—'}</span> },
    { key: 'cal', header: t('nutrition.calories'), cell: (f) => <span className="font-mono">{f.calories}</span>, className: 'text-end' },
    { key: 'p', header: t('nutrition.protein'), cell: (f) => <span className="font-mono text-earth-subtle">{f.protein}</span>, className: 'text-end' },
    { key: 'c', header: t('nutrition.carbs'), cell: (f) => <span className="font-mono text-earth-subtle">{f.carbs}</span>, className: 'text-end' },
    { key: 'fat', header: t('nutrition.fats'), cell: (f) => <span className="font-mono text-earth-subtle">{f.fats}</span>, className: 'text-end' },
    { key: 'cat', header: t('coachLib.category'), cell: (f) => <span className="text-[12px] text-earth-subtle">{f.category || '—'}</span> },
    { key: 'actions', header: '', className: 'text-end', cell: (f) => (
      <button type="button" className="text-danger" aria-label={t('common.delete')} onClick={(e) => { e.stopPropagation(); void remove(f); }}><Icon name="close" size={16} /></button>
    ) },
  ];

  const submit = () => {
    if (!form) return;
    const food: LibraryFood = {
      id: form.id ?? uid('food'),
      name: { en: form.name.trim(), ar: form.name.trim() },
      quantity: form.quantity.trim(),
      calories: numv(form.calories),
      protein: numv(form.protein),
      carbs: numv(form.carbs),
      fats: numv(form.fats),
      ...(form.category.trim() ? { category: form.category.trim() } : {}),
      ...(form.tags.length ? { tags: form.tags } : {}),
    };
    saveMut.mutate(food);
  };

  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-earth-subtle"><Icon name="search" size={18} /></span>
          <input className="input ps-10" data-testid="food-search" placeholder={t('coachFoods.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <button type="button" className="icon-btn h-[42px] w-[42px]" aria-label={t('coachFoods.newFood')} data-testid="food-new" onClick={() => setForm(blankFoodForm())}>
          <Icon name="plus" size={20} />
        </button>
      </div>
      {foods.isLoading ? (
        <p className="py-8 text-center text-sm text-earth-muted">{t('auth.working')}</p>
      ) : isDesktop ? (
        <DataTable
          testId="coach-desktop-foods"
          columns={foodColumns}
          rows={filtered}
          rowKey={(f) => f.id}
          onRowClick={editFood}
          empty={search ? t('coachLib.noResults') : t('coachFoods.empty')}
        />
      ) : filtered.length === 0 ? (
        <div className="card py-10 text-center text-sm text-earth-muted">{search ? t('coachLib.noResults') : t('coachFoods.empty')}</div>
      ) : (
        <div className="card divide-y divide-line-soft">
          {filtered.map((f) => (
            <div key={f.id} className="flex items-center gap-3 py-2.5" data-testid="food-item">
              <button type="button" className="min-w-0 flex-1 text-start" onClick={() => editFood(f)}>
                <span className="block truncate font-medium">{f.name.en}</span>
                <span className="block truncate text-[12px] text-earth-subtle" dir="ltr">{f.quantity ? `${f.quantity} · ` : ''}{f.calories} kcal · P{f.protein} C{f.carbs} F{f.fats}</span>
              </button>
              <button type="button" className="text-danger" aria-label={t('common.delete')} onClick={() => void remove(f)}><Icon name="close" size={18} /></button>
            </div>
          ))}
        </div>
      )}
      <Sheet open={!!form} onClose={() => setForm(null)} title={t('coachFoods.food')}>
        {form && (
          <div className="space-y-3" data-testid="food-lib-form">
            <input className="input" data-testid="lf-name" placeholder={t('coachEditor.foodName')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input className="input" data-testid="lf-quantity" placeholder={t('coachFoods.serving')} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              {(['calories', 'protein', 'carbs', 'fats'] as const).map((k) => (
                <div key={k}>
                  <label className="label">{t(`nutrition.${k}`)}</label>
                  <input className="input" data-testid={`lf-${k}`} inputMode="numeric" value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
                </div>
              ))}
            </div>
            <input className="input" placeholder={t('coachLib.category')} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            <div>
              <div className="label mb-1.5">{t('coachLib.tags')}</div>
              <TagInput values={form.tags} onChange={(v) => setForm({ ...form, tags: v })} placeholder={t('coachLib.tagsPlaceholder')} />
            </div>
            <button type="button" data-testid="lf-save" disabled={!form.name.trim()} onClick={submit} className="btn-primary w-full disabled:opacity-40">{t('common.save')}</button>
          </div>
        )}
      </Sheet>
    </>
  );
}

// ---- Food groups (alternatives) --------------------------------------------

interface GroupFormState { id: string | null; name: string; notes: string; foodIds: string[] }

function GroupsTab({ coachId }: { coachId: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [form, setForm] = useState<GroupFormState | null>(null);
  const groups = useQuery({ queryKey: ['foodGroups', coachId], queryFn: () => listFoodGroups(coachId), enabled: !!coachId });
  const foods = useQuery({ queryKey: ['foods', coachId], queryFn: () => listFoods(coachId), enabled: !!coachId });

  const saveMut = useMutation({ mutationFn: (g: FoodGroup) => saveFoodGroup(g), onSuccess: () => { setForm(null); void qc.invalidateQueries({ queryKey: ['foodGroups', coachId] }); } });
  const delMut = useMutation({ mutationFn: (id: string) => deleteFoodGroup(coachId, id), onSuccess: () => void qc.invalidateQueries({ queryKey: ['foodGroups', coachId] }) });
  const remove = async (g: FoodGroup) => { if (await confirmDialog({ title: t('common.delete'), message: g.name, danger: true })) delMut.mutate(g.id); };

  const submit = () => {
    if (!form) return;
    const picked = (foods.data ?? []).filter((f) => form.foodIds.includes(f.id));
    const group: FoodGroup = {
      id: form.id ?? uid('fgrp'),
      coachId,
      name: form.name.trim(),
      foods: picked,
      ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    saveMut.mutate(group);
  };

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[13px] text-earth-muted">{t('coachFoods.groupsHint')}</p>
        <button type="button" className="icon-btn h-[42px] w-[42px]" aria-label={t('coachFoods.newGroup')} data-testid="group-new" onClick={() => setForm({ id: null, name: '', notes: '', foodIds: [] })}>
          <Icon name="plus" size={20} />
        </button>
      </div>
      {groups.isLoading ? (
        <p className="py-8 text-center text-sm text-earth-muted">{t('auth.working')}</p>
      ) : groups.data?.length ? (
        <div className="space-y-2">
          {groups.data.map((g) => (
            <div key={g.id} className="card" data-testid="group-item">
              <div className="flex items-start justify-between gap-3">
                <button type="button" className="min-w-0 flex-1 text-start" onClick={() => setForm({ id: g.id, name: g.name, notes: g.notes ?? '', foodIds: g.foods.map((f) => f.id) })}>
                  <span className="block truncate font-medium">{g.name || t('coachFoods.untitledGroup')}</span>
                  <span className="block truncate text-[12px] text-earth-subtle">{t('coachFoods.foodCount', { n: g.foods.length })}</span>
                </button>
                <button type="button" className="text-danger" aria-label={t('common.delete')} onClick={() => void remove(g)}><Icon name="close" size={18} /></button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card py-10 text-center text-sm text-earth-muted">{t('coachFoods.noGroups')}</div>
      )}
      <Sheet open={!!form} onClose={() => setForm(null)} title={t('coachFoods.group')}>
        {form && (
          <div className="space-y-3" data-testid="group-form">
            <input className="input" data-testid="grp-name" placeholder={t('coachFoods.groupName')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <textarea className="input min-h-16" placeholder={t('coachFoods.groupNotes')} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            <div>
              <div className="label mb-1.5">{t('coachFoods.pickFoods')}</div>
              {(foods.data?.length ?? 0) === 0 ? (
                <p className="text-[12px] text-earth-subtle">{t('coachFoods.empty')}</p>
              ) : (
                <div className="flex flex-wrap gap-2" data-testid="grp-foods">
                  {(foods.data ?? []).map((f) => {
                    const on = form.foodIds.includes(f.id);
                    return (
                      <button key={f.id} type="button" data-testid={`grp-food-${f.id}`} className={`chip ${on ? 'chip-on' : ''}`} onClick={() => setForm({ ...form, foodIds: on ? form.foodIds.filter((x) => x !== f.id) : [...form.foodIds, f.id] })}>
                        {f.name.en}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <button type="button" data-testid="grp-save" disabled={!form.name.trim() || form.foodIds.length === 0} onClick={submit} className="btn-primary w-full disabled:opacity-40">{t('common.save')}</button>
          </div>
        )}
      </Sheet>
    </>
  );
}

// ---- Supplements -----------------------------------------------------------

interface SuppFormState { id: string | null; name: string; dose: string; timing: string }
const blankSuppForm = (): SuppFormState => ({ id: null, name: '', dose: '', timing: '' });

function SupplementsTab({ coachId }: { coachId: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<SuppFormState | null>(null);
  const supps = useQuery({ queryKey: ['supplements', coachId], queryFn: () => listSupplements(coachId), enabled: !!coachId });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = supps.data ?? [];
    if (!q) return all;
    return all.filter((s) => s.name.toLowerCase().includes(q) || s.dose.en.toLowerCase().includes(q));
  }, [supps.data, search]);

  const saveMut = useMutation({ mutationFn: (s: LibrarySupplement) => saveSupplement(coachId, s), onSuccess: () => { setForm(null); void qc.invalidateQueries({ queryKey: ['supplements', coachId] }); } });
  const delMut = useMutation({ mutationFn: (id: string) => deleteSupplement(coachId, id), onSuccess: () => void qc.invalidateQueries({ queryKey: ['supplements', coachId] }) });
  const remove = async (s: LibrarySupplement) => { if (await confirmDialog({ title: t('common.delete'), message: s.name, danger: true })) delMut.mutate(s.id); };

  const submit = () => {
    if (!form) return;
    const s: LibrarySupplement = {
      id: form.id ?? uid('supp'),
      name: form.name.trim(),
      dose: { en: form.dose.trim(), ar: form.dose.trim() },
      ...(form.timing.trim() ? { timing: { en: form.timing.trim(), ar: form.timing.trim() } } : {}),
    };
    saveMut.mutate(s);
  };

  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-earth-subtle"><Icon name="search" size={18} /></span>
          <input className="input ps-10" data-testid="supp-search" placeholder={t('coachSupps.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <button type="button" className="icon-btn h-[42px] w-[42px]" aria-label={t('coachSupps.newSupp')} data-testid="supp-new" onClick={() => setForm(blankSuppForm())}>
          <Icon name="plus" size={20} />
        </button>
      </div>
      {supps.isLoading ? (
        <p className="py-8 text-center text-sm text-earth-muted">{t('auth.working')}</p>
      ) : filtered.length === 0 ? (
        <div className="card py-10 text-center text-sm text-earth-muted">{search ? t('coachLib.noResults') : t('coachSupps.empty')}</div>
      ) : (
        <div className="card divide-y divide-line-soft">
          {filtered.map((s) => (
            <div key={s.id} className="flex items-center gap-3 py-2.5" data-testid="supp-item">
              <Icon name="pill" size={18} className="shrink-0 text-earth-subtle" />
              <button type="button" className="min-w-0 flex-1 text-start" onClick={() => setForm({ id: s.id, name: s.name, dose: s.dose.en, timing: s.timing?.en ?? '' })}>
                <span className="block truncate font-medium">{s.name}</span>
                <span className="block truncate text-[12px] text-earth-subtle">{[s.dose.en, s.timing?.en].filter(Boolean).join(' · ') || t('coachLib.noMeta')}</span>
              </button>
              <button type="button" className="text-danger" aria-label={t('common.delete')} onClick={() => void remove(s)}><Icon name="close" size={18} /></button>
            </div>
          ))}
        </div>
      )}
      <Sheet open={!!form} onClose={() => setForm(null)} title={t('coachEditor.supplement')}>
        {form && (
          <div className="space-y-3" data-testid="supp-form">
            <input className="input" data-testid="supp-name" placeholder={t('coachEditor.suppName')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input className="input" data-testid="supp-dose" placeholder={t('coachEditor.suppDose')} value={form.dose} onChange={(e) => setForm({ ...form, dose: e.target.value })} />
            <input className="input" data-testid="supp-timing" placeholder={t('coachEditor.suppTiming')} value={form.timing} onChange={(e) => setForm({ ...form, timing: e.target.value })} />
            <button type="button" data-testid="supp-save" disabled={!form.name.trim()} onClick={submit} className="btn-primary w-full disabled:opacity-40">{t('common.save')}</button>
          </div>
        )}
      </Sheet>
    </>
  );
}
