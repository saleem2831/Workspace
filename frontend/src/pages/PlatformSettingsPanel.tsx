import {useEffect,useState} from 'react';
import type {FormEvent} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {Settings2} from 'lucide-react';
import {http} from '../api';
import ThemePicker,{type ThemeId} from '../components/ThemePicker';

type Settings={platformName:string;supportEmail:string;defaultLocale:'en'|'ar';defaultTheme:ThemeId};
export default function PlatformSettingsPanel({readOnly}:{readOnly:boolean}){
  const query=useQueryClient();const q=useQuery({queryKey:['platform','settings'],queryFn:async()=>(await http.get<Settings>('/platform/settings')).data});
  const [name,setName]=useState('Bitstek Workspace Platform');const [email,setEmail]=useState('');
  const [lang,setLang]=useState<'en'|'ar'>('en');const [theme,setTheme]=useState<ThemeId>('violet');
  const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
  useEffect(()=>{if(q.data){setName(q.data.platformName);setEmail(q.data.supportEmail);setLang(q.data.defaultLocale);setTheme(q.data.defaultTheme);}},[q.data]);
  const save=async(e:FormEvent)=>{e.preventDefault();setMessage('');setBusy(true);try{
    await http.patch('/platform/settings',{platformName:name,supportEmail:email,defaultLocale:lang,defaultTheme:theme});
    await query.invalidateQueries({queryKey:['platform','settings']});setMessage('Platform settings saved. This does not change existing customer workspaces.');
  }catch(e:any){setMessage(e.message||'Could not save platform settings');}finally{setBusy(false);}};
  return <section className="saas-panel platform-settings-panel"><header><Settings2/><div><h2>Platform Owner settings</h2><p>Platform-level branding and defaults. Separate from each customer tenant's own company branding.</p></div></header>
    {q.isLoading?<p>Loading settings…</p>:<form className="saas-form" onSubmit={save}>
      <label>Platform name<input required minLength={2} maxLength={100} value={name} disabled={readOnly} onChange={e=>setName(e.target.value)}/></label>
      <label>Support email<input type="email" placeholder="support@example.com" value={email} disabled={readOnly} onChange={e=>setEmail(e.target.value)}/></label>
      <label>Default language for new tenants<select value={lang} disabled={readOnly} onChange={e=>setLang(e.target.value as 'en'|'ar')}><option value="en">English</option><option value="ar">العربية</option></select></label>
      <fieldset className="saas-theme-fieldset" disabled={readOnly}><legend>Default colour theme for new tenants</legend><ThemePicker value={theme} disabled={readOnly} onChange={setTheme}/></fieldset>
      <p className="saas-note">Individual tenants can choose their own theme; changing these settings does not alter existing customer branding or subscription limits.</p>
      {!readOnly&&<button className="button primary" disabled={busy}>Save platform settings</button>}
      {message&&<p role="status">{message}</p>}
    </form>}
  </section>;
}
