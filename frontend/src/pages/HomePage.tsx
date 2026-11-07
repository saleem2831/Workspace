import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Activity, ArrowRight, BookOpen, BriefcaseBusiness, CalendarDays, CheckCircle2, CreditCard, LayoutDashboard, ShieldCheck, Users, Workflow } from 'lucide-react';
import { useWorkspace } from '../App';
import { http } from '../api';
import { ErrorState, Loader } from '../components/UI';
const shortcuts = [
  {title:'Daily command centre',path:'/today',icon:LayoutDashboard,description:'Priorities, deadlines and decisions',module:'reports'},
  {title:'Work Board',path:'/work-board',icon:Workflow,description:'Track and assign delivery tasks',module:'operations'},
  {title:'Calendar',path:'/calendar',icon:CalendarDays,description:'Events and meeting links',module:'operations'},
  {title:'Learning',path:'/learning',icon:BookOpen,description:'Students, batches and fees',module:'learning'},
  {title:'Advisory',path:'/advisory',icon:Activity,description:'Accounts, P&L and USDT trades',module:'advisory'},
  {title:'Projects',path:'/projects',icon:BriefcaseBusiness,description:'Milestones and client delivery',module:'projects'},
  {title:'Finance',path:'/finance',icon:CreditCard,description:'Invoices, vendors and transfers',module:'finance'},
  {title:'Approvals',path:'/approvals',icon:CheckCircle2,description:'Requests awaiting a decision',module:'approvals'},
];
export default function HomePage(){
 const {session,company,setCompany}=useWorkspace();
 const q=useQuery({queryKey:['home-summary',company],queryFn:async()=> (await http.get('/insights/summary')).data as any,staleTime:90000});
 const allowed=(m:string)=>session.companies.some(c=>(company==='all'||company===c._id)&&(session.companyModules?.[c._id]||c.enabledModules||[]).includes(m)&&(['owner','super_admin'].includes(session.roles[c._id])||(session.permissions[c._id]||[]).some(p=>p.startsWith(m+':'))));
 return <div className="home-view"><section className="home-hero"><div><span className="eyebrow">BITSTEK BUSINESS OPERATING SYSTEM</span><h1>Welcome to {session.branding?.name||'Bitstek Workspace'}</h1><p>One place for your teams, clients, learning operations, financial controls and business decisions.</p></div><div className="home-hero-icon"><ShieldCheck size={42}/></div></section>
 <section className="home-company-section"><div><strong>Company workspace</strong><p className="muted">Select a company to create and update records. You can continue viewing the combined overview under All companies.</p></div><select value={company} onChange={e=>setCompany(e.target.value)} aria-label="Select home company">{(session.isSuperAdmin || session.companies.length>0 && session.companies.every(c=>session.roles[c._id]==='owner')) && <option value="all">All companies</option>}{session.companies.map(c=><option key={c._id} value={c._id}>{c.name}</option>)}</select></section>
 <div className="home-metrics">{q.isPending?<Loader/>:q.error?<ErrorState error={q.error}/>:<>{[{label:'Students',value:q.data?.students??'—'},{label:'Projects',value:q.data?.projects??'—'},{label:'Pending approvals',value:q.data?.approvals??'—'},{label:'Subscriptions due',value:q.data?.renewals??'—'}].map(x=><div className="home-metric" key={x.label}><span>{x.label}</span><strong>{x.value}</strong></div>)}</>}</div>
 <div className="home-section-head"><h2>Open a module</h2><p className="muted">Only permitted modules are shown</p></div><div className="home-shortcuts">{shortcuts.filter(x=>x.path==='/today'||allowed(x.module)).map(x=><Link to={x.path} className="home-shortcut" key={x.path}><div className="home-shortcut-icon"><x.icon size={22}/></div><strong>{x.title}</strong><p>{x.description}</p><ArrowRight size={17} className="home-arrow"/></Link>)}</div>
 <div className="home-help"><Users size={19}/><p>New here? Start with <b>Work Board</b> for assignments, <b>Calendar</b> for meetings, and <b>Settings</b> to review your profile and MFA.</p></div></div>;
}
