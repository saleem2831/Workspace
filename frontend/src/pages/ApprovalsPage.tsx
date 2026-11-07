import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { BadgeCheck, Check, Clock3, FileText, UserRoundCog, X } from 'lucide-react';
import { useWorkspace } from '../App';
import { dateText, fetchRecords, http, money } from '../api';
import { Empty, ErrorState, Loader, PageHead, Panel, Stat, Status, Tabs, Toolbar, useToast } from '../components/UI';

const isEligible = (member: any) => ['owner','super_admin'].includes(member.role) || (member.role==='team' && (member.permissions||[]).includes('approvals:write'));

export default function ApprovalsPage(){
  const { company, session }=useWorkspace();
  const toast=useToast();
  const query=useQueryClient();
  const [tab,setTab]=useState('pending');
  const [selected,setSelected]=useState<any|null>(null);
  const [search,setSearch]=useState('');
  const [reason,setReason]=useState('');
  const [busy,setBusy]=useState(false);
  const [reassignOpen,setReassignOpen]=useState(false);
  const [newReviewerIds,setNewReviewerIds]=useState<string[]>([]);
  const q=useQuery({queryKey:['records','approvals',company],queryFn:()=>fetchRecords('approvals',{limit:200}),staleTime:15000,refetchInterval:30000});
  const approvalCompany=String(selected?.companyId||'');
  const role=session.roles[approvalCompany];
  const approverPermission=(session.permissions?.[approvalCompany]||[]).includes('approvals:write');
  const hasApproverRole=['owner','super_admin'].includes(role) || (role==='team'&&approverPermission);
  const owner=role==='owner'||!!session.isSuperAdmin;
  const selfRequest=selected && String(selected.requestedBy)===session.user.id;
  const assigned= !selected?.reviewerIds?.length || selected.reviewerIds.some((id:any)=>String(id)===session.user.id);
  const canDecide=selected?.status==='pending' && !selfRequest && hasApproverRole && assigned;
  const context=useQuery({queryKey:['approval-context',selected?._id],queryFn:async()=>(await http.get(`/workflows/approvals/${selected._id}/context`)).data,enabled:!!selected,staleTime:30000});
  const members=useQuery({queryKey:['approval-members',approvalCompany],queryFn:async()=>(await http.get('/admin/members',{headers:{'x-company-id':approvalCompany}})).data as any[],enabled:!!selected&&owner&&reassignOpen,staleTime:30000});
  const eligible=(members.data||[]).filter((m:any)=>m._id!==String(selected?.requestedBy) && isEligible(m));
  const items=(q.data?.items||[]).filter((x:any)=>(tab==='all'||x.status===tab) && String(x.title||'').toLowerCase().includes(search.toLowerCase()));
  useEffect(()=>{setReassignOpen(false);setNewReviewerIds([]);setReason('');},[selected?._id]);
  async function decision(choice:'approved'|'rejected'){
    if(!selected || !canDecide) return;
    if(choice==='rejected' && !reason.trim())return toast.error('Enter a reason before rejecting');
    setBusy(true);
    try {
      await http.post(`/workflows/approvals/${selected._id}/decision`,{decision:choice,reason},{headers:{'x-company-id':approvalCompany}});
      await query.invalidateQueries({queryKey:['records','approvals']});
      await query.invalidateQueries({queryKey:['notification-count']});
      await query.invalidateQueries({queryKey:['records','capitalMovements']});
      toast.success(choice==='approved'?'Approved successfully':'Request rejected');setSelected(null);
    }catch(e:any){toast.error(e.message);}finally{setBusy(false);}
  }
  async function reassign(){
    if(!selected || !owner || newReviewerIds.length===0)return;
    setBusy(true);
    try {
      await http.post(`/workflows/approvals/${selected._id}/reassign`,{reviewerIds:newReviewerIds},{headers:{'x-company-id':approvalCompany}});
      await Promise.all([query.invalidateQueries({queryKey:['records','approvals']}),query.invalidateQueries({queryKey:['notification-count']})]);
      toast.success('Reviewers updated. Assigned members can now approve or reject.');
      setSelected(null);
    }catch(e:any){toast.error(e.message);}finally{setBusy(false);}
  }
  const counts=(q.data?.items||[]);
  return <>
    <PageHead title="Approval inbox" subtitle="Review pending requests, assign authorized reviewers and record decisions."/>
    <div className="stat-grid four">
      <Stat label="Pending" value={counts.filter((x:any)=>x.status==='pending').length} icon={Clock3}/>
      <Stat label="Approved" value={counts.filter((x:any)=>x.status==='approved').length} icon={BadgeCheck} tone="green"/>
      <Stat label="Rejected" value={counts.filter((x:any)=>x.status==='rejected').length} icon={X} tone="red"/>
      <Stat label="All requests" value={q.data?.total||0} icon={FileText} tone="blue"/>
    </div>
    <div className="approval-layout">
      <Panel title="Requests" className="approval-list-panel">
        <Tabs active={tab} onChange={setTab} items={['pending','approved','rejected','all'].map(t=>({key:t,label:t[0].toUpperCase()+t.slice(1)}))}/>
        <Toolbar search={search} setSearch={setSearch}/>
        {q.isPending?<Loader/>:q.error?<ErrorState error={q.error}/>:items.length?<div className="approval-list">
          {items.map((x:any)=><button type="button" key={x._id} className={`approval-item ${selected?._id===x._id?'selected':''}`} onClick={()=>setSelected(x)}>
            <div className="approval-row-top"><strong>{x.title}</strong><Status value={x.status}/></div>
            <span>{x.recordType} · {money(x.amount,x.currency)}</span><small>Requested {dateText(x.createdAt)}</small>
          </button>)}
        </div>:<Empty text="No matching approval requests"/>}
      </Panel>
      <Panel title="Request details" className="approval-details-panel">
        {selected?<div className="record-detail">
          <h2>{selected.title}</h2><Status value={selected.status}/>
          <div className="detail-grid">
            <label><span>Transaction type</span><b>{selected.recordType}</b></label>
            <label><span>Amount</span><b>{money(selected.amount,selected.currency)}</b></label>
            <label><span>Requested</span><b>{dateText(selected.createdAt)}</b></label>
            <label><span>Last reviewed</span><b>{dateText(selected.reviewedAt)}</b></label>
          </div>
          {selected.status==='pending' && <div className="approval-decision-panel">
            {selfRequest?<div className="approval-guidance" role="alert"><strong>Approval requires another person</strong><p>You created this request. For financial safety, requesters cannot approve or reject their own transactions. Assign another authorized reviewer, then have them sign in.</p></div>
             :!hasApproverRole?<div className="approval-guidance">You need an Owner role or Approvals edit permission for this company to decide.</div>
             :!assigned?<div className="approval-guidance">This request is assigned to a different reviewer. An Owner can reassign it below.</div>:null}
            {canDecide&&<><label className="form-label">Decision comment / rejection reason<textarea rows={3} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Enter a reason when rejecting"/></label>
              <div className="decision-buttons"><button type="button" className="button primary" disabled={busy} onClick={()=>void decision('approved')}><Check size={16}/> Approve</button><button type="button" className="button danger" disabled={busy||!reason.trim()} onClick={()=>void decision('rejected')}><X size={16}/> Reject</button></div></>}
            {owner&&<div className="reviewer-reassign"><button type="button" className="button secondary" onClick={()=>setReassignOpen(v=>!v)}><UserRoundCog size={15}/> {reassignOpen?'Close reviewer selection':'Reassign approvers'}</button>
              {reassignOpen&&<div className="reviewer-reassign-fields"><p className="muted">Select one or more eligible members. Any one can decide. The requester is excluded.</p>
                {members.isPending?<Loader/>:members.error?<ErrorState error={members.error}/>:eligible.length?eligible.map((m:any)=><label key={m._id} className="reviewer-choice"><input type="checkbox" checked={newReviewerIds.includes(m._id)} onChange={e=>setNewReviewerIds(old=>e.target.checked?[...old,m._id]:old.filter(id=>id!==m._id))}/><span>{m.name}<small>{m.email} · {m.role}</small></span></label>):<p className="muted">No eligible reviewers in this company. Add another Owner or give a Team member Approvals edit permission.</p>}
                <button type="button" className="button primary" disabled={busy||!newReviewerIds.length} onClick={()=>void reassign()}>Save reviewer assignment</button>
              </div>}</div>}
          </div>}
          <div className="workflow-box"><h3>Source of approval</h3>
            {context.data?<><p><b>Module:</b> {context.data.sourceModule}</p><p><b>Requested for:</b> {context.data.recordTitle}</p><p><b>Source company:</b> {context.data.sourceCompany}</p>{context.data.targetCompany&&<p><b>Destination:</b> {context.data.targetCompany}</p>}<p><b>Record status:</b> {context.data.recordStatus}</p></>:<p className="muted">{context.isPending?'Loading source…':context.error?'Source details unavailable':'No source record'}</p>}
          </div>
          {selected.rejectionReason&&<p className="form-error">Rejection: {selected.rejectionReason}</p>}
        </div>:<div className="empty big-empty"><FileText size={30}/><strong>Select an approval request</strong><p>Open a request to see its details and available actions.</p></div>}
      </Panel>
    </div>
  </>;
}
