/** V5.5: three visible roles. Tenant Super Admin is a verified TenantMembership role, not a company role. */
export type ModuleAction = 'read' | 'write' | 'approve' | 'admin';
export const MODULE_DOMAINS = ['operations', 'learning', 'advisory', 'sales', 'products', 'projects', 'finance', 'approvals', 'reports'] as const;
export type CompanyRole = 'owner' | 'team';

/** This role is assigned only in memory to a verified workspace Super Admin. */
export function roleAllows(role: string | undefined, permissions: readonly string[], domain: string, action: ModuleAction = 'read'): boolean {
    if (!role) return false;
    if (role === 'super_admin' || role === 'owner') return true;
    if (role !== 'team') return false;
    if (action === 'admin' || domain === 'settings') return false;
    if (action === 'approve') return permissions.includes('approvals:write');
    if (action === 'read') return permissions.includes(`${domain}:read`) || permissions.includes(`${domain}:write`);
    return action === 'write' && permissions.includes(`${domain}:write`);
}

/** An Owner can manage Team members; only Super Admin can grant or edit Owner. */
export function mayManageMemberRole(actorRole: string | undefined, currentRole?: string, requestedRole?: string, isSuperAdmin = false): boolean {
    if (isSuperAdmin) return true;
    return actorRole === 'owner' && [currentRole, requestedRole].every(r => !r || r === 'team');
}

export function mayUseAllCompanies(roles: Record<string, string>, isSuperAdmin = false): boolean {
    const assigned = Object.values(roles);
    return isSuperAdmin || (assigned.length > 0 && assigned.every(role => role === 'owner'));
}

export function resolveCompanySelection(requested: string, roles: Record<string, string>, isSuperAdmin = false): string {
    const ids = Object.keys(roles);
    if (requested !== 'all' && ids.includes(requested)) return requested;
    if (requested === 'all' && mayUseAllCompanies(roles, isSuperAdmin)) return 'all';
    return ids[0] || 'all';
}
