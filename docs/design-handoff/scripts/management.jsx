// Phase-2 screens: Recurring, Categories, Accounts, Settings, Empty states.

// ── Recurring list + form ─────────────────────────────────────────────────
function RecurringScreen() {
  const items = [
    { name:'Salary',         kind:'income',  amount: 2450.00, who:'fran',  cat:'Income',     day:'25th' },
    { name:'Rent',           kind:'expense', amount:  950.00, who:'house', cat:'Housing',    day:'1st' },
    { name:'Endesa',         kind:'expense', amount:   67.22, who:'house', cat:'Utilities',  day:'8th' },
    { name:'Spotify Family', kind:'expense', amount:   17.99, who:'house', cat:'Subscriptions', day:'14th' },
    { name:'Gym',            kind:'expense', amount:   42.00, who:'sam',   cat:'Health',     day:'1st' },
    { name:'Loan payment',   kind:'debt',    amount:  150.00, who:'sam',   cat:'Debt',       day:'15th' },
  ];
  const incomes = items.filter(i => i.kind === 'income');
  const expenses = items.filter(i => i.kind !== 'income');
  const total = expenses.reduce((s,i)=>s+i.amount,0);
  const incTotal = incomes.reduce((s,i)=>s+i.amount,0);

  return (
    <div className="phone-surface">
      <div className="scrollarea" style={{paddingBottom: 110}}>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'52px 16px 4px'}}>
          <button style={{background:'none', border:'none', color:'var(--violet)', display:'flex', alignItems:'center', gap: 2}}>{I.back}<span>More</span></button>
          <div className="t-display" style={{fontSize: 16, fontWeight: 600}}>Recurring</div>
          <button style={{background:'none', border:'none', color:'var(--violet)'}}>{I.plus}</button>
        </div>

        <div style={{padding:'10px 20px 0'}}>
          <div className="card" style={{padding: 14, display:'grid', gridTemplateColumns:'1fr 1fr', gap: 12}}>
            <div>
              <div className="t-eyebrow" style={{color:'var(--positive)'}}>Monthly in</div>
              <div className="t-num" style={{fontSize: 22, fontWeight: 600, marginTop: 4, color:'var(--positive)'}}>+{fmtEUR(incTotal)}</div>
            </div>
            <div>
              <div className="t-eyebrow" style={{color:'var(--expense)'}}>Monthly out</div>
              <div className="t-num" style={{fontSize: 22, fontWeight: 600, marginTop: 4, color:'var(--expense)'}}>-{fmtEUR(total)}</div>
            </div>
          </div>
        </div>

        <SectionLabel>Incomes</SectionLabel>
        <List>
          {incomes.map((it,i) => <RecRow key={i} {...it}/>)}
        </List>
        <SectionLabel>Expenses</SectionLabel>
        <List>
          {expenses.map((it,i) => <RecRow key={i} {...it}/>)}
        </List>
      </div>
      <BottomNav active="more"/>
    </div>
  );
}

function RecRow({ name, kind, amount, who, cat, day }) {
  const colorMap = { income:'var(--positive)', expense:'var(--expense)', debt:'var(--info)' };
  const color = colorMap[kind];
  return (
    <div style={{padding:'12px 14px', display:'flex', alignItems:'center', gap: 12}}>
      <div style={{width: 36, height: 36, borderRadius: 10, background: `color-mix(in oklab, ${color} 14%, transparent)`, color, display:'flex', alignItems:'center', justifyContent:'center', fontSize: 14, fontWeight: 600, fontFamily:'Sora'}}>
        {kind === 'income' ? '↓' : kind === 'debt' ? '%' : '↑'}
      </div>
      <div style={{flex: 1, minWidth: 0}}>
        <div style={{fontSize: 14, fontWeight: 600}}>{name}</div>
        <div style={{display:'flex', gap: 6, alignItems:'center', marginTop: 1}}>
          <Avatar who={who} size={14}/>
          <span className="t-meta" style={{fontSize: 11}}>{cat} · every {day}</span>
        </div>
      </div>
      <div style={{textAlign:'right'}}>
        <div className="t-num" style={{fontSize: 14, fontWeight: 600, color: kind === 'income' ? 'var(--positive)' : 'var(--text-1)'}}>{kind === 'income' ? '+' : ''}{fmtEUR(amount)}</div>
        <div className="t-meta" style={{fontSize: 10, marginTop: 1}}>monthly</div>
      </div>
    </div>
  );
}

// ── Recurring form ─────────────────────────────────────────────────────────
function RecurringForm() {
  return (
    <div className="phone-surface">
      <div className="scrollarea" style={{paddingBottom: 110}}>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'52px 16px 4px'}}>
          <button style={{background:'none', border:'none', color:'var(--violet)'}}>Cancel</button>
          <div className="t-display" style={{fontSize: 16, fontWeight: 600}}>New recurring</div>
          <button style={{background:'none', border:'none', color:'var(--violet)', fontWeight: 600}}>Save</button>
        </div>

        <div style={{padding:'14px 20px 0'}}>
          <div className="t-eyebrow" style={{marginBottom: 8}}>Type</div>
          <div style={{display:'flex', padding: 4, background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius: 14}}>
            {['Expense','Income','Debt payment'].map((t,i) => (
              <button key={t} style={{flex: 1, height: 34, border:'none', background: i === 0 ? 'var(--surface)' : 'transparent', color: i === 0 ? 'var(--text-1)' : 'var(--text-2)', fontWeight: i === 0 ? 600 : 500, fontSize: 12, borderRadius: 10, boxShadow: i === 0 ? 'var(--shadow-card)' : 'none'}}>{t}</button>
            ))}
          </div>
        </div>

        <FormRow label="Name" value="Spotify Family"/>
        <div style={{padding:'14px 20px 0'}}>
          <div className="t-eyebrow" style={{marginBottom: 8}}>Amount</div>
          <div className="card" style={{padding:'10px 14px', display:'flex', alignItems:'baseline', gap: 6}}>
            <span style={{color:'var(--text-3)', fontWeight: 500, fontSize: 22, fontFamily:'Sora'}}>€</span>
            <span className="t-num" style={{fontSize: 28, fontWeight: 600}}>17.99</span>
          </div>
        </div>

        <FormRow label="Category" value="Subscriptions" icon="🎵"/>
        <FormRow label="Paid from" value="Joint account" who="joint"/>
        <FormRow label="Owner" value="Household" who="house"/>

        <div style={{padding:'14px 20px 0'}}>
          <div className="t-eyebrow" style={{marginBottom: 8}}>Frequency</div>
          <div className="card" style={{padding: 14}}>
            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 10}}>
              <div style={{fontSize: 13, fontWeight: 500}}>Every month</div>
              <div style={{color:'var(--text-3)'}}>{I.chevDn}</div>
            </div>
            <div style={{height: 1, background:'var(--border)', margin:'4px -14px 10px'}}/>
            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
              <div>
                <div style={{fontSize: 13, fontWeight: 500}}>Day of month</div>
                <div className="t-meta" style={{fontSize: 11}}>Charges every 14th</div>
              </div>
              <div style={{padding:'4px 10px', background:'var(--violet-tint)', color:'var(--violet-ink)', borderRadius: 8, fontWeight: 600, fontSize: 13, fontFamily:'Sora'}}>14</div>
            </div>
          </div>
        </div>

        <div style={{padding:'14px 20px 0'}}>
          <div className="card" style={{padding:'12px 14px', display:'flex', alignItems:'center', justifyContent:'space-between'}}>
            <div>
              <div style={{fontSize: 13, fontWeight: 500}}>Auto-include in monthly forecast</div>
              <div className="t-meta" style={{fontSize: 11}}>Counts toward available money</div>
            </div>
            <Toggle on/>
          </div>
        </div>
      </div>
      <BottomNav active="more"/>
    </div>
  );
}

function FormRow({ label, value, who, icon }) {
  return (
    <div style={{padding:'14px 20px 0'}}>
      <div className="t-eyebrow" style={{marginBottom: 8}}>{label}</div>
      <div className="card" style={{padding:'12px 14px', display:'flex', alignItems:'center', gap: 10}}>
        {who && <Avatar who={who} size={28}/>}
        {icon && <span style={{fontSize: 18}}>{icon}</span>}
        <span style={{flex: 1, fontSize: 14, fontWeight: 500}}>{value}</span>
        <span style={{color:'var(--text-3)'}}>{I.chevR}</span>
      </div>
    </div>
  );
}

function Toggle({ on }) {
  return (
    <div style={{
      width: 40, height: 24, borderRadius: 999, padding: 2,
      background: on ? 'var(--violet)' : 'var(--border-strong)',
      display:'flex', alignItems:'center',
      justifyContent: on ? 'flex-end' : 'flex-start',
      transition: 'all 200ms',
    }}>
      <div style={{width: 20, height: 20, borderRadius: 999, background:'white', boxShadow:'0 1px 3px rgba(0,0,0,0.2)'}}/>
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{padding:'18px 20px 6px'}}>
      <div className="t-eyebrow">{children}</div>
    </div>
  );
}

function List({ children }) {
  const arr = React.Children.toArray(children);
  return (
    <div style={{margin:'0 20px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius: 16, overflow:'hidden'}}>
      {arr.map((c, i) => (
        <div key={i} style={{borderTop: i > 0 ? '1px solid var(--border)' : 'none'}}>{c}</div>
      ))}
    </div>
  );
}

// ── Categories management ─────────────────────────────────────────────────
function CategoriesScreen() {
  const cats = [
    { name:'Housing',       color:'#7B5CF6', icon:'🏠', kind:'expense', count: 14 },
    { name:'Groceries',     color:'#22C55E', icon:'🛒', kind:'expense', count: 38 },
    { name:'Transport',     color:'#3B82F6', icon:'🚗', kind:'expense', count: 22 },
    { name:'Leisure',       color:'#FF7D6B', icon:'🎬', kind:'expense', count: 12 },
    { name:'Health',        color:'#F59E0B', icon:'❤️', kind:'expense', count:  6 },
    { name:'Subscriptions', color:'#A891FA', icon:'📦', kind:'expense', count:  9 },
    { name:'Other',         color:'#8E92A0', icon:'•',  kind:'expense', count:  4 },
  ];
  const incomes = [
    { name:'Salary',        color:'#22C55E', icon:'💼', kind:'income',  count:  2 },
    { name:'Freelance',     color:'#34D36E', icon:'⚡',  kind:'income',  count:  1 },
  ];

  return (
    <div className="phone-surface">
      <div className="scrollarea" style={{paddingBottom: 110}}>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'52px 16px 4px'}}>
          <button style={{background:'none', border:'none', color:'var(--violet)', display:'flex', alignItems:'center', gap: 2}}>{I.back}<span>More</span></button>
          <div className="t-display" style={{fontSize: 16, fontWeight: 600}}>Categories</div>
          <button style={{background:'none', border:'none', color:'var(--violet)'}}>{I.plus}</button>
        </div>

        <div style={{padding:'10px 20px 0'}}>
          <div style={{display:'flex', alignItems:'center', gap: 8, padding:'10px 12px', background:'var(--surface-2)', borderRadius: 12, border:'1px solid var(--border)'}}>
            <div style={{color:'var(--text-3)'}}>{I.search}</div>
            <span style={{flex: 1, fontSize: 13, color:'var(--text-3)'}}>Search categories</span>
          </div>
        </div>

        <SectionLabel>Expense</SectionLabel>
        <List>
          {cats.map((c,i) => <CatRow key={i} {...c}/>)}
        </List>
        <SectionLabel>Income</SectionLabel>
        <List>
          {incomes.map((c,i) => <CatRow key={i} {...c}/>)}
        </List>
      </div>
      <BottomNav active="more"/>
    </div>
  );
}

function CatRow({ name, color, icon, count }) {
  return (
    <div style={{padding:'12px 14px', display:'flex', alignItems:'center', gap: 12}}>
      <div style={{width: 36, height: 36, borderRadius: 10, background: `color-mix(in oklab, ${color} 16%, transparent)`, color, display:'flex', alignItems:'center', justifyContent:'center', fontSize: 16}}>
        {icon}
      </div>
      <div style={{flex: 1}}>
        <div style={{fontSize: 14, fontWeight: 600}}>{name}</div>
        <div className="t-meta" style={{fontSize: 11}}>{count} transactions</div>
      </div>
      <div style={{width: 12, height: 12, borderRadius: 99, background: color, marginRight: 8}}/>
      <div style={{color:'var(--text-3)'}}>{I.chevR}</div>
    </div>
  );
}

// ── Accounts ──────────────────────────────────────────────────────────────
function AccountsScreen() {
  const accounts = [
    { name:'Joint account', kind:'JOINT', who:'joint', balance: 2840.50, currency:'EUR' },
    { name:'Fran personal', kind:'PERSONAL', who:'fran', balance: 1250.20, currency:'EUR' },
    { name:'Sam personal',  kind:'PERSONAL', who:'sam', balance:  890.75, currency:'EUR' },
    { name:'Sam USD savings', kind:'PERSONAL', who:'sam', balance: 1240.00, currency:'USD' },
  ];

  return (
    <div className="phone-surface">
      <div className="scrollarea" style={{paddingBottom: 110}}>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'52px 16px 4px'}}>
          <button style={{background:'none', border:'none', color:'var(--violet)', display:'flex', alignItems:'center', gap: 2}}>{I.back}<span>More</span></button>
          <div className="t-display" style={{fontSize: 16, fontWeight: 600}}>Accounts</div>
          <button style={{background:'none', border:'none', color:'var(--violet)'}}>{I.plus}</button>
        </div>

        <div style={{padding:'14px 20px 0'}}>
          <div className="t-eyebrow">Total estimated</div>
          <div className="t-num" style={{fontSize: 36, fontWeight: 600, marginTop: 4}}>€6,127.45</div>
          <div className="t-meta" style={{fontSize: 11}}>across 4 accounts · USD converted at 1.0825</div>
        </div>

        <div style={{padding:'14px 20px 0', display:'flex', flexDirection:'column', gap: 10}}>
          {accounts.map((a,i) => <AccountCard key={i} {...a}/>)}
        </div>
      </div>
      <BottomNav active="more"/>
    </div>
  );
}

function AccountCard({ name, kind, who, balance, currency }) {
  const symbol = currency === 'USD' ? '$' : '€';
  return (
    <div className="card" style={{padding: 16}}>
      <div style={{display:'flex', alignItems:'center', gap: 12}}>
        <Avatar who={who} size={40}/>
        <div style={{flex: 1, minWidth: 0}}>
          <div style={{fontSize: 14, fontWeight: 600}}>{name}</div>
          <div style={{display:'flex', alignItems:'center', gap: 6, marginTop: 2}}>
            <span className="pill" style={{height: 18, padding:'0 8px', fontSize: 10, background:'var(--surface-2)'}}>{kind}</span>
            <span className="pill" style={{height: 18, padding:'0 8px', fontSize: 10, background:'color-mix(in oklab, var(--info) 12%, transparent)', borderColor:'transparent', color:'var(--info)'}}>{currency}</span>
          </div>
        </div>
        <div style={{color:'var(--text-3)'}}>{I.chevR}</div>
      </div>
      <div style={{height: 1, background:'var(--border)', margin:'12px -16px 12px'}}/>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <span className="t-meta">Estimated balance</span>
        <span className="t-num" style={{fontSize: 18, fontWeight: 600}}>{symbol}{balance.toLocaleString('en-US',{minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
      </div>
    </div>
  );
}

// ── Settings ──────────────────────────────────────────────────────────────
function SettingsScreen() {
  return (
    <div className="phone-surface">
      <div className="scrollarea" style={{paddingBottom: 110}}>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'52px 16px 4px'}}>
          <button style={{background:'none', border:'none', color:'var(--violet)', display:'flex', alignItems:'center', gap: 2}}>{I.back}<span>More</span></button>
          <div className="t-display" style={{fontSize: 16, fontWeight: 600}}>Settings</div>
          <div style={{width: 22}}/>
        </div>

        <SectionLabel>Appearance</SectionLabel>
        <List>
          <SettingRow label="Theme" value="System" icon="◐"/>
          <SettingRow label="Language" value="English" icon="🌐"/>
          <SettingRow label="Accent" trailing={
            <div style={{display:'flex', gap: 4}}>
              {['#7B5CF6','#22C55E','#3B82F6','#F59E0B'].map(c => (
                <div key={c} style={{width: 16, height: 16, borderRadius: 99, background: c, border: c === '#7B5CF6' ? '2px solid var(--text-1)' : '2px solid transparent'}}/>
              ))}
            </div>
          }/>
        </List>

        <SectionLabel>Defaults</SectionLabel>
        <List>
          <SettingRow label="Default split" value="50 / 50"/>
          <SettingRow label="Default source" value="Joint" who="joint"/>
          <SettingRow label="Round amounts" trailing={<Toggle/>}/>
        </List>

        <SectionLabel>Sync</SectionLabel>
        <List>
          <SettingRow label="Google Sheets" value={<span style={{color:'var(--positive)'}}>● Connected</span>}/>
          <SettingRow label="Auto-sync" trailing={<Toggle on/>}/>
          <SettingRow label="Last sync" value="2 minutes ago"/>
        </List>

        <SectionLabel>Data</SectionLabel>
        <List>
          <SettingRow label="Export backup"/>
          <SettingRow label="Import from Sheets"/>
          <SettingRow label="Reset app" valueColor="var(--expense)"/>
        </List>

        <div style={{textAlign:'center', padding:'20px 0', color:'var(--text-3)', fontSize: 11}}>Adulting.app · v0.1.0</div>
      </div>
      <BottomNav active="more"/>
    </div>
  );
}

function SettingRow({ label, value, icon, trailing, who, valueColor }) {
  return (
    <div style={{padding:'13px 14px', display:'flex', alignItems:'center', gap: 12}}>
      {icon && <div style={{width: 28, height: 28, borderRadius: 8, background:'var(--surface-2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize: 14}}>{icon}</div>}
      {who && <Avatar who={who} size={24}/>}
      <div style={{flex: 1, fontSize: 14, fontWeight: 500, color: valueColor || 'var(--text-1)'}}>{label}</div>
      {trailing}
      {value && <div style={{fontSize: 13, color: valueColor || 'var(--text-2)'}}>{value}</div>}
      {!trailing && <div style={{color:'var(--text-3)', marginLeft: 4}}>{I.chevR}</div>}
    </div>
  );
}

// ── Empty states ──────────────────────────────────────────────────────────
function EmptyTransactions() {
  return (
    <div className="phone-surface">
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'52px 16px 4px'}}>
        <div className="t-display" style={{fontSize: 22, fontWeight: 600, padding:'0 4px'}}>Transactions</div>
        <button style={{background:'none', border:'none', color:'var(--text-2)'}}>{I.filter}</button>
      </div>
      <div style={{height:'calc(100% - 80px)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'0 40px', textAlign:'center'}}>
        <EmptyArt kind="transactions"/>
        <div className="t-display" style={{fontSize: 20, fontWeight: 600, marginTop: 24}}>Quiet so far</div>
        <p style={{fontSize: 13, color:'var(--text-2)', marginTop: 8, lineHeight: 1.5, maxWidth: 260}}>Your transactions will appear here as soon as you record one. Tap the <b style={{color:'var(--violet)'}}>+</b> button below to start.</p>
        <button style={{marginTop: 20, padding:'10px 18px', borderRadius: 999, background:'var(--violet-tint)', color:'var(--violet-ink)', border:'none', fontWeight: 600, fontSize: 13}}>Try a sample</button>
      </div>
      <BottomNav active="tx"/>
    </div>
  );
}

function EmptyDebts() {
  return (
    <div className="phone-surface">
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'52px 16px 4px'}}>
        <div className="t-display" style={{fontSize: 22, fontWeight: 600, padding:'0 4px'}}>Debts</div>
        <button style={{background:'none', border:'none', color:'var(--violet)'}}>{I.plus}</button>
      </div>
      <div style={{height:'calc(100% - 80px)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'0 40px', textAlign:'center'}}>
        <EmptyArt kind="debts"/>
        <div className="t-display" style={{fontSize: 20, fontWeight: 600, marginTop: 24}}>Debt-free, for now</div>
        <p style={{fontSize: 13, color:'var(--text-2)', marginTop: 8, lineHeight: 1.5, maxWidth: 260}}>Track loans, credit cards, or anything you owe (or are owed) — separately from internal Settlements.</p>
        <button style={{marginTop: 20, padding:'10px 18px', borderRadius: 999, background:'var(--violet)', color:'white', border:'none', fontWeight: 600, fontSize: 13}}>+ Add a debt</button>
      </div>
      <BottomNav active="debts"/>
    </div>
  );
}

function EmptySettlements() {
  return (
    <div className="phone-surface">
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'52px 16px 4px'}}>
        <button style={{background:'none', border:'none', color:'var(--violet)', display:'flex', alignItems:'center'}}>{I.back}<span>More</span></button>
        <div className="t-display" style={{fontSize: 16, fontWeight: 600}}>Settlements</div>
        <div style={{width: 22}}/>
      </div>
      <div style={{height:'calc(100% - 80px)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'0 40px', textAlign:'center'}}>
        <EmptyArt kind="settlements"/>
        <div className="t-display" style={{fontSize: 20, fontWeight: 600, marginTop: 24}}>All square</div>
        <p style={{fontSize: 13, color:'var(--text-2)', marginTop: 8, lineHeight: 1.5, maxWidth: 280}}>Nobody owes anyone right now. When a shared expense gets paid from a personal account, the balance will show up here.</p>
      </div>
      <BottomNav active="more"/>
    </div>
  );
}

// Sober line-art illustrations — geometric, no people
function EmptyArt({ kind }) {
  if (kind === 'transactions') {
    return (
      <svg width="160" height="120" viewBox="0 0 160 120" fill="none">
        <rect x="20" y="30" width="120" height="22" rx="6" fill="var(--surface-2)" stroke="var(--border)" strokeWidth="1"/>
        <rect x="20" y="58" width="120" height="22" rx="6" fill="var(--surface-2)" stroke="var(--border)" strokeWidth="1" opacity="0.7"/>
        <rect x="20" y="86" width="120" height="22" rx="6" fill="var(--surface-2)" stroke="var(--border)" strokeWidth="1" opacity="0.4"/>
        <circle cx="32" cy="20" r="10" fill="var(--violet-tint)" stroke="var(--violet)" strokeWidth="1.4"/>
        <path d="M28 20l3 3 5-6" stroke="var(--violet)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      </svg>
    );
  }
  if (kind === 'debts') {
    return (
      <svg width="160" height="120" viewBox="0 0 160 120" fill="none">
        <rect x="30" y="40" width="100" height="60" rx="10" fill="var(--surface-2)" stroke="var(--border)" strokeWidth="1.4"/>
        <line x1="30" y1="58" x2="130" y2="58" stroke="var(--border)"/>
        <circle cx="80" cy="78" r="14" fill="var(--violet-tint)" stroke="var(--violet)" strokeWidth="1.4"/>
        <path d="M75 78l4 4 7-7" stroke="var(--violet)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      </svg>
    );
  }
  // settlements
  return (
    <svg width="160" height="120" viewBox="0 0 160 120" fill="none">
      <circle cx="55" cy="60" r="22" fill="var(--violet-tint)" stroke="var(--violet)" strokeWidth="1.4"/>
      <text x="55" y="65" textAnchor="middle" fontFamily="Sora" fontWeight="600" fontSize="16" fill="var(--violet)">F</text>
      <circle cx="105" cy="60" r="22" fill="color-mix(in oklab, var(--expense) 16%, transparent)" stroke="var(--expense)" strokeWidth="1.4"/>
      <text x="105" y="65" textAnchor="middle" fontFamily="Sora" fontWeight="600" fontSize="16" fill="var(--expense)">S</text>
      <line x1="78" y1="60" x2="82" y2="60" stroke="var(--positive)" strokeWidth="3" strokeLinecap="round"/>
      <text x="80" y="100" textAnchor="middle" fontFamily="Inter" fontWeight="600" fontSize="11" fill="var(--positive)">€0.00</text>
    </svg>
  );
}

Object.assign(window, { RecurringScreen, RecurringForm, CategoriesScreen, AccountsScreen, SettingsScreen, EmptyTransactions, EmptyDebts, EmptySettlements });
