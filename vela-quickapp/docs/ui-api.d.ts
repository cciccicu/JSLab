// Editor reference for every JSLab .js script. This file has no runtime cost.
type UiColor = string;
type UiView = UiNode | string | number | false | null | undefined;
interface UiNode { readonly kind: string; }
interface UiBox {
  id?: string;
  width?: number | `${number}%`;
  height?: number;
  background?: UiColor;
  radius?: number;
  /** Relative weight of an unsized row child. */
  flex?: number;
  /** Only used inside stack. */
  x?: number;
  y?: number;
}
interface UiLayout extends UiBox {
  padding?: number;
  gap?: number;
  align?: 'start' | 'center' | 'end';
  justify?: 'start' | 'center' | 'end' | 'between';
}
interface UiText extends UiBox {
  size?: number;
  color?: UiColor;
  align?: 'left' | 'center' | 'right';
  bold?: boolean;
  lines?: number;
  lineHeight?: number;
}
interface UiButton extends UiText { tone?: 'primary' | 'neutral' | 'danger'; disabled?: boolean; }
interface UiControl extends UiBox {
  color?: UiColor;
  accent?: UiColor;
  trackColor?: UiColor;
  thumbColor?: UiColor;
}
interface UiSignal<T> {
  get(): T;
  set(value: T): T;
  update(updater: T | ((previous: T) => T)): T;
}
interface JSLabUi {
  readonly version: 2;
  render(view: UiView | UiView[] | (() => UiView | UiView[])): boolean;
  show(): boolean;
  hide(): void;
  refresh(): void;
  signal<T>(initial: T): UiSignal<T>;
  setTitle(title: string): void;
  showHeader(visible: boolean): void;
  scrollTo(y: number | 'top' | 'bottom'): void;
  scrollTop(): void;
  scrollBottom(): void;
  row(children: UiView[], options?: UiLayout): UiNode;
  column(children: UiView[], options?: UiLayout): UiNode;
  stack(children: UiView[], options?: UiLayout): UiNode;
  heading(text: unknown, options?: UiText): UiNode;
  text(text: unknown, options?: UiText): UiNode;
  button(text: unknown, onPress: () => unknown, options?: UiButton): UiNode;
  switch(label: unknown, checked: boolean, onChange: (value: boolean) => unknown,
    options?: UiControl & { detail?: string; detailColor?: UiColor }): UiNode;
  slider(label: unknown, value: number, onChange: (value: number) => unknown,
    options?: UiControl & { min?: number; max?: number; step?: number }): UiNode;
  progress(label: unknown, percent: number, options?: UiControl): UiNode;
  grid(items: (string | number | { text: unknown; color?: UiColor; background?: UiColor; size?: number;
    tone?: 'primary' | 'neutral' | 'success' | 'warning' | 'danger' })[],
    options?: UiBox & { columns?: number; cellHeight?: number; gap?: number; padding?: number }): UiNode;
  buttonRow(buttons: UiNode[], options?: UiLayout): UiNode;
  divider(options?: UiBox & { color?: UiColor }): UiNode;
  spacer(size: number): UiNode;
  qrcode(value: string, options?: UiBox & { size?: number; color?: UiColor }): UiNode;
}
declare const ui: JSLabUi;
