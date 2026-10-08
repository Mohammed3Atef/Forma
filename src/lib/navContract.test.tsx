import { afterEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { isRolePath, roleSpaceOf, safeRolePath, semanticParent } from './navContract';
import { backTarget, useBack } from '@/hooks/useBack';
import { workspaceTabNav } from '@/components/coach/CoachClientWorkspaceLayout';
import { useSession } from '@/services/auth/sessionStore';
import type { UserRecord } from '@/types';

describe('navigation contract (B1.10)', () => {
  it('semantic parents: every screen has an "up"', () => {
    const coach = (p: string) => semanticParent(p, 'coach');
    expect(coach('/coach/client/c1/checkins')).toBe('/coach/client/c1');
    expect(coach('/coach/client/c1/view/progress')).toBe('/coach/client/c1');
    expect(coach('/coach/client/c1/versions/workout')).toBe('/coach/client/c1');
    expect(coach('/coach/client/c1')).toBe('/coach/clients');
    expect(coach('/coach/messages/c1')).toBe('/coach/messages');
    expect(coach('/coach/templates/t1/edit')).toBe('/coach/templates/t1');
    expect(coach('/coach/templates/t1')).toBe('/coach/templates');
    expect(coach('/coach/clients')).toBe('/coach');
    expect(coach('/coach')).toBe('/coach');
    const client = (p: string) => semanticParent(p, 'client');
    expect(client('/workout/routine/d1')).toBe('/workout');
    expect(client('/workout/exercise/e1')).toBe('/workout/library');
    expect(client('/progress/measurements')).toBe('/progress');
    expect(client('/check-in/2026-10-05')).toBe('/check-ins');
    expect(client('/settings/subscription')).toBe('/settings');
    expect(client('/nutrition?day=2026-10-01')).toBe('/');
    expect(semanticParent('/admin/coaches/k1', 'admin')).toBe('/admin/coaches');
    expect(semanticParent('/admin/clients/c1', 'admin')).toBe('/admin/members');
  });

  it("a role's paths only — never another origin or another role's screens", () => {
    expect(isRolePath('/coach/clients', 'coach')).toBe(true);
    expect(isRolePath('/coach', 'coach')).toBe(true);
    expect(isRolePath('/coaching', 'coach')).toBe(false);
    expect(isRolePath('/nutrition', 'client')).toBe(true);
    expect(isRolePath('/coach/clients', 'client')).toBe(false);
    expect(isRolePath('/admin', 'coach')).toBe(false);
    for (const bad of ['https://evil.example', '//evil.example/x', '/\\evil', 'javascript:alert(1)', '', '/a/../admin', '/x\u0000y', 42, null]) {
      expect(isRolePath(bad, 'client'), String(bad)).toBe(false);
    }
    expect(safeRolePath('//evil', 'coach')).toBe('/coach');
    expect(roleSpaceOf('super_admin')).toBe('admin');
    expect(roleSpaceOf(undefined)).toBe('client');
  });

  it('back target with no history: a valid ?returnTo= wins; an invalid one is ignored', () => {
    const at = (pathname: string, search = '') => ({ pathname, search });
    expect(backTarget(at('/coach/messages/c1', '?returnTo=%2Fcoach%2Fclient%2Fc1'), 'coach')).toBe('/coach/client/c1');
    expect(backTarget(at('/coach/messages/c1', '?returnTo=https%3A%2F%2Fevil.example'), 'coach')).toBe('/coach/messages');
    expect(backTarget(at('/coach/messages/c1', '?returnTo=%2Fadmin'), 'coach')).toBe('/coach/messages');
    expect(backTarget(at('/coach/messages/c1', '?returnTo=%2Fcoach%2Fmessages%2Fc1'), 'coach')).toBe('/coach/messages'); // not itself
    expect(backTarget(at('/coach/messages/c1'), 'coach', '/coach/clients')).toBe('/coach/clients'); // caller fallback
  });

  it('workspace: in-shell tabs replace; Progress and Messages push so Back returns to the workspace (NAV-K01)', () => {
    expect(workspaceTabNav('c1', 'workout')).toEqual({ to: '/coach/client/c1/workout', replace: true });
    expect(workspaceTabNav('c1', 'messages')).toEqual({ to: '/coach/messages/c1', replace: false });
    expect(workspaceTabNav('c1', 'progress')).toEqual({ to: '/coach/client/c1/view/progress', replace: false });
  });
});

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}
function BackButton() {
  const back = useBack();
  return <button onClick={back}>back</button>;
}
function Go({ to }: { to: string }) {
  const nav = useNavigate();
  return <button onClick={() => nav(to)}>go</button>;
}

describe('useBack (B1.10)', () => {
  afterEach(() => window.history.replaceState(null, ''));

  it('a cold deep link (no in-app history) goes to the semantic parent', async () => {
    useSession.setState({ account: { id: 'k1', role: 'coach' } as UserRecord });
    render(
      <MemoryRouter initialEntries={['/coach/client/c1/checkins']}>
        <Routes>
          <Route path="*" element={<><Where /><BackButton /></>} />
        </Routes>
      </MemoryRouter>,
    );
    await act(async () => fireEvent.click(screen.getByText('back')));
    expect(screen.getByTestId('where').textContent).toBe('/coach/client/c1');
  });

  it('after an in-app navigation, Back returns to where the user was', async () => {
    useSession.setState({ account: { id: 'k1', role: 'coach' } as UserRecord });
    render(
      <MemoryRouter initialEntries={['/coach/client/c1']}>
        <Routes>
          <Route path="*" element={<><Where /><BackButton /><Go to="/coach/messages/c1" /></>} />
        </Routes>
      </MemoryRouter>,
    );
    await act(async () => fireEvent.click(screen.getByText('go')));
    window.history.replaceState({ idx: 1 }, ''); // what BrowserRouter records for a pushed entry
    await act(async () => fireEvent.click(screen.getByText('back')));
    expect(screen.getByTestId('where').textContent).toBe('/coach/client/c1');
  });
});
