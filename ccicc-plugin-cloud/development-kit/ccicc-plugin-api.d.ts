import type Database from 'better-sqlite3';
import type { Request, RequestHandler, Response } from 'express';
import type { Logger } from 'pino';

export type MaybePromise<T> = T | Promise<T>;
export type UserRole = 'member' | 'vip' | 'admin';
export type UserStatus = 'active' | 'disabled';
export type PluginStatus = 'enabled' | 'disabled';
export type PluginSourceType = 'url' | 'file' | 'directory';
export type PluginLifecyclePhase = 'install' | 'boot' | 'close' | 'uninstall';
export type PluginRouteMethod = 'get' | 'post' | 'put' | 'patch' | 'delete' | 'all';
export type PluginRouteScope = 'frontend' | 'admin';
export type PluginConfigValueType = 'string' | 'number' | 'boolean' | 'enum' | 'json' | 'filepath';

export interface PluginSource { type: PluginSourceType; value: string; }
export interface PluginManifest {
  id: string; version: string; displayName: string; description?: string; author?: string;
  dependencies?: string[]; entry?: string; enabledByDefault?: boolean;
}
export interface PluginPackageConfig {
  dependencies?: Record<string, string>;
  ccicc?: { hostDependencies?: Record<string, string> };
}
export interface SafeUser {
  id: number; username: string; email: string; role: UserRole; status: UserStatus;
  display_name: string | null; avatar_base64: string | null; bio: string | null;
  location: string | null; website: string | null; custom_html: string | null;
  email_verified_at: string | null; created_at: string; updated_at: string;
}
export interface UserListOptions { limit?: number; offset?: number; role?: UserRole; status?: UserStatus; }
export interface PluginRouteRegistration {
  pluginId: string; scope: PluginRouteScope; method: PluginRouteMethod; path: string; mountedPath: string;
}
export interface PluginScopedRouter {
  get(path: string, ...handlers: RequestHandler[]): void;
  post(path: string, ...handlers: RequestHandler[]): void;
  put(path: string, ...handlers: RequestHandler[]): void;
  patch(path: string, ...handlers: RequestHandler[]): void;
  delete(path: string, ...handlers: RequestHandler[]): void;
  all(path: string, ...handlers: RequestHandler[]): void;
}
export interface PluginConfigMeta {
  key: string; displayName: string; description?: string; defaultValue?: unknown;
  valueType: PluginConfigValueType; validationRules?: Record<string, unknown>;
  controlType?: string; hotReload?: boolean; enumOptions?: string[]; sortOrder?: number;
}
export interface PluginConfigApi {
  register(meta: PluginConfigMeta): void;
  get<T = unknown>(key: string): T | null;
  set(key: string, value: unknown): void;
  all(): Record<string, unknown>;
}
export interface PluginDatabaseApi {
  raw: Database.Database;
  table(localName: string): string;
  prepare: Database.Database['prepare']; exec: Database.Database['exec']; transaction: Database.Database['transaction'];
}
export type ModuleRenderFn = (params: Record<string, unknown>, req?: Request) => MaybePromise<string>;
export interface PluginModuleRegistration { name: string; displayName: string; usageExample?: string; render: ModuleRenderFn; }
export interface PluginRenderApi {
  withLayout(req: Request, res: Response, contentHtml: string, pageCtx?: Record<string, unknown>): MaybePromise<void>;
  adminPage(req: Request, res: Response, contentHtml: string, pageCtx?: Record<string, unknown>): void;
  standalone(res: Response, html: string): void;
  string(template: string, context?: Record<string, unknown>): string;
}
export interface PluginNavigationItem {
  category: string; name: string; path: string; surface?: 'frontend' | 'admin'; target?: string;
  icon?: string; private?: boolean; sortOrder?: number;
}
export interface PluginNavigationApi { register(item: PluginNavigationItem): void; clear(): number; }
export interface PluginCaddyApi { registerSubdomain(subdomain: string): void; }
export interface PluginUserDataApi {
  get<T = unknown>(userId: number, key: string): T | null;
  set(userId: number, key: string, value: unknown): void;
  delete(userId: number, key: string): boolean;
  all(userId: number): Record<string, unknown>;
}
export interface PluginUsersApi {
  current(req: Request): SafeUser | null; get(userId: number): SafeUser | null;
  getByUsername(username: string): SafeUser | null; getByEmail(email: string): SafeUser | null;
  list(options?: UserListOptions): SafeUser[];
  requireAuth: RequestHandler; requireVip: RequestHandler; requireAdmin: RequestHandler;
  requireVerifiedEmail: RequestHandler; data: PluginUserDataApi;
}
export interface PluginSecurityApi { csrfToken(req: Request): string; csrfProtection: RequestHandler; }
export interface PluginUninstallOptions { purgeData: boolean; }
export interface PluginHooks {
  install?(ctx: PluginContext): MaybePromise<void>;
  boot?(ctx: PluginContext): MaybePromise<void>;
  close?(ctx: PluginContext): MaybePromise<void>;
  uninstall?(ctx: PluginContext, options: PluginUninstallOptions): MaybePromise<void>;
}
export interface PluginContext {
  id: string; manifest: PluginManifest; rootDir: string; phase: PluginLifecyclePhase; logger: Logger;
  db: PluginDatabaseApi; config: PluginConfigApi;
  routes: { frontend: PluginScopedRouter; admin: PluginScopedRouter };
  render: PluginRenderApi; navigation: PluginNavigationApi; caddy: PluginCaddyApi;
  users: PluginUsersApi; security: PluginSecurityApi;
  events: {
    on<TPayload = unknown>(eventName: string, handler: (payload: TPayload) => MaybePromise<void>): () => void;
    emit<TPayload = unknown>(eventName: string, payload: TPayload): void;
  };
  registerModule(registration: PluginModuleRegistration): void;
  onClose(fn: () => MaybePromise<void>): void;
}
export type PluginModuleExport = PluginHooks | { default?: PluginHooks; plugin?: PluginHooks } | ((manifest: PluginManifest) => PluginHooks);
