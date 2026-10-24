import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * B3.8 Account & preferences (CO-31 / CD-09 / owner D8), shared by the coach and admin shells: every
 * profile field says whether it saved, keeps what was typed when it didn't (with Retry), a real
 * the device's time zone and EGP shown read-only (B3.8 completion); no capacity card for the coach; admin unchanged.
 */
vi.mock('@/components/AvatarPicker', () => ({ AvatarPicker: () => <div data-testid="avatar-picker" /> }));
vi.mock('@/components/ChangePasswordSheet', () => ({ ChangePasswordSheet: () => null }));
vi.mock('@/stores/dialogStore', () => ({ confirmDialog: async () => false }));

import { useSession } from '@/services/auth/sessionStore';
import { RoleAccount } from './RoleAccount';

const updateSelf = vi.fn();
const base = { id: 'u1', email: 'amira@x.test', displayName: 'Amira', phone: '+201000', timezone: 'Africa/Cairo', currency: 'EGP', accountStatus: 'active', createdAt: 1 };
function setAccount(role: 'coach' | 'super_admin', over: Record<string, unknown> = {}) {
  updateSelf.mockReset();
  updateSelf.mockImplementation(async (patch: Record<string, unknown>) => {
    useSession.setState((s) => ({ account: { ...(s.account as object), ...patch } as never }));
  });
  useSession.setState({ uid: 'u1', account: { ...base, role, ...over } as never, updateSelf: updateSelf as never });
}
const renderPage = () => render(<MemoryRouter><RoleAccount /></MemoryRouter>);

beforeEach(() => setAccount('coach'));

describe('Account & preferences — every field says whether it saved (CO-31)', () => {
  it('a name saves on leaving the field and says "Saved"', async () => {
    renderPage();
    fireEvent.change(screen.getByTestId('account-name'), { target: { value: 'Amira Hassan' } });
    fireEvent.blur(screen.getByTestId('account-name'));
    await waitFor(() => expect(updateSelf).toHaveBeenCalledWith({ displayName: 'Amira Hassan' }));
    expect(await screen.findByTestId('account-name-status')).toHaveTextContent('Saved');
  });

  it('a failed save says so, keeps what was typed, and Retry saves it', async () => {
    renderPage();
    updateSelf.mockRejectedValueOnce(new Error('offline'));
    fireEvent.change(screen.getByTestId('account-phone'), { target: { value: '+201111' } });
    fireEvent.blur(screen.getByTestId('account-phone'));
    const status = await screen.findByTestId('account-phone-status');
    await waitFor(() => expect(status).toHaveAttribute('data-status', 'error'));
    expect(status).toHaveAttribute('role', 'alert');
    expect(screen.getByTestId('account-phone')).toHaveValue('+201111');
    fireEvent.click(within(status).getByTestId('account-phone-status-retry'));
    await waitFor(() => expect(screen.getByTestId('account-phone-status')).toHaveTextContent('Saved'));
    expect(updateSelf).toHaveBeenLastCalledWith({ phone: '+201111' });
  });

  it('another field saving never resets a field whose save failed', async () => {
    renderPage();
    updateSelf.mockRejectedValueOnce(new Error('500'));
    fireEvent.change(screen.getByTestId('account-name'), { target: { value: 'Amira H.' } });
    fireEvent.blur(screen.getByTestId('account-name'));
    await waitFor(() => expect(screen.getByTestId('account-name-status')).toHaveAttribute('data-status', 'error'));
    fireEvent.change(screen.getByTestId('account-phone'), { target: { value: '+202222' } });
    fireEvent.blur(screen.getByTestId('account-phone'));
    await waitFor(() => expect(screen.getByTestId('account-phone-status')).toHaveTextContent('Saved'));
    expect(screen.getByTestId('account-name')).toHaveValue('Amira H.');
  });

  it('an empty name is never saved — it says why', async () => {
    renderPage();
    fireEvent.change(screen.getByTestId('account-name'), { target: { value: '   ' } });
    fireEvent.blur(screen.getByTestId('account-name'));
    expect(screen.getByTestId('account-name-error')).toHaveTextContent("Your name can't be empty");
    expect(screen.getByTestId('account-name')).toHaveAttribute('aria-invalid', 'true');
    expect(updateSelf).not.toHaveBeenCalled();
  });
});

describe('Account & preferences — EGP only, the device time zone (B3.8 owner decisions 8 + 9)', () => {
  it('no currency picker: the coach is told prices are in Egyptian pounds, and nothing is saved', () => {
    setAccount('coach', { currency: 'USD' });
    renderPage();
    const row = screen.getByTestId('account-currency');
    expect(row).toHaveTextContent('EGP — Egyptian Pound');
    expect(row.querySelector('select')).toBeNull();
    expect(updateSelf).not.toHaveBeenCalled();
  });

  it('no time-zone picker: the device zone is shown (whatever was stored) and nothing is saved', () => {
    setAccount('coach', { timezone: 'Asia/Tokyo' });
    renderPage();
    const row = screen.getByTestId('account-timezone');
    expect(row.querySelector('select')).toBeNull();
    const device = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (device) expect(row).toHaveTextContent(device);
    expect(row).not.toHaveTextContent('Asia/Tokyo');
    expect(row).toHaveTextContent("Dates follow this device's time zone.");
    expect(updateSelf).not.toHaveBeenCalled();
  });
});

describe('Account & preferences — coach vs admin', () => {
  it('the coach sees no capacity card (capacity lives on Forma subscription) and no second hero', () => {
    renderPage();
    expect(screen.getByTestId('account-identity')).toHaveTextContent('Amira');
    expect(document.querySelectorAll('.card-featured')).toHaveLength(0);
    expect(screen.queryByText(/clients/i)).not.toBeInTheDocument();
  });

  it('admin keeps its card and has no currency field; language buttons keep their names', () => {
    setAccount('super_admin');
    renderPage();
    expect(document.querySelectorAll('.card-featured')).toHaveLength(1);
    expect(screen.queryByTestId('account-currency')).not.toBeInTheDocument();
    for (const name of ['English', 'العربية', 'مصري']) expect(screen.getByRole('button', { name })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });
});
