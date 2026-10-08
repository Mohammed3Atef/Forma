import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { Banner, BannerRegion } from './Banner';
import { useBannerRegion, useBannerSlot } from '@/stores/bannerRegionStore';

let setters: Record<string, (v: boolean) => void> = {};
function Notice({ id, priority, initial = true }: { id: string; priority: number; initial?: boolean }) {
  const [active, setActive] = useState(initial);
  setters[id] = setActive;
  const show = useBannerSlot(id, priority, active);
  return show ? <Banner testId={`n-${id}`}>{id}</Banner> : null;
}

beforeEach(() => {
  setters = {};
  useBannerRegion.setState({ slots: [], expanded: false });
});

describe('banner region (B1.4 / VS-11)', () => {
  it('shows only the most important notice; "+N more" reaches the rest', () => {
    render(
      <BannerRegion>
        <Notice id="announcement" priority={10} />
        <Notice id="conflict" priority={100} />
        <Notice id="reminder" priority={50} />
      </BannerRegion>,
    );
    expect(screen.getByTestId('n-conflict')).toBeTruthy();
    expect(screen.queryByTestId('n-reminder')).toBeNull();
    expect(screen.queryByTestId('n-announcement')).toBeNull();
    expect(screen.getByTestId('banner-region-more').textContent).toBe('2 more notices');

    fireEvent.click(screen.getByTestId('banner-region-more'));
    expect(screen.getByTestId('n-reminder')).toBeTruthy();
    expect(screen.getByTestId('n-announcement')).toBeTruthy();
    expect(screen.getByTestId('banner-region-more').getAttribute('aria-expanded')).toBe('true');
  });

  it('when the top notice is resolved, the next one takes its place', () => {
    render(
      <BannerRegion>
        <Notice id="conflict" priority={100} />
        <Notice id="reminder" priority={50} />
      </BannerRegion>,
    );
    act(() => setters.conflict(false));
    expect(screen.getByTestId('n-reminder')).toBeTruthy();
    expect(screen.queryByTestId('banner-region-more')).toBeNull();
  });

  it('nothing active: the region takes no space', () => {
    render(
      <BannerRegion>
        <Notice id="reminder" priority={50} initial={false} />
      </BannerRegion>,
    );
    expect(screen.getByTestId('banner-region').children).toHaveLength(0);
  });
});
