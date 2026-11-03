import type { CSSProperties } from 'react';
import { hueFor, initials } from '@/lib/format';

/** Deterministic gradient avatar: the same name always gets the same colours. */
export default function Avatar({ name, size = 40, className = '' }: { name: string; size?: number; className?: string }) {
  const h = hueFor(name);
  const style = { '--size': `${size}px`, '--h1': h, '--h2': (h + 52) % 360 } as CSSProperties;
  return <span className={`avatar ${className}`.trim()} style={style} aria-hidden="true">{initials(name)}</span>;
}
