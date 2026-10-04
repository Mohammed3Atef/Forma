import type { ReactNode } from 'react';
import { cx } from '../cx';
import { Icon } from './Icon';

/*
 * Website form controls (design site.css "forms"). Labels/help/errors keep the
 * browser's default paragraph margins where the design relied on them.
 */

/** Text input / textarea / select base (design .inp), with the error ring when `bad`. */
export const inputClass = (bad?: boolean) =>
  cx(
    'w-full min-h-[52px] rounded-[14px] border bg-surface-raised px-4 py-[14px] text-[15px] text-earth placeholder:text-site-tx4',
    'transition-[border-color,box-shadow,background] duration-200',
    'focus:bg-surface-card focus:!outline-none',
    bad
      ? 'border-[rgba(240,72,62,.7)] shadow-[0_0_0_4px_rgba(240,72,62,.1)]'
      : 'border-site-line2 hover:border-site-line3 focus:border-brand focus:shadow-[0_0_0_4px_rgba(255,139,2,.14)]',
  );

/** Field wrapper (design .fld): label, control, help, error (shown when `bad`). */
export function Field({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('flex min-w-0 flex-col gap-2', className)}>{children}</div>;
}

export function FieldLabel({ htmlFor, label, required, optional }: { htmlFor: string; label: string; required?: boolean; optional?: string }) {
  return (
    <label htmlFor={htmlFor} className="p-0 text-[14px] font-medium text-earth">
      <span>{label}</span>{' '}
      {required && (
        <span className="text-brand-hover" aria-hidden="true">
          *
        </span>
      )}
      {optional && <span className="font-normal text-site-tx3">{optional}</span>}
    </label>
  );
}

export function FieldHelp({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className="mb-[1em] mt-[6px] text-[13px] leading-[1.5] text-site-tx3">
      {children}
    </p>
  );
}

export function FieldError({ id, show, children, style }: { id?: string; show: boolean; children: ReactNode; style?: React.CSSProperties }) {
  return (
    <p id={id} className={cx('mb-[1em] mt-[6px] items-center gap-[6px] text-[13px] text-danger', show ? 'flex' : 'hidden')} style={style}>
      <Icon name="alert" style={{ width: 14 }} />
      <span>{children}</span>
    </p>
  );
}
