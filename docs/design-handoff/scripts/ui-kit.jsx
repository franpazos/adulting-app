// Shared UI primitives + brand SVG components for Adulting.app mockups
// Loaded via <script type="text/babel"> — exposes helpers on window.

const Icon = ({ d, size = 20, stroke = 1.6, fill = "none", style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={style}>{d}</svg>
);

// ── Inline glyphs ───────────────────────────────────────────────────────────
const I = {
  bell:    <Icon d={<><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 21a2 2 0 0 0 4 0"/></>}/>,
  chevR:   <Icon d={<polyline points="9 6 15 12 9 18"/>}/>,
  chevL:   <Icon d={<polyline points="15 6 9 12 15 18"/>}/>,
  chevDn:  <Icon d={<polyline points="6 9 12 15 18 9"/>}/>,
  plus:    <Icon d={<><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>}/>,
  minus:   <Icon d={<line x1="5" y1="12" x2="19" y2="12"/>}/>,
  home:    <Icon d={<><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></>}/>,
  list:    <Icon d={<><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></>}/>,
  card:    <Icon d={<><rect x="3" y="6" width="18" height="13" rx="2"/><line x1="3" y1="11" x2="21" y2="11"/></>}/>,
  more:    <Icon d={<><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></>}/>,
  back:    <Icon d={<polyline points="15 6 9 12 15 18"/>}/>,
  close:   <Icon d={<><line x1="6" y1="6" x2="18" y2="18"/><line x1="6" y1="18" x2="18" y2="6"/></>}/>,
  check:   <Icon d={<polyline points="5 12 10 17 19 7"/>}/>,
  bars:    <Icon d={<><rect x="3" y="14" width="4" height="7" rx="1" fill="currentColor" stroke="none"/><rect x="10" y="9" width="4" height="12" rx="1" fill="currentColor" stroke="none"/><rect x="17" y="4" width="4" height="17" rx="1" fill="currentColor" stroke="none"/></>}/>,
  arrowUp: <Icon d={<><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></>}/>,
  arrowR:  <Icon d={<><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>}/>,
  swap:    <Icon d={<><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></>}/>,
  globe:   <Icon d={<><circle cx="12" cy="12" r="9"/><line x1="3" y1="12" x2="21" y2="12"/><path d="M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></>}/>,
  cart:    <Icon d={<><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M3 4h2l2.5 11h12L22 7H6"/></>}/>,
  car:     <Icon d={<><path d="M3 13l2-5a2 2 0 0 1 2-1h10a2 2 0 0 1 2 1l2 5"/><path d="M3 13h18v5H3z"/><circle cx="7" cy="18" r="1.2"/><circle cx="17" cy="18" r="1.2"/></>}/>,
  film:    <Icon d={<><rect x="3" y="5" width="18" height="14" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/></>}/>,
  bolt:    <Icon d={<polygon points="13 2 3 14 11 14 9 22 19 10 13 10 13 2" fill="currentColor" stroke="none"/>}/>,
  filter:  <Icon d={<polygon points="3 4 21 4 14 12 14 19 10 21 10 12 3 4"/>}/>,
  search:  <Icon d={<><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></>}/>,
  calendar:<Icon d={<><rect x="3" y="5" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="16" y1="3" x2="16" y2="7"/></>}/>,
  edit:    <Icon d={<><path d="M3 21l4-1 12-12-3-3L4 17l-1 4z"/></>}/>,
  trash:   <Icon d={<><polyline points="3 6 21 6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M5 6l1 14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-14"/></>}/>,
  flame:   <Icon d={<path d="M12 2c2 5 6 6 6 11a6 6 0 0 1-12 0c0-3 2-4 3-7 1 2 2 3 3 4-1-4 0-6 0-8z"/>}/>,
};

// ── Brand SVGs ──────────────────────────────────────────────────────────────
// Adulting "A" — ribbon-fold construction matching the reference:
// Two rounded violet strokes meet at the apex with a visible OVER/UNDER fold
// (right ribbon passes over the left, creating a small darker inner-face
// triangle at the crossing). Inside: an upward chevron + two ascending bars.
function ASymbol({ size = 36, gradient = true, barColor = '#FFFFFF' }) {
  const id = React.useId();
  const T = 32; // ribbon thickness
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" fill="none" aria-hidden>
      <defs>
        {/* Left leg: lighter face (front-lit ribbon) */}
        <linearGradient id={`al-${id}`} x1="20" y1="20" x2="180" y2="180" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#BAA6FF"/>
          <stop offset="0.55" stopColor="#8467F5"/>
          <stop offset="1" stopColor="#5B3FD9"/>
        </linearGradient>
        {/* Right leg: slightly darker face (the side that "wraps around") */}
        <linearGradient id={`ar-${id}`} x1="20" y1="20" x2="180" y2="180" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#9B85F2"/>
          <stop offset="0.55" stopColor="#6E50E0"/>
          <stop offset="1" stopColor="#4A2FBF"/>
        </linearGradient>
        {/* Inner-fold face: darkest (the "underside" of the ribbon visible at the fold) */}
        <linearGradient id={`af-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3F2BA8"/>
          <stop offset="1" stopColor="#5B3FD9"/>
        </linearGradient>
      </defs>

      {/* LEFT LEG (drawn first → behind at the fold) */}
      <line x1="100" y1="22" x2="32" y2="184"
        stroke={gradient ? `url(#al-${id})` : 'currentColor'}
        strokeWidth={T} strokeLinecap="round"/>

      {/* RIGHT LEG (drawn after → sits ON TOP creating the fold) */}
      <line x1="100" y1="22" x2="168" y2="184"
        stroke={gradient ? `url(#ar-${id})` : 'currentColor'}
        strokeWidth={T} strokeLinecap="round"/>

      {gradient && (
        // Inner-fold "underside" — small darker quadrilateral peeking out
        // on the LEFT side of the apex where the right ribbon wraps over.
        <path
          d="M 88 38 L 100 22 L 112 38 L 100 54 Z"
          fill={`url(#af-${id})`}
          opacity="0.85"
        />
      )}

      {/* Inner upward chevron — large, prominent, sits under the apex */}
      <path
        d="M 64 138 L 100 102 L 136 138"
        fill="none"
        stroke={barColor}
        strokeWidth="13"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Two ascending bars below the chevron (matches reference exactly) */}
      <g fill={barColor}>
        <rect x="86"  y="156" width="14" height="26" rx="3"/>
        <rect x="104" y="142" width="14" height="40" rx="3"/>
      </g>
    </svg>
  );
}

// Variation 02 — bars at full height filling the counter (chart-as-counter)
function ASymbolFilled({ size = 36 }) {
  const id = React.useId();
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" fill="none" aria-hidden>
      <defs>
        <linearGradient id={`af-${id}`} x1="0.18" y1="0.05" x2="0.85" y2="0.95">
          <stop offset="0" stopColor="#B6A1FF"/>
          <stop offset="0.55" stopColor="#8467F5"/>
          <stop offset="1" stopColor="#6B4EE0"/>
        </linearGradient>
      </defs>
      {/* Solid A (no counter) — bars sit ON the surface */}
      <path d="M 100 16 C 106 16 110 19 113 25 L 184 165 C 187 171 184 178 178 180 L 156 188 C 150 190 145 187 142 182 L 124 146 L 76 146 L 58 182 C 55 187 50 190 44 188 L 22 180 C 16 178 13 171 16 165 L 87 25 C 90 19 94 16 100 16 Z"
        fill={`url(#af-${id})`}/>
      {/* Bars carved out of upper body as ascending chart — the counter IS the chart */}
      <g fill="#FFFFFF">
        <rect x="74"  y="118" width="14" height="20" rx="3"/>
        <rect x="93"  y="100" width="14" height="38" rx="3"/>
        <rect x="112" y="78"  width="14" height="60" rx="3"/>
      </g>
    </svg>
  );
}

// Variation 03 — A built FROM 3 ascending bars (kinetic / playful)
function ASymbolBars({ size = 36 }) {
  const id = React.useId();
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" fill="none" aria-hidden>
      <defs>
        <linearGradient id={`ab-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#B6A1FF"/>
          <stop offset="1" stopColor="#6B4EE0"/>
        </linearGradient>
      </defs>
      {/* Three thick rounded bars at ascending heights forming an A silhouette */}
      <g transform="translate(100 100)">
        {/* Left leg of A — diagonal */}
        <path d="M -68 80 L -8 -82 Q 0 -92 8 -82 L 68 80 Q 72 90 60 92 L 50 92 Q 42 92 38 84 L -38 84 Q -42 92 -50 92 L -60 92 Q -72 90 -68 80 Z"
              fill={`url(#ab-${id})`}/>
      </g>
      {/* Crossbar arrow + bars */}
      <g fill="#FFFFFF">
        <rect x="76"  y="158" width="12" height="22" rx="3"/>
        <rect x="94"  y="146" width="12" height="34" rx="3"/>
        <rect x="112" y="132" width="12" height="48" rx="3"/>
      </g>
      <path d="M 76 138 L 100 122 L 124 138" stroke="#FFFFFF" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.95"/>
    </svg>
  );
}

// Variation 04 — Outline-only with internal bar chart (lighter-weight, modern)
function ASymbolOutline({ size = 36, color = '#7B5CF6', barColor = '#7B5CF6' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" fill="none" aria-hidden>
      <path
        d="M 100 16 C 106 16 110 19 113 25 L 184 165 C 187 171 184 178 178 180 L 156 188 C 150 190 145 187 142 182 L 124 146 L 76 146 L 58 182 C 55 187 50 190 44 188 L 22 180 C 16 178 13 171 16 165 L 87 25 C 90 19 94 16 100 16 Z"
        fill="none" stroke={color} strokeWidth="14" strokeLinejoin="round"/>
      <g fill={barColor}>
        <rect x="76"  y="158" width="11" height="22" rx="2.5"/>
        <rect x="92"  y="146" width="11" height="34" rx="2.5"/>
        <rect x="108" y="132" width="11" height="48" rx="2.5"/>
      </g>
    </svg>
  );
}

function Wordmark({ height = 22, dark = false }) {
  return (
    <span style={{display:'inline-flex', alignItems:'baseline', gap: 6, lineHeight: 1}}>
      <ASymbol size={height * 1.05}/>
      <span style={{fontFamily:'Sora, sans-serif', fontWeight: 600, fontSize: height, letterSpacing:'-0.03em', color: dark ? '#F0F0F5' : '#1C2030'}}>Adulting</span>
      <span style={{fontFamily:'Sora, sans-serif', fontWeight: 500, fontSize: height, letterSpacing:'-0.03em', color:'var(--violet)'}}>.app</span>
    </span>
  );
}

// ── Common phone chrome ─────────────────────────────────────────────────────
function PhoneHeader({ title, subtitle, leading, trailing, dark }) {
  return (
    <div style={{padding:'8px 20px 14px', display:'flex', alignItems:'center', gap: 12}}>
      {leading}
      <div style={{flex: 1, minWidth: 0}}>
        {subtitle && <div className="t-meta" style={{marginBottom: 2}}>{subtitle}</div>}
        <div className="t-display" style={{fontSize: 22, fontWeight: 600, color:'var(--text-1)'}}>{title}</div>
      </div>
      {trailing}
    </div>
  );
}

function BottomNav({ active = "add", lang = "en" }) {
  const labels = lang === "es"
    ? { home:"Inicio", tx:"Movs", debts:"Deudas", more:"Más" }
    : { home:"Home", tx:"Transactions", debts:"Debts", more:"More" };
  const Item = ({k, icon, label}) => (
    <div style={{display:'flex', flexDirection:'column', alignItems:'center', gap: 3, color: active === k ? 'var(--violet)' : 'var(--text-3)', flex: 1, fontSize: 10, fontWeight: 500}}>
      <div style={{height: 22, display:'flex', alignItems:'center'}}>{icon}</div>
      {label}
    </div>
  );
  return (
    <div style={{
      position:'absolute', bottom: 0, left: 0, right: 0,
      paddingBottom: 30, paddingTop: 10,
      background: 'color-mix(in oklab, var(--surface) 86%, transparent)',
      backdropFilter: 'blur(20px) saturate(180%)',
      WebkitBackdropFilter: 'blur(20px) saturate(180%)',
      borderTop: '1px solid var(--border)',
      display: 'flex', alignItems: 'center',
      paddingLeft: 8, paddingRight: 8,
      zIndex: 10,
    }}>
      <Item k="home" icon={I.home} label={labels.home}/>
      <Item k="tx" icon={I.list} label={labels.tx}/>
      {/* central FAB */}
      <div style={{flex: 1, display:'flex', justifyContent:'center', position:'relative'}}>
        <div style={{
          width: 56, height: 56, borderRadius: 999,
          background: 'linear-gradient(135deg, #9D85FF 0%, #7B5CF6 60%, #5B3FD9 100%)',
          color: 'white', display:'flex', alignItems:'center', justifyContent:'center',
          boxShadow: 'var(--shadow-fab)',
          marginTop: -22, position: 'relative',
        }}>
          {/* "A" symbol — the Adulting wordmark also reads as "Add" */}
          <svg width="28" height="28" viewBox="0 0 200 200" fill="none" aria-label="Add">
            <path d="M100 18 L172 168 Q174 173 169 178 L150 188 Q145 190 142 184 L100 96 L58 184 Q55 190 50 188 L31 178 Q26 173 28 168 L100 18 Z" fill="white"/>
            <g fill="#7B5CF6">
              <rect x="78"  y="138" width="12" height="20" rx="3"/>
              <rect x="94"  y="128" width="12" height="30" rx="3"/>
              <rect x="110" y="118" width="12" height="40" rx="3"/>
            </g>
          </svg>
          <div style={{position:'absolute', inset: 0, borderRadius: 999, boxShadow:'inset 0 1px 0 rgba(255,255,255,0.35)', pointerEvents:'none'}}/>
        </div>
      </div>
      <Item k="debts" icon={I.card} label={labels.debts}/>
      <Item k="more" icon={I.more} label={labels.more}/>
    </div>
  );
}

// ── Money formatter ─────────────────────────────────────────────────────────
function fmtEUR(n, opts = {}) {
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  const s = abs.toLocaleString('en-US', { minimumFractionDigits: opts.decimals ?? 2, maximumFractionDigits: opts.decimals ?? 2 });
  return `${sign}€${s}`;
}
function fmtUSD(n) {
  return `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Avatar bubble
function Avatar({ who, size = 32 }) {
  const map = {
    fran: { cls:'avatar-fran', initial:'F' },
    sam:  { cls:'avatar-sam',  initial:'S' },
    house:{ cls:'avatar-house',initial:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg> },
    joint:{ cls:'avatar-joint',initial:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="3"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
  };
  const m = map[who] || map.fran;
  return <span className={`avatar ${m.cls}`} style={{width: size, height: size, fontSize: size * 0.42}}>{m.initial}</span>;
}

Object.assign(window, { Icon, I, ASymbol, ASymbolFilled, ASymbolBars, ASymbolOutline, Wordmark, PhoneHeader, BottomNav, fmtEUR, fmtUSD, Avatar });
