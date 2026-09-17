declare module '*.css';
declare module '*.jpg';
declare module '*.jpeg';
declare module '*.png';
declare module '*.gif';
declare module '*.svg';

interface ImportMetaEnv {
    readonly [key: string]: string | boolean | undefined;
    readonly VITE_API_URL?: string;
    readonly VITE_AI_ANALYTICS_ENABLED?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}