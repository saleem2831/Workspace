import { useQuery, useQueryClient } from '@tanstack/react-query';
import { addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, addDays, format, isSameMonth, isSameDay } from 'date-fns';
import { useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useWorkspace } from '../App';
import { dateText, fetchRecords, http } from '../api';
import { Drawer, Empty, ErrorState, Loader, PageHead, Panel, RecordForm, Status, useToast } from '../components/UI';
export default function CalendarPage() {
    const { company } = useWorkspace();
    const query=useQueryClient();const toast=useToast();const [editing,setEditing]=useState<any|null>(null);const [busy,setBusy]=useState(false);
    const [month, setMonth] = useState(new Date());
    const [day, setDay] = useState(new Date());
    const [open, setOpen] = useState(false);
    const q = useQuery({ queryKey: ['records', 'events', company], queryFn: () => fetchRecords('events', { limit: 200 }) });
    const events = (q.data?.items || []).filter(e => e.status !== 'archived');
    const act=async(item:any,action:'cancelled'|'postponed'|'archive')=>{if(!item.companyId)return toast.error('Event is missing its company');setBusy(true);try{if(action==='archive')await http.delete(`/records/events/${item._id}`,{headers:{'x-company-id':String(item.companyId)}});else await http.patch(`/records/events/${item._id}`,{status:action},{headers:{'x-company-id':String(item.companyId)}});await query.invalidateQueries({queryKey:['records','events']});toast.success(action==='archive'?'Event deleted':`Event ${action}`);}catch(e:any){toast.error(e.message);}finally{setBusy(false);}};
    const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
    const forDay = (d: Date) => events.filter(e => isSameDay(new Date(e.startAt), d));
    return <><PageHead title="Calendar" subtitle="Schedule training, client meetings, project milestones and reviews." action={{ label: 'Add event', onClick: () => setOpen(true) }}/>
 <div className="calendar-layout"><Panel className="calendar-panel" title="Workspace calendar" aside={<div className="calendar-nav"><button className="icon-btn" onClick={() => setMonth(subMonths(month, 1))}><ChevronLeft size={18}/></button><strong>{format(month, 'MMMM yyyy')}</strong><button className="icon-btn" onClick={() => setMonth(addMonths(month, 1))}><ChevronRight size={18}/></button><button className="button secondary compact" onClick={() => { setMonth(new Date()); setDay(new Date()); }}>Today</button></div>}>{q.isPending ? <Loader /> : q.error ? <ErrorState error={q.error}/> : <><div className="calendar-weekdays">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => <span key={d}>{d}</span>)}</div><div className="calendar-cells">{cells.map((cell, i) => <button key={i} className={`calendar-cell ${!isSameMonth(cell, month) ? 'other-month' : ''} ${isSameDay(cell, new Date()) ? 'today' : ''} ${isSameDay(cell, day) ? 'selected' : ''}`} onClick={() => setDay(cell)}><span className="date-number">{format(cell, 'd')}</span>{forDay(cell).slice(0, 3).map(e => <span key={e._id} className={`calendar-event type-${e.type || 'meeting'}`}>{e.title}</span>)}{forDay(cell).length > 3 && <small>+{forDay(cell).length - 3} more</small>}</button>)}</div></>}</Panel><Panel title={`Agenda · ${format(day, 'EEEE, d MMMM')}`}><div className="agenda-sidebar">{forDay(day).length ? forDay(day).map(e => <div className="agenda-item" key={e._id}><span className="agenda-clock">{format(new Date(e.startAt), 'hh:mm a')}</span><strong>{e.title}</strong><Status value={e.status}/><p>{e.description || e.type || 'Calendar event'}</p>{e.meetingUrl && /^https:\/\//i.test(e.meetingUrl) && <a href={e.meetingUrl} target="_blank" rel="noopener noreferrer" className="button secondary">Join {e.meetingProvider || 'meeting'}</a>}<div className="event-actions"><button className="button secondary compact" onClick={()=>setEditing(e)}>Edit / reschedule</button><button className="button secondary compact" disabled={busy} onClick={()=>void act(e,'postponed')}>Postpone</button><button className="button secondary compact" disabled={busy} onClick={()=>void act(e,'cancelled')}>Cancel event</button><button className="button danger compact" disabled={busy} onClick={()=>{if(confirm('Archive calendar event?'))void act(e,'archive');}}>Delete</button></div></div>) : <Empty text="No events for selected day"/>}<button className="button secondary full" onClick={() => setOpen(true)}><Plus size={16}/> Add an event</button></div></Panel></div>
 {editing && <Drawer title={`Edit ${editing.title}`} onClose={()=>setEditing(null)}><RecordForm entity="events" initial={editing} onClose={()=>setEditing(null)}/></Drawer>}
 {open && <Drawer title="New calendar event" onClose={() => setOpen(false)}><RecordForm entity="events" onClose={() => setOpen(false)}/></Drawer>}
 </>;
}
