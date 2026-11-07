import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, BookOpen, BriefcaseBusiness, CalendarDays, CheckCircle2, Clock3, Handshake, Plus } from 'lucide-react';
import { dateText, http, money, shortDate } from '../api';
import { Drawer, Empty, ErrorState, Loader, PageHead, Panel, RecordForm, Stat, Table } from '../components/UI';
import { useState } from 'react';
import { useWorkspace } from '../App';

type CompanySummary = {id:string;name:string;code:string;vertical:string;currency:string;modules:string[];counts:{tasks:number;leads:number;students:number;tradingAccounts:number;projects:number;subscriptions:number}};
const metrics=(c:CompanySummary):Array<[string,number]>=>{
  const m=c.modules;const k=c.counts;
  const result:Array<[string,number]>=[];
  if(m.includes('learning'))result.push(['Students',k.students]);
  if(m.includes('advisory'))result.push(['Trading accounts',k.tradingAccounts]);
  if(m.includes('projects'))result.push(['Projects',k.projects]);
  if(m.includes('products'))result.push(['Subscriptions',k.subscriptions]);
  if(m.includes('sales'))result.push(['Sales leads',k.leads]);
  if(m.includes('operations'))result.push(['Tasks',k.tasks]);
  return result.slice(0,3);
};
const companyIcon=(c:CompanySummary)=>c.modules.includes('learning')?BookOpen:c.modules.includes('advisory')?Handshake:BriefcaseBusiness;
export default function Dashboard(){
  const {company,session}=useWorkspace();
  const navigate=useNavigate();const [open,setOpen]=useState(false);
  const allowed=(domain:string,action:'read'|'write'='read')=>session.companies.some(c=>
    (company==='all'||company===c._id) && (session.companyModules?.[c._id]||c.enabledModules||[]).includes(domain) &&
    (session.isSuperAdmin||session.roles[c._id]==='owner'||(session.permissions[c._id]||[]).some(p=>p===`${domain}:write`||(action==='read'&&p===`${domain}:read`))));
  const q=useQuery({queryKey:['dashboard',session.tenant?._id,company],queryFn:async()=>(await http.get('/dashboard/summary')).data});
  if(q.isPending)return <><PageHead title="Daily command centre" subtitle="Your company's operations at a glance"/><Loader/></>;
  if(q.error)return <ErrorState error={q.error}/>;
  const d=q.data;const stats=d.stats;
  const fmt=(values:Record<string,string>)=>Object.entries(values||{}).length?Object.entries(values).map(([c,v])=>money(v,c)).join(' / '):'—';
  const summaries=(d.companySummaries||[]) as CompanySummary[];
  return <><PageHead title="Daily command centre" subtitle={`${session.tenant?.name||'Your workspace'} · Priorities and upcoming activities · ${dateText(new Date())}`} action={allowed('operations','write')?{label:'New action',onClick:()=>setOpen(true)}:undefined}/>
    <div className="dashboard-grid"><div className="dash-main">
      <div className="stat-grid four"><Stat label="Due today" value={stats.dueToday} icon={CalendarDays}/><Stat label="Overdue" value={stats.overdue} icon={AlertTriangle} tone="red"/><Stat label="Follow-ups" value={stats.followUps} icon={Clock3} tone="blue"/><Stat label="Approvals" value={stats.approvals} icon={CheckCircle2} tone="green"/></div>
      <div className="verticals">{summaries.map(c=>{const Icon=companyIcon(c);const facts=metrics(c);return <article className="vertical-card tenant-company-card" key={c.id}>
        <div className="vertical-top"><Icon size={22} className="purple-text"/><strong>{c.name}</strong></div>
        <p>{c.vertical||'General Business'}</p>
        <div className="vertical-metrics">{facts.length?facts.map(([label,value],i)=><span key={label} className="tenant-company-metric"><b>{value}</b> {label}{i<facts.length-1?' · ':''}</span>):<span>No overview metrics configured</span>}</div>
      </article>;})}</div>
      {!summaries.length&&<Panel title="Your companies"><Empty text="No accessible company is configured for this workspace"/></Panel>}
      {allowed('operations')&&<Panel title="Action board" subtitle="Tasks for the current authorized company scope" aside={<Link to="/work-board" className="text-link">View board <ArrowRight size={14}/></Link>}><Table items={d.tasks.slice(0,9)} columns={['title','vertical','status','priority','dueAt']} onSelect={()=>navigate('/work-board')}/></Panel>}
    </div><div className="dash-side">
      <Panel title={`Needs your attention (${d.attention.length})`}><div className="feed-list">{d.attention.length?d.attention.map((a:any)=><Link to={a.target} className="feed-row" key={a.id}><span className={`feed-dot ${a.kind}`}/><span className="feed-text">{a.title}</span><span className={`feed-label ${a.kind}`}>{a.kind}</span><ArrowRight size={14}/></Link>):<p className="small-empty">All caught up. No urgent items.</p>}</div></Panel>
      {allowed('operations')&&<Panel title={`Next 7 days (${d.upcoming.length})`}><div className="agenda-list">{d.upcoming.length?d.upcoming.map((e:any)=><Link className="agenda-row" to="/calendar" key={e._id}><span className="day-chip">{shortDate(e.startAt)}</span><span>{e.title}</span><ArrowRight size={13}/></Link>):<p className="small-empty">No upcoming calendar events.</p>}</div></Panel>}
      {allowed('finance')&&<Panel title="Financial snapshot"><div className="finance-snapshot"><div><span>Open receivables</span><strong>{fmt(d.finance.receivablesByCurrency)}</strong></div><div><span>Recorded expenses</span><strong>{fmt(d.finance.expensesByCurrency)}</strong></div></div><Link className="text-link" to="/finance">Open finance <ArrowRight size={14}/></Link></Panel>}
    </div></div>
    {open&&allowed('operations','write')&&<Drawer title="Create new action" onClose={()=>setOpen(false)}><RecordForm entity="tasks" onClose={()=>setOpen(false)}/></Drawer>}
  </>;
}
