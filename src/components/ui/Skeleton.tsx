/** Shimmer placeholder block. Honours prefers-reduced-motion. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-md bg-surface-raised motion-reduce:animate-none ${className}`} />;
}

/** A card-shaped skeleton mirroring a MetricCard for KPI grids. */
export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={`card ${className}`}>
      <Skeleton className="mb-4 h-9 w-9 rounded-xl" />
      <Skeleton className="mb-2 h-7 w-16" />
      <Skeleton className="h-3 w-24" />
    </div>
  );
}
