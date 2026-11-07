/// <reference types="vite/client" />
/// <reference types="vite/client" />
interface ImportMetaEnv {
    readonly VITE_API_BASE_URL?: string;
    readonly VITE_BACKEND_URL?: string;
    readonly VITE_APP_TITLE?: string;
    readonly VITE_DEMO_MODE?: string;
    readonly VITE_DEV_PROXY_TARGET?: string;
}
interface ImportMeta {
    readonly env: ImportMetaEnv;
}
