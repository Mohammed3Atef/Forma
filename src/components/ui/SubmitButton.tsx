import { Button, type ButtonProps } from './Button';

export type SubmitButtonProps = ButtonProps;

/**
 * A submit `Button` (B1.3). Kept as its own name so existing call sites read
 * naturally; everything — pending spinner without a width jump, double-submit
 * prevention, the offline reason, 44 px hit areas — lives in `Button`.
 */
export function SubmitButton({ type = 'submit', ...props }: SubmitButtonProps) {
  return <Button type={type} {...props} />;
}
