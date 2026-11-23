import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Activity, AlertTriangle, ArrowUpRight, BadgeCheck, Banknote, BookOpen, BriefcaseBusiness, CreditCard, Download, FileText, GraduationCap, Package, Plus, Send, Upload, Users, Wallet } from 'lucide-react';
import { useWorkspace } from '../App';
import { dateText, fetchRecords, friendly, http, money, shortDate } from '../api';
import { areas, configs } from '../config';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Bar, BarChart } from 'recharts';
import RenewalsPanel from './RenewalsPanel';
import { Drawer, Empty, ErrorState, Loader, PageHead, Panel, RecordForm, Stat, Status, Table, Tabs, Toolbar, useToast } from '../components/UI';
const domainData: Record<string, {
    title: string;
    desc: string;
    action: string;
}> = {
    learning: { title: 'Student & course operations', desc: 'Manage students, batches, fees, internships and stipends in one place.', action: 'Add student' },
    advisory: { title: 'Capital & trading oversight', desc: 'Track trading accounts, daily performance, capital movements and approvals.', action: 'Add trading account' },
    products: { title: 'Products & subscriptions', desc: 'Manage products, customers, subscriptions and upcoming renewals.', action: 'Add product' },
    projects: { title: 'Project delivery', desc: 'Plan, track and deliver projects across companies and regions.', action: 'New project' },
    finance: { title: 'Finance operations', desc: 'Cash, collections, obligations and controlled financial workflows.', action: 'Record invoice' },
};
const creatable = new Set(['students', 'courses', 'batches', 'internships', 'tradingAccounts', 'capitalMovements', 'usdtTransactions', 'mentors', 'traders', 'vendors', 'bankAccounts', 'clients', 'leads', 'proposals', 'products', 'subscriptions', 'projects', 'milestones', 'invoices', 'expenses', 'transfers', 'tasks', 'events']);
const currencies = ['amount', 'paidAmount', 'outstanding', 'budget', 'fee', 'capital', 'totalFees', 'price', 'stipend', 'realizedPnL', 'unrealizedPnL','totalInr','realizedPnl','rateInr'];
/** Escape CSV values and neutralize spreadsheet formula execution. */
function csvCell(value: unknown): string {
    const raw = value && typeof value === 'object' && '$numberDecimal' in value
        ? String((value as {
            $numberDecimal: string;
        }).$numberDecimal)
        : String(value ?? '');
    const trimmed = raw.trimStart();
    const safe = /^[=+@\-\t\r]/.test(trimmed) && !/^-?\d+(\.\d+)?$/.test(trimmed)
        ? `'${raw}`
        : raw;
    return `"${safe.replace(/"/g, '""')}"`;
}
function ExportButton({ items, entity }: {
    items: any[];
    entity: string;
}) {
    const save = () => {
        const cols = configs[entity].columns;
        const lines = [
            cols.map(csvCell).join(','),
            ...items.map(item => cols.map(col => csvCell(item[col])).join(',')),
        ];
        const blob = new Blob(['\uFEFF', lines.join('\r\n')], {
            type: 'text/csv;charset=utf-8',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${entity}-export.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };
    return <button className="button secondary" onClick={save}><Download size={15}/> Export</button>;
}
export default function DomainPage({ domain }: {
    domain: string;
}) {
    const { company, session } = useWorkspace();
    const location = useLocation();
    const query = useQueryClient();
    const toast = useToast();
    const d = domainData[domain];
    const tabKeys = areas[domain as keyof typeof areas] || [];
    const [active, setActive] = useState(tabKeys[0]);
    useEffect(()=>{setActive(tabKeys[0]);setSelected(null);setSearch('');},[domain]);
    useEffect(()=>{const tab=new URLSearchParams(location.search).get('tab');if(tab && tabKeys.includes(tab))setActive(tab);},[domain,location.search]);
    const [selected, setSelected] = useState<any | null>(null);
    const [create, setCreate] = useState(false);
    const [edit, setEdit] = useState(false);
    const [stateBusy,setStateBusy]=useState(false);
    const [search, setSearch] = useState('');
    const [debouncedSearch,setDebouncedSearch] = useState('');
    const [page,setPage] = useState(1);
    useEffect(()=>{const t=setTimeout(()=>{setDebouncedSearch(search);setPage(1);},350);return()=>clearTimeout(t);},[search]);
    const [pay, setPay] = useState('');
    const [reference, setReference] = useState('');
    const [importOpen, setImportOpen] = useState(false);
    const [csv, setCsv] = useState('');
    const [accountId, setAccountId] = useState('');
    const [loading, setLoading] = useState(false);
    const [scheduleOpen, setScheduleOpen] = useState(false);
    const [studentId, setStudentId] = useState('');
    const [installmentDue, setInstallmentDue] = useState('');
    const [installmentTitle, setInstallmentTitle] = useState('');
    const projectMilestones = useQuery({queryKey:['milestones-for-project',selected?._id,company],queryFn:()=>fetchRecords('milestones',{projectId:selected._id,limit:200}),enabled:domain==='projects'&&active==='projects'&&!!selected});
    const studentLookup = useQuery({ queryKey: ['records', 'students', company], queryFn: () => fetchRecords('students', { limit: 200 }), enabled: domain === 'learning' && active === 'installments' });
    const accountLookup = useQuery({ queryKey: ['records', 'tradingAccounts', company], queryFn: () => fetchRecords('tradingAccounts', { limit: 200 }), enabled: importOpen });
    const occupancy = useQuery({ queryKey: ['occupancy',company], queryFn:async()=> (await http.get('/records/batches/occupancy')).data as any[], enabled:domain==='learning' && active === 'batches' });
    const perfAccounts = useQuery({ queryKey:['records','tradingAccounts',company], queryFn:()=>fetchRecords('tradingAccounts',{limit:200}), enabled:domain==='advisory'&&active==='dailyPerformance'});
    const masterKinds = domain === 'learning' ? ['mentors'] : domain === 'advisory' ? ['traders'] : domain === 'finance' ? ['vendors','clients','projects'] : domain === 'projects' ? ['clients'] : domain === 'products' ? ['clients'] : [];
    const masters = useQuery({queryKey:['master-names',domain,company],queryFn:async()=>Object.fromEntries(await Promise.all(masterKinds.map(async k=>[k, k==='clients'?(await http.get('/records/lookups/clients')).data.items:k==='projects'?(await http.get('/records/lookups/projects')).data.items:(await fetchRecords(k,{limit:200})).items]))),enabled:masterKinds.length>0,staleTime:120000});
    const [accountFilter,setAccountFilter] = useState('');
    const [dateFrom,setDateFrom] = useState('');
    const [dateTo,setDateTo] = useState('');
    const inventory = useQuery({queryKey:['usdt-inventory',company],queryFn:async()=> (await http.get('/records/usdt/inventory')).data as any,enabled:domain==='advisory'&&active==='usdtTransactions',staleTime:15000});
    const summary = useQuery({queryKey:['insights-summary',company],queryFn:async()=> (await http.get('/insights/summary')).data, staleTime:45000});
    const overview = summary.data || {};
    const q = useQuery({ queryKey: ['records', active, company, page, debouncedSearch], queryFn: () => fetchRecords(active, { limit: 50, page, ...(debouncedSearch ? {search:debouncedSearch}: {}) }), enabled:active !== 'renewals' });
    const records = q.data?.items || [];
    const enhanced = records.map(row=>{const o = active==='batches' && occupancy.data ? (occupancy.data || []).find((b:any)=>b._id===row._id) : undefined;const mentor=(masters.data?.mentors||[]).find((m:any)=>m._id===row.mentorId);const trader=(masters.data?.traders||[]).find((m:any)=>m._id===row.traderId);const vendor=(masters.data?.vendors||[]).find((m:any)=>m._id===row.vendorId);return {...row,...o,mentor:mentor?.title||row.mentor,instructor:mentor?.title||row.instructor,trader:trader?.title||row.trader,vendor:vendor?.title||row.vendor,clientName:(masters.data?.clients||[]).find((c:any)=>c._id===row.clientId)?.title||'—',projectName:(masters.data?.projects||[]).find((p:any)=>p._id===row.projectId)?.title||'—'};});
    const items = useMemo(() => enhanced.filter(x => x.status !== 'archived' && x.title?.toLowerCase().includes(search.toLowerCase()) && (active !== 'dailyPerformance' || ((!accountFilter || x.tradingAccountId===accountFilter) && (!dateFrom || String(x.performanceDate).slice(0,10)>=dateFrom) && (!dateTo || String(x.performanceDate).slice(0,10)<=dateTo)))), [q.data, occupancy.data, masters.data, search, active, accountFilter, dateFrom, dateTo]);
    const performanceChart = [...items].filter(x=>x.performanceDate).sort((a,b)=>String(a.performanceDate).localeCompare(String(b.performanceDate))).map(x=>({date:String(x.performanceDate).slice(5,10),pnl:Number(x.realizedPnL?.$numberDecimal || x.realizedPnL || 0)}));
    const subscriptionChart = active==='subscriptions' ? Object.entries(items.reduce((acc:Record<string,number>,x:any)=>{const month=String(x.renewAt||'').slice(0,7)||'Unscheduled';acc[month]=(acc[month]||0)+1;return acc;},{})).map(([month,count])=>({month,count})) : [];
    const selectedAccount = (perfAccounts.data?.items || []).find((x:any)=>x._id===accountFilter);
    const pnlTotal=items.reduce((sum,x)=>sum+Number(x.realizedPnL?.$numberDecimal||x.realizedPnL||0),0);
    const setTab = (key: string) => { setActive(key); setPage(1); setSearch(''); setSelected(null); };
    const action = async (url: string, body: any, msg: string) => {
        // For an existing selected record, use its company even while viewing All Companies.
        // A new unlinked workflow must still explicitly select a company.
        const target = selected?.companyId || (company !== 'all' ? company : '');
        if (!target) {
            toast.error('Open a company record first, or select a company for this workflow');
            return;
        }
        setLoading(true);
        try {
            await http.post(url, body, {headers:{'x-company-id':String(target)}});
            void query.invalidateQueries();
            toast.success(msg);
            setSelected(null);
            setPay('');
            setReference('');
        }
        catch (e: any) {
            toast.error(e.message);
        }
        finally {
            setLoading(false);
        }
    };
    const capitalCurrencies = overview.capitalByCurrency || [];
    const capitalLabel = capitalCurrencies.length === 1 ? money(capitalCurrencies[0].total, capitalCurrencies[0]._id || 'INR') : capitalCurrencies.length ? 'Multiple currencies' : '—';
    const stats = domain === 'learning' ? [
        { label: 'Active students', value: overview.students ?? '—', icon: GraduationCap, tone: 'purple' },
        { label: 'Courses', value: overview.courses ?? '—', icon: BookOpen, tone: 'blue' },
        { label: 'Fee installments', value: overview.installments ?? '—', icon: CreditCard, tone: 'red' },
        { label: 'Internships', value: overview.internships ?? '—', icon: Wallet, tone: 'green' },
    ] : domain === 'advisory' ? [
        { label: 'Capital deployed', value: capitalLabel, icon: Banknote, tone: 'purple' },
        { label: 'Account reporting', value: overview.performances ?? '—', icon: Activity, tone: 'green' },
        { label: 'Reconciliation', value: overview.movements ?? '—', icon: BadgeCheck, tone: 'red' },
        { label: 'Remuneration', value: 'By account', icon: Users, tone: 'blue' },
    ] : domain === 'products' ? [
        { label: 'Catalog', value: overview.products ?? '—', icon: Package, tone: 'purple' },
        { label: 'Active subscriptions', value: 'See records', icon: BadgeCheck, tone: 'green' },
        { label: 'Upcoming renewals', value: overview.renewals ?? '—', icon: CreditCard, tone: 'blue' },
        { label: 'Billing', value: 'Finance linked', icon: FileText, tone: 'red' },
    ] : domain === 'projects' ? [
        { label: 'Active projects', value: overview.projects ?? '—', icon: BriefcaseBusiness, tone: 'purple' },
        { label: 'Milestones', value: overview.milestones ?? '—', icon: BadgeCheck, tone: 'green' },
        { label: 'Risk monitoring', value: overview.atRisk ?? '—', icon: AlertTriangle, tone: 'red' },
        { label: 'Project progress', value: 'See projects', icon: Activity, tone: 'blue' },
    ] : [
        { label: 'Receivables', value: overview.invoices ?? '—', icon: Banknote, tone: 'green' },
        { label: 'Payables', value: overview.expenses ?? '—', icon: CreditCard, tone: 'red' },
        { label: 'Transfer controls', value: overview.approvals ?? '—', icon: BadgeCheck, tone: 'purple' },
        { label: 'Journal entries', value: 'See journals', icon: FileText, tone: 'blue' },
    ];
    const modifiable=new Set(['students','courses','batches','internships','mentors','traders','tradingAccounts','vendors','products','subscriptions','projects','milestones','bankAccounts']);
    const changeState=async(active:boolean)=>{if(!selected)return;setStateBusy(true);try{await http.patch(`/records/${activeTabEntity()}/${selected._id}/state`,{isActive:active},{headers:{'x-company-id':String(selected.companyId)}});await query.invalidateQueries({queryKey:['records']});toast.success(active?'Reactivated':'Deactivated');setSelected(null);}catch(e:any){toast.error(e.message);}finally{setStateBusy(false);}};
    const archive=async()=>{if(!selected||!confirm(`Archive ${selected.title}?`))return;setStateBusy(true);try{await http.delete(`/records/${active}/${selected._id}`,{headers:{'x-company-id':String(selected.companyId)}});await query.invalidateQueries({queryKey:['records']});toast.success('Archived');setSelected(null);}catch(e:any){toast.error(e.message);}finally{setStateBusy(false);}};
    const voidUsdt=async()=>{
        if(!selected||active!=='usdtTransactions'||!confirm(`Void this ${selected.side} trade? It will remain visible in audit history. For buys with linked sales, void the sale first.`))return;
        setStateBusy(true);
        try { await http.post(`/records/usdt/${selected._id}/void`,{},{headers:{'x-company-id':String(selected.companyId)}});await query.invalidateQueries();toast.success('USDT transaction voided; inventory refreshed');setSelected(null); }
        catch(e:any){toast.error(e.message);}finally{setStateBusy(false);}
    };
    const activeTabEntity=()=>active;
    const canPost = (active === 'invoices' && ['sent', 'approved'].includes(selected?.status)) || (['expenses', 'transfers'].includes(active) && selected?.status === 'approved');
    const canEdit = !!selected && !['posted', 'paid'].includes(selected.status) && !['receipts', 'installments', 'dailyPerformance'].includes(active);
    const details = selected ? configs[active].columns.filter(c => c !== 'title') : [];
    return <><PageHead title={d.title} subtitle={d.desc} action={{ label: d.action, onClick: () => { setActive(tabKeys[0]); setCreate(true); } }}>{domain === 'advisory' && <button className="button secondary" onClick={() => setImportOpen(true)}><Upload size={16}/> Import statement</button>}</PageHead>
 <div className="stat-grid four">{stats.map(s => <Stat key={s.label} {...s}/>)}</div>
 <Panel className="domain-panel"><Tabs items={tabKeys.map(k => ({ key: k, label: configs[k].label }))} active={active} onChange={setTab}/>{active!=='renewals'&&<><Toolbar search={search} setSearch={setSearch} extra={<>{active==='usdtTransactions'&&selected?.status==='posted'&&<button className="button danger" disabled={stateBusy} onClick={()=>void voidUsdt()}>Void selected trade</button>}<ExportButton items={items} entity={active}/>{active === 'installments' && <button className="button primary" onClick={() => setScheduleOpen(true)}><Plus size={15}/> Schedule installment</button>}{creatable.has(active) && <button className="button primary" onClick={() => setCreate(true)}><Plus size={15}/> Add {configs[active].label.replace(/s$/, '')}</button>}</>}/>{q.isPending ? <Loader /> : q.error ? <ErrorState error={q.error}/> : <Table items={items} columns={active==='batches'?['title','seats','enrolled','remainingSeats','status']:(active==='projects'||active==='invoices') ? configs[active].columns.map(x=>x==='clientId'?'clientName':x==='projectId'?'projectName':x) : configs[active].columns} onSelect={setSelected}/>}<div className="table-foot">Showing {items.length} of {q.data?.total || 0} records <div className="pager"><button className="button secondary compact" disabled={page<=1} onClick={()=>setPage(x=>x-1)}>Previous</button><span>Page {page}</span><button className="button secondary compact" disabled={page * 50 >= (q.data?.total || 0)} onClick={()=>setPage(x=>x+1)}>Next</button></div></div></>}</Panel>
 {active==='renewals'&&<RenewalsPanel/>}
 {active==='dailyPerformance' && <Panel title="Trading performance" subtitle={accountFilter ? `Realized P&L: ${money(pnlTotal, selectedAccount?.currency || 'INR')}` : 'Choose one account to view currency-correct P&L'}><div className="filter-row"><select value={accountFilter} onChange={e=>setAccountFilter(e.target.value)}><option value="">All trading accounts</option>{(perfAccounts.data?.items||[]).map((a:any)=><option key={a._id} value={a._id}>{a.title}</option>)}</select><input type="date" aria-label="From date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}/><input type="date" aria-label="To date" value={dateTo} onChange={e=>setDateTo(e.target.value)}/></div><div className="chart-wrap">{accountFilter ? <ResponsiveContainer width="100%" height={260}><AreaChart data={performanceChart}><CartesianGrid strokeDasharray="4 4"/><XAxis dataKey="date"/><YAxis/><Tooltip/><Area type="monotone" dataKey="pnl" stroke="#5843d9" fill="#e9e5ff"/></AreaChart></ResponsiveContainer> : <p className="muted">Select an account to chart its daily P&L.</p>}</div></Panel>}
 {active==='usdtTransactions' && <Panel title="USDT inventory & trade performance" subtitle="Available units, open FIFO purchase lots and realized P&L across posted transactions.">
    {inventory.isPending?<Loader/>:inventory.error?<ErrorState error={inventory.error}/>:<div className="inventory-section">
      <div className="inventory-kpis"><div><span>Available USDT</span><strong>{Number(inventory.data.availableQuantity||0).toLocaleString('en-IN',{maximumFractionDigits:8})}</strong></div><div><span>Inventory cost (INR)</span><strong>{money(inventory.data.costBasisInr)}</strong></div><div><span>Average buy rate</span><strong>₹{Number(inventory.data.averageBuyRate||0).toFixed(4)}</strong></div><div><span>Realized profit / loss</span><strong className={Number(inventory.data.realizedPnlInr)<0?'negative':'positive'}>{money(inventory.data.realizedPnlInr)}</strong></div></div>
      <div className="inventory-caption">Open purchase lots • {inventory.data.lots.length} holding{inventory.data.lots.length===1?'':'s'} • Voided trades excluded</div>
      {inventory.data.lots.length?<div className="table-scroll"><table className="data-table"><thead><tr><th>Purchase date</th><th>Company</th><th>Available USDT</th><th>Buy rate (INR)</th><th>Cost basis (INR)</th><th>Reference</th></tr></thead><tbody>{inventory.data.lots.map((lot:any)=><tr key={lot.id}><td>{dateText(lot.tradeDate)}</td><td>{session.companies.find(c=>c._id===lot.companyId)?.name||lot.companyId}</td><td>{Number(lot.remainingQuantity||0).toLocaleString('en-IN',{maximumFractionDigits:8})}</td><td>{Number(lot.buyRateInr||0).toFixed(4)}</td><td>{money(Number(lot.remainingQuantity||0)*Number(lot.buyRateInr||0))}</td><td>{lot.reference||'—'}</td></tr>)}</tbody></table></div>:<div className="empty-inventory">No open USDT inventory. Record a Buy transaction to build inventory, or use the buy-and-sell form to record a completed deal.</div>}
    </div>}
    </Panel>}
 {active==='subscriptions' && <Panel title="Subscription renewals" subtitle="Upcoming renewals by month"><div className="chart-wrap"><ResponsiveContainer width="100%" height={220}><BarChart data={subscriptionChart}><XAxis dataKey="month"/><YAxis allowDecimals={false}/><Tooltip/><Bar dataKey="count" fill="#5947d9"/></BarChart></ResponsiveContainer></div><p className="muted">{items.filter(x=>x.renewAt && new Date(x.renewAt).getTime()<Date.now()+30*86400000).length} subscriptions are due within 30 days or overdue.</p></Panel>}
 {selected && <Drawer title={selected.title} onClose={() => setSelected(null)}><div className="record-detail"><Status value={selected.status}/><p className="muted">{selected.description || 'Record details and workflow actions'}</p><div className="detail-grid">{details.map(k => <label key={k}><span>{friendly(k)}</span><b>{['status', 'risk'].includes(k) ? <Status value={selected[k]}/> : currencies.includes(k) ? money(selected[k], selected.currency || 'INR') : /(At|Date)$/.test(k) ? dateText(selected[k]) : String(selected[k] ?? '—')}</b></label>)}</div>
 {active === 'invoices' && selected.status === 'draft' && selected.reviewerIds?.length>0 && <button className="button primary full" disabled={loading} onClick={()=>action(`/workflows/invoices/${selected._id}/request-review`,{},'Invoice sent for review')}>Request approval from reviewers</button>}
 {active === 'invoices' && ['posted', 'partial'].includes(selected.status) && <div className="workflow-box"><h3>Collect invoice receipt</h3><label>Amount<input type="number" min="0.01" step="0.01" value={pay} onChange={e => setPay(e.target.value)}/></label><label>Receipt reference<input value={reference} onChange={e => setReference(e.target.value)} placeholder="Payment reference"/></label><button className="button primary full" disabled={loading || !pay || !reference} onClick={() => action(`/workflows/invoices/${selected._id}/collect`, { amount: pay, reference }, 'Invoice receipt posted')}>Record receipt</button></div>}
 {active === 'capitalMovements' && selected.status === 'approved' && <button className="button primary full" disabled={loading} onClick={()=>action(`/workflows/advisory/capital/${selected._id}/settle`,{},'Trading account capital updated')}>Settle approved capital movement</button>}
 {active === 'installments' && selected.status !== 'paid' && <div className="workflow-box"><h3>Collect installment</h3><label>Payment amount<input type="number" min="0.01" step="0.01" value={pay} onChange={e => setPay(e.target.value)}/></label><label>Receipt reference<input value={reference} onChange={e => setReference(e.target.value)} placeholder="Bank transaction / receipt ID"/></label><button className="button primary full" disabled={loading || !pay || !reference} onClick={() => action(`/workflows/installments/${selected._id}/collect`, { amount: pay, reference }, 'Fee receipt recorded')}>Collect payment</button></div>}
 {canPost && <div className="workflow-box"><h3>Accounting controls</h3><p>Post balanced journal entries only after required approval.</p><button className="button primary full" disabled={loading} onClick={() => action(`/workflows/finance/post/${active}/${selected._id}`, {}, 'Financial journal posted')}>Post financial record</button></div>}
 {active==='projects' && <div className="workflow-box"><h3>Project milestone timeline</h3><div className="milestone-timeline">{(projectMilestones.data?.items||[]).map((m:any)=><div className="milestone-step" key={m._id}><span className={m.status==='completed'?'done':''}>●</span><div><strong>{m.title}</strong><p>{dateText(m.dueAt)} · {m.status}</p><p>{m.description||''}</p><div className="progress"><i style={{width:`${m.progress||0}%`}}/></div></div></div>)}{!projectMilestones.isPending && !projectMilestones.data?.items?.length && <p>No milestones yet. Create milestones from the Milestones tab.</p>}</div></div>}
 {active==='batches' && <div className="workflow-box"><h3>Students assigned to batch</h3><p>{(selected.studentNames||[]).join(', ') || 'No students enrolled yet'}</p><p>Seats remaining: {selected.remainingSeats ?? '—'}</p></div>}
 {active==='usdtTransactions' && <div className="workflow-box"><strong>{selected.side==='sell'?`Realized P&L: ${money(selected.realizedPnl)}`:`Purchase: ${Number(selected.quantity?.$numberDecimal||selected.quantity||0).toLocaleString()} USDT`}</strong><p className="muted">{selected.status==='voided'?'Voided: excluded from inventory and realized P&L.':selected.side==='buy'?`Units still held: ${selected.remainingQuantity?.$numberDecimal||selected.remainingQuantity||'0'} USDT`:'Sale accounted using FIFO purchase rates.'}</p>{selected.status==='posted'&&<button className="button danger full" disabled={stateBusy} onClick={()=>void voidUsdt()}>Void / delete transaction (audited)</button>}</div>}
 {active==='internships' && <div className="workflow-box">{['offerLetterFileId','certificateFileId'].map(k=>selected[k] && <p key={k}><a href={`/api/files/${selected[k]}`} target="_blank" rel="noopener noreferrer">Download {friendly(k)}</a></p>)}</div>}
 {active==='milestones' && selected.supportingFileId && <a className="button secondary full" href={`/api/files/${selected.supportingFileId}`} target="_blank" rel="noreferrer">Download milestone document</a>}
 {active==='proposals' && selected.documentFileId && <a href={`/api/files/${selected.documentFileId}`}>Download proposal document</a>}
 {active === 'invoices' && <p className="hint">Receipt allocation and payment gateway integrations require configured downstream workflows.</p>}
 {canEdit && <button className="button secondary full" onClick={() => setEdit(true)}>Edit record</button>}
 {modifiable.has(active) && <><button className="button secondary full" disabled={stateBusy} onClick={()=>void changeState(selected.isActive===false)}>{selected.isActive===false?'Reactivate record':'Deactivate record'}</button><button className="button danger full" disabled={stateBusy} onClick={()=>void archive()}>Archive / delete record</button></>}
 {['invoices','expenses','transfers','capitalMovements','usdtTransactions'].includes(active) && <p className="field-hint">Financial records cannot be deleted after creation. Use the authorized accounting reversal or correction workflow.</p>}
 </div></Drawer>}
 {edit && selected && <Drawer title={`Edit ${selected.title}`} onClose={() => setEdit(false)}><RecordForm entity={active} initial={selected} onClose={() => { setEdit(false); setSelected(null); }}/></Drawer>}
 {create && <Drawer title={`New ${configs[active].label}`} onClose={() => setCreate(false)}><RecordForm entity={active} onClose={() => setCreate(false)}/></Drawer>}
 {scheduleOpen && <Drawer title="Schedule student installment" onClose={() => setScheduleOpen(false)}><div className="record-form"><label>Student<select value={studentId} onChange={e => setStudentId(e.target.value)}><option value="">Select student</option>{(studentLookup.data?.items || []).map((s: any) => <option value={s._id} key={s._id}>{s.title}</option>)}</select></label><label>Installment title<input value={installmentTitle} onChange={e => setInstallmentTitle(e.target.value)}/></label><label>Amount<input type="number" step="0.01" value={pay} onChange={e => setPay(e.target.value)}/></label><label>Due date<input type="date" value={installmentDue} onChange={e => setInstallmentDue(e.target.value)}/></label><button className="button primary full" disabled={!studentId || !installmentTitle || !pay || !installmentDue || loading} onClick={async () => { await action('/workflows/installments/schedule', { studentId, title: installmentTitle, amount: pay, dueAt: installmentDue }, 'Installment scheduled'); setScheduleOpen(false); }}>Schedule installment</button></div></Drawer>}
 {importOpen && <Drawer title="Import daily performance CSV" onClose={() => setImportOpen(false)}><div className="record-form"><p className="muted">CSV format: <code>sourceKey,date,realizedPnL,unrealizedPnL,fees</code>. Imports are deduplicated by sourceKey and marked for reconciliation.</p><label>Trading account<select value={accountId} onChange={e => setAccountId(e.target.value)}><option value="">Select account</option>{(accountLookup.data?.items || []).map((a: any) => <option value={a._id} key={a._id}>{a.title} — {a.accountNumber}</option>)}</select></label><label>Select CSV file<input type="file" accept=".csv,text/csv" onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f)
                    setCsv(await f.text());
            }}/></label><textarea rows={8} placeholder="Or paste CSV data here" value={csv} onChange={e => setCsv(e.target.value)}/><button className="button primary full" disabled={loading || !csv || !accountId} onClick={() => action('/workflows/advisory/import-performance', { tradingAccountId: accountId, csv }, 'Statement import processed')}>Import and reconcile later</button></div></Drawer>}
 </>;
}
