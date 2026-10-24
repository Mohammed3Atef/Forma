import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { CoachNote } from '@/types';

const listCoachNotes = vi.fn();
const addCoachNote = vi.fn();
vi.mock('@/services/platform/coachApi', async (orig) => ({
  ...(await orig<typeof import('@/services/platform/coachApi')>()),
  listCoachNotes: (id: string) => listCoachNotes(id),
  addCoachNote: (...args: unknown[]) => addCoachNote(...args),
}));

import { CoachClientNotes } from './CoachClientNotes';

function renderNotes() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/coach/client/c1/notes']}>
        <Routes>
          <Route path="/coach/client/:clientId/notes" element={<CoachClientNotes />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const note = (id: string, visibility?: CoachNote['visibility']): CoachNote => ({ id, clientId: 'c1', authorId: 'coach', authorRole: 'coach', body: `body ${id}`, visibility, createdAt: 1, updatedAt: 1 }) as CoachNote;

beforeEach(() => {
  listCoachNotes.mockReset();
  addCoachNote.mockReset();
});

describe('coach notes — private vs client-visible (CO-02 / CO-21)', () => {
  it('a new note is private unless the coach turns sharing on', async () => {
    listCoachNotes.mockResolvedValue([]);
    addCoachNote.mockResolvedValue(undefined);
    renderNotes();
    fireEvent.click(await screen.findByTestId('coach-notes-add'));
    const toggle = screen.getByTestId('note-visibility-toggle') as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    fireEvent.change(screen.getByTestId('coach-note-body'), { target: { value: 'Knee looks off' } });
    fireEvent.click(screen.getByTestId('coach-note-save'));
    await waitFor(() => expect(addCoachNote).toHaveBeenCalledTimes(1));
    expect(addCoachNote.mock.calls[0][5]).toBe('private');

    fireEvent.click(screen.getByTestId('coach-notes-add'));
    fireEvent.click(screen.getByTestId('note-visibility-toggle'));
    fireEvent.change(screen.getByTestId('coach-note-body'), { target: { value: 'Great week' } });
    fireEvent.click(screen.getByTestId('coach-note-save'));
    await waitFor(() => expect(addCoachNote).toHaveBeenCalledTimes(2));
    expect(addCoachNote.mock.calls[1][5]).toBe('client');
  });

  it('each note shows whether the client can see it (legacy = private)', async () => {
    listCoachNotes.mockResolvedValue([note('a', 'client'), note('b', 'private'), note('c')]);
    renderNotes();
    await screen.findByText('body a');
    expect(screen.getAllByTestId('note-visibility-badge').map((b) => b.getAttribute('data-visibility'))).toEqual(['client', 'private', 'private']);
  });

  it('a failed load is an error with Retry, not "no notes"', async () => {
    listCoachNotes.mockRejectedValueOnce(new Error('500 {"raw":"backend"}'));
    renderNotes();
    expect(await screen.findByTestId('coach-notes-error')).toBeInTheDocument();
    expect(screen.queryByText(/raw/)).toBeNull();
  });
});
