import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { CalendarDays, ChevronRight, Columns3, List, Plus, Send, UserRound, UploadCloud } from 'lucide-react';
import TaskImport from '../components/TaskImport';
import { useWorkspace } from '../App';
import { dateText, fetchRecords, http, shortDate, updateRecord } from '../api';
import { stages } from '../config';
import { Drawer, Empty, ErrorState, Loader, PageHead, RecordForm, Status, Table, Toolbar, useToast } from '../components/UI';
const stageColors = ['#ede9ff', '#e7f6e5', '#e7f0ff', '#fff0cc', '#eee5ff', '#e4f9e8'];
export default function WorkBoard() {
    const { company } = useWorkspace();
    const query = useQueryClient();
    const toast = useToast();
    const [selected, setSelected] = useState<any | null>(null);
    const [create, setCreate] = useState(false);
    const [importOpen,setImportOpen]=useState(false);
    const [list, setList] = useState(false);
    const [search, setSearch] = useState('');
    const [priority, setPriority] = useState('');
    const [update, setUpdate] = useState('');
    const [assigning, setAssigning] = useState(false);
    const memberCompany = selected?.companyId || (company !== 'all' ? company : '');
    const members = useQuery({ queryKey: ['members', memberCompany], queryFn: async () => (await http.get('/admin/members',{headers:{'x-company-id':String(memberCompany)}})).data as any[], enabled:!!memberCompany });
    const [dragging, setDragging] = useState<string | null>(null);
    const q = useQuery({ queryKey: ['records', 'tasks', company], queryFn: () => fetchRecords('tasks', { limit: 200 }) });
    const u = useQuery({ queryKey: ['task-updates', selected?._id, company], queryFn: async () => (await http.get(`/workflows/tasks/${selected._id}/updates`,{headers:{'x-company-id':String(selected.companyId)}})).data, enabled: !!selected });
    const items = useMemo(() => (q.data?.items || []).filter(x => x.status !== 'archived' && x.title.toLowerCase().includes(search.toLowerCase()) && (!priority || x.priority === priority)), [q.data, search, priority]);
    const changeStatus = async (task:any,status:string) => {
        if (!task.companyId) return toast.error('Task is missing its company assignment');
        if(task.status===status)return;
        const key=['records','tasks',company];
        const old=query.getQueryData<any>(key);
        query.setQueryData(key,(prev:any)=>prev?{...prev,items:prev.items.map((x:any)=>x._id===task._id?{...x,status}:x)}:prev);
        setSelected((prev:any)=>prev?prev._id===task._id?{...prev,status}:prev:prev);
        try {
            await updateRecord('tasks',task._id,{status},String(task.companyId));
            toast.success(`Moved to ${status}`);
            void query.invalidateQueries({queryKey:['records','tasks',company]});
        } catch(e:any) {
            if(old)query.setQueryData(key,old);
            setSelected((prev:any)=>prev&&prev._id===task._id?{...prev,status:task.status}:prev);
            toast.error(`Could not move task: ${e.message}`);
        }
    };
    const archive = async () => {
        if (!selected || !selected.companyId) return;
        if (!window.confirm(`Archive task: ${selected.title}?`)) return;
        try { await http.delete(`/records/tasks/${selected._id}`,{headers:{'x-company-id':String(selected.companyId)}}); await query.invalidateQueries({queryKey:['records','tasks']}); setSelected(null);toast.success('Task archived'); }
        catch(e:any){toast.error(e.message)}
    };
    const assign = async (ids:string[]) => {
        if(!selected||!selected.companyId)return;
        try{const update={assigneeIds:ids,ownerId:ids[0]||null};
            await updateRecord('tasks',selected._id,update,String(selected.companyId));
            query.setQueriesData<any>({queryKey:['records','tasks',company]},(old:any)=>old?{...old,items:old.items.map((x:any)=>x._id===selected._id?{...x,...update}:x)}:old);
            setSelected((prev:any)=>prev?{...prev,...update}:prev);
            toast.success('Assignees updated');
        }catch(e:any){toast.error(e.message);}
    };
    const addUpdate = async () => {
        if (!update.trim() || !selected)
            return;
        try {
            await http.post(`/workflows/tasks/${selected._id}/updates`, { message: update },{headers:{'x-company-id':String(selected.companyId)}});
            setUpdate('');
            await query.invalidateQueries({ queryKey: ['task-updates'] });
            toast.success('Update posted');
        }
        catch (e: any) {
            toast.error(e.message);
        }
    };
    return <><PageHead title="Work Board" subtitle="Track and move work across stages. Click any task for details, updates and linked records." action={{ label: 'New task', onClick: () => setCreate(true) }}><button className={`button ${list ? 'secondary' : 'selected-button'}`} onClick={() => setList(false)}><Columns3 size={16}/> Board</button><button className={`button ${list ? 'selected-button' : 'secondary'}`} onClick={() => setList(true)}><List size={16}/> List</button></PageHead>
 <div className="board-filters"><button className="button secondary" onClick={()=>setImportOpen(true)} disabled={company==='all'} title={company==='all'?'Select one company to import tasks':'Import tasks from CSV or Excel'}><UploadCloud size={16}/> Import Tasks</button><Toolbar search={search} setSearch={setSearch} extra={<select value={priority} onChange={e => setPriority(e.target.value)}><option value="">All priorities</option><option>P1</option><option>P2</option><option>P3</option></select>}/></div>
 {q.isPending ? <Loader /> : q.error ? <ErrorState error={q.error}/> : list ? <div className="panel"><Table items={items} columns={['title', 'vertical', 'status', 'priority', 'dueAt']} onSelect={setSelected}/></div> : <div className="kanban-board">{stages.tasks.map((stage, i) => {
                const cards = items.filter(x => x.status === stage);
                return <div className="kanban-col" key={stage} onDragOver={e => e.preventDefault()} onDrop={e => {
                        e.preventDefault();
                        if (dragging) {
                            const task = items.find(x => x._id === dragging);
                            if (task)
                                changeStatus(task, stage);
                        }
                        setDragging(null);
                    }}><div className="kanban-head" style={{ background: stageColors[i] }}><span>{stage === 'in-progress' ? 'In progress' : stage[0].toUpperCase() + stage.slice(1)}</span><b>{cards.length}</b></div><div className="kanban-cards">{cards.map(task => <button className={`task-card ${selected?._id === task._id ? 'picked' : ''}`} key={task._id} draggable onDragStart={() => setDragging(task._id)} onDragEnd={() => setDragging(null)} onClick={() => setSelected(task)}><strong>{task.title}</strong><span className="task-vertical">{task.vertical || 'Operations'}</span><div className="task-meta"><span className="mini-avatar">{(task.assigneeIds?.length || (task.ownerId ? 1 : 0))} <UserRound size={12}/></span><span><CalendarDays size={12}/>{shortDate(task.dueAt)}</span><span className={`priority priority-${task.priority}`}>{task.priority}</span></div></button>)}{!cards.length && <p className="stage-empty">Drop task here</p>}</div></div>;
            })}</div>}
 {selected && <Drawer title={selected.title} onClose={() => setSelected(null)}><div className="record-detail"><div className="detail-section"><Status value={selected.status}/><p>{selected.description || 'No description added.'}</p></div><div className="detail-grid"><label><span>Due date</span><b>{dateText(selected.dueAt)}</b></label><label><span>Priority</span><b>{selected.priority}</b></label><label><span>Vertical</span><b>{selected.vertical || '—'}</b></label><label><span>Owner</span><b>{selected.ownerId || 'Unassigned'}</b></label></div><div className="member-picker"><strong>Assign multiple team members</strong><p className="muted tiny">Every selected team member will see this task.</p><div className="member-picker-list">{(members.data||[]).map(m=><label key={m._id} className="member-option"><input type="checkbox" checked={(selected.assigneeIds||[selected.ownerId].filter(Boolean)).includes(m._id)} onChange={e=>void assign(e.target.checked?[...new Set([...(selected.assigneeIds||[selected.ownerId].filter(Boolean)),m._id])]: (selected.assigneeIds||[selected.ownerId].filter(Boolean)).filter((x:string)=>x!==m._id))}/>{m.name}</label>)}</div></div><label className="form-label">Move to status<select value={selected.status} onChange={e => changeStatus(selected, e.target.value)}>{stages.tasks.map(x => <option key={x} value={x}>{x}</option>)}</select></label><button className="button danger full" onClick={archive}>Archive / delete task</button><h3>Daily updates</h3><div className="timeline">{(u.data || []).map((item: any) => <div className="timeline-entry" key={item._id}><span className="timeline-dot"/><strong>{dateText(item.createdAt)}</strong><p>{item.message}</p></div>)}{u.isPending && <span className="muted">Loading updates…</span>}{u.data?.length === 0 && <span className="muted">No updates yet.</span>}</div><div className="comment-row"><input placeholder="Add an update or blocker…" value={update} onChange={e => setUpdate(e.target.value)} onKeyDown={e => {
                if (e.key === 'Enter')
                    addUpdate();
            }}/><button className="button primary" onClick={addUpdate}><Send size={16}/></button></div></div></Drawer>}
 {importOpen&&<TaskImport companyId={company} onClose={()=>setImportOpen(false)} onImported={()=>{void query.invalidateQueries({queryKey:['records','tasks']});setImportOpen(false);toast.success('Tasks imported into Backlog');}}/>}
 {create && <Drawer title="New task" onClose={() => setCreate(false)}><RecordForm entity="tasks" onClose={() => setCreate(false)}/></Drawer>}
 </>;
}
