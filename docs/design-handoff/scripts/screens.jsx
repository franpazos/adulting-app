// Settlements detail screen — avatar-to-avatar cards with arrows + amounts.
// Plus: Home dashboard preview, USD-debt-payment screen, donut breakdown.

function SettlementsScreen({ dark }) {
  const balances = [
    { from:'fran', to:'sam',  amount: 50.00, items: 3 },
    { from:'sam',  to:'house', amount: 100.00, items: 1 },
    { from:'fran', to:'house', amount: 0, items: 0, settled: true },
  ];
  const totalOwed = balances.reduce((s, b) => s + b.amount, 0);

  return (
    <div className="phone-surface">
      <div className="scrollarea" style={{paddingBottom: 110}}>
        {/* nav */}
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'52px 16px 4px'}}>
          <button style={{background:'none', border:'none', color:'var(--violet)', display:'flex', alignItems:'center', gap: 2}}>
            {I.back}<span>More</span>
          </button>
          <div className="t-display" style={{fontSize: 16, fontWeight: 600}}>Settlements</div>
          <div style={{width: 22}}/>
        </div>

        {/* hero */}
        <div style={{padding:'12px 20px 0'}}>
          <div className="t-eyebrow">Outstanding</div>
          <div className="t-num" style={{fontSize: 40, fontWeight: 600, color:'var(--text-1)', marginTop: 4}}>{fmtEUR(totalOwed)}</div>
          <div className="t-meta" style={{marginTop: 2}}>across {balances.filter(b => !b.settled).length} open balances · internal accounting only</div>
        </div>

        {/* segmented filter */}
        <div style={{padding:'14px 20px 0'}}>
          <div style={{display:'flex', padding: 4, background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius: 14}}>
            {['Open','Settled','History'].map((t,i) => (
              <button key={t} style={{
                flex: 1, height: 32, border:'none',
                background: i === 0 ? 'var(--surface)' : 'transparent',
                color: i === 0 ? 'var(--text-1)' : 'var(--text-2)',
                fontWeight: i === 0 ? 600 : 500, fontSize: 13, borderRadius: 10,
                boxShadow: i === 0 ? 'var(--shadow-card)' : 'none',
              }}>{t}</button>
            ))}
          </div>
        </div>

        {/* balance cards */}
        <div style={{padding:'14px 20px 0', display:'flex', flexDirection:'column', gap: 12}}>
          {balances.filter(b => !b.settled).map((b,i) => (
            <BalanceCard key={i} {...b}/>
          ))}

          {/* Section header for history */}
          <div className="t-eyebrow" style={{marginTop: 6}}>Recent activity</div>
          {[
            { from:'fran', to:'sam', amount: 25.00, what:'Mercadona', when:'Apr 28' },
            { from:'sam',  to:'house', amount: 100.00, what:'Joint paid for Sam — gym', when:'Apr 22' },
            { from:'fran', to:'sam', amount: 25.00, what:'Pharmacy', when:'Apr 18' },
          ].map((e,i) => <HistoryRow key={i} {...e}/>)}

          {/* CTA */}
          <button style={{
            width:'100%', marginTop: 4, padding:'14px', borderRadius: 14, border:'1px dashed var(--border-strong)',
            background:'transparent', color:'var(--violet)', fontWeight: 600, fontSize: 14,
            display:'flex', alignItems:'center', justifyContent:'center', gap: 6,
          }}>
            {I.check} Record a settlement payment
          </button>
        </div>
      </div>
      <BottomNav active="more"/>
    </div>
  );
}

function BalanceCard({ from, to, amount, items }) {
  const fromName = ({fran:'Fran', sam:'Sam', house:'Household'})[from];
  const toName = ({fran:'Fran', sam:'Sam', house:'Household'})[to];
  return (
    <div className="card" style={{padding: 16, position:'relative', overflow:'hidden'}}>
      {/* subtle violet wash */}
      <div style={{position:'absolute', top:-30, right:-30, width:120, height:120, background:'radial-gradient(circle, var(--violet-tint), transparent 70%)', pointerEvents:'none'}}/>
      <div style={{display:'flex', alignItems:'center', gap: 12, position:'relative'}}>
        <div style={{display:'flex', flexDirection:'column', alignItems:'center', gap: 4}}>
          <Avatar who={from} size={42}/>
          <div style={{fontSize: 11, fontWeight: 600, color:'var(--text-2)'}}>{fromName}</div>
        </div>

        <div style={{flex: 1, display:'flex', flexDirection:'column', alignItems:'center'}}>
          <svg width="100%" height="22" viewBox="0 0 100 22" preserveAspectRatio="none" style={{maxWidth: 120}}>
            <line x1="2" y1="11" x2="92" y2="11" stroke="var(--violet)" strokeWidth="2" opacity="0.7"/>
            <polygon points="92,11 86,7 86,15" fill="var(--violet)"/>
          </svg>
          <div className="t-num" style={{fontSize: 24, fontWeight: 600, color:'var(--violet-ink)', marginTop: 2}}>{fmtEUR(amount)}</div>
          <div className="t-meta" style={{fontSize: 11}}>{items} {items === 1 ? 'transaction' : 'transactions'}</div>
        </div>

        <div style={{display:'flex', flexDirection:'column', alignItems:'center', gap: 4}}>
          <Avatar who={to} size={42}/>
          <div style={{fontSize: 11, fontWeight: 600, color:'var(--text-2)'}}>{toName}</div>
        </div>
      </div>

      <div style={{display:'flex', gap: 8, marginTop: 14, paddingTop: 14, borderTop:'1px solid var(--border)', position:'relative'}}>
        <button style={{flex: 1, height: 36, borderRadius: 10, background:'var(--violet)', color:'white', border:'none', fontWeight: 600, fontSize: 13}}>Settle up</button>
        <button style={{flex: 1, height: 36, borderRadius: 10, background:'var(--surface-2)', color:'var(--text-2)', border:'1px solid var(--border)', fontWeight: 500, fontSize: 13}}>View items</button>
      </div>
    </div>
  );
}

function HistoryRow({ from, to, amount, what, when }) {
  return (
    <div style={{padding: '10px 4px', display:'flex', alignItems:'center', gap: 10}}>
      <div style={{display:'flex', alignItems:'center', gap: -6}}>
        <Avatar who={from} size={26}/>
        <div style={{margin:'0 -6px', color:'var(--text-3)', display:'flex'}}>{I.arrowR}</div>
        <Avatar who={to} size={26}/>
      </div>
      <div style={{flex: 1, minWidth: 0}}>
        <div style={{fontSize: 13, fontWeight: 500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{what}</div>
        <div className="t-meta" style={{fontSize: 11}}>{when}</div>
      </div>
      <div className="t-num" style={{fontSize: 14, fontWeight: 600, color:'var(--text-1)'}}>{fmtEUR(amount)}</div>
    </div>
  );
}

// ── Home Dashboard ─────────────────────────────────────────────────────────
function HomeScreen() {
  return (
    <div className="phone-surface">
      <div className="scrollarea" style={{paddingBottom: 110}}>
        <div style={{padding:'52px 20px 0', display:'flex', alignItems:'center', justifyContent:'space-between'}}>
          <div style={{display:'flex', alignItems:'center', gap: 8}}>
            <ASymbol size={26}/>
            <span style={{fontFamily:'Sora', fontWeight: 600, fontSize: 16, letterSpacing:'-0.02em'}}>Adulting<span style={{color:'var(--violet)'}}>.app</span></span>
          </div>
          <div style={{display:'flex', alignItems:'center', gap: 12, color:'var(--text-2)'}}>
            <div style={{position:'relative'}}>
              {I.bell}
              <div style={{position:'absolute', top:-2, right:-2, width: 8, height: 8, borderRadius: 999, background:'var(--expense)', border:'2px solid var(--bg)'}}/>
            </div>
          </div>
        </div>

        <div style={{padding:'14px 20px 0'}}>
          <div className="t-meta">May 2026 · Hello Fran</div>
          <div className="t-display" style={{fontSize: 24, fontWeight: 600, marginTop: 2}}>Here's the household.</div>
        </div>

        {/* Owner pills */}
        <div style={{padding:'14px 20px 0', display:'flex', gap: 6, overflowX:'auto'}}>
          <Pill label="Household" active/>
          <Pill label="Fran"/>
          <Pill label="Sam"/>
          <Pill label="All"/>
        </div>

        {/* Available money hero */}
        <div style={{padding:'14px 20px 0'}}>
          <div className="card" style={{padding: 18, position:'relative', overflow:'hidden', background:'linear-gradient(135deg, #181A24 0%, #20222E 100%)', color:'#F0F0F5', borderColor:'rgba(255,255,255,0.06)'}}>
            <div style={{position:'absolute', top:-40, right:-30, width:160, height:160, background:'radial-gradient(circle, rgba(123,92,246,0.4), transparent 70%)'}}/>
            <div style={{position:'relative'}}>
              <div className="t-eyebrow" style={{color:'rgba(240,240,245,0.5)'}}>Available this month</div>
              <div className="t-num" style={{fontSize: 36, fontWeight: 600, marginTop: 4}}>€927.50</div>
              <div style={{display:'flex', gap: 18, marginTop: 14, fontSize: 11}}>
                <Stat label="Income" value="€2,980" color="#34D36E"/>
                <Stat label="Spent" value="€1,432" color="#FF8A7A"/>
                <Stat label="Recurring" value="€620" color="rgba(255,255,255,0.7)"/>
              </div>
            </div>
          </div>
        </div>

        {/* Categories donut */}
        <div style={{padding:'14px 20px 0'}}>
          <div className="card" style={{padding: 16}}>
            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 10}}>
              <div className="t-display" style={{fontSize: 15, fontWeight: 600}}>Spending by category</div>
              <div style={{color:'var(--text-3)'}}>{I.chevR}</div>
            </div>
            <div style={{display:'flex', gap: 14, alignItems:'center'}}>
              <Donut/>
              <div style={{flex: 1, display:'flex', flexDirection:'column', gap: 6}}>
                {[
                  { c:'#7B5CF6', n:'Housing',     p:42, v:601.50 },
                  { c:'#22C55E', n:'Groceries',   p:24, v:343.20 },
                  { c:'#3B82F6', n:'Transport',   p:15, v:214.75 },
                  { c:'#FF7D6B', n:'Leisure',     p:10, v:143.80 },
                  { c:'#F59E0B', n:'Other',       p: 9, v:129.25 },
                ].map((row,i) => (
                  <div key={i} style={{display:'flex', alignItems:'center', gap: 8, fontSize: 12}}>
                    <div style={{width: 8, height: 8, borderRadius: 99, background: row.c}}/>
                    <span style={{flex: 1, color:'var(--text-1)'}}>{row.n}</span>
                    <span style={{color:'var(--text-3)', fontSize: 11, fontVariantNumeric:'tabular-nums'}}>{row.p}%</span>
                    <span className="t-mono-num" style={{fontWeight: 600, minWidth: 56, textAlign:'right'}}>{fmtEUR(row.v)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Settlements + Debts row */}
        <div style={{padding:'14px 20px 0', display:'grid', gridTemplateColumns:'1fr 1fr', gap: 10}}>
          <div className="card" style={{padding: 14}}>
            <div className="t-eyebrow" style={{color:'var(--violet)'}}>Settlements</div>
            <div style={{display:'flex', alignItems:'center', gap: 6, marginTop: 8}}>
              <Avatar who="fran" size={20}/>
              <span style={{fontSize: 11, color:'var(--text-2)', fontWeight: 600}}>→</span>
              <Avatar who="sam" size={20}/>
            </div>
            <div className="t-num" style={{fontSize: 18, fontWeight: 600, marginTop: 6}}>€20.00</div>
            <div className="t-meta" style={{fontSize: 11}}>2 open</div>
          </div>
          <div className="card" style={{padding: 14}}>
            <div className="t-eyebrow" style={{color:'var(--info)'}}>Debts</div>
            <div className="t-num" style={{fontSize: 18, fontWeight: 600, marginTop: 22}}>€450.00</div>
            <div className="t-meta" style={{fontSize: 11}}>2 active</div>
          </div>
        </div>
      </div>
      <BottomNav active="home"/>
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div>
      <div style={{fontSize: 10, opacity: 0.7, letterSpacing:'0.06em', textTransform:'uppercase', fontWeight: 600}}>{label}</div>
      <div className="t-num" style={{fontSize: 14, fontWeight: 600, color, marginTop: 2}}>{value}</div>
    </div>
  );
}

function Donut() {
  const segments = [
    { c:'#7B5CF6', p: 42 },
    { c:'#22C55E', p: 24 },
    { c:'#3B82F6', p: 15 },
    { c:'#FF7D6B', p: 10 },
    { c:'#F59E0B', p:  9 },
  ];
  const r = 38, cx = 50, cy = 50, C = 2 * Math.PI * r;
  let off = 0;
  return (
    <svg width="100" height="100" viewBox="0 0 100 100" style={{flexShrink: 0}}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface-2)" strokeWidth="14"/>
      {segments.map((s, i) => {
        const len = (s.p / 100) * C;
        const dasharray = `${len} ${C - len}`;
        const dashoffset = -off;
        off += len;
        return <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={s.c} strokeWidth="14" strokeDasharray={dasharray} strokeDashoffset={dashoffset} transform={`rotate(-90 ${cx} ${cy})`} strokeLinecap="butt"/>;
      })}
      <text x="50" y="48" textAnchor="middle" fontFamily="Sora" fontWeight="600" fontSize="11" fill="var(--text-3)">Total</text>
      <text x="50" y="62" textAnchor="middle" fontFamily="Sora" fontWeight="600" fontSize="13" fill="var(--text-1)">€1,432</text>
    </svg>
  );
}

// ── USD Debt Payment with FX ───────────────────────────────────────────────
function DebtPaymentUSD() {
  const [usd, setUsd] = React.useState(250);
  const fx = 1.0825; // USD per EUR
  const eur = usd / fx;

  return (
    <div className="phone-surface">
      <div className="scrollarea" style={{paddingBottom: 110}}>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'52px 16px 4px'}}>
          <button style={{background:'none', border:'none', color:'var(--violet)', display:'flex', alignItems:'center', gap: 2}}>{I.back}<span>Debt</span></button>
          <div className="t-display" style={{fontSize: 16, fontWeight: 600}}>Pay debt</div>
          <button style={{background:'none', border:'none', color:'var(--violet)', fontWeight: 600, fontSize: 15}}>Save</button>
        </div>

        <div style={{padding:'12px 20px 0'}}>
          <div className="card" style={{padding: 14, display:'flex', alignItems:'center', gap: 10}}>
            <div style={{width: 36, height: 36, borderRadius: 10, background:'color-mix(in oklab, var(--info) 18%, transparent)', color:'var(--info)', display:'flex', alignItems:'center', justifyContent:'center'}}>{I.globe}</div>
            <div style={{flex: 1}}>
              <div style={{fontSize: 13, fontWeight: 600}}>NYC Apartment Deposit</div>
              <div className="t-meta" style={{fontSize: 11}}>Sam · USD · balance $2,400.00</div>
            </div>
            <div className="pill" style={{background:'color-mix(in oklab, var(--info) 12%, transparent)', borderColor:'transparent', color:'var(--info)'}}>USD</div>
          </div>
        </div>

        <div style={{padding:'18px 20px 0', textAlign:'center'}}>
          <div className="t-eyebrow">Payment amount</div>
          <div className="t-num" style={{fontSize: 56, fontWeight: 600, marginTop: 4}}>
            <span style={{color:'var(--text-3)', fontSize: 32, verticalAlign:'top', marginRight: 2}}>$</span>{usd.toFixed(2)}
          </div>
          <div style={{display:'flex', justifyContent:'center', gap: 6, marginTop: 8}}>
            {[100, 250, 500, 1000].map(v => (
              <button key={v} onClick={() => setUsd(v)} style={{
                padding:'5px 12px', borderRadius: 999,
                background: usd === v ? 'var(--violet)' : 'var(--surface-2)',
                color: usd === v ? 'white' : 'var(--text-2)',
                border: usd === v ? 'none' : '1px solid var(--border)',
                fontSize: 12, fontWeight: 500,
              }}>${v}</button>
            ))}
          </div>
        </div>

        {/* FX card */}
        <div style={{padding:'18px 20px 0'}}>
          <div className="card" style={{padding: 16, background:'linear-gradient(180deg, var(--surface) 0%, var(--surface-2) 100%)'}}>
            <div style={{display:'flex', alignItems:'center', gap: 10, marginBottom: 12}}>
              <div className="t-eyebrow" style={{flex: 1}}>Exchange</div>
              <div style={{display:'flex', alignItems:'center', gap: 4, color:'var(--text-3)', fontSize: 11}}>
                {I.swap} <span>Live · 14:32</span>
              </div>
            </div>
            <div style={{display:'flex', alignItems:'center', gap: 12}}>
              <div style={{flex: 1}}>
                <div className="t-meta" style={{fontSize: 10, letterSpacing:'0.08em', textTransform:'uppercase', fontWeight: 600}}>You pay</div>
                <div className="t-num" style={{fontSize: 22, fontWeight: 600, marginTop: 2}}>${usd.toFixed(2)}</div>
              </div>
              <div style={{color:'var(--violet)', fontSize: 12, fontWeight: 600, padding:'4px 8px', borderRadius: 8, background:'var(--violet-tint)'}}>1 € = ${fx}</div>
              <div style={{flex: 1, textAlign:'right'}}>
                <div className="t-meta" style={{fontSize: 10, letterSpacing:'0.08em', textTransform:'uppercase', fontWeight: 600}}>EUR impact</div>
                <div className="t-num" style={{fontSize: 22, fontWeight: 600, marginTop: 2, color:'var(--violet-ink)'}}>{fmtEUR(eur)}</div>
              </div>
            </div>
            <div style={{height: 1, background:'var(--border)', margin:'14px 0'}}/>
            <div style={{display:'flex', justifyContent:'space-between', fontSize: 12}}>
              <span style={{color:'var(--text-2)'}}>New balance after payment</span>
              <span className="t-num" style={{fontWeight: 600}}>${(2400 - usd).toFixed(2)}</span>
            </div>
            <div style={{display:'flex', justifyContent:'space-between', fontSize: 12, marginTop: 6}}>
              <span style={{color:'var(--text-2)'}}>Cash source</span>
              <span style={{fontWeight: 600, display:'flex', alignItems:'center', gap: 6}}><Avatar who="sam" size={16}/> Sam personal</span>
            </div>
          </div>
        </div>

        <div style={{padding:'14px 20px 0'}}>
          <div style={{padding:'10px 12px', borderRadius: 12, background:'color-mix(in oklab, var(--warning) 14%, transparent)', color:'var(--warning)', fontSize: 12, lineHeight: 1.45, display:'flex', gap: 8, alignItems:'flex-start'}}>
            <div style={{flexShrink: 0, marginTop: 1}}>{I.bolt}</div>
            <div><b>FX rate caveat:</b> EUR impact is calculated at the rate above. Final bank rate may differ; we'll reconcile when the transaction syncs.</div>
          </div>
        </div>
      </div>

      <div style={{position:'absolute', left: 16, right: 16, bottom: 26, zIndex: 5}}>
        <button style={{
          width:'100%', height: 52, border:'none', borderRadius: 16,
          background:'linear-gradient(135deg, #9D85FF 0%, #7B5CF6 60%, #5B3FD9 100%)',
          color:'white', fontFamily:'Sora', fontWeight: 600, fontSize: 16,
          boxShadow:'var(--shadow-fab)',
        }}>
          Record payment · ${usd.toFixed(2)}
        </button>
      </div>
    </div>
  );
}

Object.assign(window, { SettlementsScreen, HomeScreen, DebtPaymentUSD, BalanceCard });
