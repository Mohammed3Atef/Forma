import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet } from '@/components/Sheet';
import { Icon } from '@/components/Icon';

const OUT = 512; // output square size (px)

/**
 * Square avatar cropper: shows the chosen image in a circular viewport the user
 * can drag + zoom, then renders the visible square to a WebP blob. Self-contained
 * (canvas + pointer events, no external library) so it works under the strict CSP.
 */
export function AvatarCropper({ file, onCancel, onCropped }: { file: File; onCancel: () => void; onCropped: (blob: Blob) => void }) {
  const { t } = useTranslation();
  const [url, setUrl] = useState('');
  const [vp, setVp] = useState(264); // viewport (square) size in px
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const vpRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const baseScale = nat ? vp / Math.min(nat.w, nat.h) : 1;
  const dispScale = baseScale * zoom;
  const dispW = nat ? nat.w * dispScale : vp;
  const dispH = nat ? nat.h * dispScale : vp;

  // Keep the image covering the viewport (no gaps) at all times.
  const clamp = (x: number, y: number) => ({
    x: Math.min(0, Math.max(vp - dispW, x)),
    y: Math.min(0, Math.max(vp - dispH, y)),
  });

  useEffect(() => {
    if (nat) setOffset((o) => clamp(o.x, o.y));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, nat, vp]);

  const onImgLoad = () => {
    const im = imgRef.current;
    const size = vpRef.current?.clientWidth || vp;
    if (!im) return;
    const w = im.naturalWidth;
    const h = im.naturalHeight;
    const bs = size / Math.min(w, h);
    setVp(size);
    setNat({ w, h });
    setZoom(1);
    setOffset({ x: (size - w * bs) / 2, y: (size - h * bs) / 2 }); // center
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setOffset(clamp(drag.current.ox + (e.clientX - drag.current.x), drag.current.oy + (e.clientY - drag.current.y)));
  };
  const onPointerUp = () => { drag.current = null; };

  const confirm = async () => {
    const im = imgRef.current;
    if (!nat || !im) return;
    setBusy(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = OUT;
      canvas.height = OUT;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const srcSize = vp / dispScale;
      ctx.drawImage(im, -offset.x / dispScale, -offset.y / dispScale, srcSize, srcSize, 0, 0, OUT, OUT);
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/webp', 0.85));
      if (blob) onCropped(blob);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open onClose={onCancel} size="md" title={t('upload.cropTitle')}>
      <div className="space-y-4" data-testid="avatar-cropper">
        <div
          ref={vpRef}
          className="relative mx-auto aspect-square w-full max-w-[280px] cursor-grab touch-none select-none overflow-hidden rounded-full border border-line bg-black active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {url && (
            <img
              ref={imgRef}
              src={url}
              alt=""
              draggable={false}
              onLoad={onImgLoad}
              className="pointer-events-none absolute left-0 top-0 max-w-none select-none"
              style={{ width: `${dispW}px`, height: `${dispH}px`, transform: `translate(${offset.x}px, ${offset.y}px)` }}
            />
          )}
          {/* Soft ring to convey the circular crop. */}
          <span className="pointer-events-none absolute inset-0 rounded-full shadow-[inset_0_0_0_2px_rgba(255,255,255,0.25)]" />
        </div>

        <div className="flex items-center gap-3">
          <Icon name="image" size={16} className="shrink-0 text-earth-muted" />
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            aria-label={t('upload.zoom')}
            data-testid="avatar-zoom"
            onChange={(e) => setZoom(Number(e.target.value))}
            className="h-1.5 flex-1 accent-brand"
          />
        </div>

        <div className="flex gap-2">
          <button type="button" className="btn-ghost flex-1" onClick={onCancel}>{t('common.cancel')}</button>
          <button type="button" className="btn-primary flex-1 disabled:opacity-40" data-testid="avatar-crop-save" disabled={busy || !nat} onClick={() => void confirm()}>
            {busy ? t('auth.working') : t('common.save')}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
