import {useState} from 'react';
import {Download,UploadCloud} from 'lucide-react';
import {http} from '../api';

type Result={created:number;valid:number;invalid:number;errors:{row:number;error:string}[];preview?:{row:number;title:string;priority:string;vertical:string;dueDate:string}[]};
export default function TaskImport({companyId,onClose,onImported}:{companyId:string;onClose:()=>void;onImported:()=>void}){
 const [file,setFile]=useState<File|null>(null);const [result,setResult]=useState<Result|null>(null);
 const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const upload=async(preview:boolean)=>{
  if(!file)return;setBusy(true);setError('');
  try{const form=new FormData();form.append('file',file);form.append('preview',String(preview));
   const response=await http.post<Result>('/records/tasks/import/upload',form,{headers:{'x-company-id':companyId}});
   setResult(response.data);if(!preview&&response.data.created>0)onImported();
  }catch(e:any){setError(e.message||'Upload failed');}finally{setBusy(false);}
 };
 const sample=async()=>{try{const r=await http.get('/records/tasks/import/template.csv',{headers:{'x-company-id':companyId},responseType:'blob'});
  const url=URL.createObjectURL(r.data),a=document.createElement('a');a.href=url;a.download='bitstek_task_import_sample.csv';a.click();URL.revokeObjectURL(url);
 }catch(e:any){setError(e.message);}};
 return <div className="task-import-mask" role="dialog" aria-modal="true" aria-label="Bulk task import"><section className="task-import-dialog">
  <div className="task-import-head"><h2>Bulk create tasks</h2><button className="button secondary" onClick={onClose}>Close</button></div>
  <p>Upload CSV or Excel with title, description, priority, vertical, and dueDate. All tasks start in Backlog, unassigned.</p>
  <button className="button secondary" onClick={()=>void sample()}><Download size={16}/> Download sample CSV</button>
  <p className="muted tiny">Priority accepts P1/High, P2/Medium, P3/Low. Date: YYYY-MM-DD. Up to 500 rows / 2 MB.</p>
  <input aria-label="Task import file" type="file" accept=".csv,.xlsx" onChange={e=>{setFile(e.target.files?.[0]||null);setResult(null);}}/>
  {error&&<p role="alert" className="task-import-error">{error}</p>}
  {result&&<div><p><b>{result.valid}</b> valid · <b>{result.invalid}</b> invalid · <b>{result.created}</b> created</p>
   {!!result.errors.length&&<div className="task-import-errors" role="alert">{result.errors.map((x,i)=><p key={i}>Row {x.row}: {x.error}</p>)}</div>}
   {!!result.preview?.length&&<div className="task-import-preview"><table><thead><tr><th>Title</th><th>Priority</th><th>Vertical</th><th>Due</th></tr></thead><tbody>{result.preview.slice(0,30).map(x=><tr key={x.row}><td>{x.title}</td><td>{x.priority}</td><td>{x.vertical}</td><td>{x.dueDate||'—'}</td></tr>)}</tbody></table></div>}
  </div>}
  <div className="task-import-actions"><button className="button secondary" disabled={busy||!file} onClick={()=>void upload(true)}>1. Validate & preview</button>
  <button className="button primary" disabled={busy||!file||!result||result.invalid>0||result.created>0} onClick={()=>void upload(false)}><UploadCloud size={16}/> 2. Create in Backlog</button></div>
 </section></div>;
}
