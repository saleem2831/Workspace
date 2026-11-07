import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { config } from '../config.js';
import { newSecret, encryptSecret, decryptSecret, matchTotp } from '../lib/mfa.js';
import { User, Company, WorkspaceSetting } from '../models.js';
import { Tenant, TenantMembership, PlatformOperator, TenantInvitation } from '../saas/models.js';
import { runWithTenant } from '../saas/tenant-context.js';
import { audit, authenticate, clearSession, issueToken, setSession, issueCsrfToken, wrap, HttpError, csrfGuard } from '../lib/security.js';
const router = Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 12, standardHeaders: 'draft-7', legacyHeaders: false });
/** For separately hosted frontends: the CSRF cookie is on the API host, so JS cannot read it.
 *  The exact-allowlist CORS policy protects the JSON response. Never enable wildcard CORS. */
router.get('/csrf', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ csrfToken: issueCsrfToken(res) });
});
router.post('/login', limiter, wrap(async (req, res) => {
    const input = z.object({ email: z.string().email(), password: z.string().min(1), tenantSlug: z.string().trim().regex(/^[a-z0-9-]{2,80}$/) }).parse(req.body);
    const user = await User.findOne({ email: input.email.toLowerCase() });
    if (!user || !user.active || !(await bcrypt.compare(input.password, user.passwordHash)))
        throw new HttpError(401, 'Incorrect email or password');
    const memberships = await TenantMembership.find({ userId: user._id, active: true }).lean();
    const tenantIds = memberships.map(m => m.tenantId);
    const tenants = await Tenant.find({ _id: { $in: tenantIds }, status: 'active',
        slug: input.tenantSlug }).lean();
    if (!tenants.length) throw new HttpError(403, 'No active workspace membership for this account');
    if (tenants.length > 1) throw new HttpError(409, 'Workspace code is required');
    // Hosted wildcard tenant domains cannot be used to log into a different workspace.
    // The configured API/admin subdomains are exempt for centrally hosted API deployments.
    const domain=(process.env.SAAS_BASE_DOMAIN||'').trim().toLowerCase().replace(/^\./,'');
    const host=req.hostname.toLowerCase();
    if(domain&&host.endsWith('.'+domain)){
      const hostLabel=host.slice(0,-domain.length-1);
      if(!['www','api','app','platform','auth','admin'].includes(hostLabel) && hostLabel!==tenants[0].subdomain)
        throw new HttpError(403,'Workspace code does not match this tenant subdomain');
    }
    const tenantId = String(tenants[0]._id);
    if (user.mfaEnabled) {
        const mfaToken=jwt.sign({sub:String(user._id),sv:user.sessionVersion,tid:tenantId,purpose:'mfa-login'},config.secret,{expiresIn:'5m',issuer:'bitstek-workspace'});
        res.json({mfaRequired:true,mfaToken});return;
    }
    setSession(res, issueToken(String(user._id), user.sessionVersion, tenantId));
    res.json({ message: 'Signed in' });
}));
/** Validate an invitation by POST, keeping the token out of URLs and server logs. */
router.post('/invite/preview',limiter,wrap(async(req,res)=>{
  const {token}=z.object({token:z.string().regex(/^[a-f0-9]{64}$/)}).parse(req.body);
  const tokenHash=crypto.createHash('sha256').update(token).digest('hex');
  const invitation=await TenantInvitation.findOne({tokenHash,claimedAt:{$exists:false},expiresAt:{$gt:new Date()}}).lean();
  if(!invitation)throw new HttpError(410,'Invitation expired, claimed or revoked. Request a new invitation.');
  const tenant=await Tenant.findOne({_id:invitation.tenantId,status:'active'}).select('name slug').lean();
  if(!tenant)throw new HttpError(403,'Workspace is not active');
  res.setHeader('Cache-Control','no-store');
  res.json({email:invitation.email,workspaceCode:tenant.slug,workspaceName:tenant.name,expiresAt:invitation.expiresAt});
}));
/** Claim an invitation without making the Platform Operator an all-tenant data reader. */
router.post('/claim-invite',limiter,wrap(async(req,res)=>{
  const {token,email,password}=z.object({token:z.string().regex(/^[a-f0-9]{64}$/),
    email:z.string().email(),password:z.string().min(12).max(128)}).parse(req.body);
  const tokenHash=crypto.createHash('sha256').update(token).digest('hex');
  const invitation=await TenantInvitation.findOne({tokenHash,email:email.toLowerCase(),
    claimedAt:{$exists:false},expiresAt:{$gt:new Date()}}).lean();
  if(!invitation)throw new HttpError(400,'Invitation is invalid, revoked or expired');
  if(!await Tenant.exists({_id:invitation.tenantId,status:'active'}))throw new HttpError(403,'Invited workspace is not active');
  const transaction=await mongoose.startSession();
  let userId='';
  try{
    await transaction.withTransaction(async()=>{
      const claimed=await TenantInvitation.findOneAndUpdate({_id:invitation._id,claimedAt:{$exists:false}},
        {$set:{claimedAt:new Date()}},{new:true,session:transaction});
      if(!claimed)throw new HttpError(409,'Invitation already claimed');
      let user=await User.findOne({email:email.toLowerCase()}).session(transaction);
      if(user){
        if(!user.active||!await bcrypt.compare(password,user.passwordHash))
          throw new HttpError(403,'Existing account requires the correct password');
      }else{
        if(password.length<16)throw new HttpError(400,'New account passwords must be at least 16 characters');
        const [created]=await User.create([{name:email.split('@')[0],email:email.toLowerCase(),
          passwordHash:await bcrypt.hash(password,12),active:true}],{session:transaction});
        user=created;
      }
      userId=String(user._id);
      await TenantMembership.findOneAndUpdate({tenantId:invitation.tenantId,userId:user._id},
        {$set:{role:invitation.role,active:true}},{upsert:true,session:transaction});
      // Legacy tenant creations may have no companies. Provision one during the
      // initial Super Admin claim to avoid an unusable empty workspace.
      if(invitation.role==='super_admin'){
        await runWithTenant(String(invitation.tenantId),async()=>{
          const count=await Company.countDocuments({tenantId:invitation.tenantId}).session(transaction);
          if(!count){
            await Company.create([{name:'Primary Company',code:'PRIMARY',vertical:'General Business',currency:'INR',
              enabledModules:['operations','sales','finance','approvals','reports']}],{session:transaction});
          }
        });
      }
    });
  }finally{await transaction.endSession();}
  res.status(201).json({message:'Invitation accepted. Sign in with this email and workspace code.',
    tenantId:invitation.tenantId,userId,workspaceCode:(await Tenant.findById(invitation.tenantId).select('slug').lean())?.slug});
}));
router.get('/me', authenticate, wrap(async (req, res) => {
    const companies = await Company.find({ _id: { $in: req.actor!.companyIds }, active: true }).sort({ name: 1 }).lean();
    const branding = await WorkspaceSetting.findOne({ key: 'workspace' }).lean();
    const tenant = await Tenant.findById(req.actor!.tenantId).select('name slug status defaultLocale themeId').lean();
    const platform=await PlatformOperator.findOne({userId:req.actor!.id,active:true}).select('level').lean();
    const mfaReady=!!(await User.findById(req.actor!.id).select('mfaEnabled').lean())?.mfaEnabled;
    const isPlatformOperator=!!platform && mfaReady;
    const isPlatformOwner=isPlatformOperator && platform?.level==='owner';
    res.json({ tenant, isPlatformOperator,isPlatformOwner,isSuperAdmin:req.actor!.isSuperAdmin, companyModules:req.actor!.companyModules, mfaEnabled:!!(await User.findById(req.actor!.id).select('mfaEnabled').lean())?.mfaEnabled, branding: { name: branding?.name || (tenant?.name ? `${tenant.name} Workspace` : 'Workspace'), logoFileId: branding?.logoFileId || null }, user: { id: req.actor!.id, name: req.actor!.name, email: req.actor!.email }, roles: req.actor!.roles, permissions: req.actor!.permissions, companies });
}));
router.post('/switch-tenant',authenticate,csrfGuard,wrap(async(req,res)=>{
  const {slug}=z.object({slug:z.string().regex(/^[a-z0-9-]{2,80}$/)}).parse(req.body);
  const tenant=await Tenant.findOne({slug,status:'active'}).lean();
  if(!tenant || !await TenantMembership.exists({tenantId:tenant._id,userId:req.actor!.id,active:true}))
    throw new HttpError(403,'Workspace not assigned');
  const user=await User.findById(req.actor!.id).select('sessionVersion').lean();
  if(!user)throw new HttpError(401,'Account unavailable');
  setSession(res,issueToken(req.actor!.id,user.sessionVersion,String(tenant._id)));
  res.json({ok:true,tenant:{name:tenant.name,slug:tenant.slug}});
}));
router.patch('/profile', authenticate, csrfGuard, wrap(async (req, res) => {
    const input = z.object({ name: z.string().min(2).max(100) }).parse(req.body);
    const user = await User.findByIdAndUpdate(req.actor!.id, { name: input.name }, { new: true });
    if (!user) throw new HttpError(404, 'User not found');
    await audit(req, 'profile.update', 'users', req.actor!.id, { name: input.name });
    res.json({ name: user.name, email: user.email });
}));
router.post('/change-password', authenticate, csrfGuard, wrap(async (req, res) => {
    const input = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(12).max(128) }).parse(req.body);
    const user = await User.findById(req.actor!.id);
    if (!user || !(await bcrypt.compare(input.currentPassword, user.passwordHash))) throw new HttpError(403, 'Current password incorrect');
    user.passwordHash = await bcrypt.hash(input.newPassword, 12);
    user.sessionVersion += 1;
    await user.save();
    await audit(req, 'profile.password-change', 'users', req.actor!.id, {});
    clearSession(res);
    res.json({ message: 'Password updated. Please sign in again.' });
}));
const otpLimit=rateLimit({windowMs:15*60*1000,limit:12,standardHeaders:'draft-7',legacyHeaders:false});
router.post('/mfa/verify-login',otpLimit,wrap(async(req,res)=>{
 const {token,code}=z.object({token:z.string().min(10),code:z.string().regex(/^\d{6}$/)}).parse(req.body);
 let payload:jwt.JwtPayload;
 try{payload=jwt.verify(token,config.secret,{issuer:'bitstek-workspace'}) as jwt.JwtPayload;}catch{throw new HttpError(401,'MFA login challenge expired');}
 if(payload.purpose!=='mfa-login')throw new HttpError(401,'Wrong MFA challenge');
 const user=await User.findById(payload.sub);
 if(!user?.active || !user.mfaEnabled || user.sessionVersion!==payload.sv || !user.mfaSecretEncrypted)throw new HttpError(401,'Invalid MFA session');
 const counter=matchTotp(decryptSecret(user.mfaSecretEncrypted),code,user.mfaLastCounter);
 if(counter<0)throw new HttpError(401,'Invalid or previously used authenticator code');
 const changed=await User.updateOne({_id:user._id,mfaLastCounter:{$lt:counter}},{$set:{mfaLastCounter:counter}});
 if(!changed.modifiedCount)throw new HttpError(401,'Code already used');
 const tenantId = String(payload.tid || '');
 if (!await TenantMembership.exists({userId:user._id,tenantId,active:true}) || !await Tenant.exists({_id:tenantId,status:'active'}))throw new HttpError(403,'Workspace membership invalid');
 setSession(res,issueToken(String(user._id),user.sessionVersion,tenantId));res.json({message:'Signed in'});
}));
router.post('/mfa/setup',authenticate,csrfGuard,wrap(async(req,res)=>{
 if(!config.mfaEncryptionKey)throw new HttpError(503,'MFA_ENCRYPTION_KEY is not configured');
 const {password}=z.object({password:z.string().min(1)}).parse(req.body);
 const user=await User.findById(req.actor!.id);
 if(!user||user.mfaEnabled)throw new HttpError(409,'MFA is already enabled');
 if(!await bcrypt.compare(password,user.passwordHash))throw new HttpError(403,'Password verification failed');
 const secret=newSecret();user.mfaPendingEncrypted=encryptSecret(secret);await user.save();
 res.json({secret,otpauthUrl:`otpauth://totp/${encodeURIComponent('Bitstek Workspace:'+user.email)}?secret=${secret}&issuer=${encodeURIComponent('Bitstek Workspace')}&digits=6&period=30`});
}));
router.post('/mfa/enable',otpLimit,authenticate,csrfGuard,wrap(async(req,res)=>{
 const {code}=z.object({code:z.string().regex(/^\d{6}$/)}).parse(req.body);
 const user=await User.findById(req.actor!.id);if(!user?.mfaPendingEncrypted||user.mfaEnabled)throw new HttpError(409,'Start MFA setup first');
 const counter=matchTotp(decryptSecret(user.mfaPendingEncrypted),code);if(counter<0)throw new HttpError(400,'Invalid authenticator code');
 user.mfaSecretEncrypted=user.mfaPendingEncrypted;user.mfaPendingEncrypted='';user.mfaLastCounter=counter;user.mfaEnabled=true;user.sessionVersion+=1;await user.save();clearSession(res);res.json({message:'MFA enabled. Please sign in again.'});
}));
router.post('/mfa/disable',otpLimit,authenticate,csrfGuard,wrap(async(req,res)=>{
 const {password,code}=z.object({password:z.string().min(1),code:z.string().regex(/^\d{6}$/)}).parse(req.body);
 const user=await User.findById(req.actor!.id);if(!user?.mfaEnabled||!user.mfaSecretEncrypted)throw new HttpError(409,'MFA is not enabled');
 if(!await bcrypt.compare(password,user.passwordHash) || matchTotp(decryptSecret(user.mfaSecretEncrypted),code,user.mfaLastCounter)<0)throw new HttpError(403,'Invalid password or authenticator code');
 user.mfaEnabled=false;user.mfaSecretEncrypted='';user.mfaPendingEncrypted='';user.mfaLastCounter=-1;user.sessionVersion++;await user.save();clearSession(res);res.json({message:'MFA disabled. Sign in again.'});
}));
router.post('/logout', authenticate, csrfGuard, wrap(async (req, res) => { clearSession(res); res.json({ message: 'Signed out' }); }));
export default router;
