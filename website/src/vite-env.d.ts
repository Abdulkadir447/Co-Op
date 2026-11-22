/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Analytics collector endpoint. Unset = events are buffered locally only. */
  readonly VITE_ANALYTICS_URL?: string;
  /** The site's public origin, when a real host is configured. */
  readonly VITE_PUBLIC_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
