import {useState} from 'react';
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {Archive, Building2, Download, FileInput, HardDrive, Sparkles, ShieldCheck} from 'lucide-react';
import {http} from '../api';
import {useWorkspace} from '../App';
import ThemePicker,{type ThemeId} from '../components/ThemePicker';
import './saas.css';

type Overview={tenant:{name:string;slug:string;themeId?:ThemeId};plan?:{name:string;maxCompanies:number;maxUsers:number};
  subscription?:{status:string};companies:number;files:number;storageBytes:number;storageMode:string;imports:number;exports:number};
type Preview={received:number;accepted:number;errors:{row:number;error:string}[];sample:Record<string,unknown>[]};
export default function SaaSCenter(){
  const {session,refresh}=useWorkspace();
  const query=useQueryClient();
  const {data,refetch,isLoading,error}=useQuery({queryKey:['saas','overview',session.tenant?._id],
    queryFn:async()=>(await http.get<Overview>('/saas/overview')).data,retry:false});
  const [theme,setTheme]=useState<ThemeId>((session.tenant?.themeId as ThemeId)||'violet');
  const [scope,setScope]=useState('tenant');
  const [target,setTarget]=useState(session.companies[0]?._id||'');
  const [entity,setEntity]=useState('clients');
  const [csv,setCsv]=useState('');
  const [preview,setPreview]=useState<Preview|null>(null);
  const [brief,setBrief]=useState<{messages:string[];mode:string;asOf:string}|null>(null);
  const [working,setWorking]=useState(false);
  const [status,setStatus]=useState('');
  const [err,setErr]=useState('');
  const action=async(fn:()=>Promise<void>)=>{setErr('');setStatus('');setWorking(true);try{await fn();}catch(e:any){setErr(e.message||'Operation failed');}finally{setWorking(false);}};
  const exportData=()=>action(async()=>{
    const companyId=scope==='company'?target:undefined;
    const res=await http.get('/saas/exports/download',{params:companyId?{companyId}:{},responseType:'blob',timeout:180000,
      headers:{'x-company-id':'all'}});
    const url=URL.createObjectURL(new Blob([res.data],{type:'application/zip'}));
    const a=document.createElement('a');a.href=url;a.download=`${data?.tenant?.slug||'workspace'}-${scope}-backup.zip`;
    document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
    setStatus('Archive downloaded. Store it encrypted and test restoration separately.');
    void query.invalidateQueries({queryKey:['saas']});
  });
  const downloadTemplate=(includeSample:boolean)=>action(async()=>{
    const res=await http.get(`/saas/imports/template/${entity}`,{params:includeSample?{example:'1'}:{},responseType:'blob'});
    const blob=new Blob([res.data],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    try{
      const a=document.createElement('a');a.href=url;a.download=`${entity}-${includeSample?'sample':'template'}.csv`;
      document.body.appendChild(a);a.click();a.remove();
    }finally{URL.revokeObjectURL(url);}
    setStatus(includeSample?'Sample CSV downloaded. Remove the example row before importing actual records.':'Blank CSV template downloaded with exact supported field names.');
  });
  const doPreview=()=>action(async()=>{
    const response=await http.post('/saas/imports/preview',{entity,companyId:target,csvText:csv});
    setPreview(response.data);setStatus('Review validation results before committing.');
  });
  const doCommit=()=>action(async()=>{
    if(!preview||preview.errors.length||!preview.accepted)throw new Error('Preview must contain valid rows without errors');
    if(!window.confirm(`Import ${preview.accepted} ${entity} records into the selected company?`))return;
    const response=await http.post('/saas/imports/commit',{entity,companyId:target,csvText:csv,confirm:'IMPORT'});
    setStatus(`Imported ${response.data.imported} rows.`);setPreview(null);void refetch();
  });
  return <div className="saas-page">
    <div className="saas-heading"><div><h1>SaaS administration</h1><p>Manage your tenant's data, imports, storage and insights.</p></div><span className="saas-pill"><ShieldCheck size={15}/> Tenant Super Admin</span></div>
    {err&&<div className="saas-alert error">{err}</div>}{status&&<div className="saas-alert success">{status}</div>}
    {error&&<div className="saas-alert error">Unable to load tenant summary.</div>}
    <div className="saas-metrics">
      {[
        {label:'Workspace',value:data?.tenant?.name||'—',icon:<Building2/>},
        {label:'Subscription',value:data?.subscription?.status||'Not configured',icon:<ShieldCheck/>},
        {label:'Companies',value:data?.companies??'—',icon:<Building2/>},
        {label:'Documents',value:data?.files??'—',icon:<HardDrive/>},
        {label:'Storage',value:data?`${(data.storageBytes/1048576).toFixed(1)} MB`:'—',icon:<HardDrive/>}
      ].map(x=><div className="saas-metric" key={x.label}><span>{x.icon}{x.label}</span><strong>{isLoading?'…':x.value}</strong></div>)}
    </div>
    <div className="saas-grid">
      <section className="saas-panel"><header><Download/><div><h2>Company and tenant export</h2><p>Includes tenant-scoped database records, S3 documents and schema manifest.</p></div></header>
        <label>Export scope<select value={scope} onChange={e=>setScope(e.target.value)}><option value="tenant">Complete tenant</option><option value="company">Selected company</option></select></label>
        {scope==='company'&&<label>Company<select value={target} onChange={e=>setTarget(e.target.value)}>{session.companies.map(c=><option key={c._id} value={c._id}>{c.name}</option>)}</select></label>}
        <p className="saas-note">Archives contain confidential records. Exports exceeding synchronous limits require a background export worker. No data is deleted during export.</p>
        <button disabled={working} className="button primary" onClick={exportData}><Download size={16}/> Download portable archive</button>
      </section>
      <section className="saas-panel"><header><FileInput/><div><h2>Import existing data</h2><p>CSV preview, validation and controlled creation in the destination company.</p></div></header>
        <label>Destination company<select value={target} onChange={e=>{setTarget(e.target.value);setPreview(null);}}>{session.companies.map(c=><option key={c._id} value={c._id}>{c.name}</option>)}</select></label>
        <label>Business records<select value={entity} onChange={e=>{setEntity(e.target.value);setPreview(null);}}>{['clients','students','products','vendors'].map(x=><option key={x}>{x}</option>)}</select></label>
        <p className="saas-note">Download the field-name template or an example-filled CSV for the selected record type. Templates match the import validator. Remove example rows before importing customer data.</p>
        <div className="saas-actions"><button type="button" className="button secondary" disabled={working} onClick={()=>downloadTemplate(false)}><Download size={15}/> Blank CSV template</button><button type="button" className="button secondary" disabled={working} onClick={()=>downloadTemplate(true)}><Download size={15}/> Sample CSV with fields</button></div>
        <label>CSV file (max 2 MB, 1,000 rows)<input type="file" accept=".csv,text/csv" onChange={async e=>{const file=e.target.files?.[0];if(file){setCsv(await file.text());setPreview(null);}}}/></label>
        <div className="saas-actions"><button className="button secondary" disabled={working||!csv} onClick={doPreview}>Preview import</button><button className="button primary" disabled={working||!preview||!!preview.errors.length||!preview.accepted} onClick={doCommit}>Confirm import</button></div>
        {preview&&<div className="saas-preview"><strong>{preview.accepted}/{preview.received} rows ready</strong><p>{preview.errors.length} error(s)</p>{preview.errors.slice(0,6).map(x=><small key={x.row}>Row {x.row}: {x.error}</small>)}</div>}
      </section>
      <section className="saas-panel"><header><Sparkles/><div><h2>Daily operational insights</h2><p>Permission-scoped summary; rules-based initially, not an external LLM.</p></div></header>
        <button className="button secondary" disabled={working} onClick={()=>action(async()=>{const r=await http.get('/saas/ai/daily-brief');setBrief(r.data);})}>Generate daily briefing</button>
        {brief&&<div className="saas-preview"><strong>Briefing · {new Date(brief.asOf).toLocaleString()}</strong>{brief.messages.map(t=><p key={t}>{t}</p>)}<small>Mode: {brief.mode}. AI provider features require tenant opt-in and configuration.</small></div>}
      </section>
      <section className="saas-panel"><header><ShieldCheck/><div><h2>Workspace colour theme</h2><p>Choose a tenant-specific palette for all employees. It does not change another customer workspace.</p></div></header>
        <ThemePicker value={theme} onChange={setTheme}/>
        <button type="button" className="button primary" disabled={working} onClick={()=>action(async()=>{
          await http.patch('/saas/settings/theme',{themeId:theme});
          await query.invalidateQueries({queryKey:['saas']});refresh();setStatus('Workspace theme updated for this tenant.');
        })}>Save workspace theme</button>
        <p className="saas-note">Five options: Violet, Ocean Blue, Emerald, Sunset and Slate. Tenant Super Admin permission is required.</p>
      </section>
      <section className="saas-panel"><header><Archive/><div><h2>Data lifecycle</h2><p>Archive before deletion; keep financial and audit records according to retention policy.</p></div></header>
        <p className="saas-note">Company deactivation and impact previews remain in Settings → Companies → Manage Data. Permanent tenant deletion is intentionally disabled in this developer preview.</p>
        <button className="button secondary" onClick={()=>window.location.assign('/settings')}>Go to company settings</button>
      </section>
    </div>
  </div>;
}
