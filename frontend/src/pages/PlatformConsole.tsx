import {useEffect,useState} from 'react';
import type {FormEvent} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {Building2,Plus,ShieldCheck,Database,HardDrive,CheckCircle2,AlertTriangle,Users,Settings2,CreditCard,ExternalLink,Copy,RefreshCw,Archive,UserRound,Mail} from 'lucide-react';
import {http} from '../api';
import {useWorkspace} from '../App';
import {useLocale} from '../i18n';
import ThemePicker,{type ThemeId} from '../components/ThemePicker';
import PlatformSettingsPanel from './PlatformSettingsPanel';
import './saas.css';

type Plan={_id:string;name:string;code:string;maxUsers:number;maxCompanies:number;storageLimitBytes:number;aiMonthlyCredits:number;monthlyPriceMinor:number;currency:string;active:boolean};
type Subscription={planId:string;status:string;provider?:string;currentPeriodEnd?:string};
type Tenant={_id:string;name:string;slug:string;subdomain?:string;tenantUrl?:string|null;status:'active'|'suspended'|'archived';defaultLocale?:'en'|'ar';themeId?:ThemeId;primaryContactEmail?:string;subscription?:Subscription|null};
type TenantUser={userId:string;name:string;email:string;accountActive:boolean;tenantActive:boolean;tenantRole:string;mfaEnabled:boolean;companies:{companyId:string;role:string}[]};
type Migration={_id:string;kind:'database'|'storage';sourceLabel:string;targetLabel:string;reason:string;status:string;requestedBy:string;approvedBy?:string;createdAt:string};
type Invite={token:string;workspace:string;email:string};
type View='overview'|'users'|'subscription'|'lifecycle';
const pathForInvite=(inv:Invite)=>{
  const url=new URL('/invite',window.location.origin);
  url.hash=new URLSearchParams({token:inv.token,workspace:inv.workspace,email:inv.email}).toString();
  return url.toString();
};
const humanMoney=(n:number,c:string)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:c||'INR',maximumFractionDigits:2}).format((n||0)/100);

export default function PlatformConsole(){
  const {session}=useWorkspace();const {t,formatDate}=useLocale();
  const cache=useQueryClient();const isOwner=!!session.isPlatformOwner;
  const plans=useQuery({queryKey:['platform','plans'],queryFn:async()=>(await http.get<Plan[]>('/platform/plans')).data,retry:false});
  const platformDefaults=useQuery({queryKey:['platform','settings'],queryFn:async()=>(await http.get<{defaultLocale:'en'|'ar';defaultTheme:ThemeId}>('/platform/settings')).data,retry:false});
  const tenants=useQuery({queryKey:['platform','tenants'],queryFn:async()=>(await http.get<Tenant[]>('/platform/tenants')).data,retry:false});
  const [showMigrations,setShowMigrations]=useState(false);
  const migrations=useQuery({queryKey:['platform','migrations'],enabled:isOwner&&showMigrations,queryFn:async()=>(await http.get<Migration[]>('/platform/migrations')).data,retry:false});
  const [selectedId,setSelectedId]=useState('');
  const selected=tenants.data?.find(x=>x._id===selectedId);
  const users=useQuery({queryKey:['platform','users',selectedId],enabled:!!selectedId&&isOwner,queryFn:async()=>(await http.get<TenantUser[]>(`/platform/tenants/${selectedId}/users`)).data,retry:false});
  const [view,setView]=useState<View>('overview');
  const [name,setName]=useState('');const [slug,setSlug]=useState('');const [subdomain,setSubdomain]=useState('');
  const [initialCompany,setInitialCompany]=useState('');const [ownerEmail,setOwnerEmail]=useState('');
  const [defaultLocale,setDefaultLocale]=useState<'en'|'ar'>('en');const [newTheme,setNewTheme]=useState<ThemeId>('violet');const [planId,setPlanId]=useState('');
  const [invite,setInvite]=useState<Invite|null>(null);
  const [err,setErr]=useState('');const [message,setMessage]=useState('');const [loading,setLoading]=useState(false);
  const [detailsName,setDetailsName]=useState('');const [detailsEmail,setDetailsEmail]=useState('');const [detailsLocale,setDetailsLocale]=useState<'en'|'ar'>('en');const [detailsTheme,setDetailsTheme]=useState<ThemeId>('violet');
  const [detailsSubdomain,setDetailsSubdomain]=useState('');const [newPlan,setNewPlan]=useState('');const [newStatus,setNewStatus]=useState('active');
  const [planCode,setPlanCode]=useState('');const [planName,setPlanName]=useState('');const [maxCompanies,setMaxCompanies]=useState(3);
  const [maxUsers,setMaxUsers]=useState(10);const [storageGB,setStorageGB]=useState(5);const [credits,setCredits]=useState(0);
  const [price,setPrice]=useState(2999);const [currency,setCurrency]=useState('INR');
  const [editingPlan,setEditingPlan]=useState<string|null>(null);const [planActive,setPlanActive]=useState(true);
  const [editingUser,setEditingUser]=useState('');const [userName,setUserName]=useState('');const [userEmail,setUserEmail]=useState('');const [userActive,setUserActive]=useState(true);
  const [kind,setKind]=useState<'database'|'storage'>('database');const [sourceLabel,setSourceLabel]=useState('Production primary');
  const [targetLabel,setTargetLabel]=useState('New cluster or bucket');const [reason,setReason]=useState('');
  useEffect(()=>{
    if(!platformDefaults.data||name||slug)return;
    setDefaultLocale(platformDefaults.data.defaultLocale||'en');
    setNewTheme(platformDefaults.data.defaultTheme||'violet');
  },[platformDefaults.data]);
  useEffect(()=>{
    if(!selected)return;
    setDetailsName(selected.name);setDetailsEmail(selected.primaryContactEmail||'');setDetailsLocale(selected.defaultLocale||'en');setDetailsTheme(selected.themeId||'violet');
    setDetailsSubdomain(selected.subdomain||selected.slug);setNewPlan(String(selected.subscription?.planId||''));
    setNewStatus(selected.subscription?.status||'active');setEditingUser('');
  },[selectedId,selected?.name,selected?.primaryContactEmail,selected?.subdomain,selected?.defaultLocale,selected?.themeId,selected?.subscription?.planId,selected?.subscription?.status]);
  const resetFeedback=()=>{setErr('');setMessage('');};
  const refresh=async()=>{await cache.invalidateQueries({queryKey:['platform']});};
  const act=async(task:()=>Promise<unknown>,success:string)=>{
    resetFeedback();setLoading(true);
    try{await task();await refresh();setMessage(success);}catch(e:any){setErr(e.message||'Request failed');}finally{setLoading(false);}
  };
  const copy=async(value:string)=>{try{await navigator.clipboard.writeText(value);setMessage('Copied to clipboard');}catch{setErr('Could not copy. Select and copy the text manually.');}};
  const create=async(e:FormEvent)=>{e.preventDefault();setInvite(null);
    await act(async()=>{
      const r=await http.post('/platform/tenants',{name,slug,subdomain:subdomain||undefined,initialCompanyName:initialCompany||undefined,
        ownerEmail,defaultLocale,themeId:newTheme,planId:planId||plans.data?.find(p=>p.active)?._id});
      setInvite({token:r.data.inviteToken,workspace:r.data.slug,email:ownerEmail.toLowerCase()});
      setName('');setSlug('');setOwnerEmail('');setSubdomain('');setInitialCompany('');setNewTheme(platformDefaults.data?.defaultTheme||'violet');setSelectedId(r.data.tenantId);
    },'Tenant created. The invited administrator must activate the one-time invitation before logging in.');
  };
  const resetPlan=()=>{setEditingPlan(null);setPlanCode('');setPlanName('');setPlanActive(true);setMaxCompanies(3);setMaxUsers(10);setStorageGB(5);setCredits(0);setPrice(2999);setCurrency('INR');};
  const selectPlan=(p:Plan)=>{setEditingPlan(p._id);setPlanCode(p.code);setPlanName(p.name);setMaxCompanies(p.maxCompanies);setMaxUsers(p.maxUsers);setStorageGB(Number((p.storageLimitBytes/1024**3).toFixed(2)));setCredits(p.aiMonthlyCredits);setPrice(p.monthlyPriceMinor/100);setCurrency(p.currency);setPlanActive(p.active);};
  const makePlan=async(e:FormEvent)=>{e.preventDefault();
    if(editingPlan && !confirm(`Update ${planCode}? Changes to an assigned plan may affect its tenants; no customer will be charged automatically.`))return;
    await act(async()=>{
      // AI credits are an entitlement field only in v6.2.x; no metered AI calls are deducted yet.
      const body={name:planName,maxCompanies,maxUsers,storageLimitBytes:Math.round(storageGB*1024**3),aiMonthlyCredits:credits,monthlyPriceMinor:Math.round(price*100),currency};
      if(editingPlan)await http.patch(`/platform/plans/${editingPlan}`,{...body,active:planActive,confirmation:planCode});
      else await http.post('/platform/plans',{...body,code:planCode});
      resetPlan();
    },editingPlan?'Subscription plan updated. Existing subscriptions remain in place.':'Subscription plan created. Billing is manual metadata only.');
  };
  const deletePlan=async(p:Plan)=>{
    if(prompt(`Only unused plans can be removed. Type DELETE ${p.code} to confirm.`)!==`DELETE ${p.code}`)return;
    await act(async()=>{await http.delete(`/platform/plans/${p._id}`,{data:{confirmation:`DELETE ${p.code}`}});if(editingPlan===p._id)resetPlan();},'Unused subscription plan deleted.');
  };
  const updateTenantTheme=async()=>{if(!selected)return;
    await act(()=>http.patch(`/platform/tenants/${selected._id}/theme`,{themeId:detailsTheme,confirmation:selected.slug}),'Tenant colour theme updated. Members see the change after session refresh.');
  };
  const updateDetails=async(e:FormEvent)=>{e.preventDefault();if(!selected)return;
    if(!confirm(`Update tenant details for ${selected.slug}?`))return;
    await act(()=>http.patch(`/platform/tenants/${selected._id}`,{name:detailsName,primaryContactEmail:detailsEmail,
      defaultLocale:detailsLocale,confirmation:selected.slug}),'Tenant details updated. Login emails are managed separately.');};
  const updateSubdomain=async()=>{if(!selected)return;
    if(!confirm('Save subdomain metadata? Live access requires wildcard DNS, TLS and routing configuration.'))return;
    await act(()=>http.patch(`/platform/tenants/${selected._id}/subdomain`,{subdomain:detailsSubdomain,confirmation:selected.slug}),
      'Subdomain saved. Configure DNS, HTTPS certificate and reverse proxy before use.');};
  const updateSubscription=async(e:FormEvent)=>{e.preventDefault();if(!selected)return;
    if(!confirm(`Apply ${newStatus} subscription and selected plan to ${selected.slug}? This does not charge a card.`))return;
    await act(()=>http.patch(`/platform/tenants/${selected._id}/subscription`,{planId:newPlan,status:newStatus,confirmation:selected.slug}),
      'Manual subscription metadata updated. No payment was captured.');};
  const changeStatus=async(status:Tenant['status'])=>{if(!selected)return;
    const code=prompt(`Type the workspace code ${selected.slug} to ${status} this tenant.`);if(code!==selected.slug)return;
    await act(()=>http.patch(`/platform/tenants/${selected._id}/status`,{status,confirmation:code}),`Tenant is now ${status}.`);};
  const deleteEmpty=async()=>{if(!selected)return;const confirmation=`DELETE EMPTY ${selected.slug}`;
    if(prompt(`Permanent deletion is allowed only for eligible empty archived tenants. Type ${confirmation} to continue.`)!==confirmation)return;
    await act(async()=>{await http.delete(`/platform/tenants/${selected._id}`,{data:{confirmation}});setSelectedId('');},
      'Eligible empty tenant deleted. Tenants containing members or records must be archived and exported instead.');};
  const reissue=async()=>{if(!selected)return;
    if(prompt(`Reissue invitation and revoke previous unclaimed tokens? Type ${selected.slug}`)!==selected.slug)return;
    setInvite(null);
    await act(async()=>{const r=await http.post(`/platform/tenants/${selected._id}/reissue-invite`,{confirmation:selected.slug});
      setInvite({token:r.data.inviteToken,email:r.data.email,workspace:selected.slug});},
      'Invitation reissued. The previous unclaimed invitation is revoked. Share the new URL securely.');};
  const editMember=(user:TenantUser)=>{setEditingUser(user.userId);setUserName(user.name);setUserEmail(user.email);setUserActive(user.tenantActive);resetFeedback();};
  const updateMember=async(e:FormEvent)=>{e.preventDefault();if(!selected||!editingUser)return;
    if(prompt(`Type workspace code ${selected.slug} to confirm name and tenant access changes.`)!==selected.slug)return;
    await act(()=>http.patch(`/platform/tenants/${selected._id}/users/${editingUser}`,{name:userName,tenantActive:userActive,confirmation:selected.slug}),
      'Tenant user updated and existing sessions revoked.');};
  const updateMemberEmail=async()=>{if(!selected||!editingUser)return;
    const previous=users.data?.find(u=>u.userId===editingUser)?.email;
    if(!previous||userEmail.toLowerCase()===previous.toLowerCase())return;
    if(prompt(`Changing a login email affects account recovery. Confirm the user's identity and verify mailbox ownership separately. Type current email ${previous}.`)!==previous)return;
    await act(()=>http.patch(`/platform/tenants/${selected._id}/users/${editingUser}/email`,{email:userEmail,confirmation:previous}),
      'Login email changed and sessions revoked. Verify the new mailbox before enabling account recovery.');};
  const createMigration=async(e:FormEvent)=>{e.preventDefault();await act(async()=>{
    const r=await http.post('/platform/migrations',{kind,sourceLabel,targetLabel,reason});setReason('');
    setMessage(`Plan ${r.data.id} created; approval by a different MFA-enabled Platform Owner is required.`);
  },'Migration plan created. Independent approval and offline execution required.');};
  const approve=async(id:string)=>{if(!confirm('Approve for OFFLINE execution only? Confirm backups and maintenance readiness.'))return;
    await act(()=>http.post(`/platform/migrations/${id}/approve`,{confirmation:'APPROVE MIGRATION'}),
      'Approved. Execution is restricted to the secured offline migration CLI.');};

  return <div className="saas-page">
    <div className="saas-heading"><div><h1>{t('Platform operations')}</h1><p>{t('Customer provisioning, subscription plans and tenant administration. No unrestricted access to private business records.')}</p></div>
      <span className="saas-pill"><ShieldCheck size={15}/>{isOwner?'Platform Owner':'Platform Operator'} · MFA</span></div>
    {err&&<div className="saas-alert error" role="alert">{err}</div>}{message&&<div className="saas-alert success" role="status">{message}</div>}
    <div className="saas-grid">
      <section className="saas-panel"><header><Plus/><div><h2>{t('Create a customer workspace')}</h2><p>Creates a tenant, initial company and one-time Super Admin invitation.</p></div></header>
        <form onSubmit={create} className="saas-form">
          <label>{t('Customer name')}<input required minLength={2} value={name} onChange={e=>setName(e.target.value)}/></label>
          <label>{t('Workspace code')}<input required pattern="[a-z0-9-]{2,80}" value={slug} onChange={e=>{setSlug(e.target.value.toLowerCase());if(!subdomain)setSubdomain('');}} placeholder="advancerex"/></label>
          <label>{t('Super Admin email')}<input type="email" required value={ownerEmail} onChange={e=>setOwnerEmail(e.target.value)}/></label>
          <label>Initial company name (optional)<input value={initialCompany} onChange={e=>setInitialCompany(e.target.value)} placeholder="Example: Customer Primary"/></label>
          <label>Tenant subdomain (optional)<input value={subdomain} onChange={e=>setSubdomain(e.target.value.toLowerCase())} placeholder={slug||'customer'}/><small>Defaults to workspace code. Requires SAAS_BASE_DOMAIN, wildcard DNS, TLS and same-origin routing.</small></label>
          <label>{t('Language')}<select value={defaultLocale} onChange={e=>setDefaultLocale(e.target.value as 'en'|'ar')}><option value="en">English</option><option value="ar">العربية</option></select></label>
          <label>Workspace colour theme<ThemePicker value={newTheme} onChange={setNewTheme}/></label>
          <label>{t('Subscription plan')}<select required value={planId||plans.data?.find(p=>p.active)?._id||''} onChange={e=>setPlanId(e.target.value)}>{(plans.data||[]).filter(x=>x.active).map(x=><option key={x._id} value={x._id}>{x.name} · {x.maxCompanies} companies · {x.maxUsers} seats</option>)}</select></label>
          <button className="button primary" disabled={loading||!plans.data?.some(p=>p.active)}>{t('Create tenant and invitation')}</button>
        </form>
        {invite&&<div className="saas-preview" role="status"><strong>New Super Admin activation link</strong><p>Workspace: <b>{invite.workspace}</b> · Invited email: <b>{invite.email}</b></p>
          <input readOnly aria-label="One-time activation link" value={pathForInvite(invite)} onFocus={e=>e.target.select()}/>
          <div className="saas-actions"><button type="button" className="button secondary" onClick={()=>void copy(pathForInvite(invite))}><Copy size={15}/> Copy activation link</button>
          <a className="button secondary" href={pathForInvite(invite)} target="_blank" rel="noopener noreferrer"><ExternalLink size={15}/> Test activation</a></div>
          <details><summary>Show raw token (private)</summary><code style={{overflowWrap:'anywhere'}}>{invite.token}</code></details>
          <p>Invitation expires in 48 hours. The link must be opened and the account activated BEFORE password login. No automatic email was sent; share it securely. Never post the token in screenshots or chat.</p>
        </div>}
      </section>
      <section className="saas-panel"><header><Building2/><div><h2>{t('Tenant directory')}</h2><p>Select a tenant to manage its users, subscription, subdomain and lifecycle.</p></div></header>
        {tenants.isLoading?<p>Loading tenants…</p>:(tenants.data||[]).map(v=><button type="button" className={`saas-tenant saas-tenant-button ${selectedId===v._id?'is-selected':''}`} key={v._id}
          onClick={()=>{setSelectedId(v._id);setView('overview');resetFeedback();}}><strong>{v.name}</strong>
          <small>{v.slug} · {v.status} · {v.subscription?.status||'No subscription'}</small>
          {v.tenantUrl&&<small>{v.tenantUrl}</small>}</button>)}
        {!tenants.isLoading&&!tenants.data?.length&&<p>No tenants found.</p>}
        {tenants.isError&&<div className="saas-alert error">Platform Operator requires verified MFA and an active platform role.</div>}
        <p className="saas-note">Private customer business records require separate support authorization. Tenant management does not bypass customer permissions.</p>
      </section>
    </div>
    {isOwner&&<section className="saas-panel" style={{marginTop:18}}><header><CreditCard/><div><h2>Subscription plan catalogue</h2><p>Create SaaS plans with company, seat, storage and AI limits. Payment processing is not included.</p></div></header>
      <div className="saas-plan-list">{(plans.data||[]).map(p=><div className={`saas-plan ${p.active?'':'saas-plan-muted'}`} key={p._id}>
        <div className="saas-plan-head"><strong>{p.name}</strong><small>{p.active?'Active':'Inactive'}</small></div>
        <small>{p.code} · {p.maxCompanies} companies · {p.maxUsers} seats · {(p.storageLimitBytes/1024**3).toFixed(1)} GB · {humanMoney(p.monthlyPriceMinor,p.currency)}/month</small>
        <div className="saas-plan-actions"><button type="button" className="button secondary" disabled={loading} onClick={()=>selectPlan(p)}>Edit</button><button type="button" className="button danger" disabled={loading} onClick={()=>void deletePlan(p)}>Delete unused</button></div>
      </div>)}</div>
      <form className="saas-plan-form" onSubmit={makePlan}>
        <label>Plan code<input required disabled={!!editingPlan} pattern="[a-z0-9-]{2,40}" value={planCode} onChange={e=>setPlanCode(e.target.value.toLowerCase())} placeholder="business-growth"/></label>
        <label>Plan name<input required minLength={2} value={planName} onChange={e=>setPlanName(e.target.value)}/></label>
        <label>Companies<input required type="number" min={1} max={1000} value={maxCompanies} onChange={e=>setMaxCompanies(Number(e.target.value))}/></label>
        <label>Seats<input required type="number" min={1} max={100000} value={maxUsers} onChange={e=>setMaxUsers(Number(e.target.value))}/></label>
        <label>Storage (GB)<input type="number" min={0} max={100000} value={storageGB} onChange={e=>setStorageGB(Number(e.target.value))}/></label>
        <label>Monthly AI credits<input type="number" min={0} value={credits} onChange={e=>setCredits(Number(e.target.value))}/><span className="muted" style={{fontSize:12}}>Entitlement only in v6.2.x. AI requests are not metered or deducted yet.</span></label>
        <label>Price per month<input type="number" min={0} step="0.01" value={price} onChange={e=>setPrice(Number(e.target.value))}/></label>
        <label>Currency<select value={currency} onChange={e=>setCurrency(e.target.value)}>{['INR','USD','AED','SAR'].map(c=><option key={c}>{c}</option>)}</select></label>
        {editingPlan&&<label><input type="checkbox" checked={planActive} onChange={e=>setPlanActive(e.target.checked)} style={{width:18,minHeight:18}}/> Active for new subscriptions</label>}
        <div className="saas-plan-form-actions"><button className="button primary" disabled={loading}>{editingPlan?'Update subscription plan':'Create subscription plan'}</button>{editingPlan&&<button className="button secondary" type="button" onClick={resetPlan}>Cancel edit</button>}</div>
      </form>
    </section>}
    {selected&&<section className="saas-panel saas-management" style={{marginTop:18}}><header><Settings2/><div><h2>Manage tenant: {selected.name}</h2><p>Workspace code <strong>{selected.slug}</strong> · status {selected.status}</p></div></header>
      <div className="saas-tabs" role="tablist">{(['overview','users','subscription','lifecycle'] as const).map(tab=><button type="button" key={tab} role="tab" aria-selected={view===tab} className={view===tab?'active':''} onClick={()=>setView(tab)}>{tab==='overview'?'Details & domain':tab==='users'?'Tenant users':tab==='subscription'?'Subscription':'Lifecycle'}</button>)}</div>
      {!isOwner&&<p className="saas-note">Only Platform Owners can modify tenant information or billing. Platform Operators can create and view tenant records.</p>}
      {view==='overview'&&<div className="saas-details-grid"><form onSubmit={updateDetails} className="saas-form"><h3>Tenant details</h3>
        <label>Name<input disabled={!isOwner} required value={detailsName} onChange={e=>setDetailsName(e.target.value)}/></label>
        <label>Primary contact email<input disabled={!isOwner} required type="email" value={detailsEmail} onChange={e=>setDetailsEmail(e.target.value)}/></label>
        <label>Default language<select disabled={!isOwner} value={detailsLocale} onChange={e=>setDetailsLocale(e.target.value as 'en'|'ar')}><option value="en">English</option><option value="ar">العربية</option></select></label>
        <p className="saas-note">Changing contact email does not change a user's login email or resend an invitation.</p>
        {isOwner&&<button className="button primary" disabled={loading}>Save tenant details</button>}</form>
        <div className="saas-form"><h3>Tenant appearance & subdomain</h3>
          <p className="saas-note">This theme applies only to the selected customer workspace.</p>
          <ThemePicker value={detailsTheme} disabled={!isOwner} onChange={setDetailsTheme}/>
          {isOwner&&<button type="button" className="button secondary" disabled={loading} onClick={()=>void updateTenantTheme()}>Save tenant theme</button>}
          <h3 style={{marginTop:18}}>Tenant subdomain</h3><label>Subdomain<input value={detailsSubdomain} disabled={!isOwner} onChange={e=>setDetailsSubdomain(e.target.value.toLowerCase())}/></label>
          <p className="saas-note">The subdomain is metadata until wildcard DNS, HTTPS certificates and routing are configured. A workspace code is still required at login.</p>
          {selected.tenantUrl&&<p><a href={selected.tenantUrl} target="_blank" rel="noopener noreferrer">{selected.tenantUrl}</a></p>}
          {isOwner&&<button type="button" className="button secondary" disabled={loading} onClick={()=>void updateSubdomain()}>Save subdomain</button>}
          {isOwner&&<button type="button" className="button secondary" disabled={loading} onClick={()=>void reissue()}><RefreshCw size={15}/> Reissue unclaimed invitation</button>}
        </div></div>}
      {view==='users'&&<div><h3>Tenant users</h3><p className="saas-note">These users belong to {selected.name}. Platform Owners manage tenant membership, not private business records.</p>
        <div className="saas-user-table">{users.isLoading?<p>Loading users…</p>:(users.data||[]).map(u=><div key={u.userId} className="saas-user-row">
          <UserRound size={20}/><div><strong>{u.name}</strong><small>{u.email}</small><div className="saas-user-meta">
            <span className="saas-user-badge">{u.tenantRole==='super_admin'?'Super Admin':'Member'}</span>
            <span className="saas-user-badge">{u.tenantActive?'Active':'Disabled'}</span>
            <span className="saas-user-badge">MFA {u.mfaEnabled?'enabled':'not enabled'}</span>
          </div></div>{isOwner&&<button type="button" className="button secondary" onClick={()=>editMember(u)}>Edit user</button>}
        </div>)}</div>
        {!users.isLoading&&!users.data?.length&&<p>No users yet. The invited Super Admin must first activate their account.</p>}
        {editingUser&&isOwner&&<div className="saas-user-editor"><div className="saas-plan-head"><h3>Edit tenant user</h3><button className="button secondary" type="button" onClick={()=>setEditingUser('')}>Close editor</button></div>
          <div className="saas-user-editor-forms"><form onSubmit={updateMember} className="saas-form">
            <label>Display name<input required minLength={2} value={userName} onChange={e=>setUserName(e.target.value)}/></label>
            <label className="saas-checkbox"><input type="checkbox" checked={userActive} onChange={e=>setUserActive(e.target.checked)}/> Active within this tenant</label>
            <button className="button primary" disabled={loading}>Save name & membership</button>
          </form><div className="saas-form"><label>Login email<input type="email" value={userEmail} onChange={e=>setUserEmail(e.target.value)}/></label>
            <p className="saas-note">Only eligible single-tenant non-platform identities can change email. Verify mailbox ownership; all existing sessions will be revoked.</p>
            <button type="button" className="button secondary" disabled={loading} onClick={()=>void updateMemberEmail()}><Mail size={15}/> Change login email</button>
          </div></div>
        </div>}
      </div>}
      {view==='subscription'&&<form onSubmit={updateSubscription} className="saas-form"><h3>Change subscription</h3>
        <label>Subscription plan<select disabled={!isOwner} required value={newPlan||selected.subscription?.planId||''} onChange={e=>setNewPlan(e.target.value)}>{(plans.data||[]).filter(p=>p.active||p._id===selected.subscription?.planId).map(p=><option key={p._id} value={p._id}>{p.name} · {p.maxCompanies} companies · {p.maxUsers} seats</option>)}</select></label>
        <label>Billing state<select disabled={!isOwner} value={newStatus} onChange={e=>setNewStatus(e.target.value)}>{['trialing','active','past_due','cancelled','suspended'].map(status=><option key={status}>{status}</option>)}</select></label>
        <p className="saas-note">This changes subscription metadata only; no card is charged. Downgrades that exceed current company/seat usage are rejected.</p>
        {isOwner&&<button className="button primary" disabled={loading}>Apply plan & status</button>}</form>}
      {view==='lifecycle'&&<div><h3>Tenant status and deletion</h3><p className="saas-note">Suspending a tenant blocks its members' new logins. Archive only after suspension and export. Permanent deletion is restricted to eligible empty archived tenants.</p>
        {isOwner&&<div className="saas-actions">
          {selected.status!=='active'&&<button type="button" className="button secondary" disabled={loading} onClick={()=>void changeStatus('active')}>Reactivate</button>}
          {selected.status==='active'&&<button type="button" className="button secondary" disabled={loading} onClick={()=>void changeStatus('suspended')}>Suspend tenant</button>}
          {selected.status==='suspended'&&<button type="button" className="button secondary" disabled={loading} onClick={()=>void changeStatus('archived')}><Archive size={15}/> Archive</button>}
          {selected.status==='archived'&&<button type="button" className="button danger" disabled={loading} onClick={()=>void deleteEmpty()}>Delete eligible empty tenant</button>}
        </div>}
      </div>}
    </section>}
    <div style={{marginTop:18}}><PlatformSettingsPanel readOnly={!isOwner}/></div>
    {isOwner&&<div className="saas-hidden-migration-cta"><button type="button" className="button secondary" onClick={()=>setShowMigrations(x=>!x)}><Database size={16}/>{showMigrations?'Hide infrastructure migrations':'Show infrastructure migrations (advanced)'}</button></div>}
    {isOwner&&showMigrations&&<section className="saas-panel" style={{marginTop:18}}><header><Database/><div><h2>{t('Infrastructure migrations')}</h2><p>{t('Database or object-storage relocation requires independent Platform Owner approval and offline verification.')}</p></div></header>
      <div className="saas-alert error"><AlertTriangle size={16} style={{verticalAlign:'middle',marginInlineEnd:8}}/>Cutover cannot be initiated from the browser. Backups, maintenance mode, destination checks and manual deployment secret updates are mandatory.</div>
      <form onSubmit={createMigration} className="migration-plan-form">
        <label>{t('Migration type')}<select value={kind} onChange={e=>setKind(e.target.value as 'database'|'storage')}><option value="database">{t('Database')}</option><option value="storage">{t('Object storage')}</option></select></label>
        <label>{t('Source label')}<input required minLength={2} value={sourceLabel} onChange={e=>setSourceLabel(e.target.value)}/></label>
        <label>{t('Target label')}<input required minLength={2} value={targetLabel} onChange={e=>setTargetLabel(e.target.value)}/></label>
        <label className="migration-reason">{t('Reason for migration')}<textarea required minLength={12} maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)} rows={3}/></label>
        <button disabled={loading} className="button primary">{t('Submit migration plan')}</button>
      </form>
      <div className="migration-plan-list">{(migrations.data||[]).map(m=><article key={m._id} className="migration-plan-card"><div className="migration-plan-title">{m.kind==='database'?<Database size={18}/>:<HardDrive size={18}/>}<strong>{m.sourceLabel} → {m.targetLabel}</strong><span className="saas-pill">{m.status}</span></div><small>{formatDate(new Date(m.createdAt))} · ID: <code>{m._id}</code></small><p>{m.reason}</p>
        {m.status==='planned'&&m.requestedBy!==session.user.id&&<button className="button secondary" disabled={loading} onClick={()=>void approve(m._id)}><CheckCircle2 size={15}/> {t('Approve')}</button>}
        {m.status==='approved'&&<p className="saas-note">{t('Run in offline terminal')}: <code>npm run migrate:{m.kind==='database'?'database':'storage-provider'}:apply -- --plan-id={m._id}</code></p>}
      </article>)}</div>
    </section>}
  </div>;
}
