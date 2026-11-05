'use client';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/** Full-screen look at someone's photo. Tap anywhere, press Esc, or use the close button. */
export default function PhotoViewer({ src, name, onClose }: { src: string; name: string; onClose: () => void }) {
  const closeBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeBtn.current?.focus();
    // Capture on window so Esc closes only the viewer, not a sheet underneath it.
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); onClose(); } };
    window.addEventListener('keydown', key, true);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', key, true);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, [onClose]);

  return createPortal(
    <div className="viewer" role="dialog" aria-modal="true" aria-label={`${name}’s photo`} onClick={onClose}>
      <button ref={closeBtn} type="button" className="viewer-close icon-btn" onClick={onClose} aria-label="Close photo"><X size={24} /></button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="viewer-img" src={src} alt={`${name}’s profile photo`} onClick={e => e.stopPropagation()} />
      <p className="viewer-name">{name}</p>
    </div>,
    document.body,
  );
}
