import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { ArrowUpRight, BriefcaseBusiness, CalendarDays, CircleDollarSign, Handshake, Plus, Send, Users } from 'lucide-react';
import { useWorkspace } from '../App';
import { dateText, fetchRecords, http, money, updateRecord } from '../api';
import { stages } from '../config';
import { Drawer, ErrorState, Loader, PageHead, RecordForm, Stat, Status, Tabs, Table, Toolbar, useToast } from '../components/UI';
export default function SalesPage() {
    const { company } = useWorkspace();
    const query = useQueryClient();
    const toast = useToast();
    const [selected, setSelected] = useState<any | null>(null);
    const [create, setCreate] = useState(false);
    const [edit, setEdit] = useState(false);
    const [busy,setBusy]=useState(false);
    const [view, setView] = useState('pipeline');
    const [dragging, setDragging] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const memberCompany = selected?.companyId || (company !== 'all' ? company : '');
    const members = useQuery({queryKey:['members',memberCompany],queryFn:async()=>(await http.get('/admin/members',{headers:{'x-company-id':String(memberCompany)}})).data as any[],enabled:!!memberCompany});
    const leads = useQuery({ queryKey: ['records', 'leads', company], queryFn: () => fetchRecords('leads', { limit: 200 }) });
    const clients = useQuery({ queryKey: ['records', 'clients', company], queryFn: () => fetchRecords('clients', { limit: 100 }) });
    const proposals = useQuery({ queryKey: ['records', 'proposals', company], queryFn: () => fetchRecords('proposals', { limit: 100 }) });
    const items = useMemo(() => (leads.data?.items || []).filter(x => x.title.toLowerCase().includes(search.toLowerCase()) && x.status !== 'archived'), [leads.data, search]);
    const changeStage = async (id:string,stage:string) => {
        const source = (leads.data?.items || []).find(x=>x._id===id);
        if(!source?.companyId)return toast.error('Lead is missing its company assignment');
        const key=['records','leads',company];const old=query.getQueryData<any>(key);
        query.setQueryData(key,(prev:any)=>prev?{...prev,items:prev.items.map((x:any)=>x._id===id?{...x,stage}:x)}:prev);
        try{await updateRecord('leads',id,{stage},String(source.companyId));setSelected((s:any)=>s&&s._id===id?{...s,stage}:s);toast.success('Stage updated');void query.invalidateQueries({queryKey:['records','leads',company]});}
        catch(e:any){if(old)query.setQueryData(key,old);toast.error(e.message);}
    };
    const changeActive=async(active:boolean)=>{if(!selected)return;setBusy(true);try{await http.patch(`/records/${view==='pipeline'?'leads':view}/${selected._id}/state`,{isActive:active},{headers:{'x-company-id':String(selected.companyId)}});await query.invalidateQueries({queryKey:['records']});setSelected(null);toast.success(active?'Reactivated':'Deactivated');}catch(e:any){toast.error(e.message);}finally{setBusy(false);}};
    const archive=async()=>{if(!selected||!confirm('Archive this record?'))return;setBusy(true);try{await http.delete(`/records/${view==='pipeline'?'leads':view}/${selected._id}`,{headers:{'x-company-id':String(selected.companyId)}});await query.invalidateQueries({queryKey:['records']});setSelected(null);toast.success('Record archived');}catch(e:any){toast.error(e.message);}finally{setBusy(false);}};
    const convert = async () => {
        if (!selected)
            return;
        try {
            const result = await http.post(`/workflows/leads/${selected._id}/convert`,{},{headers:{'x-company-id':String(selected.companyId)}});
            await query.invalidateQueries();
            toast.success(`Project created: ${result.data.title}`);
            setSelected(null);
        }
        catch (e: any) {
            toast.error(e.message);
        }
    };
    return <><PageHead title="Sales pipeline" subtitle="Track opportunities from new leads to won clients, with next actions and follow-ups." action={{ label: 'New lead', onClick: () => { setView('pipeline'); setCreate(true); } }}/><div className="stat-grid four"><Stat label="Open opportunities" value={items.filter(x => !['won', 'lost'].includes(x.stage)).length} icon={Handshake}/><Stat label="Total opportunities" value={items.length} icon={Users} tone="blue"/><Stat label="Follow-ups today" value={items.filter(x => x.followUpAt && new Date(x.followUpAt).toDateString() === new Date().toDateString()).length} icon={CalendarDays} tone="green"/><Stat label="Proposals pending" value={items.filter(x => x.stage === 'proposal').length} icon={CircleDollarSign} tone="amber"/></div><div className="panel domain-panel"><Tabs active={view} onChange={s => { setView(s); setSelected(null); }} items={[{ key: 'pipeline', label: 'Pipeline' }, { key: 'clients', label: 'Clients', number: clients.data?.items.length }, { key: 'proposals', label: 'Proposals', number: proposals.data?.items.length }]}/><Toolbar search={search} setSearch={setSearch} extra={view !== 'pipeline' && <button className="button primary" onClick={() => setCreate(true)}><Plus size={15}/> Add {view === 'clients' ? 'client' : 'proposal'}</button>}/>{view === 'pipeline' ? leads.isPending ? <Loader /> : leads.error ? <ErrorState error={leads.error}/> : <div className="sales-pipeline">{stages.leads.map(stage => <div className="sales-column" key={stage} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault(); if(dragging) void changeStage(dragging,stage);setDragging(null);}}><div className="sales-stage-head"><strong>{stage[0].toUpperCase() + stage.slice(1)}</strong><span>{items.filter(x => x.stage === stage).length}</span></div>{items.filter(x => x.stage === stage).map(x => <button className="sales-card" draggable onDragStart={()=>setDragging(x._id)} onDragEnd={()=>setDragging(null)} onClick={() => setSelected(x)} key={x._id}><strong>{x.title}</strong><b>{money(x.amount, x.currency)}</b><p>{x.contact || 'Client contact'}</p><p className="muted">Owner: {x.ownerId ? ((members.data||[]).find((u:any)=>u._id===x.ownerId)?.name || 'Assigned') : 'Unassigned'}</p><div><CalendarDays size={12}/>{dateText(x.followUpAt)}</div></button>)}</div>)}</div> : view === 'clients' ? <Table items={clients.data?.items || []} columns={['title', 'contactPerson', 'email', 'country', 'status']} onSelect={setSelected}/> : <Table items={proposals.data?.items || []} columns={['title', 'version', 'amount', 'status', 'validUntil']} onSelect={setSelected}/>}</div>
 {selected && <Drawer title={selected.title} onClose={() => setSelected(null)}><div className="record-detail"><Status value={selected.stage || selected.status}/><div className="detail-grid"><label><span>Value</span><b>{money(selected.amount, selected.currency)}</b></label><label><span>Follow-up</span><b>{dateText(selected.followUpAt)}</b></label><label><span>Contact</span><b>{selected.contact || selected.contactPerson || '—'}</b></label><label><span>Created</span><b>{dateText(selected.createdAt)}</b></label></div>{view === 'pipeline' && <><label className="form-label">Pipeline stage<select value={selected.stage} onChange={e => changeStage(selected._id, e.target.value)}>{[...stages.leads, 'lost'].map(s => <option value={s} key={s}>{s}</option>)}</select></label>{selected.stage === 'won' && !selected.projectId && <button className="button primary full" onClick={convert}><BriefcaseBusiness size={15}/> Convert to project</button>}{selected.projectId && <div className="workflow-box"><b>Linked project created</b><p>Project ID: {selected.projectId}</p></div>}</>}<button className="button secondary full" onClick={() => setEdit(true)}>Edit record</button><button className="button secondary full" disabled={busy} onClick={()=>void changeActive(selected.isActive===false)}> {selected.isActive===false?'Reactivate':'Deactivate'} </button><button className="button danger full" disabled={busy} onClick={()=>void archive()}>Archive record</button></div></Drawer>}
 {edit && selected && <Drawer title="Edit sales record" onClose={() => setEdit(false)}><RecordForm entity={view === 'pipeline' ? 'leads' : view} initial={selected} onClose={() => { setEdit(false); setSelected(null); }}/></Drawer>}
 {create && <Drawer title="New sales record" onClose={() => setCreate(false)}><RecordForm entity={view === 'pipeline' ? 'leads' : view} onClose={() => setCreate(false)}/></Drawer>}
 </>;
}
