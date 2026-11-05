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
type UiImageFit = 'contain' | 'cover' | 'none' | 'scale-down';
interface UiImageOptions extends UiBox {
  /** Required only when source is bare Base64. Data URIs carry their own format. */
  format?: 'png' | 'jpg' | 'jpeg';
  fit?: UiImageFit;
}
/** Layout width defaults to the parent's available width; height follows the pixel aspect ratio. */
interface UiCanvasOptions extends UiBox {
  /** Fixed memory resolution, independent of layout width/height. */
  pixelWidth: number;
  pixelHeight: number;
  fit?: UiImageFit;
}
interface UiLegacyCanvasOptions extends Omit<UiBox, 'width' | 'height'> {
  /** Legacy form: numeric dimensions also set the memory resolution. */
  width?: number;
  height: number;
  pixelWidth?: never;
  pixelHeight?: never;
  fit?: UiImageFit;
}
interface UiDrawStyle { color?: UiColor; lineWidth?: number; }
interface UiShapeStyle extends UiDrawStyle { fill?: boolean; }
/** RGBA channels are integers in 0..255, including alpha. */
type UiRgba = [number, number, number, number];
/** Reuse this instance; copying or spreading it does not copy its pixel buffer. */
interface UiCanvas extends UiNode, UiBox {
  readonly kind: 'canvas';
  /** Layout properties and fit may change before ui.refresh(); the pixel buffer stays fixed. */
  fit?: UiImageFit;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  /** No argument clears to transparent; a color replaces every pixel. */
  clear(color?: UiColor): void;
  /** Replaces RGBA without blending; invalid colors or RGBA channels throw. */
  setPixel(x: number, y: number, color: UiColor | Readonly<UiRgba>): void;
  /** Returns an independent RGBA array that can be passed directly to setPixel. */
  getPixel(x: number, y: number): UiRgba;
  line(x1: number, y1: number, x2: number, y2: number, options?: UiDrawStyle): void;
  rect(x: number, y: number, width: number, height: number, options?: UiShapeStyle): void;
  circle(x: number, y: number, radius: number, options?: UiShapeStyle): void;
  /** Snapshots and writes pixels. Does not refresh UI. Await before ui.refresh(). */
  submit(): Promise<void>;
}
interface UiLegacyCanvas extends UiCanvas {
  readonly width: number;
  readonly height: number;
}
interface JSLabUi {
  readonly version: 2;
  /** Root content width in native layout pixels (Pro 324, RW 372); excludes screen safe margins. */
  getWidth(): number;
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
  image(source: string, options?: UiImageOptions): UiNode;
  canvas(options: UiCanvasOptions): UiCanvas;
  canvas(options: UiLegacyCanvasOptions): UiLegacyCanvas;
}
declare const ui: JSLabUi;
