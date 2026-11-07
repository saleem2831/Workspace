import { useMemo, useState } from 'react';
import type * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArrowRightLeft, Building2, Download, Edit3, FolderArchive, Plus, RefreshCw, ShieldAlert, Trash2 } from 'lucide-react';
import { http } from '../api';
import { Drawer, Loader, ErrorState, Status, useToast } from '../components/UI';
import { useWorkspace } from '../App';

const MODULES = [
  ['operations','Work Board & Calendar'],['learning','Learning'],['advisory','Advisory'],
  ['sales','Sales'],['products','Products'],['projects','Projects'],
  ['finance','Finance'],['approvals','Approvals'],['reports','Reports'],
] as const;
const VERTICALS = ['Learning & Education','Advisory & Trading','IT Services & Products','General Business','Custom'];
const common = ['operations','sales','finance','approvals','reports'];
function defaults(vertical:string):string[]{
  if(vertical.includes('Learning'))return [...common,'learning'];
  if(vertical.includes('Advisory'))return [...common,'advisory'];
  if(vertical.includes('IT Services'))return [...common,'products','projects'];
  if(vertical==='Custom')return ['operations'];
  return [...common];
}
type Company = {_id:string;name:string;code:string;vertical:string;currency:string;active:boolean;enabledModules:string[]};
type CompanyForm={_id?:string;name:string;code:string;vertical:string;currency:string;enabledModules:string[]};
type Impact={counts:Record<string,number>;pendingApprovals:number;openInvoices:number;openExpenses:number;openProjects:number;incomingTransfers:number;supportedOperations:number;deletionEligible:boolean};
const blank=():CompanyForm=>({name:'',code:'',vertical:'General Business',currency:'INR',enabledModules:defaults('General Business')});

export default function CompanyManager(){
  const {session,refresh}=useWorkspace();
  const toast=useToast();
  const client=useQueryClient();
  const [editor,setEditor]=useState<CompanyForm|null>(null);
  const [selected,setSelected]=useState<Company|null>(null);
  const [saving,setSaving]=useState(false);
  const [confirmText,setConfirmText]=useState('');
  const [target,setTarget]=useState('');
  const [migrationPreview,setMigrationPreview]=useState<any|null>(null);
  const companies=useQuery({queryKey:['admin-all-companies'],queryFn:async()=>(await http.get('/admin/companies')).data as Company[],enabled:session.isSuperAdmin});
  const impact=useQuery({queryKey:['company-impact',selected?._id],queryFn:async()=>(await http.get(`/admin/companies/${selected?._id}/impact`)).data as Impact,enabled:!!selected});
  const active=useMemo(()=>companies.data?.filter(c=>c.active)||[],[companies.data]);
  const reload=async()=>{
    await client.invalidateQueries({queryKey:['admin-all-companies']});
    await client.invalidateQueries({queryKey:['company-impact']});
    await client.invalidateQueries({queryKey:['auth']});
    refresh();
  };
  const saveCompany=async(e:React.FormEvent)=>{
    e.preventDefault();if(!editor)return;
    setSaving(true);
    const data={name:editor.name.trim(),code:editor.code.trim().toUpperCase(),vertical:editor.vertical,currency:editor.currency,enabledModules:editor.enabledModules};
    try{
      if(editor._id){
        const {code:immutableCode,...updates}=data;
        try{await http.patch(`/admin/companies/${editor._id}`,updates);}catch(error:any){
          if(/Existing data may become inaccessible/.test(error?.message||'')){
            if(!window.confirm('This change hides existing data in disabled modules. Back up the company first. Continue?'))return;
            await http.patch(`/admin/companies/${editor._id}`,{...updates,acknowledgeImpact:true});
          }else throw error;
        }
      }else await http.post('/admin/companies',data);
      await reload();toast.success(editor._id?'Company and module access updated':'Company created');setEditor(null);
    }catch(error:any){toast.error(error.message);}finally{setSaving(false);}
  };
  const perform=async(action:'deactivate'|'reactivate'|'delete')=>{
    if(!selected)return;
    if(action==='delete' && confirmText!==`DELETE ${selected.code}`)return toast.error(`Type DELETE ${selected.code}`);
    if(action==='deactivate' && confirmText!==selected.code)return toast.error(`Type ${selected.code}`);
    setSaving(true);
    try{
      if(action==='delete')await http.delete(`/admin/companies/${selected._id}`,{data:{confirmation:confirmText,acknowledgeExport:true}});
      else await http.post(`/admin/companies/${selected._id}/${action}`,{confirmation:confirmText});
      await reload();toast.success(action==='delete'?'Empty company removed':'Company status updated');setSelected(null);setConfirmText('');
    }catch(error:any){toast.error(error.message);}finally{setSaving(false);}
  };
  const exportCompany=async()=>{
    if(!selected)return;setSaving(true);
    try{
      const response=await http.get(`/admin/companies/${selected._id}/export`,{responseType:'blob',timeout:120000});
      const url=URL.createObjectURL(new Blob([response.data],{type:'application/gzip'}));
      const a=document.createElement('a');a.href=url;a.download=`${selected.code}-backup.tar.gz`;document.body.append(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),120000);
      toast.success('Backup archive downloaded. Store it securely.');
    }catch(error:any){toast.error(error.message);}finally{setSaving(false);}
  };
  const previewMigration=async(companyId:string)=>{
    if(!selected||!companyId)return;
    setTarget(companyId);setMigrationPreview(null);
    try{setMigrationPreview((await http.get(`/admin/companies/${selected._id}/migration-preview`,{params:{targetCompanyId:companyId}})).data);}
    catch(error:any){toast.error(error.message);}
  };
  const migrate=async()=>{
    if(!selected||!target||!migrationPreview?.eligible)return;
    if(confirmText!==`MIGRATE ${selected.code}`)return toast.error(`Type MIGRATE ${selected.code}`);
    setSaving(true);
    try{await http.post(`/admin/companies/${selected._id}/migrate-operations`,{targetCompanyId:target,confirmation:confirmText});
      await reload();setMigrationPreview(null);setConfirmText('');toast.success('Operations records moved atomically. Other modules were not changed.');
    }catch(error:any){toast.error(error.message);}finally{setSaving(false);}
  };
  const toggle=(module:string,checked:boolean)=>setEditor(prev=>prev?{...prev,enabledModules:checked?[...prev.enabledModules,module]:prev.enabledModules.filter(x=>x!==module)}:prev);
  if(!session.isSuperAdmin)return <p>Only Super Admin can manage company settings.</p>;
  return <div className="company-management">
    <div className="company-management-heading"><div><h3>Company directory</h3><p className="muted">Each company has its own enabled modules and isolated data. Change a vertical's default modules at any time.</p></div><button type="button" className="button primary" onClick={()=>setEditor(blank())}><Plus size={16}/> New company</button></div>
    {companies.isPending?<Loader/>:companies.error?<ErrorState error={companies.error}/>:<div className="company-cards company-management-grid">{companies.data?.map(c=><div className="company-card company-management-card" key={c._id}>
      <div className="company-card-title"><Building2 size={20}/><strong>{c.name}</strong></div>
      <span className="muted tiny">{c.vertical||'General Business'} · {c.code} · {c.currency}</span>
      <Status value={c.active?'active':'inactive'}/>
      <div className="company-module-pills">{(c.enabledModules||[]).map(m=><span className="company-module-pill" key={m}>{MODULES.find(x=>x[0]===m)?.[1]||m}</span>)}</div>
      <div className="company-card-buttons"><button className="button secondary compact" onClick={()=>setEditor({_id:c._id,name:c.name,code:c.code,vertical:c.vertical,currency:c.currency,enabledModules:[...(c.enabledModules||[])]})}><Edit3 size={14}/> Edit & modules</button><button className="button secondary compact" onClick={()=>{setSelected(c);setConfirmText('');setMigrationPreview(null);setTarget('');}}><FolderArchive size={14}/> Manage data</button></div>
    </div>)}</div>}
    {editor&&<Drawer title={editor._id?`Edit ${editor.name}`:'Create company'} onClose={()=>setEditor(null)} width="570px"><form className="record-form company-form" onSubmit={saveCompany}>
      <label>Company name<input required minLength={2} maxLength={120} value={editor.name} onChange={e=>setEditor(p=>p&&({...p,name:e.target.value}))}/></label>
      <label>Company code<input required minLength={2} maxLength={15} disabled={!!editor._id} value={editor.code} onChange={e=>setEditor(p=>p&&({...p,code:e.target.value.toUpperCase()}))}/></label>
      <label>Business vertical<select value={editor.vertical} onChange={e=>setEditor(p=>p&&({...p,vertical:e.target.value,enabledModules:p._id?p.enabledModules:defaults(e.target.value)}))}>{VERTICALS.map(v=><option value={v} key={v}>{v}</option>)}</select></label>
      <label>Base currency<select value={editor.currency} onChange={e=>setEditor(p=>p&&({...p,currency:e.target.value}))}>{['INR','AED','SAR','USD'].map(v=><option key={v}>{v}</option>)}</select></label>
      <section className="company-module-section"><h3>Enabled modules</h3><p className="muted tiny">The vertical fills defaults only. For example, Advisory may enable Products and Projects independently.</p><div className="company-module-options">
        {MODULES.map(([key,label])=><label key={key} className="company-module-option"><input type="checkbox" checked={editor.enabledModules.includes(key)} onChange={e=>toggle(key,e.target.checked)}/><span>{label}</span></label>)}
      </div><p className="muted tiny">Home, Today and Settings remain available. Team members still need individual module permissions.</p></section>
      <div className="member-edit-footer"><button type="button" className="button secondary" onClick={()=>setEditor(null)}>Cancel</button><button className="button primary" disabled={saving}>{saving?'Saving…':editor._id?'Save company changes':'Create company'}</button></div>
    </form></Drawer>}
    {selected&&<Drawer title={`Company controls · ${selected.name}`} onClose={()=>{setSelected(null);setConfirmText('');}} width="590px">
      <div className="company-lifecycle">
        {impact.isPending?<Loader/>:impact.error?<ErrorState error={impact.error}/>:<>
          <div className="company-impact-heading"><ShieldAlert size={20}/><div><strong>Review company data before changes</strong><p className="muted tiny">Export includes database records and private uploaded documents. Historical finance/audit data is preserved.</p></div></div>
          <div className="company-impact-stats">{Object.entries(impact.data?.counts||{}).map(([name,count])=><div key={name}><span>{name}</span><strong>{count}</strong></div>)}</div>
          <p className="muted tiny">Pending approvals: {impact.data?.pendingApprovals||0} · Open invoices: {impact.data?.openInvoices||0} · Open expenses: {impact.data?.openExpenses||0} · External transfers: {impact.data?.incomingTransfers||0}</p>
          <button type="button" className="button secondary full" disabled={saving} onClick={()=>void exportCompany()}><Download size={16}/> Download complete company backup (.tar.gz)</button>
          <section className="company-lifecycle-section"><h3>Migrate supported records</h3><p className="muted tiny">Operations only: Work Board tasks, updates and Calendar events. Finance, Learning, Advisory and other linked records remain in the source and can be exported.</p>
            <label>Destination company<select value={target} onChange={e=>void previewMigration(e.target.value)}><option value="">Select destination</option>{active.filter(c=>c._id!==selected._id).map(c=><option key={c._id} value={c._id}>{c.name}</option>)}</select></label>
            {migrationPreview&&<div className="company-migration-summary"><strong>{migrationPreview.tasks} tasks · {migrationPreview.events} events · {migrationPreview.taskUpdates} updates</strong><p className="muted tiny">{migrationPreview.eligible?'Eligible to migrate. Confirm below.':`Resolve ${migrationPreview.blockingApprovals||0} task approval(s) and assign users to the destination first: ${(migrationPreview.unassignedUsers||[]).join(', ')}`}</p></div>}
            {migrationPreview?.eligible&&<button type="button" className="button secondary full" disabled={saving||confirmText!==`MIGRATE ${selected.code}`} onClick={()=>void migrate()}><ArrowRightLeft size={16}/> Migrate Operations records</button>}
          </section>
          <section className="company-lifecycle-section"><h3>Deactivate / reactivate</h3><p className="muted tiny">Deactivated companies disappear from user selectors and cannot be used for new records. Existing data is retained.</p>
            {selected.active?<button type="button" className="button secondary full" disabled={saving||confirmText!==selected.code} onClick={()=>void perform('deactivate')}><Archive size={16}/> Deactivate company</button>:<button type="button" className="button secondary full" disabled={saving} onClick={()=>void perform('reactivate')}><RefreshCw size={16}/> Reactivate company</button>}
          </section>
          <section className="company-lifecycle-section danger-zone"><h3>Permanent deletion</h3><p className="muted tiny">Only empty companies can be deleted. The API blocks deletion when business records, uploaded files, posted journals or cross-company references exist.</p>
            <button type="button" className="button danger full" disabled={!impact.data?.deletionEligible||saving||confirmText!==`DELETE ${selected.code}`} onClick={()=>void perform('delete')}><Trash2 size={16}/> Delete empty company</button>
            {!impact.data?.deletionEligible&&<p className="muted tiny">Not eligible for deletion. Export and deactivate instead.</p>}
          </section>
          <label>Confirmation<input value={confirmText} onChange={e=>setConfirmText(e.target.value)} placeholder={`Type ${selected.code}, MIGRATE ${selected.code}, or DELETE ${selected.code}`}/></label>
        </>}
      </div>
    </Drawer>}
  </div>;
}
