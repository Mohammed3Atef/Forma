import type { ImgHTMLAttributes, ReactNode } from 'react';
import { useMediaSrc } from '@/services/platform/mediaDelivery';

/**
 * An `<img>` for stored media (MD-02, B4.3): personal media goes through `useMediaSrc` — a short-lived
 * signed URL when the server signs it, the stored URL otherwise. While a signature is fetched, or for
 * media this viewer may not see, `fallback` is shown instead.
 */
export function MediaImg({ src, fallback = null, ...rest }: Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & { src: string | null | undefined; fallback?: ReactNode }) {
  const shown = useMediaSrc(src);
  if (!shown) return <>{fallback}</>;
  return <img src={shown} {...rest} />;
}
