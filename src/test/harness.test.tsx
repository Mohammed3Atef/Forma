import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useTranslation } from 'react-i18next';
import { Pill } from '@/components/ui/Pill';

/** Proves the jsdom project boots: alias resolution, React plugin, i18n bundle, jest-dom matchers. */
function Probe() {
  const { t } = useTranslation();
  return <Pill tone="ok">{t('common.retry')}</Pill>;
}

describe('ui test harness', () => {
  it('renders a component with a translated label', () => {
    render(<Probe />);
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });
});
