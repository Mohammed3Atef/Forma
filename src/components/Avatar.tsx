/** Avatar: shows a profile photo when present, else the name's initials. */
const SIZES = {
  xs: 'h-7 w-7 text-[10px]',
  sm: 'h-9 w-9 text-xs',
  md: 'h-11 w-11 text-sm',
  lg: 'h-16 w-16 text-2xl',
} as const;

function initialsOf(name?: string): string {
  return (name ?? '').trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

export function Avatar({
  name,
  photoUrl,
  size = 'md',
  className = '',
  rounded = 'rounded-xl',
  onClick,
}: {
  name?: string;
  photoUrl?: string;
  size?: keyof typeof SIZES;
  className?: string;
  rounded?: string;
  onClick?: () => void;
}) {
  const base = `${SIZES[size]} ${rounded} shrink-0 overflow-hidden border border-line bg-surface-raised flex items-center justify-center font-serif text-brand ${className}`;
  const content = photoUrl ? (
    <img src={photoUrl} alt={name ?? ''} className="h-full w-full object-cover" loading="lazy" />
  ) : (
    initialsOf(name)
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={base} aria-label={name}>
        {content}
      </button>
    );
  }
  return <span className={base}>{content}</span>;
}
