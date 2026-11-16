/// <reference types="vite/client" />
declare module 'mammoth' {
  export function extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string }>;
}
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_AI_MODE?: string;
  readonly VITE_AI_ENDPOINT?: string;
  readonly VITE_DEFAULT_RETENTION_DAYS?: string;
}
