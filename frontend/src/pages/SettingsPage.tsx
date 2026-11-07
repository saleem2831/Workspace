import type * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Activity, Building2, LockKeyhole, ShieldCheck, Users, UserRound, Paintbrush } from 'lucide-react';
import { useWorkspace } from '../App';
import { dateText, http } from '../api';
import { Drawer, ErrorState, Loader, PageHead, Panel, Status, Table, useToast } from '../components/UI';
import CompanyManager from './CompanyManager';

const roles = ['owner', 'team'];
const roleLabel=(role:string)=>role==='super_admin'?'Super Admin':role==='team'?'Team':role==='owner'?'Owner':'Team (migration needed)';
const domains = ['operations','learning','advisory','sales','products','projects','finance','approvals','reports'];
const empty = { name: '', email: '', password: '', role: 'team', permissions: [] as string[] };

export default function SettingsPage() {
  const { company, session, refresh } = useWorkspace();
  const query = useQueryClient();
  const toast = useToast();
  const owner = !!session.isSuperAdmin || Object.values(session.roles).includes('owner');
  const [managementCompany,setManagementCompany] = useState(company);
  useEffect(() => setManagementCompany(company), [company]);
  const isCompanyOwner = managementCompany !== 'all' && (!!session.isSuperAdmin || session.roles[managementCompany] === 'owner');
  const teamManager = !!session.isSuperAdmin || Object.values(session.roles).includes('owner');
  const canAddTeam = isCompanyOwner || (managementCompany === 'all' && !!session.isSuperAdmin);
  const [tab, setTab] = useState('profile');
  const [create, setCreate] = useState(false);
  const [newMemberCompanyId,setNewMemberCompanyId] = useState('');
  const [assigning, setAssigning] = useState<null | { user: any; companyIds: string[]; role: string; permissions: string[] }>(null);
  const [editing, setEditing] = useState<null | { user: any; companyId:string; role: string; name: string; email: string; permissions: string[] }>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...empty });
  const [profile, setProfile] = useState(session.user.name);
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '' });
  const [branding, setBranding] = useState({ name: session.branding?.name || 'Bitstek Workspace', logoFileId: session.branding?.logoFileId || '' });
  const [brandingCompany,setBrandingCompany] = useState(company==='all'?'':company);
  const [existingUserId, setExistingUserId] = useState('');
  const [mfaSetup,setMfaSetup]=useState<{secret:string;otpauthUrl:string}|null>(null);
  const [mfaCode,setMfaCode]=useState('');
  const [mfaPassword,setMfaPassword]=useState('');
  const [resetPassword,setResetPassword]=useState('');
  const [removal,setRemoval]=useState<{user:any;companyId:string;impact:Record<string,number>;total:number}|null>(null);
  const [replacementUserId,setReplacementUserId]=useState('');
  const [removing,setRemoving]=useState(false);
  const users = useQuery({ queryKey:['settings-users', managementCompany], queryFn: async () => (await http.get('/admin/users',{headers:{'x-company-id':managementCompany}})).data as any[], enabled: teamManager });
  const assignableCompanies = session.companies.filter(c => session.isSuperAdmin || session.roles[c._id] === 'owner');
  const newMemberTarget = newMemberCompanyId || (managementCompany !== 'all' ? managementCompany : '');
  const forCompany = (companyId:string) => ({headers:{'x-company-id':companyId}});
  const audit = useQuery({ queryKey:['settings-audit', company], queryFn: async () => (await http.get('/admin/audit')).data, enabled: owner && tab === 'audit' });
  const updatePermission = (domain: string, level: string) => setForm(p => ({ ...p, permissions: [...p.permissions.filter(x => !x.startsWith(domain + ':')), ...(level ? [`${domain}:${level}`] : [])] }));
  const save = async (action: () => Promise<any>, message: string) => {
    setSaving(true);
    try { await action(); await query.invalidateQueries(); refresh(); toast.success(message); }
    catch(e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };
  const createRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    await save(async () => {
      if (!assignableCompanies.some(c=>c._id===newMemberTarget)) throw new Error('Choose an authorized company in the Add Member form');
      if (existingUserId) await http.post('/admin/memberships', { userId: existingUserId, role: form.role, permissions: form.permissions }, forCompany(newMemberTarget));
      else await http.post('/admin/users', { name: form.name, email: form.email, password: form.password, role: form.role, permissions: form.permissions }, forCompany(newMemberTarget));
      setCreate(false); setForm({ ...empty }); setExistingUserId(''); setNewMemberCompanyId('');
    }, 'Saved successfully');
  };
  const openCompanyAssignment = async (user: any) => {
    setSaving(true);
    try {
      const response = await http.get(`/admin/users/${user._id}/company-access`,forCompany(managementCompany));
      const refreshed = {...user,memberships:response.data.memberships};
      const available = assignableCompanies.filter(c => !refreshed.memberships.some((m:any) => String(m.companyId) === c._id && m.active !== false && !m.removedAt));
      if (!available.length) throw new Error('This member already has access to every company you can assign');
      setAssigning({user:refreshed,companyIds:[],role:'team',permissions:[]});
    } catch(error:any) {toast.error(error.message);}
    finally {setSaving(false);}
  };
  const canAssignCompany = (companyId:string, role:string) =>
    (!!session.isSuperAdmin || session.roles[companyId] === 'owner') && (role === 'team' || (role === 'owner' && !!session.isSuperAdmin));
  const toggleAssignmentCompany = (companyId:string, checked:boolean) => setAssigning(p => p ? ({...p,companyIds:checked?[...p.companyIds,companyId]:p.companyIds.filter(id=>id!==companyId)}) : p);
  const setAssignmentRole = (role:string) => setAssigning(p => p ? ({...p,role,companyIds:p.companyIds.filter(id=>canAssignCompany(id,role)),permissions:role==='owner'?[]:p.permissions}) : p);
  const assignPermission = (domain:string, level:string) => setAssigning(p => p ? ({...p,permissions:[...p.permissions.filter(x=>!x.startsWith(domain+':')),...(level?[`${domain}:${level}`]:[])]}) : p);
  const grantCompanyAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assigning?.companyIds.length) return toast.error('Select at least one new company');
    setSaving(true);
    try {
      await http.post('/admin/memberships/bulk-assign', {userId:assigning.user._id, companyIds:assigning.companyIds, role:assigning.role, permissions:assigning.permissions});
      await query.invalidateQueries({queryKey:['settings-users']});
      await query.invalidateQueries({queryKey:['members']});
      refresh();
      toast.success(`${assigning.user.name} was assigned to ${assigning.companyIds.length} ${assigning.companyIds.length===1?'company':'companies'}`);
      setAssigning(null);
    } catch(error:any) { toast.error(error.message); }
    finally {setSaving(false);}
  };
  const membershipFor = (user:any, companyId:string) => (user.memberships||[]).find((m:any)=>String(m.companyId)===companyId && !m.removedAt);
  const openMemberEditor = (user: any) => {
    if (user.isSuperAdmin) return toast.error('Super Admin accounts are managed in their own security profile');
    const available=assignableCompanies.filter(c=>!!membershipFor(user,c._id));
    const target=managementCompany!=='all' ? managementCompany : available[0]?._id;
    if (!target) return toast.error('This member has no editable company assignment');
    const membership=membershipFor(user,target);
    if (!membership) return toast.error('This user has no active membership in that company');
    if (!session.isSuperAdmin && membership.role !== 'team') return toast.error('Only Super Admin can edit Owner access');
    setEditing({user,companyId:target,role:membership.role,name:user.name,email:user.email,permissions:membership.permissions||[]});
  };
  const switchEditCompany=(companyId:string)=>setEditing(prev=>{
    if(!prev)return prev;
    const m=membershipFor(prev.user,companyId);
    if(!m)return prev;
    return {...prev,companyId,role:m.role,permissions:m.permissions||[]};
  });
  const editPermission = (domain: string, level: string) => setEditing(p => p ? ({
    ...p, permissions: [ ...p.permissions.filter(x => !x.startsWith(domain + ':')), ...(level ? [`${domain}:${level}`] : []) ]
  }) : p);
  const saveEditedMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    try {
      const body: Record<string,unknown> = { role:editing.role, permissions:editing.permissions };
      if (session.isSuperAdmin) { body.name=editing.name.trim(); body.email=editing.email.trim(); }
      await http.patch(`/admin/users/${editing.user._id}/edit`,body,forCompany(editing.companyId));
      await query.invalidateQueries({queryKey:['settings-users']});
      refresh();
      toast.success(`${editing.name}'s membership updated`);
      setEditing(null);
    } catch(error: any) { toast.error(error.message); }
    finally { setSaving(false); }
  };
  const toggleUser=async(user:any,active:boolean,companyId:string)=>{
    setSaving(true);
    try {
      await http.patch(`/admin/users/${user._id}/active`,{active},forCompany(companyId));
      await query.invalidateQueries({queryKey:['settings-users']});
      refresh();
      toast.success(active?'Membership reactivated':'Membership deactivated');
      setEditing(null);
    } catch(e:any) {toast.error(e.message);} finally{setSaving(false);}
  };
  const removeUser=async(user:any,companyId:string)=>{
    if(!companyId)return toast.error('Select a member company first');
    setSaving(true);
    try{const impact=(await http.get(`/admin/memberships/${user._id}/impact`,forCompany(companyId))).data;
      setRemoval({user,companyId,impact:impact.counts,total:impact.total});setReplacementUserId('');
    }catch(e:any){toast.error(e.message);}finally{setSaving(false);}
  };
  const confirmRemoval=async()=>{
    if(!removal)return;
    if(removal.total>0&&!replacementUserId)return toast.error('Choose a replacement for active assignments');
    setRemoving(true);
    try{await http.delete(`/admin/memberships/${removal.user._id}`,{...forCompany(removal.companyId),data:replacementUserId?{replacementUserId}:{}});
      await query.invalidateQueries(); refresh(); toast.success('Member access removed; assignments transferred where required');setRemoval(null);setEditing(null);
    }catch(e:any){toast.error(e.message);}finally{setRemoving(false);}
  };
  const replacementCandidates=(users.data||[]).filter((u:any)=>u._id!==removal?.user._id && u.active!==false && u.memberships?.some((m:any)=>String(m.companyId)===removal?.companyId&&m.active!==false&&!m.removedAt));
  const resetUser=async(user:any,companyId:string)=>{if(!confirm(`Reset password for ${user.name}? All their sessions will be invalidated.`))return;setSaving(true);try{const response=await http.post(`/admin/users/${user._id}/reset-password`,{},forCompany(companyId));setResetPassword(response.data.temporaryPassword);toast.success('New temporary password generated');}catch(e:any){toast.error(e.message);}finally{setSaving(false);}};
  const repairTenantLogin=async(user:any)=>{
    if(!session.isSuperAdmin)return;
    if(!confirm(`Restore missing SaaS workspace membership for ${user.email}? This does not change their password or company role.`))return;
    setSaving(true);
    try{
      await http.post(`/admin/users/${user._id}/repair-workspace-access`,{});
      await query.invalidateQueries({queryKey:['settings-users']});
      toast.success('Workspace login membership restored. User can sign in with their existing password.');
    }catch(e:any){toast.error(e.message);}finally{setSaving(false);}
  };
  const nav = [{ key:'profile', title:'My profile', icon:UserRound }, ...(teamManager ? [{ key:'companies', title:'Companies',icon:Building2 },{ key:'team',title:'Team & access',icon:Users }] : []), ...(owner ? [{ key:'audit',title:'Audit history',icon:Activity }] : []),...(session.isSuperAdmin?[{key:'branding',title:'Workspace branding',icon:Paintbrush}]:[]),{ key:'security',title:'Security',icon:LockKeyhole }];
  return <><PageHead title="Workspace settings" subtitle="Your profile, branding, companies and module-level permissions." action={(tab === 'team' && canAddTeam) ? { label: 'Add member',onClick:()=>{setForm({...empty});setExistingUserId('');setNewMemberCompanyId(managementCompany==='all'?'':managementCompany);setCreate(true);} } : undefined}/>
  <div className="settings-layout"><div className="settings-nav">{nav.map(x => <button key={x.key} className={tab===x.key?'current':''} onClick={()=>setTab(x.key)}><x.icon size={16}/>{x.title}</button>)}</div><div className="settings-content">{resetPassword&&<div className="temporary-password" role="alert"><strong>Temporary password (displayed once)</strong><code>{resetPassword}</code><p>Share securely with the user; all existing sessions were invalidated.</p><button className="button secondary compact" onClick={()=>setResetPassword('')}>Dismiss</button></div>}
  {tab==='profile' && <Panel title="My profile" subtitle={session.user.email}><form className="record-form settings-form" onSubmit={e => { e.preventDefault(); void save(()=>http.patch('/auth/profile',{name:profile}),'Profile saved'); }}><label>Full name<input value={profile} required minLength={2} onChange={e=>setProfile(e.target.value)}/></label><button className="button primary" disabled={saving}>Save profile</button></form><hr/><h3>Change password</h3><form className="record-form settings-form" onSubmit={e=>{e.preventDefault();void save(async()=>{await http.post('/auth/change-password',passwords);setPasswords({currentPassword:'',newPassword:''});},'Password changed; sign in again');}}><label>Current password<input type="password" autoComplete="current-password" required value={passwords.currentPassword} onChange={e=>setPasswords(p=>({...p,currentPassword:e.target.value}))}/></label><label>New password (12+ characters)<input type="password" autoComplete="new-password" required minLength={12} value={passwords.newPassword} onChange={e=>setPasswords(p=>({...p,newPassword:e.target.value}))}/></label><button className="button primary" disabled={saving}>Change password</button></form></Panel>}
  {tab==='companies' && teamManager && (session.isSuperAdmin ? <CompanyManager/> : <Panel title="Assigned companies"><div className="company-cards">{session.companies.map(c=><div className="company-card" key={c._id}><Building2 size={20}/><strong>{c.name}</strong><p>{c.code} · {c.currency}</p><Status value="active"/></div>)}</div></Panel>)}
  {tab==='branding' && session.isSuperAdmin && <Panel title="Workspace branding" subtitle="Update the name without uploading a logo. Logo is always optional.">
    <form className="record-form settings-form" onSubmit={e=>{e.preventDefault();void save(()=>http.patch('/admin/branding',{name:branding.name.trim()}),'Workspace name updated');}}>
      <label>Workspace name<input required minLength={3} maxLength={80} value={branding.name} onChange={e=>setBranding(p=>({...p,name:e.target.value}))}/></label>
      <p className="muted tiny">Changing the workspace name does not require a logo or company selection.</p>
      <button className="button primary" disabled={saving||branding.name.trim().length<3}>Save workspace name</button>
    </form>
    <div className="record-form settings-form" style={{marginTop:24}}>
      <h3>Workspace logo (optional)</h3>
      {company==='all'&&<label>Company to store the logo file
        <select value={brandingCompany} onChange={e=>setBrandingCompany(e.target.value)}>
          <option value="">Select only if uploading a logo</option>
          {session.companies.map(c=><option key={c._id} value={c._id}>{c.name}</option>)}
        </select>
      </label>}
      <label>Upload logo (PNG or JPEG, max 8 MB)
        <input type="file" accept="image/png,image/jpeg" onChange={async e=>{
          const file=e.target.files?.[0];if(!file)return;
          await save(async()=>{
            const logoCompany=company==='all'?brandingCompany:company;
            if(!logoCompany)throw new Error('Choose a company only when uploading a logo');
            const fd=new FormData();fd.append('file',file);fd.append('purpose','workspace-logo');
            const result=await http.post('/files',fd,forCompany(logoCompany));
            await http.patch('/admin/branding',{logoFileId:result.data._id});
            setBranding(p=>({...p,logoFileId:result.data._id}));
          },'Workspace logo uploaded');
          e.target.value='';
        }}/>
      </label>
      {branding.logoFileId&&<img className="brand-preview" src={`/api/files/${branding.logoFileId}`} alt="Current workspace logo"/>}
    </div>
  </Panel>}
  {tab==='team' && teamManager && <Panel title="Team & access" subtitle="Manage membership and module access for the selected company. Super Admin controls the workspace, Owners manage assigned companies, and Team users receive selected module permissions.">
    <div className="team-access-layout">
      <div className="team-access-toolbar">
        <label>Company
          <select value={managementCompany} onChange={e => setManagementCompany(e.target.value)}>
            {session.isSuperAdmin && <option value="all">All accessible companies</option>}
            {assignableCompanies.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>
        </label>
        <div className="team-access-help">
          <ShieldCheck size={17}/>
          <span>Super Admin: entire workspace · Owner: assigned companies · Team: selected modules</span>
        </div>
      </div>
      {managementCompany === 'all' && <p className="team-company-hint">You can now add members, edit individual company roles and remove access directly from All Companies. Each action asks for or displays its target company.</p>}
      {session.isSuperAdmin&&<p className="team-company-hint">Your Tenant Super Admin role already grants access to all enabled company modules. You do not need to assign yourself as an Owner. Self-service privilege escalation remains blocked for security.</p>}
      {users.isPending ? <Loader/> : users.error ? <ErrorState error={users.error}/> : <div className="team-member-list">
        {(users.data || []).filter((u: any) => managementCompany === 'all' || u.memberships.some((m: any) => String(m.companyId) === managementCompany)).map((u: any) => {
          const relevant = managementCompany === 'all' ? (u.memberships || []).filter((m: any) => session.companies.some(c => String(c._id) === String(m.companyId))) : (u.memberships || []).filter((m: any) => String(m.companyId) === managementCompany);
          const membership = relevant[0];
          const currentRole = u.isSuperAdmin ? 'super_admin' : membership?.role || 'team';
          const canEdit = !u.isSuperAdmin && relevant.some((m:any)=>assignableCompanies.some(c=>c._id===String(m.companyId)) && (session.isSuperAdmin || m.role==='team'));
          return <div className="team-member-card" key={u._id}>
            <div className="team-member-identity"><span className="team-avatar">{String(u.name || '?').trim()[0]?.toUpperCase()}</span><div><strong>{u.name}</strong><small>{u.email}</small></div></div>
            <div className="team-member-description">
              <span className={`team-role-tag role-${currentRole}`}>{roleLabel(currentRole)}</span>
              <span className={`team-active-tag ${(u.active===false||u.tenantMembershipActive===false||(!u.isSuperAdmin&&!membership?.active))?'inactive':''}`}>{u.active===false?'Inactive':u.tenantMembershipActive===false?'Login blocked':u.isSuperAdmin||membership?.active?'Active':'Inactive'}</span>
              {u.tenantMembershipActive===false&&<span className="team-active-tag inactive">Workspace login not activated</span>}
              <span className="team-module-summary">{['owner','super_admin'].includes(currentRole) ? 'Full module access' : (membership?.permissions?.length ? `${new Set(membership.permissions.map((p: string) => p.split(':')[0])).size} modules enabled` : 'No modules assigned')}</span>
              <small className="team-company-assignments">{u.isSuperAdmin&&<span className="team-company-pill">All enabled companies · Tenant Super Admin</span>}{(u.memberships||[]).filter((m:any)=>m.active!==false&&!m.removedAt&&session.companies.some(c=>c._id===String(m.companyId))).map((m:any)=>{
                const c=session.companies.find(c=>c._id===String(m.companyId));
                return <span key={String(m.companyId)} className="team-company-pill">{c?.name} · {roleLabel(u.isSuperAdmin?'super_admin':m.role)}</span>;
              })}</small>
            </div>
            <div className="team-member-controls">
              {session.isSuperAdmin && u.tenantMembershipActive===false && !u.tenantMembershipSuspended && <button className="button secondary compact" type="button" disabled={saving} onClick={()=>void repairTenantLogin(u)}>Repair workspace login</button>}
              {!u.isSuperAdmin && u._id!==session.user.id && assignableCompanies.some(c=>!u.memberships?.some((m:any)=>String(m.companyId)===c._id && m.active!==false && !m.removedAt)) && <button className="button secondary compact" type="button" disabled={saving} onClick={()=>void openCompanyAssignment(u)}>Assign companies</button>}
              {canEdit && <button className="button primary compact" type="button" disabled={saving} onClick={() => openMemberEditor(u)}>Edit access</button>}
              {canEdit && managementCompany!=='all' && <button type="button" className="button secondary compact" disabled={saving || u._id === session.user.id} onClick={() => void toggleUser(u,!membership.active,managementCompany)}>{membership.active ? 'Deactivate' : 'Reactivate'}</button>}
              {canEdit && managementCompany!=='all' && u._id !== session.user.id && <button type="button" className="button danger compact" disabled={saving} onClick={() => void removeUser(u,managementCompany)}>Remove access</button>}
              {canEdit && session.isSuperAdmin && managementCompany!=='all' && u._id !== session.user.id && <button type="button" className="button secondary compact" disabled={saving} onClick={() => void resetUser(u,managementCompany)}>Reset password</button>}
            </div>
          </div>;
        })}
        {!users.data?.length && <p className="muted">No members found in your accessible companies.</p>}
      </div>}
    </div>
  </Panel>}
  {tab==='security' && <Panel title="Security controls"><div className="security-list"><div><ShieldCheck size={20}/><div><strong>Company isolation</strong><p>Membership and permission rules are verified on the API.</p></div><Status value="active"/></div><div><LockKeyhole size={20}/><div><strong>Password management</strong><p>Changing your password invalidates existing sessions.</p></div><Status value="active"/></div><div><LockKeyhole size={20}/><div><strong>MFA</strong><p>Use a 6-digit TOTP code from Google Authenticator, Microsoft Authenticator, or another compatible app.</p></div><Status value={session.mfaEnabled?'active':'pending'}/></div></div><div className="mfa-panel">{session.mfaEnabled?<><strong>Authenticator MFA is enabled</strong><p>To disable, verify your password and a fresh authenticator code.</p><label>Password<input type="password" value={mfaPassword} onChange={e=>setMfaPassword(e.target.value)}/></label><label>Authenticator code<input inputMode="numeric" pattern="[0-9]{6}" value={mfaCode} onChange={e=>setMfaCode(e.target.value)}/></label><button className="button danger" disabled={saving||!mfaPassword||mfaCode.length!==6} onClick={()=>void save(()=>http.post('/auth/mfa/disable',{password:mfaPassword,code:mfaCode}),'MFA disabled; sign in again')}>Disable MFA</button></>:!mfaSetup?<><strong>Enable two-factor authentication</strong><p>Protect account sign-ins with your mobile authenticator app.</p><label>Confirm current password<input type="password" autoComplete="current-password" value={mfaPassword} onChange={e=>setMfaPassword(e.target.value)}/></label><button className="button primary" disabled={saving} onClick={async()=>{setSaving(true);try{if(!mfaPassword)throw new Error('Enter your current password first');setMfaSetup((await http.post('/auth/mfa/setup',{password:mfaPassword})).data);}catch(e:any){toast.error(e.message);}finally{setSaving(false);}}}>Set up MFA</button></>:<><strong>Authenticator setup</strong><p>Open your authenticator app → Add account → Scan QR code. You can also enter the setup key manually.</p><div className="mfa-qr" aria-label="Authenticator enrollment QR code"><QRCodeSVG value={mfaSetup.otpauthUrl} size={220} marginSize={2} level="M"/></div><div className="mfa-secret">{mfaSetup.secret}</div><p className="muted tiny">Store this secret privately. It is shown for enrollment only.</p><label>6-digit code<input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={mfaCode} onChange={e=>setMfaCode(e.target.value)}/></label><button className="button primary" disabled={saving||mfaCode.length!==6} onClick={()=>void save(()=>http.post('/auth/mfa/enable',{code:mfaCode}),'MFA enabled; sign in again')}>Confirm & enable MFA</button></>}</div></Panel>}
  {tab==='audit' && owner && <Panel title="Audit history">{audit.isPending?<Loader/>:audit.error?<ErrorState error={audit.error}/>:<Table items={(audit.data||[]).map((a:any)=>({...a,title:a.action}))} columns={['title','entity','userId','createdAt']}/>}</Panel>}
  </div></div>
  {assigning && <Drawer title={`Company access · ${assigning.user.name}`} onClose={()=>setAssigning(null)} width="580px">
    <form className="record-form company-assign-form" onSubmit={e=>void grantCompanyAccess(e)}>
      <div className="member-edit-intro"><ShieldCheck size={19}/><p>Grant <strong>{assigning.user.name}</strong> access to one or more additional companies. They will only see records and modules within the companies assigned to them. Existing company roles remain unchanged.</p></div>
      <label>Role for the new company assignments
        <select value={assigning.role} onChange={e=>setAssignmentRole(e.target.value)}>
          {roles.filter(r=>assignableCompanies.some(c=>canAssignCompany(c._id,r))).map(r=><option key={r} value={r}>{roleLabel(r)}</option>)}
        </select>
      </label>
      <div className="company-assign-heading"><strong>Select companies</strong><span>{assigning.companyIds.length} selected</span></div>
      <div className="company-assign-list">
        {session.companies.map(c=>{
          const existing=assigning.user.memberships?.find((m:any)=>String(m.companyId)===c._id&&m.active!==false&&!m.removedAt);
          const permitted=canAssignCompany(c._id, assigning.role);
          return <label className={`company-assign-row ${existing||!permitted?'disabled':''}`} key={c._id}>
            <input type="checkbox" checked={!!existing||assigning.companyIds.includes(c._id)} disabled={!!existing||!permitted} onChange={e=>toggleAssignmentCompany(c._id,e.target.checked)} />
            <span className="company-assign-info"><strong>{c.name}</strong><small>{c.code} · {c.vertical||'Business company'}</small></span>
            <span className="company-assign-status">{existing?`Already assigned · ${roleLabel(existing.role)}`:permitted?'Available':'Owner permission required'}</span>
          </label>;
        })}
      </div>
      {assigning.role==='team' && <><h3>Module permissions</h3><div className="member-permission-list">{domains.map(d=>{
        const level=assigning.permissions.includes(`${d}:write`)?'write':assigning.permissions.includes(`${d}:read`)?'read':'';
        return <label key={d}><span>{d[0].toUpperCase()+d.slice(1)}</span><select value={level} onChange={e=>assignPermission(d,e.target.value)}><option value="">No access</option><option value="read">View</option><option value="write">View + edit</option></select></label>;
      })}</div></>}
      {assigning.role==='owner' && <p className="company-assign-note">Only Super Admin can grant Owner access. Owners can manage business modules and Team users in their assigned companies.</p>}
      <div className="member-edit-footer"><button type="button" className="button secondary" disabled={saving} onClick={()=>setAssigning(null)}>Cancel</button><button type="submit" className="button primary" disabled={saving||!assigning.companyIds.length}>{saving?'Assigning…':`Assign to ${assigning.companyIds.length} ${assigning.companyIds.length===1?'company':'companies'}`}</button></div>
    </form>
  </Drawer>}
  {editing && <Drawer title={`Edit member · ${editing.user.name}`} onClose={() => setEditing(null)} width="540px">
    <form className="record-form member-edit-form" onSubmit={e => void saveEditedMember(e)}>
      <div className="member-edit-intro"><ShieldCheck size={19}/><p>Edit this user's access for one company. Changes to other company memberships are not affected.</p></div>
      <label>Company for this membership<select value={editing.companyId} onChange={e=>switchEditCompany(e.target.value)}>{assignableCompanies.filter(c=>!!membershipFor(editing.user,c._id) && (session.isSuperAdmin||membershipFor(editing.user,c._id)?.role==='team')).map(c=><option key={c._id} value={c._id}>{c.name}</option>)}</select></label>
      <div className="member-edit-fields">
        <label>Full name<input value={editing.name} disabled={!session.isSuperAdmin} required minLength={2} onChange={e => setEditing(p => p && ({...p,name:e.target.value}))}/></label>
        <label>Email address<input value={editing.email} type="email" disabled={!session.isSuperAdmin} required onChange={e => setEditing(p => p && ({...p,email:e.target.value}))}/></label>
        {!session.isSuperAdmin && <p className="muted tiny">Only the workspace Super Admin can change the global name or email. You can change the company membership below.</p>}
        <label>Company role<select value={editing.role} onChange={e => setEditing(p => p && ({...p,role:e.target.value,permissions:e.target.value==='owner'?[]:p.permissions}))}>
          {(session.isSuperAdmin ? roles : ['team']).map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
        </select></label>
      </div>
      {editing.role==='owner' ? <div className="member-edit-intro"><ShieldCheck size={19}/><p><strong>{roleLabel(editing.role)} access:</strong> all operational modules for this company, including Sales, Projects, Learning, Advisory, Finance, Reports and Settings. Owner is additionally responsible for privileged account administration.</p></div> : <><h3>Module permissions</h3><p className="muted tiny">Select the minimum access this team member needs for each module.</p><div className="member-permission-list">{domains.map(d => {
        const level = editing.permissions.includes(`${d}:write`) ? 'write' : editing.permissions.includes(`${d}:read`) ? 'read' : '';
        return <label key={d}><span>{d[0].toUpperCase()+d.slice(1)}</span><select value={level} onChange={e => editPermission(d,e.target.value)}><option value="">No access</option><option value="read">View</option><option value="write">View + edit</option></select></label>;
      })}</div></>}
      <div className="member-edit-footer"><button type="button" className="button secondary" disabled={saving} onClick={() => setEditing(null)}>Cancel</button><button className="button primary" disabled={saving}>{saving ? 'Saving member…' : 'Save member changes'}</button></div>
      {editing.user._id!==session.user.id && <div className="member-edit-secondary-actions"><button type="button" className="button secondary compact" onClick={()=>void toggleUser(editing.user,!membershipFor(editing.user,editing.companyId)?.active,editing.companyId)}>{membershipFor(editing.user,editing.companyId)?.active!==false?'Deactivate in company':'Reactivate in company'}</button><button type="button" className="button danger compact" onClick={()=>void removeUser(editing.user,editing.companyId)}>Remove company access</button>{session.isSuperAdmin && <button type="button" className="button secondary compact" onClick={()=>void resetUser(editing.user,editing.companyId)}>Reset password</button>}</div>}
    </form>
  </Drawer>}
  {removal && <Drawer title={`Remove ${removal.user.name}`} onClose={()=>setRemoval(null)}>
    <div className="record-form member-handoff"><div className="approval-guidance"><strong>Transfer active responsibilities first</strong><p>Historical activity and financial audit records will still show the original user. Their other company memberships are not affected.</p></div>
    <h3>Active assignments</h3>{Object.keys(removal.impact).length?<div className="handoff-counts">{Object.entries(removal.impact).map(([name,count])=><div key={name}><strong>{name}</strong><span>{count}</span></div>)}</div>:<p>No active assignments found.</p>}
    <label>Transfer assignments to<select value={replacementUserId} onChange={e=>setReplacementUserId(e.target.value)}><option value="">{removal.total?'Select replacement member':'None — no active assignments'}</option>{replacementCandidates.map((u:any)=><option key={u._id} value={u._id}>{u.name} — {u.email}</option>)}</select></label>
    <p className="muted">For pending approvals, the replacement must have approval rights and cannot be the original requester.</p>
    <button type="button" className="button danger full" disabled={removing||(removal.total>0&&!replacementUserId)} onClick={()=>void confirmRemoval()}>{removing?'Updating assignments…':'Transfer and remove member'}</button>
    </div>
  </Drawer>}
  {create && <Drawer title="Add team member" onClose={()=>setCreate(false)}>
    <form className="record-form settings-form" onSubmit={createRecord}>
      <label>Company for new membership<select value={newMemberTarget} required onChange={e=>setNewMemberCompanyId(e.target.value)}>
        <option value="">Select company</option>{assignableCompanies.map(c=><option key={c._id} value={c._id}>{c.name}</option>)}
      </select></label>
      <label>Assign existing user (optional)<select value={existingUserId} onChange={e=>setExistingUserId(e.target.value)}>
        <option value="">Create new user</option>{(users.data||[]).map((u:any)=><option value={u._id} key={u._id}>{u.name} · {u.email}</option>)}
      </select></label>
      {!existingUserId&&<>
        <label>Full name<input required minLength={2} value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))}/></label>
        <label>Email<input type="email" required value={form.email} onChange={e=>setForm(p=>({...p,email:e.target.value}))}/></label>
        <label>Temporary password<input type="password" minLength={12} required value={form.password} onChange={e=>setForm(p=>({...p,password:e.target.value}))}/></label>
      </>}
      <label>Role<select value={form.role} onChange={e=>setForm(p=>({...p,role:e.target.value}))}>
        {(session.isSuperAdmin?roles:['team']).map(r=><option key={r} value={r}>{roleLabel(r)}</option>)}
      </select></label>
      {form.role==='team'&&<div className="permission-grid">{domains.map(d=><label key={d}>{d}<select value={form.permissions.includes(`${d}:write`)?'write':form.permissions.includes(`${d}:read`)?'read':''} onChange={e=>updatePermission(d,e.target.value)}>
        <option value="">No access</option><option value="read">View</option><option value="write">View + edit</option>
      </select></label>)}</div>}
      <button className="button primary full" disabled={saving}>{saving?'Saving…':'Save member'}</button>
    </form>
  </Drawer>}
  </>;
}
