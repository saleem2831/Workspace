/** Configurable company capabilities. A vertical selects defaults, never a hard restriction. */
export const BUSINESS_MODULES = [
  'operations', 'learning', 'advisory', 'sales', 'products',
  'projects', 'finance', 'approvals', 'reports',
] as const;
export type BusinessModule = typeof BUSINESS_MODULES[number];
const valid = new Set<string>(BUSINESS_MODULES);
const common: BusinessModule[] = ['operations', 'sales', 'finance', 'approvals', 'reports'];
export const VERTICALS = ['Learning & Education', 'Advisory & Trading', 'IT Services & Products', 'General Business', 'Custom'] as const;
export function normalizeModules(input: readonly string[]): BusinessModule[] {
  return [...new Set(input)].filter((m): m is BusinessModule => valid.has(m));
}
export function modulesForVertical(vertical: string | undefined): BusinessModule[] {
  const value = (vertical || '').trim().toLowerCase();
  if (/learn|educat|train/.test(value)) return [...common, 'learning'];
  if (/advis|trad|financ(?:ial)?/.test(value)) return [...common, 'advisory'];
  if (/(^|\W)it(\W|$)|product|technolog|software/.test(value)) return [...common, 'products', 'projects'];
  if (value === 'custom') return ['operations'];
  return [...common];
}
export type CompanyCapabilities = { vertical?: string; enabledModules?: readonly string[] | null };
export function effectiveModules(company: CompanyCapabilities): BusinessModule[] {
  // Missing on historical v5.6 records: derive from vertical without losing data.
  // An explicitly empty array means the company has disabled every business module.
  return Array.isArray(company.enabledModules)
    ? normalizeModules(company.enabledModules)
    : modulesForVertical(company.vertical);
}
export function moduleEnabled(company: CompanyCapabilities, domain: string): boolean {
  return domain === 'settings' || effectiveModules(company).includes(domain as BusinessModule);
}
export const MODULE_DESCRIPTIONS: Record<BusinessModule,string> = {
  operations:'Work Board & Calendar',learning:'Learning',advisory:'Advisory',sales:'Sales',
  products:'Products',projects:'Projects',finance:'Finance',approvals:'Approvals',reports:'Reports',
};
