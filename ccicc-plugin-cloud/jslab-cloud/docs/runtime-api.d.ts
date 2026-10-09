/// <reference path="./ui-api.d.ts" />
type DialogPrimitive = string | number | boolean;
interface DialogResult<T> { action: 'confirm' | 'secondary' | 'cancel'; value: T | null; }
interface DialogOptions { title?: string; message?: string; confirmText?: string; cancelText?: string; }
interface DialogItem { label: string; value: DialogPrimitive; description?: string; disabled?: boolean; }
interface JSLabDialog {
  alert(options?: DialogOptions): Promise<DialogResult<null>>;
  confirm(options?: DialogOptions & { secondaryText?: string }): Promise<DialogResult<null>>;
  text(options?: DialogOptions & { value?: string; placeholder?: string; required?: boolean; minLength?: number; maxLength?: number; language?: 'en' | 'cn' }): Promise<DialogResult<string>>;
  number(options?: DialogOptions & { value?: number | null; required?: boolean; min?: number; max?: number; decimals?: number }): Promise<DialogResult<number>>;
  select(options: DialogOptions & { items: DialogItem[]; value?: DialogPrimitive | DialogPrimitive[]; multiple?: boolean; minSelected?: number; maxSelected?: number }): Promise<DialogResult<DialogPrimitive | DialogPrimitive[]>>;
}
interface ScriptStorage {
  get<T>(key: string, fallback?: T): Promise<T>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  all(): Promise<Record<string, unknown>>;
}
interface JSLabScript {
  readonly name: string;
  canUse(capability: string): boolean;
  locale(): { language: string; countryOrRegion: string };
  reload(): void; exit(): void; toast(message: unknown, duration?: number): void;
  data: ScriptStorage; config: ScriptStorage;
}
declare const dialog: JSLabDialog;
declare const script: JSLabScript;
/** Native callback-based Vela modules; consult VelaDocs for device support. */
declare const system: {
  device: any; files: any; http: { request(options: any): void };
  download: { start(options: any): void; wait(options: any): void };
  upload: { file(options: any): any }; companion: any; network: any; display: any;
  battery: any; location: any; vibration: any; events: any; sensors: any;
  recorder: any; audio: any; crypto: any;
};
