export default function OrquestLogo({ light = false, compact = false }) {
  const gradientId = light ? 'orquest-logo-light-gradient' : 'orquest-logo-gradient'

  return (
    <span className={`orquest-logo ${light ? 'logo-light' : ''} ${compact ? 'logo-compact' : ''}`} role="img" aria-label="Orquest">
      <svg viewBox="0 0 264 68" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#9edc72" />
            <stop offset="52%" stopColor="#78c9a6" />
            <stop offset="100%" stopColor="#9d84e7" />
          </linearGradient>
        </defs>
        <g className="logo-violin" fill={`url(#${gradientId})`} stroke={`url(#${gradientId})`}>
          <path d="M27 12c-7-6-17-2-17 7 0 5 4 8 7 11-4 4-7 8-6 14 2 10 12 13 19 7 7 6 17 2 17-7 0-5-4-8-7-11 4-4 7-8 6-14-2-10-12-13-19-7Z" strokeWidth="2" />
          <path d="M25 8 29 1M28 59l-3 7M29 12l-1 44M18 22l22 23M41 22 17 44" fill="none" stroke="#34453e" strokeWidth="1.5" opacity=".72" />
          <path d="M31 8 52 1" fill="none" stroke={`url(#${gradientId})`} strokeWidth="2.5" />
        </g>
        <text x="57" y="49" fill={`url(#${gradientId})`} fontFamily="Courier New, monospace" fontSize="42" fontWeight="700" letterSpacing="-3">orquest</text>
        <path className="logo-bow" d="M113 49c3 7 9 9 16 7" fill="none" stroke={`url(#${gradientId})`} strokeWidth="2.5" strokeLinecap="square" />
      </svg>
    </span>
  )
}
