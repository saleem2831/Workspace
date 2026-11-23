import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowDownUp, BellRing, CalendarClock, CalendarDays, CheckCircle2, ChevronDown, Plus, Search, X } from 'lucide-react';
import { useWorkspace } from '../App';
import { API_BASE_URL, dateText, http, money } from '../api';
import { Drawer, ErrorState, Loader, Panel, Status, useToast } from '../components/UI';
import { due8To30Count, filterRenewals } from './renewalFilters';
import type { RenewalMetric, RenewalSort, RenewalStatusFilter } from './renewalFilters';

type Renewal = {
  createdAt?:string;_id:string;companyId:string;title:string;description?:string;category:string;vendorName?:string;
  amount:any;currency:string;nextDueAt:string;frequency:string;customMonths?:number;
  reminderDays:number[];assigneeId?:string;status:'active'|'paused'|'cancelled';
  currentExpenseId?:string;linkedExpenseStatus?:string|null;daysUntil:number|null;alert:string;
};
type FormValues={title:string;description:string;category:string;vendorId:string;vendorName:string;amount:string;
 currency:string;nextDueAt:string;frequency:string;customMonths:string;reminderDays:string;assigneeId:string};
const today=()=>{const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);};
const initial:FormValues={title:'',description:'',category:'SaaS',vendorId:'',vendorName:'',amount:'',currency:'INR',
  nextDueAt:today(),frequency:'yearly',customMonths:'',reminderDays:'30,15,7,3,1',assigneeId:''};
const categories=['Hosting','Domain','SaaS','License','Insurance','Rent','AMC','Other'];
const frequencies=['monthly','quarterly','half-yearly','yearly','custom'];
const currencies=['INR','AED','SAR','USD'];
const headers=(id:string)=>({headers:{'x-company-id':id}});
function dateValue(value:unknown){return String(value||'').slice(0,10);}
function alarm(x:Renewal){if(x.status!=='active')return x.status;return x.alert==='overdue'?'Overdue':x.daysUntil===0?'Due today':x.alert==='due-soon'?`Due in ${x.daysUntil} days`:'Upcoming';}
export default function RenewalsPanel(){
 const {company,session}=useWorkspace();const toast=useToast();const query=useQueryClient();
 const [search,setSearch]=useState('');const [status,setStatus]=useState<RenewalStatusFilter>('all');
 const [frequencyFilter,setFrequencyFilter]=useState('all');const [sort,setSort]=useState<RenewalSort>('due-asc');
 const [metricFilter,setMetricFilter]=useState<RenewalMetric>('all');const [selected,setSelected]=useState<Renewal|null>(null);
 const [editing,setEditing]=useState<Renewal|null>(null);const [formOpen,setFormOpen]=useState(false);
 const [form,setForm]=useState<FormValues>(initial);const [targetCompany,setTargetCompany]=useState(company==='all'?'':company);
 const [busy,setBusy]=useState(false);const [reference,setReference]=useState('');const [proofFile,setProofFile]=useState<File|null>(null);
 const [approvers,setApprovers]=useState<string[]>([]);const [historyOpen,setHistoryOpen]=useState(false);
 // A changed company must never leave the previous company's detail drawer open.
 useEffect(()=>{setSelected(null);setEditing(null);setFormOpen(false);setHistoryOpen(false);},[company]);
 const writable=session.companies.filter(c=>(session.companyModules?.[c._id]||c.enabledModules||[]).includes('finance')&&
   (session.isSuperAdmin||session.roles[c._id]==='owner'||(session.permissions[c._id]||[]).includes('finance:write')));
 const read=useQuery({queryKey:['finance-renewals',company],queryFn:async()=>
    (await http.get('/finance/renewals',company==='all'?undefined:{params:{companyId:company}})).data as {items:Renewal[];summary:{active:number;due7:number;due30:number;overdue:number;alerts:number};total:number;truncated:boolean},refetchInterval:60000});
 const current=read.data?.items.find(x=>x._id===selected?._id)||selected;
 const target=editing?.companyId||targetCompany;
 const members=useQuery({queryKey:['renewal-members',target],queryFn:async()=>
    (await http.get('/admin/members',headers(target))).data as { _id:string;name:string;email:string;role:string;permissions:string[] }[],enabled:!!target&&(formOpen||!!current)});
 const vendors=useQuery({queryKey:['renewal-vendors',target],queryFn:async()=>
    (await http.get('/records/vendors',headers(target))).data as {items:{_id:string;title:string}[]},enabled:!!target&&formOpen});
 const history=useQuery({queryKey:['finance-renewal-history',current?._id,current?.companyId],queryFn:async()=>
    (await http.get(`/finance/renewals/${current?._id}/history`,headers(current!.companyId))).data as {items:any[]},enabled:!!current&&historyOpen});
 const filtered=useMemo(()=>filterRenewals(read.data?.items||[],{
   search,status,frequency:frequencyFilter,metric:metricFilter,sort
 }),[read.data,search,status,frequencyFilter,metricFilter,sort]);
 const clearFilters=()=>{setSearch('');setStatus('all');setFrequencyFilter('all');setMetricFilter('all');setSort('due-asc');};
 const hasFilters=!!search.trim()||status!=='all'||frequencyFilter!=='all'||metricFilter!=='all'||sort!=='due-asc';
 const chooseMetric=(metric:RenewalMetric)=>{setMetricFilter(current=>current===metric?'all':metric);setStatus('all');};
 const summary=read.data?.summary;
 const metrics=[
   {key:'active' as const,label:'Active renewals',value:summary?.active,icon:CalendarClock,tone:'purple',description:'All active commitments'},
   {key:'due7' as const,label:'Due in 7 days',value:summary?.due7,icon:BellRing,tone:'blue',description:'Includes today'},
   {key:'due8to30' as const,label:'Due in 8–30 days',value:summary?due8To30Count(summary):undefined,icon:CalendarDays,tone:'green',description:'Excludes the first 7 days'},
   {key:'overdue' as const,label:'Overdue',value:summary?.overdue,icon:AlertTriangle,tone:'red',description:'Past due date'},
 ];
 const mutate=async(action:()=>Promise<unknown>,message:string)=>{
   setBusy(true);try{await action();await query.invalidateQueries({queryKey:['finance-renewals']});await query.invalidateQueries({queryKey:['notification-count']});
   await query.invalidateQueries({queryKey:['records']});toast.success(message);setFormOpen(false);setEditing(null);setHistoryOpen(false);setProofFile(null);
   }catch(e:any){toast.error(e.message||'Could not save renewal');}finally{setBusy(false);}
 };
 const openNew=()=>{setEditing(null);setTargetCompany(company==='all'?'':company);setForm({...initial,nextDueAt:today()});setFormOpen(true);};
 const openEdit=(r:Renewal)=>{setEditing(r);setSelected(null);setTargetCompany(r.companyId);setForm({title:r.title,description:r.description||'',category:r.category,
   vendorId:'',vendorName:r.vendorName||'',amount:String(r.amount?.$numberDecimal||r.amount||''),currency:r.currency,
   nextDueAt:dateValue(r.nextDueAt),frequency:r.frequency,customMonths:String(r.customMonths||''),reminderDays:(r.reminderDays||[]).join(','),assigneeId:r.assigneeId||''});setFormOpen(true);};
 const submit=async(e:React.FormEvent)=>{e.preventDefault();if(!target||!writable.some(c=>c._id===target))return toast.error('Choose an authorized company');
   const reminderDays=form.reminderDays.split(',').map(s=>Number(s.trim()));
   if(reminderDays.some(n=>!Number.isInteger(n)||n<0||n>365)||new Set(reminderDays).size!==reminderDays.length)return toast.error('Use distinct reminder days from 0 to 365');
   const body:any={...form,reminderDays,amount:form.amount,customMonths:form.frequency==='custom'?Number(form.customMonths):undefined,
     vendorId:form.vendorId||null,assigneeId:form.assigneeId||null};
   if(editing){delete body.vendorId; /* Keep the existing vendor reference while editing display name. */}
   await mutate(()=>editing?http.patch(`/finance/renewals/${editing._id}`,body,headers(target)):
     http.post('/finance/renewals',body,headers(target)),editing?'Renewal updated':'Renewal scheduled');
 };
 const requestExpense=async()=>{if(!current)return;
   if(!approvers.length)return toast.error('Select at least one approver');
   await mutate(()=>http.post(`/finance/renewals/${current._id}/request-expense`,{reviewerIds:approvers},headers(current.companyId)),
     'Expense requested. Approve it in Approvals and post it in Finance before completing renewal.');
 };
 const complete=async()=>{if(!current||!reference.trim())return;
   await mutate(async()=>{
      let proofFileId:string|undefined;
      if(proofFile){const data=new FormData();data.append('file',proofFile);data.append('purpose','renewal-proof');
          const uploaded=await http.post('/files',data,headers(current.companyId));proofFileId=uploaded.data._id;}
      await http.post(`/finance/renewals/${current._id}/complete`,{reference, ...(proofFileId?{proofFileId}:{})},headers(current.companyId));
      setReference('');
   },'Renewal settled, payment journal posted and next due date scheduled');
 };
 const changeStatus=async(next:'active'|'paused'|'cancelled')=>{if(!current)return;
   if(next==='cancelled'&&!confirm(`Cancel ${current.title}? Previous payments remain recorded.`))return;
   await mutate(()=>http.post(`/finance/renewals/${current._id}/status`,{status:next},headers(current.companyId)),`Renewal ${next}`);
   setSelected(null);
 };
 const pending=(r:Renewal)=>r.currentExpenseId?`Expense: ${r.linkedExpenseStatus||'linked'}`:'Expense not requested';
 return <>
   <Panel className="renewals-panel" title="Renewals & recurring payments" subtitle="Vendor commitments, due-date alerts and approval-controlled settlement. Customer subscriptions stay in Products."
     aside={writable.length>0?<button className="button primary" onClick={openNew}><Plus size={15}/> Add renewal</button>:undefined}>
     <div className="renewal-kpis" role="group" aria-label="Filter by renewal due date">
       {metrics.map(metric=><button key={metric.key} type="button" className={`renewal-kpi renewal-kpi--${metric.tone}${metricFilter===metric.key?' is-selected':''}`}
         aria-pressed={metricFilter===metric.key} aria-label={`${metric.label}: ${metric.value??'Loading'}. ${metric.description}. Select to filter.`}
         onClick={()=>chooseMetric(metric.key)}>
         <span className="renewal-kpi-icon"><metric.icon size={20} strokeWidth={2.1}/></span>
         <span className="renewal-kpi-detail"><span className="renewal-kpi-label">{metric.label}</span><strong className="renewal-kpi-value">{metric.value??'—'}</strong></span>
       </button>)}
     </div>
     <div className="renewal-register-head">
       <div><h4>Renewal register</h4><p>{read.data?`Showing ${filtered.length} of ${read.data.total} renewals`:'Loading renewals…'}</p></div>
       {hasFilters&&<button type="button" className="renewal-clear-all" onClick={clearFilters}>Clear all filters</button>}
     </div>
     <div className="renewal-toolbar" role="search" aria-label="Find and filter renewals">
       <label className="renewal-search"><Search size={18} aria-hidden="true"/><span className="sr-only">Search renewals</span>
         <input type="search" placeholder="Search by service, vendor or category…" aria-label="Search by service, vendor or category" value={search} onChange={e=>setSearch(e.target.value)}/>
         {search&&<button type="button" className="renewal-input-clear" onClick={()=>setSearch('')} aria-label="Clear search"><X size={15}/></button>}
       </label>
       <div className="renewal-filters">
         <label className="renewal-select-wrap"><span className="sr-only">Filter renewal status</span>
           <select value={status} aria-label="Filter renewal status" onChange={e=>{setStatus(e.target.value as RenewalStatusFilter);setMetricFilter('all');}}>
             <option value="all">All statuses</option><option value="active">Active</option><option value="due-soon">Due soon</option><option value="overdue">Overdue</option><option value="paused">Paused</option><option value="cancelled">Cancelled</option>
           </select><ChevronDown size={15} aria-hidden="true"/></label>
         <label className="renewal-select-wrap"><span className="sr-only">Filter renewal frequency</span>
           <select value={frequencyFilter} aria-label="Filter renewal frequency" onChange={e=>setFrequencyFilter(e.target.value)}>
             <option value="all">All frequencies</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="half-yearly">Half-yearly</option><option value="yearly">Yearly</option><option value="custom">Custom</option>
           </select><ChevronDown size={15} aria-hidden="true"/></label>
         <label className="renewal-select-wrap renewal-sort"><ArrowDownUp size={15} aria-hidden="true"/><span className="sr-only">Sort renewals</span>
           <select value={sort} aria-label="Sort renewals" onChange={e=>setSort(e.target.value as RenewalSort)}>
             <option value="due-asc">Next due date</option><option value="due-desc">Latest due date</option><option value="amount-desc">Highest amount</option><option value="amount-asc">Lowest amount</option><option value="name">Service name</option><option value="newest">Recently created</option>
           </select><ChevronDown size={15} aria-hidden="true"/></label>
       </div>
     </div>
     {hasFilters&&<div className="renewal-filter-chips" aria-label="Applied filters">
       {metricFilter!=='all'&&<button type="button" onClick={()=>setMetricFilter('all')}>{metrics.find(m=>m.key===metricFilter)?.label}<X size={13}/></button>}
       {status!=='all'&&<button type="button" onClick={()=>setStatus('all')}>Status: {status==='due-soon'?'Due soon':status}<X size={13}/></button>}
       {frequencyFilter!=='all'&&<button type="button" onClick={()=>setFrequencyFilter('all')}>Frequency: {frequencyFilter}<X size={13}/></button>}
       {search.trim()&&<button type="button" onClick={()=>setSearch('')}>Search: {search.trim()}<X size={13}/></button>}
       {sort!=='due-asc'&&<button type="button" onClick={()=>setSort('due-asc')}>Custom sort<X size={13}/></button>}
     </div>}
     {read.isPending?<Loader/>:read.error?<ErrorState error={read.error}/>:filtered.length?<div className="table-scroll renewal-table-wrap"><table className="data-table"><thead><tr><th>Renewal / company</th><th>Category</th><th>Next due</th><th>Amount</th><th>Reminder</th><th>Accounting</th></tr></thead><tbody>{filtered.map(r=><tr key={r._id} onClick={()=>{setSelected(r);setApprovers([]);setHistoryOpen(false);setReference('');}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSelected(r);setApprovers([]);setHistoryOpen(false);setReference('');}}} tabIndex={0} aria-label={`Open renewal ${r.title}`} className="renewal-row">
       <td><strong>{r.title}</strong><div className="muted tiny">{session.companies.find(c=>c._id===r.companyId)?.name||'Company'}{r.vendorName?` · ${r.vendorName}`:''}</div></td><td>{r.category}</td><td>{dateText(r.nextDueAt)}<div className="muted tiny">{r.frequency}</div></td><td>{money(r.amount,r.currency)}</td>
       <td><span className={`status status-${r.alert==='overdue'?'red':r.alert==='due-soon'?'amber':'blue'}`}>{alarm(r)}</span></td><td>{pending(r)}</td></tr>)}</tbody></table></div>:
       <div className="renewal-empty" role="status"><span className="renewal-empty-icon"><CalendarDays size={26}/></span>
         <h4>{hasFilters?'No matching renewals':'No renewals scheduled yet'}</h4>
         <p>{hasFilters?'Try a different search, status or frequency to see more records.':'Create a renewal to track upcoming expenses and payment reminders.'}</p>
         {hasFilters?<button type="button" className="button secondary" onClick={clearFilters}>Clear filters</button>:
           writable.length>0?<button type="button" className="button primary" onClick={openNew}><Plus size={15}/> Create first renewal</button>:null}
       </div>}
     {read.data?.truncated&&<p className="muted tiny">Showing the first 500 results. Select one company to narrow your list.</p>}
     <p className="muted tiny">Alerts update when the application loads and every 60 seconds while open. Payments require an approved, posted expense; no automatic bank charge is initiated.</p>
   </Panel>
   {formOpen&&<Drawer title={editing?'Edit renewal':'New recurring renewal'} onClose={()=>setFormOpen(false)} width="500px"><form className="record-form" onSubmit={submit}>
     <label>Company<select required disabled={!!editing} value={target} onChange={e=>setTargetCompany(e.target.value)}><option value="">Select company</option>{writable.map(c=><option value={c._id} key={c._id}>{c.name}</option>)}</select></label>
     <label>Service / renewal name<input required maxLength={160} value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="e.g. Render hosting"/></label>
     <label>Category<select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{categories.map(c=><option key={c}>{c}</option>)}</select></label>
     <label>Vendor (optional)<select disabled={!!editing} value={form.vendorId} onChange={e=>setForm({...form,vendorId:e.target.value})}><option value="">No linked vendor</option>{vendors.data?.items.map(v=><option key={v._id} value={v._id}>{v.title}</option>)}</select></label>
     <label>Vendor / provider name<input maxLength={140} value={form.vendorName} onChange={e=>setForm({...form,vendorName:e.target.value})}/></label>
     <div className="renewal-form-grid"><label>Amount<input required type="number" min="0.01" step="0.01" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})}/></label>
       <label>Currency<select value={form.currency} onChange={e=>setForm({...form,currency:e.target.value})}>{currencies.map(c=><option key={c}>{c}</option>)}</select></label></div>
     <label>Next renewal date<input required type="date" value={form.nextDueAt} onChange={e=>setForm({...form,nextDueAt:e.target.value})}/></label>
     <div className="renewal-form-grid"><label>Frequency<select value={form.frequency} onChange={e=>setForm({...form,frequency:e.target.value})}>{frequencies.map(x=><option value={x} key={x}>{x.replaceAll('-',' ')}</option>)}</select></label>
       {form.frequency==='custom'&&<label>Every N months<input type="number" required min="1" max="120" value={form.customMonths} onChange={e=>setForm({...form,customMonths:e.target.value})}/></label>}</div>
     <label>Reminder days before due (comma-separated)<input value={form.reminderDays} onChange={e=>setForm({...form,reminderDays:e.target.value})} placeholder="30,15,7,3,1"/></label>
     <label>Responsible team member<select value={form.assigneeId} onChange={e=>setForm({...form,assigneeId:e.target.value})}><option value="">Unassigned (all Finance users can see)</option>{members.data?.map(m=><option key={m._id} value={m._id}>{m.name}</option>)}</select></label>
     <label>Notes<textarea rows={3} maxLength={1500} value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label>
     <button type="submit" className="button primary full" disabled={!target||busy}>{busy?'Saving…':editing?'Save changes':'Create renewal'}</button>
   </form></Drawer>}
   {current&&<Drawer title={current.title} onClose={()=>{setSelected(null);setHistoryOpen(false);}} width="485px"><div className="record-detail">
     <Status value={current.status}/><p>{current.description||'Recurring vendor or contract expense.'}</p>
     <div className="detail-grid"><label><span>Company</span><b>{session.companies.find(c=>c._id===current.companyId)?.name||'—'}</b></label><label><span>Due date</span><b>{dateText(current.nextDueAt)}</b></label>
       <label><span>Amount</span><b>{money(current.amount,current.currency)}</b></label><label><span>Frequency</span><b>{current.frequency}</b></label>
       <label><span>Reminder</span><b>{alarm(current)}</b></label><label><span>Linked expense</span><b>{pending(current)}</b></label></div>
     {writable.some(c=>c._id===current.companyId)&&<>
       {current.status==='active'&&(!current.currentExpenseId||current.linkedExpenseStatus==='rejected')&&<section className="workflow-box"><h3>1. {current.linkedExpenseStatus==='rejected'?'Retry rejected expense':'Request expense approval'}</h3><p>{current.linkedExpenseStatus==='rejected'?'The rejected expense and approval remain in the audit record. A new request will be created.':'Creates a pending expense in Finance. Approval and journal posting remain mandatory.'}</p>
         <label>Approvers<select multiple aria-label="Expense approvers" value={approvers} onChange={e=>setApprovers(Array.from(e.target.selectedOptions,o=>o.value))}>
           {(members.data||[]).filter(m=>m._id!==session.user.id&&(m.role==='owner'||(m.permissions||[]).includes('approvals:write'))).map(m=><option key={m._id} value={m._id}>{m.name}</option>)}</select></label>
         <button className="button primary full" disabled={busy||!approvers.length} onClick={()=>void requestExpense()}>Request expense approval</button></section>}
       {current.status==='active'&&!!current.currentExpenseId&&current.linkedExpenseStatus!=='rejected'&&<section className="workflow-box"><h3>2. Complete after posting the expense</h3>
         <p>Current expense: <b>{current.linkedExpenseStatus||'linked'}</b>. Open <a href="/finance?tab=expenses">Expenses & Payables</a> to review, approve and post it. Only a posted expense can be settled.</p>
         <label>Bank/payment reference<input value={reference} onChange={e=>setReference(e.target.value)} placeholder="Payment transaction / UTR"/></label>
         <label>Proof (PDF, JPG or PNG, optional)<input type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={e=>setProofFile(e.target.files?.[0]||null)}/></label>
         <button className="button primary full" disabled={busy||reference.trim().length<2||current.linkedExpenseStatus!=='posted'} onClick={()=>void complete()}><CheckCircle2 size={16}/> Mark paid & schedule next renewal</button></section>}
       {current.status!=='cancelled'&&<div className="workflow-box"><h3>Manage renewal</h3><button className="button secondary full" disabled={busy} onClick={()=>openEdit(current)}>Edit reminder / details</button>
         {current.status==='active'?<button className="button secondary full" disabled={busy} onClick={()=>void changeStatus('paused')}>Pause reminders</button>:
           <button className="button secondary full" disabled={busy} onClick={()=>void changeStatus('active')}>Resume renewal</button>}
         <button className="button danger full" disabled={busy} onClick={()=>void changeStatus('cancelled')}>Cancel future renewals (retain history)</button></div>}
     </>}
     <div className="workflow-box"><button className="button secondary full" onClick={()=>setHistoryOpen(x=>!x)}>Payment / renewal history</button>
       {historyOpen&&(history.isPending?<Loader/>:history.error?<ErrorState error={history.error}/>:history.data?.items.length?<div className="renewal-history">{history.data.items.map((p:any)=><div key={p._id}><b>{dateText(p.createdAt)} · {money(p.amount,p.currency)}</b><p className="muted tiny">Paid for {dateText(p.dueAt)} · Reference: {p.reference}</p>{p.proofFileId&&<a href={`${API_BASE_URL}/files/${p.proofFileId}`} target="_blank" rel="noreferrer">Payment proof</a>}</div>)}</div>:<p className="muted">No settlements recorded yet.</p>)}
     </div>
   </div></Drawer>}
 </>;
}
