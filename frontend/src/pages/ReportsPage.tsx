import {useQuery} from '@tanstack/react-query';
import {useState} from 'react';
import {AlertTriangle,BadgeCheck,Download,GraduationCap,Users} from 'lucide-react';
import {Bar,BarChart,CartesianGrid,ResponsiveContainer,Tooltip,XAxis,YAxis} from 'recharts';
import {useWorkspace} from '../App';
import {friendly,http,money} from '../api';
import {Empty,ErrorState,Loader,PageHead,Panel,Stat,Table,Tabs} from '../components/UI';

const tabToModule:Record<string,string>={learning:'learning',trading:'advisory',sales:'sales',delivery:'projects',finance:'finance'};
const metricMap:Record<string,Array<[string,string]>>={
 learning:[['students','Students'],['courses','Courses'],['installments','Unpaid installments'],['internships','Internships']],
 trading:[['accounts','Trading accounts'],['performances','Performance entries'],['movements','Pending capital movements'],['usdt','USDT transactions']],
 sales:[['leads','Sales leads'],['clients','Clients'],['proposals','Proposals']],
 delivery:[['projects','Projects'],['milestones','Milestones'],['atRisk','At-risk projects']],
 finance:[['invoices','Receivables'],['expenses','Pending expenses'],['transfers','Pending transfers'],['approvals','Pending approvals']]
};
export default function ReportsPage(){
  const {company,session}=useWorkspace();const [tab,setTab]=useState('overview');
  const q=useQuery({queryKey:['reports',session.tenant?._id,company],queryFn:async()=>(await http.get('/dashboard/reports')).data});
  const insight=useQuery({queryKey:['insights-summary',session.tenant?._id,company],queryFn:async()=>(await http.get('/insights/summary')).data});
  if(q.isPending)return <><PageHead title="Management reports"/><Loader/></>;
  if(q.error)return <ErrorState error={q.error}/>;
  const r=q.data;const counts=r.counts||{};const details=insight.data||{};
  // Source of truth is backend's verified company/module ACL, never the tenant name.
  const modules:string[]=r.availableModules||[];
  const has=(module:string)=>modules.includes(module);
  const availableTabs=['overview',...Object.keys(tabToModule).filter(t=>has(tabToModule[t]))];
  const shownTab=availableTabs.includes(tab)?tab:'overview';
  const pipeline=(r.pipelineStages||[]).map(([name,value]:[string,number])=>({name:friendly(name),value}));
  const tasks=(r.taskStages||[]).map(([name,value]:[string,number])=>({name:friendly(name),value}));
  const exportJson=()=>{const blob=new Blob([JSON.stringify({...r,reportModule:shownTab,tenant:session.tenant?.slug},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`${session.tenant?.slug||'workspace'}-report-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(url);};
  const showSales=has('sales')&&(shownTab==='overview'||shownTab==='sales');
  const showOps=has('operations')&&shownTab==='overview';
  const showFinance=has('finance')&&(shownTab==='overview'||shownTab==='finance');
  const showProjects=has('projects')&&(shownTab==='overview'||shownTab==='delivery');
  const showLearning=has('learning')&&(shownTab==='overview'||shownTab==='learning');
  const showAdvisory=has('advisory')&&(shownTab==='overview'||shownTab==='trading');
  const cards:Array<{name:string;value:number;icon:any;tone?:'blue'|'green'|'red'}>=[];
  if(showOps)cards.push({name:'Tasks completed',value:counts.tasksCompleted||0,icon:BadgeCheck});
  if(showSales)cards.push({name:'Open opportunities',value:Math.max(0,(counts.leads||0)-(counts.leadsWon||0)),icon:Users,tone:'blue'});
  if(showLearning)cards.push({name:'Active students',value:counts.students||0,icon:GraduationCap,tone:'green'});
  if(showProjects)cards.push({name:'Projects at risk',value:counts.projectsAtRisk||0,icon:AlertTriangle,tone:'red'});
  const scopedNames=(r.companies||[]).map((c:{name:string})=>c.name).join(', ');
  return <><PageHead title="Management reports" subtitle={`Only enabled and authorized modules in ${session.tenant?.name||'this workspace'}.`}><button className="button primary" onClick={exportJson}><Download size={16}/> Export report</button></PageHead>
    <div className="panel domain-panel"><Tabs active={shownTab} onChange={setTab} items={availableTabs.map(t=>({key:t,label:friendly(t)}))}/><div className="report-content">
      <div className="report-scope"><div><strong>Company scope</strong><p>{scopedNames||'No authorized companies'} · Generated {new Date().toLocaleDateString()}</p></div><button className="button secondary" onClick={()=>window.print()}>Print report</button></div>
      {shownTab!=='overview'&&metricMap[shownTab]&&<div className="report-metric-grid">{metricMap[shownTab].map(([key,label])=><div className="report-metric" key={key}><span>{label}</span><strong>{details[key]??'—'}</strong></div>)}</div>}
      {cards.length>0&&<div className="stat-grid four">{cards.map(card=><Stat key={card.name} label={card.name} value={card.value} icon={card.icon} tone={card.tone}/>)}</div>}
      {(showSales||showOps)&&<div className="report-charts">
        {showSales&&<Panel title="Sales pipeline by stage"><div className="chart-wrap">{pipeline.length?<ResponsiveContainer width="100%" height={265}><BarChart data={pipeline}><CartesianGrid strokeDasharray="4 4" stroke="#eef0f5"/><XAxis dataKey="name" tick={{fontSize:11}}/><YAxis allowDecimals={false} tick={{fontSize:11}}/><Tooltip/><Bar dataKey="value" fill="var(--purple)" radius={[5,5,0,0]}/></BarChart></ResponsiveContainer>:<Empty text="No pipeline data"/>}</div></Panel>}
        {showOps&&<Panel title="Task workflow status"><div className="chart-wrap">{tasks.length?<ResponsiveContainer width="100%" height={265}><BarChart data={tasks}><CartesianGrid strokeDasharray="4 4" stroke="#eef0f5"/><XAxis dataKey="name" tick={{fontSize:11}}/><YAxis allowDecimals={false} tick={{fontSize:11}}/><Tooltip/><Bar dataKey="value" fill="#4aa7e8" radius={[5,5,0,0]}/></BarChart></ResponsiveContainer>:<Empty text="No tasks yet"/>}</div></Panel>}
      </div>}
      {showFinance&&<Panel title="Financial snapshot by currency" subtitle="Amounts are not combined across currencies without approved exchange rates."><div className="finance-report-grid">{Object.entries(r.financials||{}).filter(([type])=>type!=='pipeline'||has('sales')).map(([type,values]:any)=><div className="report-finance-card" key={type}><span>{friendly(type)}</span>{Object.entries(values).map(([currency,value]:any)=><strong key={currency}>{money(value,currency)}</strong>)}{!Object.keys(values).length&&<strong>—</strong>}</div>)}</div></Panel>}
      {showProjects&&<Panel title="Project delivery overview"><Table items={r.projects||[]} columns={['title','manager','status','progress','risk','dueAt']}/></Panel>}
      {shownTab==='learning'&&<Panel title="Learning metrics"><div className="metrics-horizontal"><p><b>{counts.students||0}</b> student records</p><p>Fee aging and receipt allocations are available under Learning.</p></div></Panel>}
      {shownTab==='trading'&&<Panel title="Advisory oversight"><div className="metrics-horizontal"><p><b>{counts.tradingAccounts||0}</b> registered accounts</p><p>Detailed capital and trading history are available in the Advisory module for authorized companies.</p></div></Panel>}
      {shownTab==='overview'&&cards.length===0&&<Empty text="No reporting modules enabled for the selected companies"/>}
    </div></div>
  </>;
}
