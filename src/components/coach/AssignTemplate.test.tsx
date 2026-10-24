import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '@/i18n';
import ar from '@/i18n/ar.json';
import arEg from '@/i18n/ar-eg.json';
import en from '@/i18n/en.json';
import type { UserRecord, WorkoutTemplate } from '@/types';

/**
 * Program → "Use in a client plan" replaces the client's whole workout plan, so it must never happen on
 * one tap: the coach confirms first, the confirmation says the current plan is replaced and kept as a
 * version, Cancel changes nothing, and Assign saves once as a deliberate, versioned replacement.
 */
const h = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock('@/services/platform/planApi', async (orig) => ({ ...(await orig<typeof import('@/services/platform/planApi')>()), saveClientWorkoutPlan: h.save }));

import { DialogHost } from '@/components/DialogHost';
import { AssignTemplate } from './AssignTemplate';

const TEMPLATE = { id: 'tpl-1', name: 'Upper Lower', days: [{ id: 'd1', name: 'Upper', exerciseIds: [] }], exercises: {} } as unknown as WorkoutTemplate;
const CLIENTS = [{ id: 'client-1', displayName: 'Salma Fathy', email: 'salma@example.test' }] as UserRecord[];

function renderAssign() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AssignTemplate template={TEMPLATE} clients={CLIENTS} assignedBy="coach-1" onDone={() => undefined} />
      <DialogHost />
    </QueryClientProvider>,
  );
}

describe('AssignTemplate — replacing a client plan is confirmed first', () => {
  beforeEach(() => {
    h.save.mockReset();
    h.save.mockResolvedValue(undefined);
  });

  it('asks before replacing, and says the current plan is kept as a version', async () => {
    renderAssign();
    fireEvent.click(screen.getByTestId('assign-client'));
    const dialog = await screen.findByTestId('confirm-dialog');
    expect(dialog).toHaveTextContent(i18n.t('workoutTemplate.confirmAssign', { name: 'Salma Fathy', template: 'Upper Lower' }));
    expect(screen.getByTestId('confirm-accept')).toHaveTextContent(i18n.t('workoutTemplate.assign'));
    expect(h.save).not.toHaveBeenCalled();
  });

  it('Cancel changes nothing', async () => {
    renderAssign();
    fireEvent.click(screen.getByTestId('assign-client'));
    fireEvent.click(await screen.findByTestId('confirm-cancel'));
    await waitFor(() => expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument());
    expect(h.save).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: i18n.t('common.done') })).not.toBeInTheDocument();
  });

  it('Assign saves once, as a deliberate replacement that versions the previous plan', async () => {
    renderAssign();
    fireEvent.click(screen.getByTestId('assign-client'));
    fireEvent.click(await screen.findByTestId('confirm-accept'));
    await screen.findByRole('button', { name: i18n.t('common.done') });
    expect(h.save).toHaveBeenCalledTimes(1);
    const [clientId, plan, opts] = h.save.mock.calls[0];
    expect(clientId).toBe('client-1');
    expect(plan).toMatchObject({ name: 'Upper Lower', meta: { sourceTemplateId: 'tpl-1', assignedBy: 'coach-1', isCustomized: false } });
    expect(opts).toEqual({ replaceExisting: true, versionReason: 'Assigned template "Upper Lower"' });
  });

  it('every language explains the replacement with both names', () => {
    for (const bundle of [en, ar, arEg]) {
      const copy = (bundle as { workoutTemplate: { confirmAssign: string } }).workoutTemplate.confirmAssign;
      expect(copy).toContain('{{template}}');
      expect(copy).toContain('{{name}}');
    }
  });
});
