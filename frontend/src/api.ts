import axios from 'axios';
// TODO: Replace transitional dynamic attributes with discriminated DTOs per module.
export type Item = Record<string, any> & {
    _id: string;
    title: string;
    companyId: string;
    status: string;
};
// VITE_BACKEND_URL allows separate AWS/Render API hosting (e.g. https://api.example.com).
// When it is empty, use /api via the local Vite proxy or deployed reverse proxy.
const backendOrigin = (import.meta.env.VITE_BACKEND_URL || '').trim().replace(/\/+$/, '');
export const API_BASE_URL = (backendOrigin
    ? `${backendOrigin}/api`
    : (import.meta.env.VITE_API_BASE_URL || '/api')).replace(/\/+$/, '');

function readCsrfCookie(): string {
    const cookie = document.cookie.split('; ').find((part) => part.startsWith('bitstek_csrf='));
    return cookie ? decodeURIComponent(cookie.substring('bitstek_csrf='.length)) : '';
}

// Separate-host API cookies cannot be read via document.cookie from the frontend.
// Fetch a token from the explicitly CORS-allowlisted backend and send it in X-CSRF-Token.
// The session cookie stays HttpOnly; we do NOT put it in localStorage.
const csrfHttp = axios.create({ baseURL: API_BASE_URL, withCredentials: true, timeout: 20000 });
let remoteCsrfToken = '';
let csrfInFlight: Promise<string> | null = null;
async function getCsrfToken(): Promise<string> {
    const sameOriginCookie = readCsrfCookie();
    if (sameOriginCookie) return sameOriginCookie;
    if (remoteCsrfToken) return remoteCsrfToken;
    if (!csrfInFlight) {
        csrfInFlight = csrfHttp.get<{csrfToken: string}>('/auth/csrf')
            .then(({data}) => {
                if (!data.csrfToken) throw new Error('Backend did not provide CSRF token');
                remoteCsrfToken = data.csrfToken;
                return remoteCsrfToken;
            })
            .finally(() => { csrfInFlight = null; });
    }
    return csrfInFlight;
}
function clearCachedCsrf() { remoteCsrfToken = ''; csrfInFlight = null; }

export const http = axios.create({ baseURL: API_BASE_URL, withCredentials: true, timeout: 20000 });
http.interceptors.request.use(async (request) => {
    const method = (request.method || 'get').toLowerCase();
    const path = (request.url || '').split('?')[0];
    // Login and invitation acceptance do not require an existing session/CSRF cookie.
    const sessionless = ['/auth/login', '/auth/mfa/verify-login', '/auth/invite/preview', '/auth/claim-invite'].includes(path);
    if (!['get', 'head', 'options'].includes(method) && !sessionless) {
        request.headers['x-csrf-token'] = await getCsrfToken();
    }
    // Preserve explicit per-form company scope, particularly in All Companies view.
    if (!request.headers['x-company-id']) request.headers['x-company-id'] = localStorage.getItem('bw_company') || 'all';
    return request;
});
http.interceptors.response.use((response) => {
    if (['/auth/login','/auth/mfa/verify-login','/auth/switch-tenant','/auth/logout'].includes((response.config.url || '').split('?')[0])) clearCachedCsrf();
    return response;
}, (error: unknown) => {
    if (axios.isAxiosError(error)) {
        if (error.response?.status === 401 && window.location.pathname !== '/login') {
            window.dispatchEvent(new Event('session-expired'));
        }
        const message = error.response?.data?.error;
        if (typeof message === 'string') {
            if (message === 'Invalid CSRF token') clearCachedCsrf();
            if (message === 'Origin rejected') return Promise.reject(new Error('Origin rejected. Backend WEB_ORIGIN/WEB_ORIGINS must include this exact browser origin: '+window.location.origin));
            return Promise.reject(new Error(message));
        }
        if (!error.response) {
            return Promise.reject(new Error('API unavailable or browser blocked CORS/cookies. Check VITE_BACKEND_URL, WEB_ORIGIN/WEB_ORIGINS and HTTPS.'));
        }
        return Promise.reject(new Error(`Request failed (HTTP ${error.response.status}).`));
    }
    return Promise.reject(error);
});
export async function fetchRecords(kind: string, params?: Record<string, string | number | boolean>, companyId?: string) {
    const response = await http.get<{
        items: Item[];
        total: number;
        page: number;
        limit: number;
    }>(`/records/${kind}`, { params, ...(companyId ? {headers: {'x-company-id':companyId}} : {}) });
    return response.data;
}
export async function saveRecord(kind: string, data: Record<string, unknown>, id?: string, companyId?: string) {
    const response = id
        ? await http.patch(`/records/${kind}/${id}`, data, companyId ? {headers:{'x-company-id': companyId}} : undefined)
        : await http.post(`/records/${kind}`, data, companyId ? {headers:{'x-company-id': companyId}} : undefined);
    return response.data;
}
export async function updateRecord(kind: string, id: string, data: Record<string, unknown>, companyId?: string) {
    const response = await http.patch(`/records/${kind}/${id}`, data, companyId ? {headers:{'x-company-id':companyId}} : undefined);
    return response.data;
}
export function money(value: unknown, currency = 'INR'): string {
    const v = value as {
        $numberDecimal?: string;
    } | string | number | null | undefined;
    const amount = typeof v === 'object' && v !== null && '$numberDecimal' in v
        ? Number(v.$numberDecimal)
        : Number(v ?? 0);
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency,
        maximumFractionDigits: 2,
    }).format(Number.isFinite(amount) ? amount : 0);
}
export function dateText(value: unknown): string {
    if (!value)
        return '—';
    const d = new Date(String(value));
    return Number.isNaN(d.getTime())
        ? '—'
        : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
export function shortDate(value: unknown): string {
    if (!value)
        return '—';
    const d = new Date(String(value));
    return Number.isNaN(d.getTime())
        ? '—'
        : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
export function friendly(value: unknown): string {
    return String(value ?? '')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
