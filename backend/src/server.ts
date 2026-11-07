import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { config, validateConfig } from './config.js';
import { authenticate, csrfGuard, HttpError } from './lib/security.js';
import authRoutes from './routes/auth.js';
import recordRoutes from './routes/records.js';
import workflowRoutes from './routes/workflows.js';
import adminRoutes from './routes/admin.js';
import companyManagementRoutes from './routes/company-management.js';
import dashboardRoutes from './routes/dashboard.js';
import fileRoutes from './routes/files.js';
import insightsRoutes from './routes/insights.js';
import saasRoutes from './saas/routes.js';
import platformRoutes from './saas/platform.js';
validateConfig();
const app = express();
app.disable('x-powered-by');
if (config.trustProxy)
    app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: config.allowedOrigins, credentials: true }));
app.use(express.json({ limit: '4mb' }));
app.use(cookieParser());
// Health is liveness; readiness must fail when the database is unavailable.
app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'bitstek-backend', version: '6.2.7' }));
app.get('/api', (_req, res) => res.json({
    name: 'Bitstek Workspace REST API',
    version: '6.2.7',
    endpoints: ['/api/auth', '/api/records', '/api/workflows', '/api/admin', '/api/dashboard'],
}));
app.get('/api/ready', (_req, res) => {
    const connected = mongoose.connection.readyState === 1;
    res.status(connected ? 200 : 503).json({
        ok: connected,
        database: connected ? 'connected' : 'disconnected',
    });
});
app.use('/api/auth', authRoutes);
app.use('/api', authenticate, csrfGuard);
app.use('/api/records', recordRoutes);
app.use('/api/workflows', workflowRoutes);
app.use('/api/admin/companies',companyManagementRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/insights', insightsRoutes);
app.use('/api/saas', saasRoutes);
app.use('/api/platform', platformRoutes);
// Same-origin deployment for session/CSRF cookies (Render one-web-service mode).
// API routes are registered above; the React SPA catches only non-API GET paths.
if (process.env.SERVE_FRONTEND === 'true') {
    const site = path.resolve(process.cwd(), '../frontend/dist');
    if (!fs.existsSync(path.join(site,'index.html'))) throw new Error('Frontend build missing: npm --prefix frontend run build');
    app.use(express.static(site, { maxAge: '1h' }));
    app.get(/^\/(?!api(?:\/|$)).*/, (_req,res)=>res.sendFile(path.join(site,'index.html')));
}
app.use((req, _res, next) => next(new HttpError(404, `Not found: ${req.path}`)));
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const err = error as Error & {
        status?: number;
        code?: number;
        type?: string;
    };
    const status = error instanceof ZodError
        ? 400
        : error instanceof HttpError
            ? error.status
            : err?.type === 'entity.parse.failed' || err instanceof SyntaxError
                ? 400
                : err?.name === 'ValidationError' || err?.name === 'CastError'
                    ? 400
                    : err?.code === 11000
                        ? 409
                        : 500;
    if (status >= 500)
        console.error('Unhandled API error:', error);
    const message = status >= 500
        ? 'Unexpected server error'
        : error instanceof ZodError
            ? error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ')
            : err.message;
    res.status(status).json({ error: message });
});
try {
    await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 10000 });
    console.log('MongoDB connected');
    const server = app.listen(config.port, () => {
        console.log(`Bitstek API listening on http://localhost:${config.port}`);
    });
    let stopping = false;
    const shutdown = async (signal: string) => {
        if (stopping)
            return;
        stopping = true;
        console.log(`Received ${signal}. Stopping API gracefully...`);
        server.close(async () => {
            await mongoose.disconnect();
            process.exit(0);
        });
    };
    process.on('SIGTERM', () => void shutdown('SIGTERM'));
    process.on('SIGINT', () => void shutdown('SIGINT'));
}
catch (error) {
    console.error('Could not start API:', error);
    process.exit(1);
}
