import { describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { MAIN_ID, useRouteFocus } from './SkipLink';

/** A shell with the hook, a nav button outside main, and one heading per route. */
function Shell() {
  useRouteFocus();
  const navigate = useNavigate();
  return (
    <>
      <button onClick={() => navigate('/b')}>push</button>
      <button onClick={() => navigate('/c', { replace: true })}>replace</button>
      <main id={MAIN_ID} tabIndex={-1}>
        <Routes>
          <Route path="/a" element={<h1>Screen A</h1>} />
          <Route path="/b" element={<h1>Screen B</h1>} />
          <Route path="/c" element={<h1>Screen C</h1>} />
        </Routes>
      </main>
    </>
  );
}
const frame = () => act(() => new Promise<void>((r) => requestAnimationFrame(() => r())));

describe('useRouteFocus (B3.9, AX-05)', () => {
  it('the first load keeps focus where it is; a push moves it to the new screen\'s h1; a replace keeps it', async () => {
    render(
      <MemoryRouter initialEntries={['/a']}>
        <Shell />
      </MemoryRouter>,
    );
    await frame();
    expect(document.activeElement).toBe(document.body);

    const push = screen.getByText('push');
    push.focus();
    act(() => push.click());
    await frame();
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Screen B' }));

    const replace = screen.getByText('replace');
    replace.focus();
    act(() => replace.click());
    await frame();
    expect(document.activeElement).toBe(replace); // a redirect / in-place switch never steals focus
  });
});
