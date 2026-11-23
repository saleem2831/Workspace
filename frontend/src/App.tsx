import type * as React from 'react';
import { createContext, useContext, useEffect, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, BarChart3, BookOpen, BriefcaseBusiness, CalendarDays, CheckCircle2, ChevronDown, CircleHelp, CircleUserRound, CreditCard, GraduationCap, LayoutDashboard, Layers3, Menu, Package, Search, Settings as SettingsIcon, ShieldCheck, Workflow, Bell, LogOut, X } from 'lucide-react';
import { http } from './api';
import Dashboard from './pages/Dashboard';
import HomePage from './pages/HomePage';
import WorkBoard from './pages/WorkBoard';
import CalendarPage from './pages/CalendarPage';
import DomainPage from './pages/DomainPage';
import SalesPage from './pages/SalesPage';
import ApprovalsPage from './pages/ApprovalsPage';
import ReportsPage from './pages/ReportsPage';
import SettingsPage from './pages/SettingsPage';
import SaaSCenter from './pages/SaaSCenter';
import PlatformConsole from './pages/PlatformConsole';
import { ToastProvider, useToast } from './components/UI';
import {LocaleProvider,LocalePicker,useLocale} from './i18n';
type Session = {
    user: {
        id: string;
        name: string;
        email: string;
    };
    roles: Record<string, string>;
    permissions: Record<string, string[]>;
    branding?: {name: string; logoFileId?: string | null};
    mfaEnabled?: boolean;
    isSuperAdmin?: boolean;
    tenant?: {_id:string;name:string;slug:string;status:string;defaultLocale?:'en'|'ar';themeId?:string};
    isPlatformOperator?: boolean;
    isPlatformOwner?: boolean;
    companyModules?: Record<string,string[]>;
    companies: Array<{
        _id: string;
        name: string;
        code: string;
        vertical: string;
        currency: string;
        enabledModules?: string[];
    }>;
};
type AppContext = {
    session: Session;
    company: string;
    setCompany: (id: string) => void;
    refresh: () => void;
};
const Context = createContext<AppContext | null>(null);
export const useWorkspace = () => {
    const value = useContext(Context);
    if (!value)
        throw new Error('Workspace context missing');
    return value;
};
function canConsolidate(session:Session):boolean {
    return !!session.isSuperAdmin || (session.companies.length>0 && session.companies.every(c=>session.roles[c._id]==='owner'));
}
function selectAuthorizedCompany(value:string, session:Session):string {
    if (value !== 'all' && session.companies.some(c=>c._id===value)) return value;
    if (value==='all' && canConsolidate(session)) return value;
    return session.companies[0]?._id || 'all';
}
const nav = [
    { name: 'Home', path: '/', icon: BriefcaseBusiness }, { name: 'Today', path: '/today', icon: LayoutDashboard }, { name: 'Work Board', path: '/work-board', icon: Workflow }, { name: 'Calendar', path: '/calendar', icon: CalendarDays },
    { name: 'Learning', path: '/learning', icon: BookOpen }, { name: 'Advisory', path: '/advisory', icon: Activity }, { name: 'Sales', path: '/sales', icon: BarChart3 },
    { name: 'Products', path: '/products', icon: Package }, { name: 'Projects', path: '/projects', icon: BriefcaseBusiness }, { name: 'Finance', path: '/finance', icon: CreditCard },
    { name: 'Approvals', path: '/approvals', icon: CheckCircle2 }, { name: 'Reports', path: '/reports', icon: Layers3 }, { name: 'Settings', path: '/settings', icon: SettingsIcon },
    {name:'SaaS Center',path:'/saas',icon:Layers3}, {name:'Platform Console',path:'/platform',icon:ShieldCheck},
];
function Login({ onLogin }: {
    onLogin: () => void;
}) {
    const {t}=useLocale();
    const [email, setEmail] = useState(() => new URLSearchParams(window.location.search).get('email') || (import.meta.env.VITE_DEMO_MODE === 'true' ? 'admin@bitstek.local' : ''));
    const [password, setPassword] = useState('');
    const [tenantSlug, setTenantSlug] = useState(() => {
        const linkedCode = new URLSearchParams(window.location.search).get('workspace');
        if (linkedCode && /^[a-z0-9-]{2,80}$/.test(linkedCode)) return linkedCode;
        const domain = (import.meta.env.VITE_SAAS_BASE_DOMAIN || '').toLowerCase().trim();
        const host = window.location.hostname.toLowerCase();
        if(domain && host.endsWith('.'+domain)){
            const label=host.slice(0,-domain.length-1);
            return /^[a-z0-9][a-z0-9-]{1,62}$/.test(label)?label:'';
        }
        return '';
    });
    const [mfaToken,setMfaToken]=useState('');
    const [mfaCode,setMfaCode]=useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            if(mfaToken){await http.post('/auth/mfa/verify-login',{token:mfaToken,code:mfaCode});setMfaCode('');setMfaToken('');onLogin();}
            else {const result=(await http.post('/auth/login',{email,password,tenantSlug:tenantSlug.trim().toLowerCase()})).data;if(result.mfaRequired){setMfaToken(result.mfaToken);setPassword('');}else onLogin();}
        }
        catch (e: any) {
            setError(e.message);
        }
        finally {
            setLoading(false);
        }
    };
    return <div className="login-page"><div className="login-art"><div className="brand large"><span className="brand-mark"><i /><i /></span><span>Bitstek<br />Workspace</span></div><div className="login-promo"><span className="eyebrow">YOUR UNIFIED BUSINESS OS</span><h1>One workspace.<br />Every business.<br /><em>Complete clarity.</em></h1><p>Operate learning, advisory, sales, projects and finance from one connected platform.</p><div className="promo-tiles"><span>12 integrated modules</span><span>Role-based access</span><span>Real-time oversight</span></div></div></div><div className="login-panel"><div className="login-language-control"><LocalePicker/></div><form className="login-form" onSubmit={submit}><div className="login-icon"><ShieldCheck size={26}/></div><h2>{t('Welcome back')}</h2><p className="muted">{t('Sign in to your Bitstek Workspace account')}</p>{mfaToken?<><p className="muted">Enter the 6-digit code from your authenticator app.</p><label>{t('Authenticator code')}<input required inputMode="numeric" pattern="[0-9]{6}" autoComplete="one-time-code" value={mfaCode} maxLength={6} onChange={e=>setMfaCode(e.target.value)}/></label><button type="button" className="button secondary full" onClick={()=>{setMfaToken('');setMfaCode('');}}>{t('Back to password')}</button></>:<><label>{t('Email address')}<input type="email" required autoComplete="username" value={email} onChange={e => setEmail(e.target.value)}/></label><label>{t('Workspace code')}  (required for every account)<input required pattern="[a-z0-9-]{2,80}" value={tenantSlug} onChange={e=>setTenantSlug(e.target.value)} placeholder="e.g. bitstek" autoComplete="organization"/></label><label>{t('Password')}<input type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)}/></label></>}{error && <p className="form-error">{error}</p>}<button className="button primary full" disabled={loading}>{t(loading ? 'Signing in…' : mfaToken ? 'Verify & sign in' : 'Sign in to Workspace')}</button><p className="tiny muted centered"><NavLink to="/invite">Have an invitation token? Activate your workspace</NavLink></p>{import.meta.env.VITE_DEMO_MODE === 'true' && <p className="tiny muted centered">Demo credentials are configured using the backend seed command.</p>}</form></div></div>;
}
type InviteInfo={email:string;workspaceCode:string;workspaceName:string;expiresAt:string};
function InviteClaim({onLogin}:{onLogin:(workspace:string,email:string)=>void}) {
    const {t}=useLocale();
    // Invitation tokens are sent in the URL fragment, never a query string,
    // so the server, access logs and Referer headers do not receive them.
    const fragment=new URLSearchParams(window.location.hash.replace(/^#/,''));
    const [token,setToken]=useState(fragment.get('token')||'');
    const [email,setEmail]=useState(fragment.get('email')||'');
    const [password,setPassword]=useState('');
    const [workspace,setWorkspace]=useState(fragment.get('workspace')||'');
    const [info,setInfo]=useState<InviteInfo|null>(null);
    const [message,setMessage]=useState('');
    const [success,setSuccess]=useState(false);
    const [busy,setBusy]=useState(false);
    const [previewBusy,setPreviewBusy]=useState(false);
    const loadInvite=async(value:string)=>{
      if (!/^[a-f0-9]{64}$/.test(value)) return;
      setPreviewBusy(true);setMessage('');
      try {
        const result=(await http.post<InviteInfo>('/auth/invite/preview',{token:value})).data;
        setInfo(result);setEmail(result.email);setWorkspace(result.workspaceCode);
      }catch(e:any){setMessage(e.message||'Could not validate invitation');}
      finally{setPreviewBusy(false);}
    };
    useEffect(()=>{if(/^[a-f0-9]{64}$/.test(token))void loadInvite(token);},[]);
    const submit=async(e:React.FormEvent)=>{e.preventDefault();setBusy(true);setMessage('');
      try{
        const result=await http.post('/auth/claim-invite',{token:token.trim(),email:email.trim().toLowerCase(),password});
        const code=result.data.workspaceCode||workspace;
        setWorkspace(code);setSuccess(true);setPassword('');setToken('');
        window.history.replaceState(null,'',window.location.pathname);
        setMessage(`Your invitation is active. Sign in with workspace code: ${code}.`);
      }catch(e:any){setMessage(e.message||'Invitation claim failed');}finally{setBusy(false);}
    };
    return <div className="login-page"><div className="login-art"><div className="brand large">Bitstek Workspace</div><div className="login-promo"><h1>Activate your<br/>workspace access.</h1><p>Use the one-time invitation token to activate the tenant administrator account before your first login.</p></div></div><div className="login-panel"><div className="login-language-control"><LocalePicker/></div><form className="login-form" onSubmit={submit}><div className="login-icon"><ShieldCheck/></div><h2>{t('Claim workspace invitation')}</h2>
      {info&&<div className="invite-summary"><strong>{info.workspaceName}</strong><small>Workspace code: <code>{info.workspaceCode}</code></small><small>Invitation expires: {new Date(info.expiresAt).toLocaleString()}</small></div>}
      {!success&&<><label>{t('Invitation token')}<input required value={token} onChange={e=>{setToken(e.target.value.trim());setInfo(null);}} autoComplete="off"/></label><button className="button secondary full" type="button" disabled={previewBusy||!/^[a-f0-9]{64}$/.test(token)} onClick={()=>void loadInvite(token)}>{previewBusy?'Checking invitation…':'Verify invitation'}</button><label>{t('Invited email')}<input required type="email" value={email} onChange={e=>setEmail(e.target.value)} readOnly={!!info}/></label><label>{t('Create password / existing account password')}<input required type="password" minLength={12} value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password"/></label><p className="tiny muted">For a new account, choose a strong password with at least 16 characters. If this email already has an account, enter its existing password instead.</p></>}
      {message&&<p className={success?'saas-alert success':'form-error'} role="status">{message}</p>}
      {!success&&<button className="button primary full" disabled={busy}>{busy?'Activating…':t('Accept invitation')}</button>}
      <button type="button" className="button secondary full" onClick={()=>onLogin(workspace,email)}>{success?'Continue to workspace login':t('Back to login')}</button>
    </form></div></div>;
}
/** A new Platform Owner identity starts as a normal tenant member.
 * Platform privileges are effective only after verified MFA and the offline promotion.
 * Do not infer authority from a display name or email address. */
function PlatformAccessSetup({session}:{session:Session}) {
    const {t}=useLocale();
    return <section className="platform-setup-page" aria-labelledby="platform-setup-title">
      <div className="platform-setup-icon"><ShieldCheck size={30}/></div>
      <h1 id="platform-setup-title">{t('Finish platform access setup')}</h1>
      <p>{t('This account is signed in, but Platform Owner privileges are not active yet. Your display name alone does not grant platform permissions.')}</p>
      <div className="platform-setup-status"><strong>{t('Authenticator MFA')}</strong><span className={session.mfaEnabled?'is-complete':'is-pending'}>{session.mfaEnabled?t('Enabled'):t('Not enabled')}</span></div>
      <div className="platform-setup-steps">
        {!session.mfaEnabled&&<p><strong>1.</strong> {t('Open Settings → Security and complete authenticator MFA enrollment.')} <NavLink to="/settings">{t('Go to Security settings')}</NavLink></p>}
        <p><strong>{session.mfaEnabled?'1.':'2.'}</strong> {t('From an authorized backend administrator terminal, configure PLATFORM_OPERATOR_EMAIL to this account and PLATFORM_OPERATOR_LEVEL=owner, then run the platform promotion dry-run and apply commands.')}</p>
        <pre><code>npm run bootstrap:platform{'\n'}npm run bootstrap:platform:apply</code></pre>
        <p><strong>{session.mfaEnabled?'2.':'3.'}</strong> {t('Sign out and sign in again. The Platform Console will then appear in the sidebar.')}</p>
      </div>
      <p className="platform-setup-tip">{t('Your account has no business-company assignments. This is expected for a dedicated platform administrator.')}</p>
    </section>;
}
function Shell({ session, company, setCompany, refresh, onLogout }: {
    session: Session;
    company: string;
    setCompany: (s: string) => void;
    refresh: () => void;
    onLogout: () => void;
}) {
    const [open, setOpen] = useState(false);
    const [notificationsOpen,setNotificationsOpen] = useState(false);
    const notificationCount = useQuery({queryKey:['notification-count',company], queryFn:async()=> (await http.get('/admin/notifications')).data as {count:number; approvals:number; renewals:number; financeRenewals:number; tasksDue:number}, refetchInterval:60000, enabled:session.companies.length>0, retry: false});
    const location = useLocation();
    const platformAppearance=useQuery({queryKey:['platform','settings'],enabled:!!session.isPlatformOperator,
      queryFn:async()=>(await http.get<{platformName:string;defaultTheme:string}>('/platform/settings')).data,retry:false});
    const inPlatformConsole=session.isPlatformOperator && location.pathname.startsWith('/platform');
    const navigate = useNavigate();
    const toast = useToast();
    const {t}=useLocale();
    useEffect(() => setOpen(false), [location.pathname]);
    const active = nav.find(n => n.path === location.pathname) || nav[0];
    const logout = async () => {
        // Always leave the protected UI. If the server cannot be reached,
        // warn the user that their HttpOnly cookie might still exist.
        try {
            await http.post('/auth/logout');
        } catch (e: any) {
            toast.error(`Could not confirm server sign-out: ${e.message}. Close the browser tab on a shared device.`);
        } finally {
            onLogout();
        }
    };
    const platformOnly=session.companies.length===0;
    const awaitingPlatformActivation=platformOnly&&!session.isPlatformOperator;
    const allowedNav = nav.filter(n => {
        if(platformOnly){
            return session.isPlatformOperator
                ? n.path==='/platform'||n.path==='/settings'
                : n.path==='/'||n.path==='/settings';
        }
        if (n.path === '/saas') return !!session.isSuperAdmin;
        if (n.path === '/platform') return !!session.isPlatformOperator;
        if (n.path === '/settings' || n.path === '/' || n.path === '/today') return true;
        const domain: Record<string,string> = { '/':'reports','/work-board':'operations','/calendar':'operations','/learning':'learning','/advisory':'advisory','/sales':'sales','/products':'products','/projects':'projects','/finance':'finance','/approvals':'approvals','/reports':'reports' };
        return session.companies.some(c => {
            if (company !== 'all' && company !== c._id) return false;
            const enabled = session.companyModules?.[c._id] || c.enabledModules || [];
            // A company-wide module toggle applies even to Owners and Super Admin.
            if (!enabled.includes(domain[n.path])) return false;
            return ['owner','super_admin'].includes(session.roles[c._id]) ||
                (session.permissions?.[c._id] || []).some(p => p.startsWith(domain[n.path] + ':'));
        });
    });
    const role = session.isPlatformOwner ? 'Platform Owner' : session.isPlatformOperator ? 'Platform Operator' : awaitingPlatformActivation ? 'Setup required' : session.isSuperAdmin ? 'Super Admin' : company === 'all' ? 'Multi-company' : session.roles[company]?.replaceAll('_', ' ') || 'Member';
    return <Context.Provider value={{ session, company, setCompany, refresh }}><div className="shell" data-theme={inPlatformConsole?(platformAppearance.data?.defaultTheme||'violet'):(session.tenant?.themeId||'violet')}>
 <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}><div className="brand">{!inPlatformConsole&&session.branding?.logoFileId ? <img className="brand-logo" src={`/api/files/${session.branding.logoFileId}`} alt="Workspace logo"/> : <span className="brand-mark"><i /><i /></span>}<span>{inPlatformConsole?(platformAppearance.data?.platformName||'Platform Administration'):(session.branding?.name||session.tenant?.name||'Workspace')}<small style={{display:'block',fontSize:10,opacity:.7}}>{inPlatformConsole?'SaaS platform settings':session.tenant?.name||''}</small></span></div><nav className="navlinks">{allowedNav.map(item => <NavLink key={item.path} end={item.path === '/'} to={item.path} className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}><item.icon size={17}/><span>{t(item.name)}</span></NavLink>)}</nav><div className="sidebar-bottom"><span className="build-pill">MERN WORKSPACE</span><div className="bottom-user"><div className="avatar">{session.user.name[0]}</div><div><strong>{session.user.name}</strong><small>{role}</small></div><button className="icon-btn inverse" title={t('Logout')} onClick={logout}><LogOut size={16}/></button></div></div></aside>
 {open && <div className="mobile-backdrop" onClick={() => setOpen(false)}/>}
 <div className="workarea"><header className="topbar"><div className="topbar-left"><button className="icon-btn mobile-menu" onClick={() => setOpen(!open)}><Menu /></button>{platformOnly ? <span className="platform-topbar-label"><ShieldCheck size={17}/>{session.isPlatformOperator?t('Platform administration'):t('Account setup')}</span> : <div className="company-select"><BriefcaseBusiness size={17}/><select aria-label="Current company" value={company} onChange={e => setCompany(e.target.value)}>{canConsolidate(session) && <option value="all">{t('All companies')}</option>}{session.companies.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}</select><ChevronDown size={14}/></div>}<span className="topbar-path">/ {t(active.name)}</span></div><div className="topbar-right"><button className="icon-btn" title="Search across modules" onClick={() => {
            const q = prompt('Search a module by name (e.g., finance, sales, projects)');
            if (q) {
                const match = nav.find(x => x.name.toLowerCase().includes(q.toLowerCase()));
                if (match)
                    navigate(match.path);
                else
                    toast.error('No matching module');
            }
        }}><Search size={18}/></button><div className="notification-wrap"><button className="icon-btn" title="Notifications" onClick={()=>setNotificationsOpen(v=>!v)}><Bell size={18}/>{!!notificationCount.data?.count && <span className="notification-counter">{notificationCount.data.count}</span>}</button>{notificationsOpen && <div className="notification-popover"><strong>Notifications</strong>{[['approvals','Approvals','/approvals'],['renewals','Subscription renewals','/products'],['financeRenewals','Finance renewals','/finance?tab=renewals'],['tasksDue','Tasks due','/work-board']].map(([key,label,url])=><button key={key} onClick={()=>{setNotificationsOpen(false);navigate(url);}}>{label}<b>{(notificationCount.data as any)?.[key]||0}</b></button>)}</div>}</div><button className="avatar top-avatar" title="My profile" onClick={()=>navigate('/settings')}>{session.user.name.slice(0, 1)}</button><div className="topbar-language"><LocalePicker/></div></div></header>
 <main className="page"><Routes><Route path="/" element={platformOnly?(session.isPlatformOperator?<Navigate to="/platform" replace/>:<PlatformAccessSetup session={session}/>):<HomePage />}/><Route path="/today" element={platformOnly?<Navigate to={session.isPlatformOperator?"/platform":"/"} replace/>:<Dashboard />}/><Route path="/work-board" element={allowedNav.some(n=>n.path==='/work-board')?<WorkBoard key={company}/>:<Navigate to="/" replace/>}/><Route path="/calendar" element={allowedNav.some(n=>n.path==='/calendar')?<CalendarPage key={company}/>:<Navigate to="/" replace/>}/><Route path="/sales" element={allowedNav.some(n=>n.path==='/sales')?<SalesPage key={company}/>:<Navigate to="/" replace/>}/><Route path="/approvals" element={allowedNav.some(n=>n.path==='/approvals')?<ApprovalsPage key={company}/>:<Navigate to="/" replace/>}/><Route path="/reports" element={allowedNav.some(n=>n.path==='/reports')?<ReportsPage key={company}/>:<Navigate to="/" replace/>}/><Route path="/settings" element={<SettingsPage />}/><Route path="/saas" element={session.isSuperAdmin?<SaaSCenter />:<Navigate to="/" replace/>}/><Route path="/platform" element={session.isPlatformOperator?<PlatformConsole />:<Navigate to="/" replace/>}/>{['learning', 'advisory', 'products', 'projects', 'finance'].map(p => <Route key={p} path={`/${p}`} element={allowedNav.some(n=>n.path===`/${p}`)?<DomainPage key={`${p}:${company}`} domain={p}/>:<Navigate to="/" replace/>}/>)}<Route path="*" element={<Navigate to="/" replace/>}/></Routes></main></div></div></Context.Provider>;
}
// Browser-tab authentication is intentionally explicit: a freshly opened tab
// presents login even if another tab has a valid cookie. Refreshing a tab after
// a successful login retains its tab-local sign-in state.
const TAB_SIGNED_IN = 'bitstek_workspace_tab_signed_in';
function AppContent() {
    const {t,setLocale}=useLocale();
    const [version, setVersion] = useState(0);
    const [tabSignedIn, setTabSignedIn] = useState(() => sessionStorage.getItem(TAB_SIGNED_IN) === 'yes');
    const [company, setCompanyState] = useState(localStorage.getItem('bw_company') || 'all');
    const query = useQueryClient();
    const navigate = useNavigate();
    const location = useLocation();
    const me = useQuery({
        queryKey: ['auth', version],
        queryFn: async () => (await http.get<Session>('/auth/me',{headers:{'x-company-id':'all'}})).data,
        refetchInterval: 60000,
        refetchOnWindowFocus: true,
        enabled: tabSignedIn,
        retry: false,
    });
    useEffect(()=>{if(!localStorage.getItem('bw_language_override') && me.data?.tenant?.defaultLocale) setLocale(me.data.tenant.defaultLocale);},[me.data?.tenant?.defaultLocale]);
    const forgetSession = () => {
        sessionStorage.removeItem(TAB_SIGNED_IN);
        query.clear();
        setTabSignedIn(false);
        navigate('/login', { replace: true });
    };
    useEffect(() => {
        const onExpire = () => forgetSession();
        window.addEventListener('session-expired', onExpire);
        return () => window.removeEventListener('session-expired', onExpire);
    }, [navigate, query]);
    useEffect(() => {
        if (!tabSignedIn && location.pathname !== '/login' && location.pathname !== '/invite') {
            navigate('/login', { replace: true });
        } else if (tabSignedIn && me.data && location.pathname === '/login') {
            navigate(me.data.isPlatformOperator && me.data.companies.length===0 ? '/platform' : '/', { replace: true });
        }
    }, [tabSignedIn, me.data, location.pathname, navigate]);
    const signIn = () => {
        sessionStorage.setItem(TAB_SIGNED_IN, 'yes');
        query.removeQueries({ queryKey: ['auth'] });
        // A different user may be signing in; never reuse the prior company.
        localStorage.setItem('bw_company','all');
        setCompanyState('all');
        setTabSignedIn(true);
        setVersion(v => v + 1);
        navigate('/', { replace: true });
    };
    const setCompany = (id: string) => {
        if (id === company) return;
        // Every company change invalidates the operational view. This prevents
        // previously selected company records from flashing in the new view.
        void query.cancelQueries();
        query.removeQueries({predicate: item => item.queryKey[0] !== 'auth'});
        localStorage.setItem('bw_company', id);
        setCompanyState(id);
    };
    const authorizedCompany = me.data ? selectAuthorizedCompany(company, me.data) : company;
    useEffect(() => {
        if (me.data && authorizedCompany !== company) setCompany(authorizedCompany);
    }, [me.data, company, authorizedCompany]);
    if (location.pathname==='/invite') return <InviteClaim onLogin={(ws,email)=>{
        sessionStorage.removeItem(TAB_SIGNED_IN);setTabSignedIn(false);query.clear();
        const params=new URLSearchParams();if(ws)params.set('workspace',ws);if(email)params.set('email',email);
        navigate('/login'+(params.size?'?'+params.toString():''),{replace:true});
    }}/>;
    if (!tabSignedIn) return <Login onLogin={signIn}/>;
    if (me.isPending || me.isLoading) {
        return <div className="boot-screen"><div className="brand"><span className="brand-mark"><i /><i /></span>Bitstek Workspace</div><p>{t('Loading your workspace…')}</p></div>;
    }
    if (me.isError || !me.data) {
        // Network failures are different from expired sessions: provide Retry.
        return <div className="boot-screen"><div className="brand">Bitstek Workspace</div><p>Could not load your account. Check the API connection.</p><button className="button primary" onClick={() => void me.refetch()}>Retry connection</button><button className="button secondary" onClick={forgetSession}>Return to login</button></div>;
    }
    if (authorizedCompany !== company) return <div className="boot-screen"><p>Loading your assigned company…</p></div>;
    return <Shell session={me.data} company={company} setCompany={setCompany} refresh={() => { void query.invalidateQueries({ queryKey: ['auth'] }); }} onLogout={forgetSession} />;
}
export default function App() { return <LocaleProvider><ToastProvider><AppContent /></ToastProvider></LocaleProvider>; }
