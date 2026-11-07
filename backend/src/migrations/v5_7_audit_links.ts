/** Read-only: identify legacy v5.6 cross-company references for manual review. */
import 'dotenv/config';
import mongoose from 'mongoose';
import { Client, Invoice, Project, Lead, Subscription, Proposal, Product, Milestone, Student, Batch, Course } from '../models.js';
const uri=process.env.MONGODB_URI;
if(!uri)throw new Error('MONGODB_URI must be set');
await mongoose.connect(uri);
const checks=[
  {label:'invoice.client',source:Invoice,field:'clientId',target:Client},
  {label:'invoice.project',source:Invoice,field:'projectId',target:Project},
  {label:'project.client',source:Project,field:'clientId',target:Client},
  {label:'lead.client',source:Lead,field:'clientId',target:Client},
  {label:'proposal.lead',source:Proposal,field:'leadId',target:Lead},
  {label:'subscription.client',source:Subscription,field:'clientId',target:Client},
  {label:'subscription.product',source:Subscription,field:'productId',target:Product},
  {label:'milestone.project',source:Milestone,field:'projectId',target:Project},
  {label:'student.batch',source:Student,field:'batchId',target:Batch},
  {label:'student.course',source:Student,field:'courseId',target:Course},
] as const;
let problems=0;
try{
  for(const check of checks){
    let mismatches=0,missing=0;
    const cursor=check.source.find({[check.field]:{$exists:true,$ne:null}}).select(`companyId ${check.field}`).lean().cursor();
    for await(const doc of cursor){
      const id=(doc as any)[check.field];
      if(!id)continue;
      const ref=await check.target.findById(id).select('companyId').lean();
      if(!ref)missing++;
      else if(String(ref.companyId)!==String(doc.companyId))mismatches++;
    }
    if(mismatches||missing){console.warn(`${check.label}: ${mismatches} cross-company, ${missing} missing target(s)`);problems+=mismatches+missing;}
  }
  console.log(problems?`Attention: ${problems} links need manual reconciliation. No data modified.`:'No checked cross-company links found. No data modified.');
}finally{await mongoose.disconnect();}
