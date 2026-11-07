import crypto from 'node:crypto';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { config } from '../config.js';
import {originAllowed} from './origin-policy.js';
import { User, Membership, AuditLog, Company } from '../models.js';
import { Tenant, TenantMembership } from '../saas/models.js';
import { runWithTenant } from '../saas/tenant-context.js';
import { roleAllows, resolveCompanySelection } from './access.js';
import { effectiveModules } from './company-modules.js';
type Actor = {
    id: string;
    tenantId: string;
    tenantSlug: string;
    email: string;
    name: string;
    roles: Record<string, string>;
    permissions: Record<string, string[]>;
    companyIds: string[];
    isSuperAdmin: boolean;
    companyModules: Record<string, string[]>;
};
declare global {
    namespace Express {
        interface Request {
            actor?: Actor;
            tenantId?: string;
            companyId?: string;
            companyIds?: string[];
        }
    }
}
export class HttpError extends Error {
    constructor(public status: number, message: string) { super(message); }
}
export const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) => (req: Request, res: Response, next: NextFunction) => Promise.resolve(fn(req, res, next)).catch(next);
export function issueToken(id: string, sessionVersion: number, tenantId: string) { return jwt.sign({ sub: id, sv: sessionVersion, tid: tenantId }, config.secret, { expiresIn: '8h', issuer: 'bitstek-workspace' }); }
export function issueCsrfToken(res: Response): string {
    const token = crypto.randomBytes(24).toString('hex');
    res.cookie('bitstek_csrf', token, { httpOnly: false, secure: config.cookieSecure, sameSite: config.cookieSameSite, maxAge: 8 * 3600 * 1000, path: '/' });
    return token;
}
export function setSession(res: Response, token: string) {
    res.cookie('bitstek_session', token, { httpOnly: true, secure: config.cookieSecure, sameSite: config.cookieSameSite, maxAge: 8 * 3600 * 1000, path: '/' });
    issueCsrfToken(res);
}
export function clearSession(res: Response) {
    for (const name of ['bitstek_session', 'bitstek_csrf'])
        res.clearCookie(name, { path: '/', secure: config.cookieSecure, sameSite: config.cookieSameSite });
}
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
    try {
        const token = req.cookies?.bitstek_session;
        if (!token)
            throw new HttpError(401, 'Please log in');
        const payload = jwt.verify(token, config.secret, { issuer: 'bitstek-workspace' }) as jwt.JwtPayload;
        const user = await User.findById(payload.sub).lean();
        if (!user?.active || user.sessionVersion !== payload.sv)
            throw new HttpError(401, 'Session invalidated');
        const tenantId = String(payload.tid || '');
        if (!mongoose.isValidObjectId(tenantId)) throw new HttpError(401, 'Tenant session missing');
        const tenant = await Tenant.findOne({ _id: tenantId, status: 'active' }).lean();
        if (!tenant) throw new HttpError(403, 'Workspace is inactive or missing');
        const tenantMember = await TenantMembership.findOne({ tenantId: tenant._id, userId: user._id, active: true }).lean();
        if (!tenantMember) throw new HttpError(403, 'No membership in this workspace');
        const isSuperAdmin = tenantMember.role === 'super_admin';
        req.tenantId = tenantId;
        // Every downstream Mongoose query and write is constrained by this
        // verified tenant context; the company selector cannot change it.
        runWithTenant(tenantId, async () => {
            try {
                const memberships = await Membership.find({ tenantId, userId: user._id, active: true, removedAt: { $exists: false } }).lean();
                const companies = await Company.find(isSuperAdmin
                    ? { tenantId, active: true }
                    : { tenantId, active: true, _id: { $in: memberships.map(m => m.companyId) } })
                    .select('_id vertical enabledModules').lean();
                const companyModules = Object.fromEntries(companies.map(c => [String(c._id), effectiveModules(c)]));
                const roles: Record<string,string> = Object.fromEntries(memberships
                    .filter(m => companyModules[String(m.companyId)] !== undefined)
                    .map(m => [String(m.companyId), m.role]));
                if (isSuperAdmin) for (const company of companies) roles[String(company._id)] = 'super_admin';
                const permissions = Object.fromEntries(memberships
                    .filter(m => companyModules[String(m.companyId)] !== undefined)
                    .map(m => [String(m.companyId), m.permissions || []]));
                req.actor = { id: String(user._id), tenantId, tenantSlug: tenant.slug, name: user.name,
                    email: user.email, roles, permissions, companyIds: Object.keys(roles), companyModules,
                    isSuperAdmin };
                const requested = String(req.header('x-company-id') || 'all');
                if (requested !== 'all' && !roles[requested]) throw new HttpError(403, 'Company is not assigned to this user');
                const effective = resolveCompanySelection(requested, roles, isSuperAdmin);
                req.companyId = effective;
                req.companyIds = effective === 'all' ? Object.keys(roles) : [effective];
                next();
            } catch (error) { next(error); }
        });

    }
    catch (e) {
        next(e);
    }
}
export function requireCompany(req: Request) {
    if (!req.companyId || req.companyId === 'all')
        throw new HttpError(400, 'Select one company before editing records');
    return req.companyId;
}
export const moduleOf: Record<string, string> = {
    bankAccounts: 'finance', mentors: 'learning', traders: 'advisory', vendors: 'finance', usdtTransactions: 'advisory', tasks: 'operations', events: 'operations', students: 'learning', courses: 'learning', batches: 'learning', installments: 'learning', internships: 'learning',
    tradingAccounts: 'advisory', dailyPerformance: 'advisory', capitalMovements: 'advisory', clients: 'sales', leads: 'sales', proposals: 'sales',
    products: 'products', subscriptions: 'products', projects: 'projects', milestones: 'projects',
    invoices: 'finance', expenses: 'finance', transfers: 'finance', receipts: 'finance', approvals: 'approvals',
};
export function can(req: Request, companyId: string, domain: string, action: 'read' | 'write' | 'approve' | 'admin' = 'read') {
    // Company feature switches restrict everyone, including Owners/Super Admin.
    // Workspace administration is handled separately by the settings routes.
    if (domain !== 'settings' && !(req.actor?.companyModules[companyId] || []).includes(domain)) return false;
    return roleAllows(req.actor?.roles[companyId], req.actor?.permissions[companyId] || [], domain, action);
}
export function allowedCompanies(req: Request, domain: string, action: 'read' | 'write' | 'approve' | 'admin' = 'read') {
    return (req.companyIds || []).filter(id => can(req, id, domain, action));
}
export function requirePermission(req: Request, domain: string, action: 'write' | 'approve' | 'admin' = 'write', companyId?: string) {
    const id = companyId || requireCompany(req);
    if (!can(req, id, domain, action))
        throw new HttpError(403, `Not authorized for ${domain}:${action}`);
    return id;
}
export function scopedQuery(req: Request, domain: string) {
    const ids = allowedCompanies(req, domain);
    if (!ids.length)
        throw new HttpError(403, 'No authorized company for this module');
    // Narrow employee views to their own work instead of granting a company-wide browse.
    return { companyId: { $in: ids } };
}
export async function audit(req: Request, action: string, entity: string, entityId: string | undefined, details: Record<string, any> = {}, companyId?: string) {
    await AuditLog.create({ tenantId: req.actor?.tenantId, userId: req.actor?.id, companyId: companyId || (req.companyId !== 'all' ? req.companyId : undefined), action, entity, entityId, details, ip: req.ip });
}
export function csrfGuard(req: Request, _res: Response, next: NextFunction) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || req.path === '/auth/login')
        return next();
    const origin = req.get('origin');
    if (!originAllowed(origin, config.allowedOrigins))
        return next(new HttpError(403, 'Origin rejected'));
    const cookieToken = req.cookies?.bitstek_csrf || '';
    const headerToken = req.get('x-csrf-token') || '';
    if (!cookieToken || !headerToken || cookieToken.length !== headerToken.length || !crypto.timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken)))
        return next(new HttpError(403, 'Invalid CSRF token'));
    next();
}
