import 'dotenv/config';
import {configuredOrigins} from './lib/origin-policy.js';

const allowedOrigins = configuredOrigins(
    process.env.WEB_ORIGIN || process.env.RENDER_EXTERNAL_URL || 'http://localhost:5173',
    process.env.WEB_ORIGINS || ''
);
const cookieSameSite = (process.env.COOKIE_SAMESITE || 'lax').toLowerCase();

export const config = {
    port: Number(process.env.PORT || 5000),
    mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/bitstek_workspace?replicaSet=rs0',
    secret: process.env.JWT_SECRET || '',
    origin: allowedOrigins[0],
    allowedOrigins,
    cookieSameSite: cookieSameSite as 'lax' | 'strict' | 'none',
    production: process.env.NODE_ENV === 'production',
    cookieSecure: process.env.COOKIE_SECURE === 'true',
    trustProxy: process.env.TRUST_PROXY === 'true',
    mfaEncryptionKey: process.env.MFA_ENCRYPTION_KEY || '',
};
export function validateConfig() {
    if (config.secret.length < 32 || config.secret.startsWith('replace-with'))
        throw new Error('JWT_SECRET must contain at least 32 characters. From project root run: node scripts/repair-security-env.mjs');
    if (!/^[a-f0-9]{64}$/i.test(config.mfaEncryptionKey)) throw new Error('MFA_ENCRYPTION_KEY must contain 64 hexadecimal characters. From the project root run: node scripts/repair-security-env.mjs (do not rotate an existing MFA key).');
    if (!['lax', 'strict', 'none'].includes(cookieSameSite))
        throw new Error('COOKIE_SAMESITE must be lax, strict or none');
    if (cookieSameSite === 'none' && !config.cookieSecure)
        throw new Error('SameSite=None requires COOKIE_SECURE=true');
    if (config.production && (!config.cookieSecure || config.allowedOrigins.some(origin => !origin.startsWith('https://'))))
        throw new Error('Production requires secure cookies and HTTPS WEB_ORIGIN/WEB_ORIGINS');
}
