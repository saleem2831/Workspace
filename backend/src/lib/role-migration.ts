/** Pure v5.4 -> v5.5 mapping. Existing permissions are retained where possible. */
import { MODULE_DOMAINS } from './access.js';
const previousDomainAccess: Record<string,readonly string[]> = {
  executive:['operations','learning','advisory','sales','products','projects','finance','approvals','reports'],
  finance_head:['operations','finance','approvals','reports','advisory'],
  sales_manager:['operations','sales','projects','reports'],
  project_manager:['operations','projects','sales','reports'],
  learning_coordinator:['operations','learning','reports'],
  trader:['operations','advisory'], employee:['operations'],
};
export const KNOWN_LEGACY_ROLES = ['manager','admin','staff','viewer','auditor',...Object.keys(previousDomainAccess)];
export function migrateMembershipRole(role:string, current:readonly string[]) {
  if(role==='owner') return {role:'owner',permissions:[] as string[]};
  if(role==='manager'||role==='admin') return {role:'team',permissions:MODULE_DOMAINS.map(x=>`${x}:write`)};
  if(role==='staff'||role==='team') return {role:'team',permissions:[...current]};
  if(role==='viewer') return {role:'team',permissions:[...new Set(current.map(x=>x.replace(/:write$/,':read')))]};
  if(role==='auditor') return {role:'team',permissions:MODULE_DOMAINS.map(x=>`${x}:read`)};
  if(previousDomainAccess[role])return {role:'team',permissions:previousDomainAccess[role].map(x=>`${x}:write`)};
  return {role:'team',permissions:[] as string[]};
}
