import { Icon, type IconName } from '@/components/Icon';

const TONE_CLASS = {
  ok: 'bg-success/15 text-success',
  brand: 'bg-brand/15 text-brand',
  info: 'bg-info/15 text-info',
  warn: 'bg-warn/15 text-warn',
} as const;

/**
 * One row of a "today's plan" checklist card: a status dot (filled once done),
 * an icon chip, title + subtitle, and a chevron to go do it. Tapping anywhere
 * on the row navigates — completion itself is always earned by the real
 * action (finishing a session, logging a meal), never faked by tapping here.
 */
export function TaskRow({
  icon,
  tone,
  title,
  subtitle,
  done,
  onClick,
  testId,
}: {
  icon: IconName;
  tone: keyof typeof TONE_CLASS;
  title: string;
  subtitle: string;
  done: boolean;
  onClick?: () => void;
  testId?: string;
}) {
  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      data-testid={testId}
      className="flex w-full items-center gap-3 border-b border-line-soft py-3 text-start last:border-b-0"
    >
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${
          done ? 'border-success bg-success text-[#06210f]' : 'border-line-strong text-transparent'
        }`}
      >
        <Icon name="check" size={13} />
      </span>
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${TONE_CLASS[tone]}`}>
        <Icon name={icon} size={17} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate font-medium ${done ? 'text-earth-subtle line-through' : ''}`}>{title}</span>
        <span className="block truncate text-[12.5px] text-earth-muted">{subtitle}</span>
      </span>
      {!done && onClick && <Icon name="chevron" size={16} className="shrink-0 text-earth-subtle rtl:rotate-180" />}
    </Wrapper>
  );
}
