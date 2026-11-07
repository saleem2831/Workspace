import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { mayManageMemberRole, roleAllows } from '../lib/access.js';
import { ensureCompanyQuota, ensureUserQuota } from '../saas/limits.js';
import { TenantMembership } from '../saas/models.js';
import { BUSINESS_MODULES, modulesForVertical, normalizeModules } from '../lib/company-modules.js';
import { Company, User, Membership, AuditLog, WorkspaceSetting, ApprovalRequest, Subscription, Task, StoredFile, models } from '../models.js';
import { allowedCompanies, audit, HttpError, requireCompany, requirePermission, wrap, moduleOf } from '../lib/security.js';
const router = Router();
const domains = ['operations','learning','advisory','sales','products','projects','finance','approvals','reports'];
const permissionSchema = z.array(z.string()).default([]).refine(items => items.every(p => domains.some(d => p === `${d}:read` || p === `${d}:write`)), 'Invalid module permissions');

// Super Admin can manage Owner or Team. Company Owners may manage Team only.
function requireTeamManagement(req: import('express').Request, companyId: string, currentRole?: string, requestedRole?: string) {
    const actorRole = req.actor?.roles[companyId];
    if (!mayManageMemberRole(actorRole, currentRole, requestedRole, req.actor?.isSuperAdmin))
        throw new HttpError(403, 'Only Super Admin can manage Owners. Owners can manage Team members in their companies.');
}
async function protectSuperAdminAccount(userId: string, tenantId: string) {
    if (await TenantMembership.exists({userId,tenantId,role:'super_admin',active:true}))
        throw new HttpError(403, 'A Super Admin account cannot be changed through company membership controls');
}
async function protectLastOwner(companyId: string, existingRole: string, nextRole?: string, nextActive?: boolean) {
    if (existingRole !== 'owner' || (nextRole === undefined || nextRole === 'owner') && nextActive !== false) return;
    const count = await Membership.countDocuments({ companyId, role:'owner', active:true, removedAt:{$exists:false} });
    if (count <= 1) throw new HttpError(409, 'The company must keep at least one active Owner');
}

router.get('/notifications', wrap(async (req,res) => {
    const ids = allowedCompanies(req, 'approvals');
    const filter = { companyId: { $in: ids }, status: 'pending', requestedBy: { $ne: req.actor!.id }, $or: [{ reviewerIds: { $exists: false } }, { reviewerIds: { $size: 0 } }, { reviewerIds: req.actor!.id }] };
    const approvals = await ApprovalRequest.countDocuments(filter);
    const productIds = allowedCompanies(req,'products');
    const operationsIds = allowedCompanies(req,'operations');
    const renewals = productIds.length ? await Subscription.countDocuments({ companyId:{$in:productIds},status:'active',renewAt:{$lte:new Date(Date.now()+30*86400000)}}) : 0;
    const tasksDue = operationsIds.length ? await Task.countDocuments({companyId:{$in:operationsIds},$or:[{ownerId:req.actor!.id},{assigneeIds:req.actor!.id}],status:{$nin:['archived','completed']},dueAt:{$lte:new Date(Date.now()+2*86400000)}}) : 0;
    res.json({ count:approvals+renewals+tasksDue, approvals, renewals, tasksDue });
}));
router.get('/branding', wrap(async (req, res) => {
    const branding = await WorkspaceSetting.findOne({ key: 'workspace' }).lean();
    res.json({ name: branding?.name || 'Bitstek Workspace', logoFileId: branding?.logoFileId || null });
}));
router.patch('/branding', wrap(async (req, res) => {
    if (!req.actor!.isSuperAdmin) throw new HttpError(403, 'Workspace super administrator only');
    const input = z.object({ name: z.string().min(3).max(80).optional(), logoFileId: z.string().regex(/^[0-9a-f]{24}$/).nullable().optional() }).parse(req.body);
    if (input.logoFileId && !await StoredFile.exists({ _id: input.logoFileId, purpose: 'workspace-logo' })) throw new HttpError(400, 'Logo file not found');
    const saved = await WorkspaceSetting.findOneAndUpdate({ key: 'workspace' }, { $set: input }, { upsert: true, new: true });
    await audit(req, 'workspace.branding', 'settings', String(saved._id), input);
    res.json(saved);
}));
router.get('/members', wrap(async (req, res) => {
    const companyId = requireCompany(req);
    const memberships = await Membership.find({ companyId, active: true, removedAt:{$exists:false} }).lean();
    const users = await User.find({ _id: { $in: memberships.map(m => m.userId) }, active: true }).select('name email').lean();
    res.json(users.map(u => {const membership=memberships.find(m=>String(m.userId)===String(u._id));return { _id:u._id,name:u.name,email:u.email,role:membership?.role,permissions:membership?.permissions||[] }; }));
}));
router.get('/companies', wrap(async (req, res) => res.json(await Company.find({ _id: { $in: req.actor!.companyIds } }).sort({ name: 1 }).lean())));
router.post('/companies', wrap(async (req, res) => {
    const existingOwner = req.actor!.isSuperAdmin;
    if (!existingOwner)
        throw new HttpError(403, 'Super Admin role required to create a company');
    const input = z.object({ name: z.string().trim().min(2), code: z.string().min(2).max(15).regex(/^[A-Za-z0-9_-]+$/), vertical: z.string().min(2).default('General Business'), currency: z.enum(['INR','USD','AED','SAR']).default('INR'), enabledModules:z.array(z.enum(BUSINESS_MODULES)).optional() }).parse(req.body);
    await ensureCompanyQuota(req.actor!.tenantId);
    const doc = await Company.create({tenantId:req.actor!.tenantId,...input,enabledModules:normalizeModules(input.enabledModules ?? modulesForVertical(input.vertical))});
    await Membership.create({ userId: req.actor!.id, companyId: doc._id, role: 'owner' });
    await audit(req, 'company.create', 'companies', String(doc._id), { name: doc.name }, String(doc._id));
    res.status(201).json(doc);
}));
// Company module updates and lifecycle actions live in company-management.ts.
router.get('/users', wrap(async (req, res) => {
    const ids = (req.companyIds || []).filter(id => ['owner','super_admin'].includes(req.actor!.roles[id]));
    if (!ids.length)
        throw new HttpError(403, 'Owner or Super Admin role required');
    const memberships = await Membership.find({ companyId: { $in: ids },removedAt:{$exists:false} }).lean();
    // Tenant roles are authoritative: the legacy global User.isSuperAdmin flag
    // does not reflect a Super Admin created by the SaaS bootstrap.
    const tenantAdmins = req.actor!.isSuperAdmin
        ? await TenantMembership.find({tenantId:req.actor!.tenantId,role:'super_admin',active:true}).select('userId').lean()
        : [];
    const userIds = [...new Set([...memberships.map(m=>String(m.userId)),...tenantAdmins.map(m=>String(m.userId))])];
    const [users,tenantAccess] = await Promise.all([
        User.find({ _id: { $in: userIds } }).select('name email active createdAt').lean(),
        TenantMembership.find({tenantId:req.actor!.tenantId,userId:{$in:userIds}}).select('userId role active').lean(),
    ]);
    res.json(users.map(u => {
        const access=tenantAccess.find(m=>String(m.userId)===String(u._id));
        return {...u,isSuperAdmin:access?.role==='super_admin' && access.active!==false,
            tenantMembershipActive:!!access?.active,tenantMembershipSuspended:!!access && access.active===false,
            memberships:memberships.filter(m=>String(m.userId)===String(u._id))};
    }));
}));
// Recover a user created by an older v6.2 build that wrote a company
// membership but forgot their tenant membership. This never changes passwords,
// account roles, or existing tenant suspension state.
router.post('/users/:id/repair-workspace-access',wrap(async(req,res)=>{
    if(!req.actor!.isSuperAdmin)throw new HttpError(403,'Tenant Super Admin required');
    if(!mongoose.isValidObjectId(req.params.id))throw new HttpError(400,'Invalid user ID');
    const user=await User.findOne({_id:req.params.id,active:true}).select('_id email sessionVersion');
    if(!user)throw new HttpError(404,'Active user not found');
    const companyIds=req.actor!.companyIds;
    const companyMembership=await Membership.exists({userId:user._id,companyId:{$in:companyIds},active:true,removedAt:{$exists:false}});
    if(!companyMembership)throw new HttpError(403,'User has no active membership in this tenant');
    const existing=await TenantMembership.findOne({tenantId:req.actor!.tenantId,userId:user._id});
    if(existing?.active) return res.json({ok:true,alreadyActive:true});
    if(existing&&!existing.active)
        throw new HttpError(409,'Tenant membership is suspended; it requires a separate authorized reactivation procedure');
    await TenantMembership.findOneAndUpdate(
        {tenantId:req.actor!.tenantId,userId:user._id},
        {$setOnInsert:{role:'member',active:true}},
        {upsert:true,new:true,setDefaultsOnInsert:true},
    );
    await User.updateOne({_id:user._id},{$inc:{sessionVersion:1}});
    await audit(req,'user.repair-tenant-membership','users',String(user._id),{email:user.email});
    res.json({ok:true,created:true});
}));
// Minimal membership metadata for a specific member across companies the
// requesting administrator can manage. Business records are not returned.
router.get('/users/:id/company-access', wrap(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, 'Invalid user ID');
    const visibleIds = (req.companyIds || []).filter(id => ['owner','super_admin'].includes(req.actor!.roles[id]));
    if (!visibleIds.length || !await Membership.exists({userId:req.params.id,companyId:{$in:visibleIds},removedAt:{$exists:false}}))
        throw new HttpError(404, 'Member not found in the selected company');
    const managedIds = req.actor!.companyIds.filter(id => ['owner','super_admin'].includes(req.actor!.roles[id]));
    const memberships = await Membership.find({userId:req.params.id,companyId:{$in:managedIds},active:true,removedAt:{$exists:false}})
        .select('companyId role active').lean();
    res.json({memberships});
}));
router.post('/users', wrap(async (req, res) => {
    const companyId = requireCompany(req);
    requireTeamManagement(req, companyId);
    const input = z.object({ name: z.string().min(2), email: z.string().email(), password: z.string().min(12), role: z.enum(['owner', 'team']), permissions: permissionSchema }).parse(req.body);
    requireTeamManagement(req, companyId, undefined, input.role);
    const email = input.email.toLowerCase();
    if (await User.exists({ email }))
        throw new HttpError(409, 'User exists; assign company membership separately');
    await ensureUserQuota(req.actor!.tenantId);
    const passwordHash = await bcrypt.hash(input.password, 12);
    // An authenticated SaaS login REQUIRES an active TenantMembership as well
    // as a company membership. Commit all three documents atomically so no
    // partially provisioned account can be returned as successfully created.
    let createdId = '';
    const dbSession = await mongoose.startSession();
    try {
        await dbSession.withTransaction(async () => {
            const [created] = await User.create([{name:input.name,email,passwordHash,active:true}],{session:dbSession});
            createdId = String(created._id);
            await TenantMembership.create([{
                tenantId:req.actor!.tenantId,userId:created._id,role:'member',active:true,
            }],{session:dbSession});
            await Membership.create([{
                userId:created._id,companyId,role:input.role,
                permissions:input.role==='team'?input.permissions:[],active:true,
            }],{session:dbSession});
        });
    } finally { await dbSession.endSession(); }
    await audit(req,'user.create','users',createdId,{email,role:input.role,tenantMembershipCreated:true},companyId);
    res.status(201).json({id:createdId,email});
}));
// Compatibility endpoint for older clients. Applies the same handoff guard as the v5.5 editor.
router.patch('/users/:id', wrap(async (req, res) => {
    const companyId=requireCompany(req);
    const input=z.object({role:z.enum(['owner','team']).optional(),permissions:permissionSchema.optional(),active:z.boolean().optional()}).parse(req.body);
    await protectSuperAdminAccount(req.params.id,req.actor!.tenantId);
    const membership=await Membership.findOne({userId:req.params.id,companyId,removedAt:{$exists:false}});
    if(!membership)throw new HttpError(404,'Membership not found');
    requireTeamManagement(req,companyId,membership.role,input.role);
    if(req.actor!.id===req.params.id && (input.active===false || (input.role && input.role!==membership.role)))
        throw new HttpError(409,'Cannot change your own role or deactivate yourself');
    await protectLastOwner(companyId,membership.role,input.role,input.active);
    const role=input.role||membership.role;
    const permissions=role==='team'?(input.permissions||membership.permissions||[]):[];
    if(input.active===false||input.role||input.permissions){
        const impacted=await ownershipImpact(companyId,req.params.id);
        if(input.active===false && Object.values(impacted).some(n=>n>0))
            throw new HttpError(409,'Remove access with assignment handoff before deactivating this member');
        for(const [entity,count] of Object.entries(impacted)) {
            if(count && !roleAllows(role,permissions,moduleOf[entity],'write'))
                throw new HttpError(409,`Reassign active ${entity} before removing ${moduleOf[entity]} edit permission`);
        }
    }
    membership.role=role;
    membership.permissions=permissions;
    if(input.active!==undefined)membership.active=input.active;
    await membership.save();
    await User.updateOne({_id:req.params.id},{$inc:{sessionVersion:1}});
    await audit(req,'membership.update','memberships',String(membership._id),{role,permissionCount:permissions.length,active:membership.active},companyId);
    res.json(membership);
}));
// Editing an existing membership is one confirmed operation, not an immediate
// dropdown write. Personal identity belongs to the workspace and is editable
// only by Super Admin because the same user may belong to other companies.
router.patch('/users/:id/edit', wrap(async (req, res) => {
    const companyId = requireCompany(req);
    requireTeamManagement(req, companyId);
    const input = z.object({
        role: z.enum(['owner','team']),
        permissions: permissionSchema,
        name: z.string().trim().min(2).max(100).optional(),
        email: z.string().email().optional(),
    }).parse(req.body);
    await protectSuperAdminAccount(req.params.id,req.actor!.tenantId);
    const current = await Membership.findOne({ userId:req.params.id, companyId, active:true, removedAt:{$exists:false} });
    if (!current) throw new HttpError(404, 'Membership not found');
    requireTeamManagement(req, companyId, current.role, input.role);
    if (req.actor!.id === req.params.id && input.role !== current.role)
        throw new HttpError(409, 'You cannot change your own role');
    await protectLastOwner(companyId, current.role, input.role);
    if (input.role !== current.role || input.role === 'team') {
        const impacts = await ownershipImpact(companyId,req.params.id);
        for (const [entity,count] of Object.entries(impacts)) {
            const domain=moduleOf[entity];
            if (count && !roleAllows(input.role,input.permissions,domain,'write'))
                throw new HttpError(409, `This member still has ${count} active ${entity} assignments. Remove access with reassignment before revoking ${domain} edit permission.`);
        }
    }
    if ((input.name !== undefined || input.email !== undefined) && !req.actor!.isSuperAdmin)
        throw new HttpError(403, 'Only the workspace Super Admin may edit a user’s global name or email');
    const dbSession = await mongoose.startSession();
    try {
        await dbSession.withTransaction(async () => {
            const membership = await Membership.findOne({ userId:req.params.id,companyId,active:true,removedAt:{$exists:false} }).session(dbSession);
            if (!membership) throw new HttpError(404, 'Membership no longer available');
            requireTeamManagement(req, companyId, membership.role, input.role);
            await protectLastOwner(companyId, membership.role, input.role);
            membership.role = input.role;
            membership.permissions = input.role === 'team' ? input.permissions : [];
            await membership.save({ session:dbSession });
            const changes: Record<string,string> = {};
            if (input.name !== undefined) changes.name=input.name;
            if (input.email !== undefined) changes.email=input.email.trim().toLowerCase();
            if (Object.keys(changes).length) {
                const result = await User.updateOne({ _id:req.params.id }, { $set:changes }, { session:dbSession });
                if (!result.matchedCount) throw new HttpError(404, 'User not found');
            }
        });
    } finally { await dbSession.endSession(); }
    await User.updateOne({_id:req.params.id},{$inc:{sessionVersion:1}});
    await audit(req, 'membership.edit', 'memberships', req.params.id,
        { role:input.role, permissionCount:input.permissions.length, identityUpdated:input.name!==undefined||input.email!==undefined }, companyId);
    res.json({ updated:true });
}));
router.post('/users/:id/reset-password', wrap(async (req,res) => {
    const companyId = requireCompany(req);requirePermission(req,'settings','admin');
    if(!req.actor!.isSuperAdmin)throw new HttpError(403,'Workspace super administrator only');
    if (req.params.id === req.actor!.id) throw new HttpError(409,'Use your own password change form');
    await protectSuperAdminAccount(req.params.id,req.actor!.tenantId);
    if (!await Membership.exists({userId:req.params.id,companyId,active:true})) throw new HttpError(404,'User is not assigned to this company');
    const password = 'Temp-' + (await import('node:crypto')).randomBytes(18).toString('base64url') + '!9';
    const user = await User.findById(req.params.id);
    if (!user) throw new HttpError(404,'User not found');
    user.passwordHash=await bcrypt.hash(password,12);user.sessionVersion+=1;await user.save();
    await audit(req,'user.password-reset','users',req.params.id,{},companyId);
    res.json({temporaryPassword:password,warning:'Shown once. Share over a secure channel; user must change it after login.'});
}));
router.patch('/users/:id/active', wrap(async (req,res) => {
    const companyId=requireCompany(req);requireTeamManagement(req,companyId);
    const {active}=z.object({active:z.boolean()}).parse(req.body);
    if(req.params.id===req.actor!.id && !active)throw new HttpError(409,'Cannot deactivate yourself');
    await protectSuperAdminAccount(req.params.id,req.actor!.tenantId);
    const membership=await Membership.findOne({userId:req.params.id,companyId});
    if(!membership)throw new HttpError(404,'Membership missing');
    requireTeamManagement(req,companyId,membership.role);
    await protectLastOwner(companyId,membership.role,undefined,active);
    if (!active && Object.values(await ownershipImpact(companyId,req.params.id)).some(n=>n>0))
        throw new HttpError(409,'Member has active responsibilities. Use Remove access with reassignment first.');
    membership.active=active;await membership.save();
    await User.updateOne({_id:req.params.id},{$inc:{sessionVersion:1}});
    await audit(req,active?'member.reactivate':'member.deactivate','memberships',String(membership._id),{},companyId);
    res.json({active});
}));
// Owner-managed batch access: add one existing member to one or more companies.
// Existing active memberships are NEVER silently overwritten or removed.
// Each target is checked independently, preventing privilege escalation into
// other companies. The transaction guarantees all-or-nothing assignments.
router.post('/memberships/bulk-assign', wrap(async (req, res) => {
    const input = z.object({
        userId: z.string().regex(/^[0-9a-f]{24}$/i),
        companyIds: z.array(z.string().regex(/^[0-9a-f]{24}$/i)).min(1).max(50)
            .refine(ids => new Set(ids).size === ids.length, 'Duplicate companies selected'),
        role: z.enum(['owner','team']),
        permissions: permissionSchema,
    }).parse(req.body);
    if (input.userId === req.actor!.id)
        throw new HttpError(409, 'An administrator cannot grant themselves new company access');
    // The editor must already share at least one managed company with this user;
    // do not expose a global user directory or invite arbitrary unknown users.
    const managed = (req.actor!.companyIds || []).filter(id => ['owner','super_admin'].includes(req.actor!.roles[id]));
    if (!await Membership.exists({ userId:input.userId, companyId:{$in:managed}, removedAt:{$exists:false} }))
        throw new HttpError(403, 'This member is not in a company you manage');
    const user = await User.findOne({ _id:input.userId, active:true });
    if (!user) throw new HttpError(404, 'Active user not found');
    const existingTenantMembership=await TenantMembership.findOne({tenantId:req.actor!.tenantId,userId:input.userId});
    if(existingTenantMembership?.role==='super_admin')throw new HttpError(403,'Tenant Super Admin already has workspace-wide company access');
    if(existingTenantMembership?.active===false)throw new HttpError(409,'User workspace membership is suspended');
    for (const id of input.companyIds) {
        if (!req.actor!.companyIds.includes(id))
            throw new HttpError(403, 'Cannot assign a company outside your own access');
        requireTeamManagement(req, id, undefined, input.role);
    }
    const activeCompanies = await Company.find({ _id:{$in:input.companyIds}, active:true }).select('_id').lean();
    if (activeCompanies.length !== input.companyIds.length)
        throw new HttpError(400, 'One or more selected companies are unavailable');
    const existing = await Membership.find({ userId:input.userId,companyId:{$in:input.companyIds},active:true,removedAt:{$exists:false} }).select('companyId').lean();
    if (existing.length)
        throw new HttpError(409, 'A selected company is already assigned. Edit its membership separately');
    const dbSession = await mongoose.startSession();
    try {
        await dbSession.withTransaction(async () => {
            await TenantMembership.findOneAndUpdate({tenantId:req.actor!.tenantId,userId:input.userId},
                {$setOnInsert:{role:'member',active:true}},{upsert:true,session:dbSession});
            for (const companyId of input.companyIds) {
                // Re-check inside the transaction; no implicit role modifications.
                const current = await Membership.findOne({ userId:input.userId, companyId }).session(dbSession);
                if (current?.active && !current.removedAt)
                    throw new HttpError(409, 'Member is already active in a selected company');
                requireTeamManagement(req, companyId, current?.role, input.role);
                await Membership.findOneAndUpdate(
                    { userId:input.userId, companyId },
                    { $set:{ role:input.role, active:true,
                        permissions:input.role === 'team' ? input.permissions : [] },
                      $unset:{ removedAt:'' } },
                    { upsert:true,new:true,session:dbSession },
                );
                // Record the grant in the same transaction as the membership.
                await AuditLog.create([{ userId:req.actor!.id, companyId,
                    action:'membership.bulk-assign',entity:'memberships',entityId:input.userId,
                    details:{role:input.role},ip:req.ip }],{session:dbSession});
            }
        });
    } finally { await dbSession.endSession(); }
    await User.updateOne({_id:input.userId},{$inc:{sessionVersion:1}});
    res.status(201).json({ assigned:input.companyIds, role:input.role });
}));
router.post('/memberships', wrap(async (req, res) => {
    const companyId = requireCompany(req);
    requireTeamManagement(req, companyId);
    const input = z.object({ userId: z.string().regex(/^[0-9a-f]{24}$/), role: z.enum(['owner','team']), permissions: permissionSchema }).parse(req.body);
    const previous = await Membership.findOne({ userId: input.userId, companyId });
    requireTeamManagement(req, companyId, previous?.role, input.role);
    if (previous) await protectLastOwner(companyId, previous.role, input.role, true);
    if(await TenantMembership.exists({tenantId:req.actor!.tenantId,userId:input.userId,role:'super_admin',active:true}))throw new HttpError(403,'Tenant Super Admin is not assignable as a company role');
    const user = await User.findOne({_id:input.userId,active:true});
    if (!user) throw new HttpError(404, 'Active user not found');
    const existingTenantMembership=await TenantMembership.findOne({tenantId:req.actor!.tenantId,userId:user._id});
    // An arbitrary globally-known User ID must never be enough to enroll a
    // person into a different customer tenant. Only an already-member user or
    // an existing company member from this tenant may be assigned here.
    if(!existingTenantMembership && !await Membership.exists({
        userId:user._id,companyId:{$in:req.actor!.companyIds},active:true,removedAt:{$exists:false},
    }))throw new HttpError(403,'User is not an existing workspace member. Use a tenant invitation.');
    if(existingTenantMembership?.active===false)throw new HttpError(409,'User workspace membership is suspended');
    let doc:any;
    const dbSession=await mongoose.startSession();
    try{
        await dbSession.withTransaction(async()=>{
            doc=await Membership.findOneAndUpdate({userId:user._id,companyId},
                {$set:{role:input.role,permissions:input.role==='team'?input.permissions:[],active:true},$unset:{removedAt:''}},
                {upsert:true,new:true,session:dbSession});
            await TenantMembership.findOneAndUpdate({tenantId:req.actor!.tenantId,userId:user._id},
                {$setOnInsert:{role:'member',active:true}},
                {upsert:true,session:dbSession});
            await User.updateOne({_id:input.userId},{$inc:{sessionVersion:1}},{session:dbSession});
        });
    }finally{await dbSession.endSession();}
    await audit(req, 'membership.assign', 'memberships', String(doc._id), input, companyId);
    res.json(doc);
}));
// Reassign operational ownership; do not rewrite historical creator/reviewer or journal audit fields.
const handoffFields = ['ownerId','reviewerId','reviewerIds','assigneeIds','attendeeIds'] as const;
function handoffFilter(companyId:string,userId:string,entity:string){
  return {companyId,status: entity==='approvals'?'pending':{$ne:'archived'},$or:handoffFields.map(field=>({[field]:userId}))};
}
async function ownershipImpact(companyId:string,userId:string,session?:mongoose.ClientSession){
  const summaries:Record<string,number>={};
  for(const [entity,Model] of Object.entries(models)){
    const M:any=Model;
    const count=await M.countDocuments(handoffFilter(companyId,userId,entity)).session(session||null);
    if(count) summaries[entity]=count;
  }
  return summaries;
}
router.get('/memberships/:userId/impact',wrap(async(req,res)=>{
  const companyId=requireCompany(req);requirePermission(req,'settings','admin');
  if(!mongoose.isValidObjectId(req.params.userId))throw new HttpError(400,'Invalid user');
  const target = await Membership.findOne({companyId,userId:req.params.userId,active:true,removedAt:{$exists:false}});
  if(!target)throw new HttpError(404,'Member not found');
  requireTeamManagement(req,companyId,target.role);
  await protectSuperAdminAccount(req.params.userId,req.actor!.tenantId);
  const counts=await ownershipImpact(companyId,req.params.userId);
  res.json({counts,total:Object.values(counts).reduce((a,b)=>a+b,0),note:'Historical createdBy, approval maker and audit fields remain unchanged.'});
}));
router.delete('/memberships/:userId',wrap(async(req,res)=>{
  const companyId=requireCompany(req);requirePermission(req,'settings','admin');
  if(!mongoose.isValidObjectId(req.params.userId))throw new HttpError(400,'Invalid user');
  if(req.params.userId===req.actor!.id)throw new HttpError(409,'Cannot remove your own membership');
  await protectSuperAdminAccount(req.params.userId,req.actor!.tenantId);
  const {replacementUserId}=z.object({replacementUserId:z.string().regex(/^[0-9a-f]{24}$/i).optional()}).parse(req.body||{});
  if(replacementUserId===req.params.userId)throw new HttpError(400,'Choose a different replacement member');
  const session=await mongoose.startSession();
  let changed:Record<string,number>={};
  try {await session.withTransaction(async()=>{
    const member=await Membership.findOne({companyId,userId:req.params.userId,active:true,removedAt:{$exists:false}}).session(session);
    if(!member)throw new HttpError(404,'Active membership not found');
    requireTeamManagement(req, companyId, member.role);
    if(member.role==='owner'){
      const ownerCount=await Membership.countDocuments({companyId,role:'owner',active:true,removedAt:{$exists:false}}).session(session);
      if(ownerCount<=1)throw new HttpError(409,'Assign another owner before removing the last company owner');
    }
    changed=await ownershipImpact(companyId,req.params.userId,session);
    if(Object.values(changed).some(n=>n>0) && !replacementUserId)
      throw new HttpError(409,'Select a replacement member for active assignments before removing this user');
    if(replacementUserId){
      const replacement=await Membership.findOne({companyId,userId:replacementUserId,active:true,removedAt:{$exists:false}}).session(session);
      const activeUser=await User.exists({_id:replacementUserId,active:true}).session(session);
      if(!replacement || !activeUser) throw new HttpError(400,'Replacement must be an active member of this company');
      for(const [entity,count] of Object.entries(changed)){
        if(count<=0) continue;
        const domain=moduleOf[entity];
        const canOwn=roleAllows(replacement.role,replacement.permissions||[],domain,'write');
        if(!canOwn)throw new HttpError(409,`Replacement needs ${domain} edit permission to inherit ${entity} assignments`);
      }
      // Pending approvals require an eligible decision-maker who is not the request maker.
      if(changed.approvals){
        const bad=await models.approvals.exists({companyId,status:'pending',reviewerIds:req.params.userId,requestedBy:replacementUserId}).session(session);
        if(bad)throw new HttpError(409,'Replacement is the requester on a pending approval. Select a different authorized reviewer');
        if(!roleAllows(replacement.role,replacement.permissions||[],'approvals','approve'))
          throw new HttpError(409,'Replacement must have approvals permission to inherit pending reviews');
      }
      const oldId=new mongoose.Types.ObjectId(req.params.userId);
      const newId=new mongoose.Types.ObjectId(replacementUserId);
      for(const [entity,Model] of Object.entries(models)){
        const M:any=Model;
        const filter=handoffFilter(companyId,req.params.userId,entity);
        // Individual field updates preserve other assignees and existing historical metadata.
        for(const field of ['ownerId','reviewerId']){
          await M.updateMany({...filter,[field]:oldId},{$set:{[field]:newId}},{session});
        }
        for(const field of ['reviewerIds','assigneeIds','attendeeIds']){
          const fieldFilter={...filter,[field]:oldId};
          await M.updateMany(fieldFilter,{$addToSet:{[field]:newId}},{session});
          await M.updateMany(fieldFilter,{$pull:{[field]:oldId}},{session});
        }
      }
    }
    member.active=false;member.removedAt=new Date();await member.save({session});
    await User.updateOne({_id:req.params.userId},{$inc:{sessionVersion:1}},{session});
  });}finally{await session.endSession();}
  await audit(req,'membership.remove-and-handoff','memberships',req.params.userId,{replacementUserId:replacementUserId||null,impacted:changed},companyId);
  res.json({removed:true,reassigned:changed});
}));
router.get('/audit', wrap(async (req, res) => {
    const ids = allowedCompanies(req, 'settings', 'admin');
    if (!ids.length)
        throw new HttpError(403, 'Owner role required');
    res.json(await AuditLog.find({ companyId: { $in: ids } }).sort({ createdAt: -1 }).limit(150).lean());
}));
export default router;
