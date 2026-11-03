/** The AirRoom mark: a squircle holding a live waveform. */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg className="logo-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="ar-lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff9a5c" />
          <stop offset="1" stopColor="#ff3d5a" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="10" fill="url(#ar-lg)" />
      <g fill="#fff">
        <rect className="lb lb1" x="6.5" y="12.5" width="3" height="7" rx="1.5" />
        <rect className="lb lb2" x="11.5" y="8" width="3" height="16" rx="1.5" />
        <rect className="lb lb3" x="16.5" y="5.5" width="3" height="21" rx="1.5" />
        <rect className="lb lb4" x="21.5" y="9.5" width="3" height="13" rx="1.5" />
      </g>
    </svg>
  );
}

export function Brand() {
  return (
    <span className="brand-lockup">
      <LogoMark size={32} />
      <span className="brand-word">AirRoom</span>
    </span>
  );
}
