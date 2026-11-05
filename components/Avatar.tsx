import type { CSSProperties } from 'react';
import { hueFor, initials } from '@/lib/format';

/** Deterministic gradient avatar: the same name always gets the same colours. */
export default function Avatar({ name, size = 40, className = '', src }: { name: string; size?: number; className?: string; src?: string | null }) {
  const h = hueFor(name);
  const style = { '--size': `${size}px`, '--h1': h, '--h2': (h + 52) % 360, position: 'relative' } as CSSProperties;
  return <span className={`avatar ${className}`.trim()} style={style} aria-hidden="true">{initials(name)}{src && <img src={src} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} onError={e => { e.currentTarget.style.display = 'none'; }} />}</span>;
}
