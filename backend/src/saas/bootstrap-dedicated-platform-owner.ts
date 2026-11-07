/**
 * Guarded offline provisioning of a DEDICATED platform-owner identity.
 * Creates an ordinary tenant MEMBER account only. MFA must be verified
 * before a separate, deliberate bootstrap grants Platform Owner privilege.
 * Does not edit any existing users, company memberships, or business records.
 */
import 'dotenv/config';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { User } from '../models.js';
import { Tenant, TenantMembership } from './models.js';

const apply = process.argv.includes('--apply');
const email = (process.env.PLATFORM_OWNER_NEW_EMAIL || '').trim().toLowerCase();
const name = (process.env.PLATFORM_OWNER_NEW_NAME || 'Platform Owner').trim();
const slug = (process.env.SAAS_INITIAL_TENANT_SLUG || 'bitstek').trim().toLowerCase();
const confirmation = process.env.PLATFORM_OWNER_CREATE_CONFIRM || '';
const confirmed = confirmation === 'I_CONTROL_THIS_INSTALLATION_AND_HAVE_VERIFIED_BACKUPS';

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  throw new Error('Set PLATFORM_OWNER_NEW_EMAIL to a valid, new, separately controlled email address.');
if (name.length < 2 || name.length > 100)
  throw new Error('PLATFORM_OWNER_NEW_NAME must contain 2 to 100 characters.');
if (!/^[a-z0-9-]{2,80}$/.test(slug))
  throw new Error('SAAS_INITIAL_TENANT_SLUG is invalid.');
if (!process.env.MONGODB_URI)
  throw new Error('Set MONGODB_URI to the verified database; use a staging copy first.');
if (apply && !confirmed)
  throw new Error('Before applying, set PLATFORM_OWNER_CREATE_CONFIRM=I_CONTROL_THIS_INSTALLATION_AND_HAVE_VERIFIED_BACKUPS.');
if (apply && !process.stdout.isTTY)
  throw new Error('Apply must run in a trusted interactive terminal; do not print one-time credentials into CI/host logs.');

await mongoose.connect(process.env.MONGODB_URI);
try {
  const tenant = await Tenant.findOne({slug,status:'active'}).lean();
  if (!tenant) throw new Error(`Active tenant ${slug} does not exist. Existing v5.7 data must be adopted into SaaS first.`);
  if (await User.exists({email})) throw new Error('That email already exists. No existing account will be overwritten or promoted by this command.');
  if (!apply) {
    console.log(`DRY RUN: create a new ordinary account ${email}, attach it as a member of tenant ${slug}.`);
    console.log('No company access or Platform Owner privilege is granted yet.');
    console.log('After MFA enrollment, use the existing bootstrap:platform command to grant the owner level.');
  } else {
    const password = crypto.randomBytes(30).toString('base64url');
    const passwordHash = await bcrypt.hash(password, 12);
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const existing = await User.findOne({email}).session(session);
        if (existing) throw new Error('Email already exists. Aborting without updating existing user.');
        const [user] = await User.create([{
          name, email, passwordHash, active: true,
          isSuperAdmin: false, mfaEnabled: false,
        }], {session});
        await TenantMembership.create([{
          tenantId:tenant._id, userId:user._id, role:'member', active:true,
        }], {session});
      });
    } finally { await session.endSession(); }
    console.log(`DEDICATED ACCOUNT CREATED. Email: ${email}`);
    console.log(`ONE-TIME PASSWORD (store securely now): ${password}`);
    console.log(`Workspace code: ${slug}`);
    console.log('This is not a Platform Owner yet. Login, enable and verify MFA, then promote with bootstrap:platform:apply.');
    console.log('Clear PLATFORM_OWNER_CREATE_CONFIRM and PLATFORM_OWNER_NEW_EMAIL after provisioning.');
  }
} finally { await mongoose.disconnect(); }
