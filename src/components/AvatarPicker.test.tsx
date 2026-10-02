import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@/services/platform/mediaApi', () => ({
  useUploadConfigured: () => true,
  uploadImage: vi.fn(),
  UploadError: class UploadError extends Error {
    code = 'failed';
  },
}));

import { AvatarPicker } from './AvatarPicker';

/**
 * M-4 / C-4: "Remove photo" used to call onChange(undefined), which JSON drops —
 * the server never saw a removal and the photo came back. It must send null,
 * await the save, and surface a failure instead of pretending it worked.
 */
describe('AvatarPicker remove', () => {
  it('sends null and awaits the save', async () => {
    const onChange = vi.fn(async () => undefined);
    render(<AvatarPicker name="Sam" photoUrl="https://cdn/x.webp" onChange={onChange} />);
    fireEvent.click(screen.getByTestId('avatar-remove'));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(null));
    expect(screen.queryByTestId('avatar-error')).toBeNull();
  });

  it('shows an error when the save fails', async () => {
    const onChange = vi.fn(async () => {
      throw new Error('network');
    });
    render(<AvatarPicker name="Sam" photoUrl="https://cdn/x.webp" onChange={onChange} />);
    fireEvent.click(screen.getByTestId('avatar-remove'));
    expect(await screen.findByTestId('avatar-error')).toHaveTextContent('Upload failed');
  });
});
