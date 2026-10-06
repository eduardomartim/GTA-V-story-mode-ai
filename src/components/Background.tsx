/**
 * Original, abstract illustration of Del Perro Pier (ferris wheel at dusk). Pure SVG + CSS:
 * four sky layers crossfade in a loop (morning → afternoon → evening → night), pier lights
 * come on in the evening. No images, no JS, honours prefers-reduced-motion. Decorative only.
 */
const LIGHTS = Array.from({ length: 22 }, (_, i) => 905 + i * 28);

export function Background() {
  return (
    <div className="bg-root" aria-hidden="true" data-testid="background">
      <div className="sky sky-morning" />
      <div className="sky sky-afternoon" />
      <div className="sky sky-evening" />
      <div className="sky sky-night" />
      <svg className="scene" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice" focusable="false">
        <defs>
          <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#06080c" stopOpacity=".42" />
            <stop offset="1" stopColor="#030406" stopOpacity=".92" />
          </linearGradient>
        </defs>
        {/* distant hills */}
        <path className="sil" opacity=".55" d="M0 520 L0 462 C120 430 230 468 380 446 S640 418 790 462 L850 520Z" />
        <path className="sil" opacity=".4" d="M980 520 C1080 486 1220 492 1330 470 S1500 462 1600 478 L1600 520Z" />
        {/* sea */}
        <rect x="0" y="520" width="1600" height="380" fill="url(#sea)" />
        {[560, 590, 630, 680, 740].map((y, i) => (
          <line key={y} className="sea-line" x1={120 + i * 40} y1={y} x2={760 + i * 60} y2={y} strokeWidth="2" />
        ))}
        {/* roller coaster */}
        <path className="sil" fill="none" stroke="#0a0b0e" strokeWidth="5" d="M1330 560 C1360 470 1380 470 1400 540 S1440 600 1470 500 S1520 470 1560 560" />
        {Array.from({ length: 9 }, (_, i) => (
          <line key={i} x1={1340 + i * 26} y1={560 - (i % 3) * 18} x2={1340 + i * 26} y2="610" stroke="#0a0b0e" strokeWidth="3" />
        ))}
        {/* ferris wheel */}
        <g className="wheel-spin">
          <circle cx="1180" cy="440" r="168" fill="none" stroke="#0a0b0e" strokeWidth="7" />
          <circle cx="1180" cy="440" r="112" fill="none" stroke="#0a0b0e" strokeWidth="3" />
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i * Math.PI) / 6;
            const x = 1180 + Math.cos(a) * 168;
            const y = 440 + Math.sin(a) * 168;
            return (
              <g key={i}>
                <line x1="1180" y1="440" x2={x} y2={y} stroke="#0a0b0e" strokeWidth="3" />
                <rect x={x - 9} y={y - 4} width="18" height="20" rx="4" fill="#0a0b0e" />
              </g>
            );
          })}
        </g>
        <circle cx="1180" cy="440" r="12" fill="#0a0b0e" />
        <path className="sil" d="M1180 440 L1112 604 M1180 440 L1248 604 M1150 604 L1210 604" stroke="#0a0b0e" strokeWidth="8" fill="none" />
        {/* pier deck + pillars */}
        <rect className="sil" x="880" y="598" width="620" height="14" />
        {Array.from({ length: 24 }, (_, i) => (
          <rect key={i} className="sil" x={888 + i * 26} y="612" width="6" height={36 + (i % 2) * 6} />
        ))}
        <g className="pier-lights">{LIGHTS.map((x) => <circle key={x} cx={x} cy="592" r="3.2" />)}</g>
        <g className="pier-lights late">{LIGHTS.map((x) => <circle key={x} cx={x + 14} cy="640" r="2.2" />)}</g>
        {/* beach */}
        <path className="sil" d="M0 760 C300 720 700 730 900 700 L1600 690 L1600 900 L0 900Z" opacity=".95" />
        {/* palms */}
        {[
          { x: 110, h: 330, lean: -30 },
          { x: 250, h: 270, lean: 24 },
          { x: 1500, h: 300, lean: -26 },
        ].map((p) => (
          <g key={p.x}>
            <path className="sil" d={`M${p.x} 770 Q${p.x + p.lean} ${770 - p.h / 2} ${p.x + p.lean * 1.4} ${770 - p.h}`} fill="none" stroke="#0a0b0e" strokeWidth="9" strokeLinecap="round" />
            {[-70, -35, 0, 35, 70].map((a) => (
              <path key={a} d={`M${p.x + p.lean * 1.4} ${770 - p.h} q${a * 0.9} ${-30 + Math.abs(a) * 0.3} ${a * 1.5} ${20 + Math.abs(a) * 0.4}`} fill="none" stroke="#0a0b0e" strokeWidth="6" strokeLinecap="round" />
            ))}
          </g>
        ))}
      </svg>
      <div className="bg-overlay" />
    </div>
  );
}
