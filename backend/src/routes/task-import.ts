import { Router } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import { parse } from 'csv-parse/sync';
import { Task, Company } from '../models.js';
import { ImportBatch } from '../saas/models.js';
import { HttpError, requireCompany, requirePermission, wrap } from '../lib/security.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: {fileSize: 2 * 1024 * 1024, files:1} });
export const TASK_HEADERS=['title','description','priority','vertical','dueDate'] as const;
const priorityMap: Record<string,string>={p1:'P1',high:'P1',critical:'P1',urgent:'P1',p2:'P2',medium:'P2',normal:'P2',p3:'P3',low:'P3'};
export function validateTaskRows(data: Record<string,unknown>[]) {
  const rows: {row:number;title:string;description:string;priority:string;vertical:string;dueAt?:Date}[]=[];
  const errors:{row:number;error:string}[]=[];
  if(!data.length)errors.push({row:1,error:'No task records found'});
  data.forEach((r,i)=>{
    const row=i+2, title=String(r.title??'').trim(), description=String(r.description??'').trim(),
      priorityValue=String(r.priority??'P2').trim().toLowerCase(),priority=priorityMap[priorityValue],
      vertical=String(r.vertical??'').trim(),dateText=String(r.dueDate??'').trim();
    const faults:string[]=[];
    if(!title||title.length>200)faults.push('Title is required (max 200 characters)');
    if(description.length>10000)faults.push('Description exceeds 10000 characters');
    if(!priority)faults.push('Priority must be P1/P2/P3 or High/Medium/Low');
    if(!vertical||vertical.length>100)faults.push('Vertical is required (max 100 characters)');
    let dueAt:Date|undefined;
    if(dateText){
      if(!/^\d{4}-\d{2}-\d{2}$/.test(dateText))faults.push('Due Date must be YYYY-MM-DD');
      else {dueAt=new Date(dateText+'T12:00:00.000Z');if(!Number.isFinite(dueAt.getTime())||dueAt.toISOString().slice(0,10)!==dateText)faults.push('Invalid due date');}
    }
    if(faults.length)errors.push({row,error:faults.join('; ')});
    else rows.push({row,title,description,priority,vertical,dueAt});
  });
  return {rows,errors};
}
async function loadRows(file:Express.Multer.File): Promise<Record<string,unknown>[]> {
  if(!file||!(/\.(csv|xlsx)$/i).test(file.originalname))throw new HttpError(400,'Upload a .csv or .xlsx file');
  if(file.originalname.toLowerCase().endsWith('.csv')){
    const records=parse(file.buffer.toString('utf8').replace(/^\uFEFF/,''),{columns:true,skip_empty_lines:true,trim:true,bom:true,relax_column_count:false}) as Record<string,unknown>[];
    if(!records.length)return [];
    return records.map(row=>Object.fromEntries(TASK_HEADERS.map(h=>[h,row[h]??row[h.toLowerCase()]??''])));
  }
  // ExcelJS is required for XLSX imports; never run executable macros.
  const {default:ExcelJS}=await import('exceljs');
  const workbook=new ExcelJS.Workbook(); await workbook.xlsx.load(file.buffer);
  const sheet=workbook.worksheets[0]; if(!sheet)throw new HttpError(400,'Workbook contains no worksheet');
  const headers: string[]=[];
  sheet.getRow(1).eachCell({includeEmpty:true},(cell:any,n:number)=>{headers[n-1]=String(cell.text??'').trim();});
  const output:Record<string,unknown>[]=[];
  sheet.eachRow((row:any,n:number)=>{if(n===1)return;const record:Record<string,unknown>={};
    TASK_HEADERS.forEach(key=>{const col=headers.findIndex(h=>h.toLowerCase()===key.toLowerCase());
      const cell=col<0?null:row.getCell(col+1);let value=cell?.value;
      if(value instanceof Date)value=value.toISOString().slice(0,10);
      else if(value&&typeof value==='object')value=cell?.text;
      record[key]=value??'';
    });
    if(Object.values(record).some(v=>String(v).trim()))output.push(record);
  });
  return output;
}
router.get('/template.csv',wrap(async(req,res)=>{
  const companyId=requireCompany(req);requirePermission(req,'operations','write');
  res.type('text/csv').setHeader('Content-Disposition','attachment; filename="bitstek_task_import_sample.csv"');
  res.send('title,description,priority,vertical,dueDate\r\nDesign login UI,Responsive design,High,IT & Products,2027-01-10\r\nCreate course notes,Upload PDF notes,P2,Learning,2027-01-15\r\n');
}));
router.post('/upload',upload.single('file'),wrap(async(req,res)=>{
  const companyId=requireCompany(req);requirePermission(req,'operations','write');
  if(!req.file)throw new HttpError(400,'File is required');
  const company=await Company.findOne({_id:companyId,active:true}).lean();
  if(!company)throw new HttpError(403,'Company not available');
  const all=await loadRows(req.file);
  if(all.length>500)throw new HttpError(400,'Maximum 500 tasks per upload');
  const {rows,errors}=validateTaskRows(all);
  if(req.body.preview==='true'||errors.length){res.json({created:0,valid:rows.length,invalid:errors.length,errors,preview:rows.map(({dueAt,...r})=>({...r,dueDate:dueAt?.toISOString().slice(0,10)||''}))});return;}
  // Only accepted fields are persisted. Tenant ID and company are server-derived.
  const docs=rows.map(r=>({title:r.title,description:r.description,priority:r.priority,vertical:r.vertical,
    dueAt:r.dueAt,status:'backlog',assigneeIds:[],companyId,createdBy:req.actor!.id}));
  if(!docs.length)throw new HttpError(400,'No valid tasks');
  const digest=crypto.createHash('sha256').update(req.file.buffer).digest('hex');
  const tasks=await Task.insertMany(docs,{ordered:true});
  await ImportBatch.create({tenantId:req.actor!.tenantId,companyId,createdBy:req.actor!.id,
    entity:'tasks',inputDigest:digest,status:'completed',importedCount:tasks.length,failedCount:0,errors:[]});
  res.status(201).json({created:tasks.length,valid:tasks.length,invalid:0,errors:[]});
}));
export default router;
