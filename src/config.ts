/** Public browser configuration. The builder supplies only these four fields.
 * Authentication identity and SQL row policies protect account data; this key
 * identifies the application and is deliberately readable by every visitor.
 */
export interface PublicSettings {
  readonly supabaseUrl: string;
  readonly supabasePublishableKey: string;
  readonly googleClientId: string;
  readonly basePath: string;
  readonly configured: boolean;
}

declare const __ANCHOR_PUBLIC_CONFIG__: Omit<PublicSettings, 'configured'>;

const supplied =
  typeof __ANCHOR_PUBLIC_CONFIG__ === 'undefined'
    ? { supabaseUrl: '', supabasePublishableKey: '', googleClientId: '', basePath: '/Anchor/' }
    : __ANCHOR_PUBLIC_CONFIG__;

export const settings: PublicSettings = Object.freeze({
  ...supplied,
  configured: Boolean(
    supplied.supabaseUrl && supplied.supabasePublishableKey && supplied.googleClientId,
  ),
});
export const publicConfig = settings;
