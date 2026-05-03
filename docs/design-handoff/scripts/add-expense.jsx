// Add Expense — 5 variations
// All share the same data model. They differ in how Source / Owner / Split / Live preview are presented.

const OWNERS = [
  { id: 'fran',  label: 'Fran' },
  { id: 'sam',   label: 'Sam' },
  { id: 'house', label: 'Household' },
];
const SOURCES = [
  { id: 'fran',  label: 'Fran' },
  { id: 'sam',   label: 'Sam' },
  { id: 'joint', label: 'Joint' },
];

// Compute live consequence sentence
function computeConsequence(amount, source, owner, split, lang = 'en') {
  // source: fran|sam|joint   owner: fran|sam|house   split: 0..100 = Fran's share when shared
  const A = Number(amount) || 0;
  if (A <= 0) return null;

  // case A: personal source, household owner -> the OTHER person owes the source (1-share)
  if (owner === 'house' && (source === 'fran' || source === 'sam')) {
    const fran = A * (split / 100);
    const sam  = A - fran;
    if (source === 'fran') {
      return { kind:'settle', from:'sam', to:'fran', amount: sam, paidBy:'fran', belongsTo:'house' };
    } else {
      return { kind:'settle', from:'fran', to:'sam', amount: fran, paidBy:'sam', belongsTo:'house' };
    }
  }
  // case D: joint source, personal owner -> person owes household
  if (source === 'joint' && (owner === 'fran' || owner === 'sam')) {
    return { kind:'settle', from: owner, to:'house', amount: A, paidBy:'joint', belongsTo: owner };
  }
  // case C: joint -> household, no settlement
  if (source === 'joint' && owner === 'house') {
    return { kind:'none', paidBy:'joint', belongsTo:'house' };
  }
  // case B: personal -> personal (same), no settlement
  if (source === owner) {
    return { kind:'none', paidBy: source, belongsTo: owner };
  }
  // edge: personal source, OTHER personal owner -> the other owes them
  return { kind:'settle', from: owner, to: source, amount: A, paidBy: source, belongsTo: owner };
}

const namesOf = (k) => ({fran:'Fran', sam:'Sam', house:'Household', joint:'Joint'})[k];

function ConsequenceSentence({ csq }) {
  if (!csq) return <span style={{color:'var(--text-3)'}}>Enter an amount to see what will happen…</span>;
  if (csq.kind === 'none') {
    return <span>Paid from <b style={{color:'var(--text-1)'}}>{namesOf(csq.paidBy)}</b> · belongs to <b style={{color:'var(--text-1)'}}>{namesOf(csq.belongsTo)}</b> · <span style={{color:'var(--positive)'}}>no settlement impact</span></span>;
  }
  return <span>Paid from <b style={{color:'var(--text-1)'}}>{namesOf(csq.paidBy)}</b> · belongs to <b style={{color:'var(--text-1)'}}>{namesOf(csq.belongsTo)}</b> · <b style={{color:'var(--violet)'}}>{namesOf(csq.from)} will owe {namesOf(csq.to)} {fmtEUR(csq.amount)}</b></span>;
}

// Reusable: visual flow diagram (Source --> Owner; settlement chip)
function FlowDiagram({ source, owner, csq }) {
  return (
    <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap: 10, padding: '14px 0'}}>
      <div style={{display:'flex', flexDirection:'column', alignItems:'center', gap: 6}}>
        <Avatar who={source} size={42}/>
        <div className="t-meta" style={{fontSize: 10, fontWeight:600, letterSpacing:'0.06em', textTransform:'uppercase', color:'var(--text-3)'}}>Paid by</div>
        <div style={{fontSize: 12, fontWeight: 600, color:'var(--text-1)'}}>{namesOf(source)}</div>
      </div>
      <div style={{flex: 1, display:'flex', flexDirection:'column', alignItems:'center', gap: 4}}>
        <svg width="100%" height="22" viewBox="0 0 100 22" preserveAspectRatio="none" style={{maxWidth: 120}}>
          <line x1="2" y1="11" x2="92" y2="11" stroke="var(--violet)" strokeWidth="2" strokeDasharray="3 3" opacity="0.55"/>
          <polygon points="92,11 86,7 86,15" fill="var(--violet)"/>
        </svg>
        <div className="t-meta" style={{fontSize: 10, color:'var(--violet)', fontWeight:600}}>belongs to</div>
      </div>
      <div style={{display:'flex', flexDirection:'column', alignItems:'center', gap: 6}}>
        <Avatar who={owner} size={42}/>
        <div className="t-meta" style={{fontSize: 10, fontWeight:600, letterSpacing:'0.06em', textTransform:'uppercase', color:'var(--text-3)'}}>Owner</div>
        <div style={{fontSize: 12, fontWeight: 600, color:'var(--text-1)'}}>{namesOf(owner)}</div>
      </div>
    </div>
  );
}

function SettlementChip({ csq }) {
  if (!csq || csq.kind === 'none') {
    return (
      <div style={{display:'flex', alignItems:'center', gap: 8, padding:'10px 14px', borderRadius: 999, background: 'color-mix(in oklab, var(--positive) 12%, transparent)', color:'var(--positive)', fontSize: 13, fontWeight: 500, justifyContent:'center'}}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="5 12 10 17 19 7"/></svg>
        No settlement impact
      </div>
    );
  }
  return (
    <div style={{display:'flex', alignItems:'center', gap: 8, padding:'10px 14px', borderRadius: 999, background:'var(--violet-tint)', color:'var(--violet-ink)', fontSize: 13, fontWeight: 600, justifyContent:'center'}}>
      <Avatar who={csq.from} size={20}/>
      <span>{namesOf(csq.from)}</span>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
      <span>{namesOf(csq.to)}</span>
      <span style={{marginLeft: 4, fontFamily:'Sora, sans-serif', fontWeight: 600}}>{fmtEUR(csq.amount)}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Variation A — Classic stacked: big amount, segmented controls, inline preview
// ─────────────────────────────────────────────────────────────────────────
function AddExpenseA({ amount: initAmount = 84.50 }) {
  const [amount, setAmount] = React.useState(initAmount);
  const [source, setSource] = React.useState('sam');
  const [owner, setOwner] = React.useState('house');
  const [split, setSplit] = React.useState(50);
  const csq = computeConsequence(amount, source, owner, split);

  return (
    <div className="phone-surface">
      <div className="scrollarea" style={{paddingBottom: 110}}>
        {/* nav */}
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'52px 16px 6px'}}>
          <button style={{background:'none', border:'none', color:'var(--violet)', display:'flex', alignItems:'center', gap: 2, fontSize: 15}}>
            {I.back}<span style={{marginLeft:-2}}>Cancel</span>
          </button>
          <div className="t-display" style={{fontSize: 16, fontWeight: 600}}>New expense</div>
          <button style={{background:'none', border:'none', color:'var(--text-3)', fontSize: 15, fontWeight: 500}}>Save</button>
        </div>

        {/* big amount */}
        <div style={{textAlign:'center', padding:'24px 20px 12px'}}>
          <div className="t-eyebrow">Amount</div>
          <div className="t-num" style={{fontSize: 64, fontWeight: 600, color:'var(--text-1)', marginTop: 4}}>
            <span style={{color:'var(--text-3)', fontWeight: 500, fontSize: 36, verticalAlign: 'top', marginRight: 4}}>€</span>{fmtEUR(amount).replace('€','')}
          </div>
          <div style={{display:'inline-flex', gap: 6, marginTop: 8}}>
            <Pill label="Groceries" icon={I.cart} active/>
            <Pill label="Today"/>
          </div>
        </div>

        {/* description */}
        <div style={{padding:'4px 20px'}}>
          <div className="card" style={{padding:'12px 16px', display:'flex', alignItems:'center', gap: 10}}>
            <div style={{color:'var(--text-3)'}}>{I.edit}</div>
            <div style={{fontSize: 14}}>Mercadona — weekly shop</div>
          </div>
        </div>

        {/* Paid from */}
        <Section label="Paid from">
          <Segmented options={SOURCES} value={source} onChange={setSource}/>
        </Section>

        {/* Belongs to */}
        <Section label="Belongs to">
          <Segmented options={OWNERS} value={owner} onChange={setOwner}/>
        </Section>

        {/* Split (only when shared) */}
        {owner === 'house' && (source === 'fran' || source === 'sam') && (
          <Section label="Split">
            <SplitSlider value={split} onChange={setSplit}/>
          </Section>
        )}

        {/* Live preview card */}
        <div style={{padding:'16px 20px 0'}}>
          <div className="card" style={{padding: 14, background:'var(--surface)'}}>
            <div className="t-eyebrow" style={{marginBottom: 6}}>Live preview</div>
            <div style={{fontSize: 14, lineHeight: 1.45, color:'var(--text-2)'}}>
              <ConsequenceSentence csq={csq}/>
            </div>
          </div>
        </div>
      </div>

      {/* Sticky save */}
      <StickyFAB amount={amount}/>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Variation B — Flow-first: visual diagram drives the form
// ─────────────────────────────────────────────────────────────────────────
function AddExpenseB({ amount: initAmount = 120.00 }) {
  const [amount, setAmount] = React.useState(initAmount);
  const [source, setSource] = React.useState('sam');
  const [owner, setOwner] = React.useState('house');
  const [split, setSplit] = React.useState(50);
  const csq = computeConsequence(amount, source, owner, split);

  return (
    <div className="phone-surface">
      <div className="scrollarea" style={{paddingBottom: 110}}>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'52px 16px 0'}}>
          <button style={{background:'none', border:'none', color:'var(--text-2)'}}>{I.close}</button>
          <div className="t-display" style={{fontSize: 16, fontWeight: 600}}>Add expense</div>
          <div style={{width: 24}}/>
        </div>

        <div style={{padding:'10px 20px 0'}}>
          <div className="card" style={{padding: '20px 18px', background:'linear-gradient(180deg, var(--surface) 0%, var(--surface-2) 100%)'}}>
            <div style={{textAlign:'center'}}>
              <div className="t-eyebrow">Amount</div>
              <div className="t-num" style={{fontSize: 48, fontWeight: 600, color:'var(--text-1)', marginTop: 2}}>
                <span style={{color:'var(--text-3)', fontWeight: 500, fontSize: 28, verticalAlign:'top'}}>€</span>{fmtEUR(amount).replace('€','')}
              </div>
            </div>
            <FlowDiagram source={source} owner={owner} csq={csq}/>
            <div style={{display:'flex', justifyContent:'center'}}>
              <SettlementChip csq={csq}/>
            </div>
          </div>
        </div>

        <Section label="Paid from"><Segmented options={SOURCES} value={source} onChange={setSource}/></Section>
        <Section label="Belongs to"><Segmented options={OWNERS} value={owner} onChange={setOwner}/></Section>
        {owner === 'house' && (source === 'fran' || source === 'sam') && (
          <Section label={`Split — Fran ${split}% / Sam ${100-split}%`}>
            <SplitSlider value={split} onChange={setSplit}/>
          </Section>
        )}

        <Section label="Category">
          <CategoryRow icon={I.cart} name="Groceries" color="#22C55E"/>
        </Section>
      </div>

      <StickyFAB amount={amount}/>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Variation C — Calculator-style numpad, mental-model labels
// ─────────────────────────────────────────────────────────────────────────
function AddExpenseC({ amount: initAmount = 45.00 }) {
  const [amount, setAmount] = React.useState(initAmount);
  const [source, setSource] = React.useState('joint');
  const [owner, setOwner] = React.useState('sam');
  const csq = computeConsequence(amount, source, owner, 50);

  const Key = ({ k, accent }) => (
    <button style={{
      height: 44, borderRadius: 12, border:'none',
      background: accent ? 'var(--violet)' : 'var(--surface)',
      color: accent ? 'white' : 'var(--text-1)',
      fontFamily:'Sora', fontWeight: 500, fontSize: 18,
      boxShadow: accent ? 'none' : 'var(--shadow-card)',
      border: accent ? 'none' : '1px solid var(--border)',
    }}>{k}</button>
  );

  return (
    <div className="phone-surface">
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'52px 16px 6px'}}>
        <button style={{background:'none', border:'none', color:'var(--text-2)'}}>{I.close}</button>
        <div className="t-display" style={{fontSize: 16, fontWeight: 600}}>Quick add</div>
        <button style={{background:'none', border:'none', color:'var(--violet)', fontWeight: 600, fontSize: 15}}>Save</button>
      </div>

      <div style={{padding:'8px 20px 0'}}>
        <div style={{textAlign:'center', padding:'14px 0 4px'}}>
          <div className="t-num" style={{fontSize: 56, fontWeight: 600}}>
            <span style={{color:'var(--text-3)', fontWeight: 500, fontSize: 32, verticalAlign:'top'}}>€</span>{fmtEUR(amount).replace('€','')}
          </div>
          <div className="t-meta" style={{marginTop: 2}}>Tap to change category · Today</div>
        </div>

        <div style={{display:'flex', gap: 8, marginBottom: 10}}>
          <FlowMini label="Paid from" who={source} onClick={() => {}}/>
          <div style={{display:'flex', alignItems:'center', color:'var(--text-3)'}}>{I.arrowR}</div>
          <FlowMini label="Belongs to" who={owner} onClick={() => {}}/>
        </div>

        <div style={{padding:'8px 12px', borderRadius: 12, background:'var(--violet-tint)', color:'var(--violet-ink)', fontSize: 12, lineHeight: 1.4, marginBottom: 12}}>
          <ConsequenceSentence csq={csq}/>
        </div>

        <div style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap: 8}}>
          {['1','2','3','⌫','4','5','6','+','7','8','9','-','.','0','00'].map((k,i) => <Key key={i} k={k}/>)}
          <Key k="✓" accent/>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Variation D — Bottom-sheet over Transactions list (one-thumb flow)
// ─────────────────────────────────────────────────────────────────────────
function AddExpenseD({ amount: initAmount = 18.40 }) {
  const [amount, setAmount] = React.useState(initAmount);
  const [source, setSource] = React.useState('fran');
  const [owner, setOwner] = React.useState('fran');
  const csq = computeConsequence(amount, source, owner, 50);

  return (
    <div className="phone-surface">
      {/* dim background list */}
      <div style={{padding: '52px 20px 0', opacity: 0.55, filter:'blur(0.6px)'}}>
        <div className="t-display" style={{fontSize: 22, fontWeight: 600}}>Transactions</div>
        <div className="t-meta" style={{marginTop: 2}}>May 2026</div>
        <div style={{display:'flex', flexDirection:'column', gap: 10, marginTop: 14}}>
          {[
            ['Mercadona','Groceries','sam', -84.50],
            ['Endesa','Utilities','joint', -67.22],
            ['Salary','Income','fran', 2450.00],
          ].map(([m,c,w,a],i) => (
            <div key={i} className="card" style={{padding: 12, display:'flex', alignItems:'center', gap: 10}}>
              <Avatar who={w} size={32}/>
              <div style={{flex: 1}}>
                <div style={{fontSize: 13, fontWeight: 600}}>{m}</div>
                <div className="t-meta">{c}</div>
              </div>
              <div className="t-num" style={{fontSize: 14, fontWeight: 600, color: a >= 0 ? 'var(--positive)' : 'var(--text-1)'}}>{fmtEUR(a)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* dim overlay */}
      <div style={{position:'absolute', inset: 0, background: 'rgba(14,15,22,0.35)', backdropFilter: 'blur(2px)'}}/>

      {/* sheet */}
      <div style={{
        position:'absolute', left: 0, right: 0, bottom: 0,
        background:'var(--surface)', borderTopLeftRadius: 28, borderTopRightRadius: 28,
        padding: '12px 18px 28px', boxShadow:'0 -10px 40px rgba(0,0,0,0.18)',
        zIndex: 5,
      }}>
        <div style={{width: 38, height: 4, borderRadius: 999, background:'var(--border-strong)', margin:'0 auto 14px'}}/>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 10}}>
          <div className="t-display" style={{fontSize: 18, fontWeight: 600}}>New expense</div>
          <button style={{background:'var(--violet)', color:'white', border:'none', borderRadius: 999, padding:'6px 14px', fontSize: 13, fontWeight: 600}}>Save</button>
        </div>

        <div style={{textAlign:'center', padding:'8px 0 6px'}}>
          <div className="t-num" style={{fontSize: 44, fontWeight: 600}}>
            <span style={{color:'var(--text-3)', fontSize: 24, verticalAlign:'top'}}>€</span>{fmtEUR(amount).replace('€','')}
          </div>
        </div>

        <div style={{display:'flex', gap: 8, justifyContent:'center', marginBottom: 12}}>
          <Pill label="Coffee" icon={I.cart} active/>
          <Pill label="Today"/>
          <Pill label="Notes" icon={I.edit}/>
        </div>

        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap: 8, marginBottom: 8}}>
          <PickerCard label="Paid from" who={source}/>
          <PickerCard label="Belongs to" who={owner}/>
        </div>

        <div style={{display:'flex', alignItems:'center', gap: 8, padding:'10px 12px', borderRadius: 12, background:'color-mix(in oklab, var(--positive) 12%, transparent)', color:'var(--positive)', fontSize: 12, fontWeight: 600}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="5 12 10 17 19 7"/></svg>
          No settlement impact — Fran pays for Fran
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Variation E — Conversational "sentence builder"
// ─────────────────────────────────────────────────────────────────────────
function AddExpenseE({ amount: initAmount = 240.00 }) {
  const [amount, setAmount] = React.useState(initAmount);
  const [source, setSource] = React.useState('fran');
  const [owner, setOwner] = React.useState('house');
  const [split, setSplit] = React.useState(70);
  const csq = computeConsequence(amount, source, owner, split);

  const Word = ({ children, accent }) => (
    <span style={{
      display:'inline-block',
      padding:'2px 8px',
      borderRadius: 8,
      background: accent ? 'var(--violet-tint)' : 'var(--surface-2)',
      color: accent ? 'var(--violet-ink)' : 'var(--text-1)',
      border: '1px dashed transparent',
      borderColor: accent ? 'color-mix(in oklab, var(--violet) 35%, transparent)' : 'var(--border)',
      fontWeight: 600,
      fontFamily: 'Sora, sans-serif',
      lineHeight: 1.6,
    }}>{children}</span>
  );

  return (
    <div className="phone-surface">
      <div className="scrollarea" style={{paddingBottom: 110}}>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'52px 16px 6px'}}>
          <button style={{background:'none', border:'none', color:'var(--violet)'}}>{I.close}</button>
          <div className="t-display" style={{fontSize: 16, fontWeight: 600}}>Tell me about it</div>
          <button style={{background:'none', border:'none', color:'var(--violet)', fontWeight: 600, fontSize: 15}}>Save</button>
        </div>

        <div style={{padding:'12px 22px 0', fontSize: 22, lineHeight: 2.2, color:'var(--text-2)', fontFamily:'Sora, sans-serif', fontWeight: 500, letterSpacing:'-0.015em'}}>
          <Word accent>{namesOf(source)}</Word> paid <Word accent>{fmtEUR(amount)}</Word> for <Word>groceries</Word>, and it belongs to <Word accent>{namesOf(owner)}</Word>{owner === 'house' ? <> with a <Word>{split}/{100-split}</Word> split</> : null}.
        </div>

        <div style={{padding:'18px 20px 0'}}>
          <div className="card" style={{padding: 14, background:'var(--violet-tint)', borderColor:'color-mix(in oklab, var(--violet) 25%, transparent)'}}>
            <div className="t-eyebrow" style={{color:'var(--violet-ink)', marginBottom: 6}}>What happens</div>
            <div style={{fontSize: 14, color:'var(--violet-ink)', fontWeight: 500}}>
              <ConsequenceSentence csq={csq}/>
            </div>
          </div>
        </div>

        <Section label="Paid from"><Segmented options={SOURCES} value={source} onChange={setSource}/></Section>
        <Section label="Belongs to"><Segmented options={OWNERS} value={owner} onChange={setOwner}/></Section>
        {owner === 'house' && (source !== 'joint') && (
          <Section label="Split">
            <SplitSlider value={split} onChange={setSplit}/>
          </Section>
        )}
      </div>
      <StickyFAB amount={amount}/>
    </div>
  );
}

// ── Local helpers ───────────────────────────────────────────────────────────
function Section({ label, children }) {
  return (
    <div style={{padding:'18px 20px 0'}}>
      <div className="t-eyebrow" style={{marginBottom: 8}}>{label}</div>
      {children}
    </div>
  );
}

function Segmented({ options, value, onChange }) {
  return (
    <div style={{display:'flex', padding: 4, background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius: 14}}>
      {options.map(o => {
        const active = value === o.id;
        return (
          <button key={o.id} onClick={() => onChange(o.id)} style={{
            flex: 1, height: 36, border:'none', background: active ? 'var(--surface)' : 'transparent',
            color: active ? 'var(--text-1)' : 'var(--text-2)',
            fontWeight: active ? 600 : 500, fontSize: 13,
            borderRadius: 10, boxShadow: active ? 'var(--shadow-card)' : 'none',
            display:'flex', alignItems:'center', justifyContent:'center', gap: 6,
            transition: 'all 160ms cubic-bezier(.22,1,.36,1)',
          }}>
            {active && <span style={{width: 6, height: 6, borderRadius:99, background:'var(--violet)'}}/>}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function SplitSlider({ value, onChange }) {
  const left = value;
  return (
    <div>
      <div style={{position:'relative', height: 32, display:'flex', alignItems:'center'}}>
        <div style={{position:'absolute', left: 0, right: 0, height: 8, borderRadius: 999, background:'var(--surface-2)', border:'1px solid var(--border)'}}/>
        <div style={{position:'absolute', left: 0, width: `${left}%`, height: 8, borderRadius: 999, background:'linear-gradient(90deg, #9D85FF, #7B5CF6)'}}/>
        <div style={{position:'absolute', left: `calc(${left}% - 11px)`, width: 22, height: 22, borderRadius: 999, background:'var(--surface)', border:'2px solid var(--violet)', boxShadow:'var(--shadow-card)'}}/>
      </div>
      <div style={{display:'flex', justifyContent:'space-between', marginTop: 8, fontSize: 12, color:'var(--text-2)', fontWeight: 500}}>
        <span>Fran <b style={{color:'var(--violet)'}}>{left}%</b></span>
        <span>Sam <b style={{color:'var(--violet)'}}>{100-left}%</b></span>
      </div>
    </div>
  );
}

function CategoryRow({ icon, name, color }) {
  return (
    <div className="card" style={{padding: '12px 14px', display:'flex', alignItems:'center', gap: 12}}>
      <div style={{width: 36, height: 36, borderRadius: 10, background: `color-mix(in oklab, ${color} 18%, transparent)`, color, display:'flex', alignItems:'center', justifyContent:'center'}}>{icon}</div>
      <div style={{flex: 1, fontSize: 14, fontWeight: 600}}>{name}</div>
      <div style={{color:'var(--text-3)'}}>{I.chevR}</div>
    </div>
  );
}

function Pill({ label, icon, active }) {
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap: 5,
      padding: '5px 10px', borderRadius: 999,
      background: active ? 'var(--violet)' : 'var(--surface-2)',
      color: active ? 'white' : 'var(--text-2)',
      fontSize: 12, fontWeight: 500,
      border: active ? 'none' : '1px solid var(--border)',
    }}>
      {icon && <span style={{display:'flex', width:14, height:14}}>{React.cloneElement(icon, { size: 14 })}</span>}
      {label}
    </span>
  );
}

function FlowMini({ label, who }) {
  return (
    <div style={{flex: 1, display:'flex', alignItems:'center', gap: 8, padding: '8px 10px', borderRadius: 12, background:'var(--surface)', border:'1px solid var(--border)'}}>
      <Avatar who={who} size={28}/>
      <div>
        <div className="t-meta" style={{fontSize: 10, letterSpacing:'0.06em', textTransform:'uppercase', fontWeight: 600}}>{label}</div>
        <div style={{fontSize: 13, fontWeight: 600}}>{namesOf(who)}</div>
      </div>
    </div>
  );
}

function PickerCard({ label, who }) {
  return (
    <button style={{
      display:'flex', alignItems:'center', gap: 10, padding: 12,
      borderRadius: 14, background:'var(--surface)', border:'1px solid var(--border)',
      textAlign:'left', cursor:'pointer',
    }}>
      <Avatar who={who} size={32}/>
      <div style={{flex: 1, minWidth: 0}}>
        <div className="t-meta" style={{fontSize: 10, letterSpacing:'0.06em', textTransform:'uppercase', fontWeight: 600}}>{label}</div>
        <div style={{fontSize: 14, fontWeight: 600}}>{namesOf(who)}</div>
      </div>
      <div style={{color:'var(--text-3)'}}>{I.chevDn}</div>
    </button>
  );
}

function StickyFAB({ amount }) {
  return (
    <div style={{
      position:'absolute', left: 16, right: 16, bottom: 26, zIndex: 5,
    }}>
      <button style={{
        width: '100%', height: 52, border:'none', borderRadius: 16,
        background: 'linear-gradient(135deg, #9D85FF 0%, #7B5CF6 60%, #5B3FD9 100%)',
        color:'white', fontFamily:'Sora', fontWeight: 600, fontSize: 16,
        boxShadow: 'var(--shadow-fab)',
        display:'flex', alignItems:'center', justifyContent:'center', gap: 8,
      }}>
        Save expense · <span className="t-num" style={{fontWeight: 600}}>{fmtEUR(amount)}</span>
      </button>
    </div>
  );
}

Object.assign(window, { AddExpenseA, AddExpenseB, AddExpenseC, AddExpenseD, AddExpenseE, computeConsequence, ConsequenceSentence, FlowDiagram, SettlementChip });
