import type * as React from 'react';
import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, ArrowDown, CalendarDays, CheckCircle2, ChevronRight, CirclePlus, FileText, Filter, Info, MoreHorizontal, Plus, Search, X } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWorkspace } from '../App';
import {useLocale} from '../i18n';
import { configs } from '../config';
import type { EntityConfig, Field } from '../config';
import { dateText, friendly, fetchRecords, http, money, saveRecord } from '../api';
const ToastContext = createContext<{
    success: (s: string) => void;
    error: (s: string) => void;
}>({ success: () => { }, error: () => { } });
export const useToast = () => useContext(ToastContext);
export function ToastProvider({ children }: {
    children: ReactNode;
}) {
    const [toast, setToast] = useState<{
        id: number;
        msg: string;
        type: string;
    } | null>(null);
    useEffect(() => {
        if (!toast)
            return;
        const t = setTimeout(() => setToast(null), 4500);
        return () => clearTimeout(t);
    }, [toast]);
    return <ToastContext.Provider value={{ success: msg => setToast({ id: Date.now(), msg, type: 'success' }), error: msg => setToast({ id: Date.now(), msg, type: 'error' }) }}>{children}{toast && <div className={`toast ${toast.type}`}>{toast.type === 'success' ? <CheckCircle2 size={17}/> : <AlertTriangle size={17}/>}<span>{toast.msg}</span><button className="icon-btn" onClick={() => setToast(null)}><X size={15}/></button></div>}</ToastContext.Provider>;
}
export function PageHead({ title, subtitle, action, children }: {
    title: string;
    subtitle?: string;
    action?: {
        label: string;
        onClick: () => void;
    };
    children?: ReactNode;
}) { const {t}=useLocale();return <div className="page-head"><div><h1>{t(title)}</h1>{subtitle && <p>{t(subtitle)}</p>}</div><div className="page-actions">{children}{action && <button className="button primary" onClick={action.onClick}><Plus size={16}/>{t(action.label)}</button>}</div></div>; }
export function Panel({ title, subtitle, children, aside, className = '' }: {
    title?: string;
    subtitle?: string;
    children: ReactNode;
    aside?: ReactNode;
    className?: string;
}) { const {t}=useLocale();return <section className={`panel ${className}`}>{(title || aside) && <div className="panel-head"><div>{title && <h3>{t(title)}</h3>}{subtitle && <p>{t(subtitle)}</p>}</div>{aside}</div>}{children}</section>; }
export function Stat({ label, value, icon: Icon, tone = 'purple', sub }: {
    label: string;
    value: string | number;
    icon?: any;
    tone?: string;
    sub?: string;
}) { const {t}=useLocale();return <div className={`stat-card tone-${tone}`}><div className="stat-icon">{Icon && <Icon size={22}/>}</div><div className="stat-body"><span>{t(label)}</span><strong>{value}</strong>{sub && <small>{sub}</small>}</div></div>; }
export function Status({ value }: {
    value: any;
}) { const {t}=useLocale();const v = String(value || '—'); const tone = ['paid', 'approved', 'completed', 'active', 'reconciled', 'won', 'ready', 'on-track'].includes(v) ? 'green' : ['pending', 'waiting', 'review', 'at-risk', 'partial', 'negotiation'].includes(v) ? 'amber' : ['overdue', 'blocked', 'rejected', 'lost', 'cancelled', 'archived'].includes(v) ? 'red' : 'blue'; return <span className={`status status-${tone}`}>{t(friendly(v))}</span>; }
export function Tabs({ items, active, onChange }: {
    items: {
        key: string;
        label: string;
        number?: number;
    }[];
    active: string;
    onChange: (s: string) => void;
}) {const {t}=useLocale();return <div className="tabs">{items.map(x => <button key={x.key} className={`tab ${active === x.key ? 'selected' : ''}`} onClick={() => onChange(x.key)}>{t(x.label)}{x.number !== undefined && <span className="tab-counter">{x.number}</span>}</button>)}</div>; }
export function Empty({ text = 'No records found', action }: {
    text?: string;
    action?: ReactNode;
}) {const {t}=useLocale();return <div className="empty"><div className="empty-icon"><FileText size={24}/></div><strong>{t(text)}</strong><p>{t('Try changing your filters or creating a new record.')}</p>{action}</div>; }
export function ErrorState({ error }: {
    error: any;
}) { return <div className="error-state"><AlertTriangle size={19}/>{error instanceof Error ? error.message : 'Could not load data'}</div>; }
export function Loader() { return <div className="skeleton-list" aria-label="Loading records" aria-live="polite">{[1,2,3,4].map(x => <div className="skeleton-row" key={x}><span/><span/><span/></div>)}</div>; }
export function Drawer({ title, onClose, children, width = '430px' }: {
    title: string;
    onClose: () => void;
    children: ReactNode;
    width?: string;
}) {
    const {t}=useLocale();
    useEffect(() => {
        const h = (e: KeyboardEvent) => {
            if (e.key === 'Escape')
                onClose();
        };
        document.addEventListener('keydown', h);
        return () => document.removeEventListener('keydown', h);
    }, [onClose]);
    return <><div className="drawer-backdrop" onClick={onClose}/><aside className="drawer" style={{ width, maxWidth: '100vw' }}><div className="drawer-head"><h2>{t(title)}</h2><button className="icon-btn" onClick={onClose}><X size={19}/></button></div><div className="drawer-content">{children}</div></aside></>;
}
export function RecordForm({ entity, initial, onClose, afterSave }: {
    entity: string;
    initial?: Record<string, any> | null;
    onClose: () => void;
    afterSave?: () => void;
}) {
    const {t}=useLocale();
    const config = configs[entity];
    const toast = useToast();
    const query = useQueryClient();
    const { company, session } = useWorkspace();
    // The global All Companies view remains unchanged while forms act within an
    // explicitly selected authorized company, including record editing.
    const domainForRecord: Record<string,string> = {
        tasks:'operations', events:'operations', students:'learning', courses:'learning', batches:'learning', installments:'learning', internships:'learning', mentors:'learning',
        tradingAccounts:'advisory', dailyPerformance:'advisory', capitalMovements:'advisory', usdtTransactions:'advisory', traders:'advisory',
        clients:'sales', leads:'sales', proposals:'sales', products:'products', subscriptions:'products',
        projects:'projects', milestones:'projects', invoices:'finance', expenses:'finance', transfers:'finance', receipts:'finance', bankAccounts:'finance', vendors:'finance'
    };
    const recordDomain = domainForRecord[entity] || entity;
    const writableCompanies = session.companies.filter(c => (session.companyModules?.[c._id] || c.enabledModules || []).includes(recordDomain) && (session.isSuperAdmin || session.roles[c._id] === 'owner' ||
        (session.permissions[c._id] || []).includes(`${recordDomain}:write`)));
    const [targetCompany, setTargetCompany] = useState(() => initial?.companyId ? String(initial.companyId) : company === 'all' ? '' : company);
    const scopedHeaders = { headers: {'x-company-id': targetCompany} };
    const [data, setData] = useState<Record<string, any>>(() => {
        const defaults: Record<string, any> = {};
        for (const f of config.fields) {
            const value = initial?.[f.name];
            defaults[f.name] = value?.$numberDecimal ?? value ?? (
                f.name === 'status' ? (entity === 'events' ? 'active' : f.options?.[0] || 'active') :
                f.name === 'side' ? 'buy' : f.name === 'accountKind' ? 'live' :
                f.name === 'phoneCountryCode' ? '+91' :
                f.name === 'tradeDate' && entity==='usdtTransactions' ? new Date().toISOString().slice(0,10) :
                f.name === 'startAt' && entity === 'subscriptions' ? new Date().toISOString().slice(0, 10) :
                f.name === 'assigneeIds' || f.name === 'reviewerIds' ? [] : ''
            );
        }
        return defaults;
    });
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [otherValues, setOtherValues] = useState<Record<string,string>>({});
    const inventory = useQuery({queryKey:['usdt-inventory',targetCompany],queryFn:async()=> (await http.get('/records/usdt/inventory',scopedHeaders)).data as {availableQuantity:string;costBasisInr:string;realizedPnlInr:string;lots:any[]},enabled:entity==='usdtTransactions' && !!targetCompany,staleTime:15000});
    const related: Record<string, string> = {
        mentorId:'mentors', traderId:'traders', vendorId:'vendors', destinationTradingAccountId:'tradingAccounts',
        courseId:'courses', batchId:'batches', studentId:'students', tradingAccountId:'tradingAccounts',
        clientId:'clients', productId:'products', leadId:'leads', projectId:'projects',
        sourceBankAccountId:'bankAccounts', targetBankAccountId:'bankAccounts'
    };
    const memberFields = new Set(['ownerId','reviewerId','reviewerIds','assigneeIds']);
    const needsMembers = config.fields.some(f => memberFields.has(f.name));
    const members = useQuery({
        queryKey:['members',targetCompany],
        queryFn:async()=>(await http.get('/admin/members',scopedHeaders)).data as any[],
        enabled:needsMembers && !!targetCompany, staleTime:120000
    });
    const relationNames = [...new Set(config.fields.filter(f=>related[f.name]).map(f=>related[f.name]))].sort();
    const lookups = useQuery({
        queryKey:['relation-lookups',relationNames.join(','),targetCompany],
        queryFn:async()=>Object.fromEntries(await Promise.all(relationNames.map(async name=>{
            const uri = name === 'clients' ? '/records/lookups/clients' : name === 'projects' ? '/records/lookups/projects' : name === 'bankAccounts' ? '/records/lookups/bank-accounts' : '';
            return [name, uri ? (await http.get(uri,scopedHeaders)).data.items : (await fetchRecords(name,{limit:200},targetCompany)).items];
        }))),
        enabled:relationNames.length>0 && !!targetCompany, staleTime:120000
    });
    const update = (name:string,value:any) => setData(prev=>{
        const next={...prev,[name]:value};
        const lookup=(kind:string)=>((lookups.data?.[kind]||[]) as any[]).find((x:any)=>String(x._id)===String(value));
        if(name==='clientId') {
            const client=lookup('clients');
            if(client && entity==='leads') { next.contact=client.contactPerson||'';next.contactEmail=client.email||''; }
            if(client && entity==='subscriptions') next.customer=client.title||'';
        }
        if(name==='projectId' && entity==='invoices') {
            const project=lookup('projects'); if(project)next.clientId=project.clientId||next.clientId;
        }
        if(name==='leadId' && entity==='proposals') {
            const lead=lookup('leads');
            if(lead){next.amount=lead.amount?.$numberDecimal||lead.amount||'';next.ownerId=lead.ownerId||'';
                next.proposalContent||=`Proposal: ${lead.title}\nScope:\nDeliverables:\nTimeline:\nCommercial terms:`;}
        }
        if(name==='productId' && entity==='subscriptions') {
            const prod=lookup('products');if(prod){next.amount=prod.price?.$numberDecimal||prod.price||'';next.currency=prod.currency||'INR';next.title ||= prod.title+' subscription';}
        }
        if(name==='sourceBankAccountId') {const account=lookup('bankAccounts');if(account)next.sourceAccount=account.title;}
        if(name==='targetBankAccountId') {const account=lookup('bankAccounts');if(account)next.targetAccount=account.title;}
        if(name==='side' && entity==='usdtTransactions'){next.title=`USDT ${value==='sell'?'Sell':'Buy'}`;next.sellRateInr='';}
        return next;
    });
    const upload = async(field:string,file:File)=>{
        const form=new FormData();form.append('file',file);form.append('purpose',field);
        setUploading(true);
        try{if (!targetCompany) throw new Error('Select a company before uploading');const result=(await http.post('/files',form,scopedHeaders)).data;update(field,result._id);toast.success('Document uploaded');}
        catch(err:any){toast.error(err.message);}finally{setUploading(false);}
    };
    const submit=async(e:React.FormEvent)=>{
        e.preventDefault();
        if(!targetCompany || !writableCompanies.some(c=>c._id===targetCompany))return toast.error('Select an authorized company in the form first');
        setSaving(true);
        try{
            const body:Record<string,any>={};
            for(const field of config.fields){
                const name=field.name;let value=data[name];
                if(field.type==='file' && !value)continue;
                if(name==='sku' && !value)continue;
                if(name==='otherKind' && data.accountKind!=='other')continue;
                if(name==='targetBankAccountId' && !value)continue;
                if(name==='destinationTradingAccountId' && data.direction!=='transfer')continue;
                if(value==='Other') {if(!otherValues[name]?.trim())throw new Error(`Specify ${field.label||friendly(name)}`);value=otherValues[name].trim();}
                if(value===''||value===null||value===undefined)continue;
                if(field.type==='date'||field.type==='datetime-local') value=new Date(value).toISOString();
                body[name]=value;
            }
            if(entity==='usdtTransactions'){
                body.title=`USDT ${data.side==='sell'?'Sell':'Buy'}`;
                if(data.side==='sell'){
                    const available=Number(inventory.data?.availableQuantity||0);
                    if(inventory.isPending)throw new Error('USDT inventory is still loading');
                    if(Number(data.quantity||0)>available)throw new Error(`Insufficient purchased USDT inventory. Available: ${available.toLocaleString()} USDT. Buy first or reduce the sale quantity.`);
                }
                if(data.side!=='buy')delete body.sellRateInr;
            }
            if(entity==='tradingAccounts' && !body.title)body.title=`${data.accountKind||'live'} account ${data.accountNumber||''}`.trim();
            if(entity==='transfers' && body.targetCompanyId===targetCompany)throw new Error('Destination company must differ');
            if(!body.title && !initial?.title)throw new Error('Title is required');
            if(entity==='subscriptions' && body.startAt && body.durationMonths && !body.renewAt){
                const d=new Date(body.startAt);const month=d.getUTCMonth()+Number(body.durationMonths);const maxDay=new Date(Date.UTC(d.getUTCFullYear(),month+1,0)).getUTCDate();d.setUTCDate(1);d.setUTCFullYear(d.getUTCFullYear(),month,Math.min(new Date(body.startAt).getUTCDate(),maxDay));body.renewAt=d.toISOString();
            }
            if(entity==='events' && body.startAt && body.endAt && new Date(body.endAt)<=new Date(body.startAt))throw new Error('Event end must follow start');
            if(entity==='expenses'||entity==='transfers'||entity==='capitalMovements')delete body.status;
            if(entity==='invoices' && body.reviewerIds?.length)body.reviewerId=body.reviewerIds[0];
            const saved=await saveRecord(entity,body,initial?._id,targetCompany);
            query.setQueriesData<any>({queryKey:['records',entity,company]},(old:any)=>old?.items?{...old,items:initial?old.items.map((x:any)=>x._id===initial._id?saved:x):[saved,...old.items].slice(0,old.limit||50),total:initial?old.total:old.total+1}:old);
            void query.invalidateQueries();
            toast.success(initial?'Record updated':'Record created');onClose();afterSave?.();
        }catch(err:any){toast.error(err.message);}finally{setSaving(false);}
    };
    const selectors=(f:Field)=>{
        let opts:{value:string,label:string}[]=[];
        if(memberFields.has(f.name))opts=(members.data||[]).map((u:any)=>({value:u._id,label:`${u.name} (${u.email})`}));
        else if(f.name==='targetCompanyId')opts=session.companies.filter(c=>c._id!==targetCompany).map(c=>({value:c._id,label:c.name}));
        else if(related[f.name])opts=(lookups.data?.[related[f.name]]||[]).filter((v:any)=>{
            if(f.name==='targetBankAccountId')return v.companyId===data.targetCompanyId;
            if(f.name==='sourceBankAccountId')return v.companyId===targetCompany;
            if(f.name==='projectId'&&entity==='invoices'&&data.clientId)return !v.clientId || String(v.clientId)===String(data.clientId);
            return v.isActive!==false;
        }).map((v:any)=>({value:v._id,label: v.companyName && f.name==='projectId' ? `${v.title} · ${v.companyName}${!v.clientId?' (client unlinked)':''}` : v.title}));
        else opts=(f.options||[]).map(o=>({value:o,label:friendly(o)}));
        return opts;
    };
    const hidden=(f:Field)=>
        (f.name==='otherKind' && data.accountKind!=='other') ||
        (f.name==='sellRateInr' && (entity!=='usdtTransactions' || data.side!=='buy')) ||
        (f.name==='destinationTradingAccountId'&&data.direction!=='transfer') ||
        (f.name==='targetBankAccountId'&&entity==='transfers'&&!data.targetCompanyId);
    return <form className="record-form enhanced-form" onSubmit={submit}>
        {(company==='all'||!!initial?.companyId)&&<div className="company-form-select"><label>Company (required)
            <select value={targetCompany} disabled={!!initial?._id} onChange={e=>{setTargetCompany(e.target.value);setData(p=>({...p,ownerId:'',reviewerId:'',reviewerIds:[],assigneeIds:[],clientId:'',projectId:''}));}} required><option value="">Select an authorized company</option>{writableCompanies.map(c=><option key={c._id} value={c._id}>{c.name}</option>)}</select>
            </label><p className="muted tiny">This action is scoped to the chosen company. Your All Companies dashboard selection will not change.</p></div>}
        {entity==='usdtTransactions'&&!!targetCompany&&<div className="usdt-form-inventory" role="status"><span>Available inventory</span><strong>{inventory.isPending?'Loading…':`${Number(inventory.data?.availableQuantity||0).toLocaleString('en-IN',{maximumFractionDigits:8})} USDT`}</strong><small>{data.side==='sell'?'Sales consume already purchased USDT using FIFO.':'Enter a sell price below to complete the buy and sell in one step, or leave blank to hold inventory.'}</small></div>}
        {config.fields.filter(f=>!hidden(f)).map(f=>{
            const opts=selectors(f);
            const val=data[f.name]??'';
            const multi=f.name==='reviewerIds'||f.name==='assigneeIds';
            return <div className="form-field" key={f.name}>
                <label className="field-caption" htmlFor={`field-${f.name}`}>{t(f.label||friendly(f.name))}</label>
                {multi ? <div className="member-picker" role="group" aria-label={f.label||friendly(f.name)}>
                    <p className="muted tiny">{f.name==='reviewerIds'?'Any one selected reviewer can approve':'Select one or more assignees'}</p>
                    <div className="member-picker-list">{opts.map(m=><label className="member-option" key={m.value}><input type="checkbox" checked={(Array.isArray(val)?val:[]).some((id:string)=>String(id)===m.value)} onChange={e=>update(f.name,e.target.checked?[...(Array.isArray(val)?val:[]),m.value]:(Array.isArray(val)?val:[]).filter((id:string)=>String(id)!==m.value))}/><span>{m.label}</span></label>)}
                    {!opts.length&&<span className="muted">No active team members for this company</span>}</div>
                </div> : f.type==='file' ? <div className="file-field"><input id={`field-${f.name}`} type="file" accept=".pdf,.docx,.png,.jpg,.jpeg" onChange={e=>{const file=e.target.files?.[0];if(file)void upload(f.name,file);}}/>{val&&<span className="field-success">Document uploaded • {String(val).slice(-6)}</span>}</div>
                : f.type==='textarea' ? <textarea id={`field-${f.name}`} rows={4} value={String(val)} onChange={e=>update(f.name,e.target.value)}/>
                : f.type==='select' ? <><select id={`field-${f.name}`} value={String(val)} onChange={e=>update(f.name,e.target.value)}><option value="">{f.name==='projectId'?'Choose a project (from accessible companies)':`Select ${f.label||friendly(f.name)}`}</option>{opts.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>
                    {val==='Other'&&<input className="other-input" placeholder={`Specify ${f.label||friendly(f.name)}`} value={otherValues[f.name]||''} onChange={e=>setOtherValues(x=>({...x,[f.name]:e.target.value}))}/>}</>
                : <input id={`field-${f.name}`} type={f.type||'text'} value={String(val).slice(0,f.type==='date'?10:f.type==='datetime-local'?16:undefined)} onChange={e=>update(f.name,e.target.value)} min={f.type==='number'?'0':undefined} step={f.type==='number'?(f.name==='quantity'?'0.00000001':['rateInr','sellRateInr'].includes(f.name)?'0.0001':'0.01'):undefined} placeholder={f.name==='sku'?'Automatically generated when saved':undefined} required={!!f.required||f.name==='title'&&entity!=='usdtTransactions'&&entity!=='tradingAccounts'}/>}
                {entity==='invoices' && f.name==='number' && <p className="field-hint">Invoice number identifies the invoice; amount is its financial value.</p>}
                {entity==='usdtTransactions'&&f.name==='quantity'&&<p className="field-hint">{data.side==='sell'?'Choose a quantity within your available inventory.':'Your quantity is added to inventory unless you also enter the sell price.'}</p>}
                {entity==='usdtTransactions'&&f.name==='sellRateInr'&&<p className="field-hint">Optional: fill this to record the purchase and its completed sale together, including exact realized P&L.</p>}
                {entity==='invoices'&&f.name==='projectId'&&lookups.isSuccess&&!(lookups.data?.projects||[]).length&&<p className="field-hint">No accessible projects yet. Create a project in Projects, or select a company with linked projects.</p>}
            </div>;
        })}
        {entity==='usdtTransactions'&&<div className="calculated-preview">
            <strong>{data.side==='sell'?'Estimated sale proceeds':'Estimated purchase cost'}: {money(Number(data.quantity||0)*Number(data.rateInr||0))}</strong>
            {data.side==='buy'&&Number(data.sellRateInr)>0&&<><span>Sell proceeds: {money(Number(data.quantity||0)*Number(data.sellRateInr||0))}</span><strong>Estimated profit / loss: {money(Number(data.quantity||0)*(Number(data.sellRateInr)-Number(data.rateInr||0)))}</strong></>}
            <small>{data.side==='sell'?'Exact realized profit uses FIFO buy rates and is calculated by the backend.':'If a sell price is provided, the backend saves a linked buy and sell atomically. Figures above are estimates.'}</small>
        </div>}
        <div className="form-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={saving||uploading||!targetCompany||!writableCompanies.some(c=>c._id===targetCompany)||(needsMembers&&members.isPending)||(relationNames.length>0&&lookups.isPending)||(entity==='usdtTransactions'&&data.side==='sell'&&inventory.isPending)}>{saving?'Saving…':uploading?'Uploading…':initial?'Save changes':'Create record'}</button></div>
    </form>;
}

export const clickableFields = new Set(['title', 'status']);
export function Table({ items, columns, onSelect, emptyText }: {
    items: any[];
    columns: string[];
    onSelect?: (x: any) => void;
    emptyText?: string;
}) {
    const {t}=useLocale();
    if (!items.length)
        return <Empty text={emptyText}/>;
    const render = (k: string, val: any, item: any) => {
        if (k === 'title')
            return <span className="table-title">{item.title}</span>;
        if (k === 'status' || k === 'risk' || k === 'stage' || k === 'priority')
            return <Status value={val}/>;
        if (k === 'progress')
            return <div className="progress-cell"><div className="progress"><i style={{ width: `${Math.min(100, Number(val || 0))}%` }}/></div><span>{val || 0}%</span></div>;
        if (['amount', 'totalFees', 'outstanding', 'fee', 'price', 'budget', 'stipend', 'capital', 'realizedPnL', 'unrealizedPnL', 'paidAmount', 'totalInr', 'realizedPnl', 'rateInr'].includes(k))
            return money(val, item.currency || 'INR');
        if (/At$|^dueAt$|^createdAt$|^updatedAt$/.test(k))
            return dateText(val);
        if (k === 'reconciled')
            return val ? 'Yes' : 'No';
        if (val && typeof val === 'object' && '$numberDecimal' in val)
            return String(val.$numberDecimal);
        return String(val ?? '—');
    };
    return <div className="table-scroll"><table className="data-table"><thead><tr>{columns.map(c => <th key={c}>{t(friendly(c))}</th>)}{onSelect && <th className="thin-col"></th>}</tr></thead><tbody>{items.map(item => <tr key={item._id} onClick={() => onSelect?.(item)} className={onSelect ? 'clickable' : ''}>{columns.map(c => <td key={c}>{render(c, item[c], item)}</td>)}{onSelect && <td><ChevronRight size={16} color="#95A0B4"/></td>}</tr>)}</tbody></table></div>;
}
export function Toolbar({ search, setSearch, extra }: {
    search: string;
    setSearch: (s: string) => void;
    extra?: ReactNode;
}) {const {t}=useLocale();return <div className="toolbar"><div className="searchbox"><Search size={16}/><input aria-label={t("Search records")} placeholder={t("Search records...")} value={search} onChange={e => setSearch(e.target.value)}/></div>{extra}</div>; }
