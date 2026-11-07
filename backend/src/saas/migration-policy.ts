/** Dependency-free security policy, used by the migration API and offline tools. */
export const MIGRATION_CONFIRM='I_HAVE_VERIFIED_BACKUPS_AND_STOPPED_WRITES';
export function safeLabel(text:string):boolean {return /^[a-z0-9][a-z0-9 _.-]{1,79}$/i.test(text);}
export function eligibleForApproval(plan:{status:string;requestedBy:any},by:string):boolean{
  return plan.status==='planned' && String(plan.requestedBy)!==by;
}
export function eligibleForExecution(plan:{status:string;requestedBy:any;approvedBy?:any}, by?:string):boolean{
  return plan.status==='approved' && !!plan.approvedBy && String(plan.approvedBy)!==String(plan.requestedBy) && (!by || by===String(plan.requestedBy) || by===String(plan.approvedBy));
}
