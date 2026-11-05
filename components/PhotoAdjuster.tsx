'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { cropToDataUrl } from '@/lib/image';
import Modal from './Modal';

const MAX_ZOOM = 4;

/**
 * Position and zoom a photo inside the avatar frame before saving it.
 * Drag to move, pinch / wheel / slider to zoom. The result is exactly what is inside the frame.
 */
export default function PhotoAdjuster({ src, onCancel, onSave, busy = false }: {
  src: string; onCancel: () => void; onSave: (dataUrl: string) => void; busy?: boolean;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [F, setF] = useState(0); // frame side in CSS px
  const [zoom, setZoom] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 }); // image top-left inside the frame
  const [err, setErr] = useState('');
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);

  const base = nat && F ? F / Math.min(nat.w, nat.h) : 1; // scale at which the shorter side fills the frame
  const scale = base * zoom;

  const clamp = useCallback((x: number, y: number, s: number) => {
    if (!nat) return { x, y };
    return { x: Math.min(0, Math.max(F - nat.w * s, x)), y: Math.min(0, Math.max(F - nat.h * s, y)) };
  }, [nat, F]);

  // Measure the frame (it is fluid), then start centred and filled.
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const measure = () => setF(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (!nat || !F) return;
    const s = F / Math.min(nat.w, nat.h);
    setZoom(1);
    setOff({ x: (F - nat.w * s) / 2, y: (F - nat.h * s) / 2 });
  }, [nat, F]);

  /** Zoom while keeping the point (cx, cy) of the frame still. */
  const applyZoom = (next: number, cx = F / 2, cy = F / 2) => {
    const z = Math.min(MAX_ZOOM, Math.max(1, next));
    const ns = base * z;
    const ix = (cx - off.x) / scale, iy = (cy - off.y) / scale; // image point under the focal point
    setZoom(z);
    setOff(clamp(cx - ix * ns, cy - iy * ns, ns));
  };

  const local = (e: React.PointerEvent) => {
    const r = frame.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  function down(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, local(e));
    if (pointers.current.size === 1) drag.current = { ...local(e), ox: off.x, oy: off.y };
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom };
      drag.current = null;
    }
  }
  function move(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, local(e));
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      applyZoom(pinch.current.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.current.dist), (a.x + b.x) / 2, (a.y + b.y) / 2);
    } else if (drag.current) {
      const p = local(e);
      setOff(clamp(drag.current.ox + p.x - drag.current.x, drag.current.oy + p.y - drag.current.y, scale));
    }
  }
  function up(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    pinch.current = null;
    const rest = [...pointers.current.values()][0];
    drag.current = rest ? { ...rest, ox: off.x, oy: off.y } : null;
  }
  function key(e: React.KeyboardEvent) {
    const step = 14;
    const moves: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (moves[e.key]) { e.preventDefault(); setOff(clamp(off.x + moves[e.key][0], off.y + moves[e.key][1], scale)); }
    else if (e.key === '+' || e.key === '=') { e.preventDefault(); applyZoom(zoom + 0.2); }
    else if (e.key === '-') { e.preventDefault(); applyZoom(zoom - 0.2); }
  }

  function save() {
    if (!nat || !img.current) return;
    try {
      onSave(cropToDataUrl(img.current, -off.x / scale, -off.y / scale, F / scale));
    } catch (e: any) { setErr(e.message || 'Could not process this photo. Try another one.'); }
  }

  return (
    <Modal
      open onClose={onCancel} title="Adjust photo" description="Drag to reposition. Pinch or use the slider to zoom."
      actions={<>
        <button type="button" className="btn btn-outline" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="button" className="btn btn-primary" onClick={save} disabled={busy || !nat} data-autofocus>
          {busy ? <span className="spinner" /> : 'Save photo'}
        </button>
      </>}
    >
      <div
        ref={frame} className="adjust-frame" tabIndex={0} role="img" aria-label="Photo preview. Use arrow keys to move and plus or minus to zoom."
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={key}
        onWheel={e => applyZoom(zoom * (e.deltaY < 0 ? 1.08 : 0.92), local(e as unknown as React.PointerEvent).x, local(e as unknown as React.PointerEvent).y)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={img} src={src} alt="" draggable={false}
          onLoad={e => setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
          onError={() => setErr('Could not read this photo. Try a PNG, JPEG or WebP image.')}
          style={nat && F
            ? { position: 'absolute', left: 0, top: 0, maxWidth: 'none', width: nat.w * scale, height: nat.h * scale, transform: `translate(${off.x}px, ${off.y}px)` }
            : { position: 'absolute', opacity: 0, maxWidth: 'none' }}
        />
        {!nat && !err && <span className="spinner adjust-spin" />}
      </div>

      <div className="adjust-zoom">
        <ZoomOut size={20} aria-hidden="true" />
        <input type="range" min={1} max={MAX_ZOOM} step={0.01} value={zoom} onChange={e => applyZoom(Number(e.target.value))} aria-label="Zoom" />
        <ZoomIn size={20} aria-hidden="true" />
        <button type="button" className="icon-btn" onClick={() => nat && applyZoom(1)} aria-label="Reset zoom" title="Reset"><RotateCcw size={18} /></button>
      </div>
      {err && <p className="hint" role="alert" style={{ color: 'var(--danger)' }}>{err}</p>}
    </Modal>
  );
}
