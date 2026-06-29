/**
 * Forma "F" brand mark — a rounded brand-orange tile with the Forma F. Scalable
 * and self-contained (no image asset), so it stays crisp at any size. Use where a
 * compact brand glyph is needed (e.g. the assessment-complete screen).
 */
export function FormaMark({ size = 64, className = '' }: { size?: number; className?: string }) {
  return (
    <span
      aria-label="Forma"
      role="img"
      className={`inline-flex select-none items-center justify-center rounded-2xl bg-gradient-to-br from-brand to-brand-dark font-display font-bold leading-none text-white shadow-elevated ring-1 ring-white/10 ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.56 }}
    >
      F
    </span>
  );
}
