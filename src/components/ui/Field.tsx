import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { Icon } from '@/components/Icon';

/**
 * Form-field primitives for the Coach/Admin portals. Every control gets a
 * PERSISTENT visible label (placeholders are optional helper text only), a
 * required marker, and helper/error text below — wired up with matching
 * `htmlFor` / `id` / `aria-describedby`. Visuals reuse the existing `.input`
 * and `.label` utilities so nothing changes except the always-on label.
 */

interface FormFieldProps {
  label?: ReactNode;
  htmlFor?: string;
  required?: boolean;
  helper?: ReactNode;
  error?: ReactNode;
  /** Keep the label for screen readers but hide it visually (e.g. search bars). */
  srOnlyLabel?: boolean;
  /** id applied to the helper/error <p> for aria-describedby wiring. */
  descId?: string;
  className?: string;
  children: ReactNode;
}

/** Low-level wrapper: label + control + helper/error. Use the typed controls below when possible. */
export function FormField({ label, htmlFor, required, helper, error, srOnlyLabel, descId, className, children }: FormFieldProps) {
  return (
    <div className={className}>
      {label != null && label !== '' && (
        <label htmlFor={htmlFor} className={`label ${srOnlyLabel ? 'sr-only' : ''}`}>
          {label}
          {required && <span className="text-danger"> *</span>}
        </label>
      )}
      {children}
      {error ? (
        <p id={descId} className="mt-1 text-[12px] text-danger">{error}</p>
      ) : helper ? (
        <p id={descId} className="mt-1 text-[12px] text-earth-subtle">{helper}</p>
      ) : null}
    </div>
  );
}

type FieldExtras = {
  label?: ReactNode;
  required?: boolean;
  helper?: ReactNode;
  error?: ReactNode;
  srOnlyLabel?: boolean;
  /** className for the wrapping FormField (the control's own className still applies to it). */
  fieldClassName?: string;
};

export const TextInput = forwardRef<HTMLInputElement, FieldExtras & InputHTMLAttributes<HTMLInputElement>>(
  function TextInput({ label, required, helper, error, srOnlyLabel, fieldClassName, id, className, ...rest }, ref) {
    const autoId = useId();
    const fieldId = id ?? autoId;
    const descId = error || helper ? `${fieldId}-desc` : undefined;
    return (
      <FormField label={label} htmlFor={fieldId} required={required} helper={helper} error={error} srOnlyLabel={srOnlyLabel} descId={descId} className={fieldClassName}>
        <input
          ref={ref}
          id={fieldId}
          required={required}
          aria-describedby={descId}
          aria-invalid={error ? true : undefined}
          className={`input ${className ?? ''}`}
          {...rest}
        />
      </FormField>
    );
  },
);

export const SelectField = forwardRef<HTMLSelectElement, FieldExtras & SelectHTMLAttributes<HTMLSelectElement>>(
  function SelectField({ label, required, helper, error, srOnlyLabel, fieldClassName, id, className, children, ...rest }, ref) {
    const autoId = useId();
    const fieldId = id ?? autoId;
    const descId = error || helper ? `${fieldId}-desc` : undefined;
    return (
      <FormField label={label} htmlFor={fieldId} required={required} helper={helper} error={error} srOnlyLabel={srOnlyLabel} descId={descId} className={fieldClassName}>
        <select
          ref={ref}
          id={fieldId}
          required={required}
          aria-describedby={descId}
          aria-invalid={error ? true : undefined}
          className={`input ${className ?? ''}`}
          {...rest}>
          {children}
        </select>
      </FormField>
    );
  },
);

export const TextAreaField = forwardRef<HTMLTextAreaElement, FieldExtras & TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function TextAreaField({ label, required, helper, error, srOnlyLabel, fieldClassName, id, className, ...rest }, ref) {
    const autoId = useId();
    const fieldId = id ?? autoId;
    const descId = error || helper ? `${fieldId}-desc` : undefined;
    return (
      <FormField label={label} htmlFor={fieldId} required={required} helper={helper} error={error} srOnlyLabel={srOnlyLabel} descId={descId} className={fieldClassName}>
        <textarea
          ref={ref}
          id={fieldId}
          required={required}
          aria-describedby={descId}
          aria-invalid={error ? true : undefined}
          className={`input ${className ?? ''}`}
          {...rest}
        />
      </FormField>
    );
  },
);

/**
 * Search input with a leading search icon. Uses logical `start-3` / `ps-10`
 * positioning so it flips correctly in RTL with no overrides. Provide a `label`
 * (rendered, or hidden via `srOnlyLabel`) or an `aria-label` for accessibility.
 */
export const SearchField = forwardRef<HTMLInputElement, FieldExtras & InputHTMLAttributes<HTMLInputElement>>(
  function SearchField({ label, helper, error, srOnlyLabel = true, fieldClassName, id, className, ...rest }, ref) {
    const autoId = useId();
    const fieldId = id ?? autoId;
    const descId = error || helper ? `${fieldId}-desc` : undefined;
    return (
      <FormField label={label} htmlFor={fieldId} helper={helper} error={error} srOnlyLabel={srOnlyLabel} descId={descId} className={fieldClassName}>
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-earth-subtle">
            <Icon name="search" size={18} />
          </span>
          <input
            ref={ref}
            id={fieldId}
            aria-describedby={descId}
            className={`input ps-10 ${className ?? ''}`}
            {...rest}
          />
        </div>
      </FormField>
    );
  },
);
