// Narrow declarations for the documented SDK surface used by this plugin.
interface AssetShape {
  SetPosition(x: number, y: number): void;
  Select(): boolean;
  SetName(name: string): boolean;
  GetName(): string;
  SetFill(fill: unknown): boolean;
}
interface AssetSlide {
  AddObject(o: unknown): void;
  GetAllShapes(): AssetShape[];
}
interface PresentationApi {
  GetCurrentSlide(): AssetSlide | null;
  GetAllSlides(): AssetSlide[];
  GetWidth(): number;
  GetHeight(): number;
}
declare const Api: {
  GetPresentation(): PresentationApi;
  CreateShape(
    type: string,
    width: number,
    height: number,
    fill: unknown,
    stroke: unknown,
  ): AssetShape;
  CreateBlipFill(src: string, type: 'stretch'): unknown;
  CreateNoFill(): unknown;
  CreateStroke(width: number, fill: unknown): unknown;
};
declare const Asc: {
  scope: Record<string, unknown>;
  plugin: {
    init: () => void;
    button: (id: number, windowId?: string) => void;
    callCommand: (
      fn: () => unknown,
      close?: boolean,
      recalculate?: boolean,
      callback?: (result: unknown) => void,
    ) => void;
    executeMethod: (name: string, args: unknown[], callback?: (value: unknown) => void) => void;
    executeCommand: (name: string, data: string) => void;
  };
  PluginWindow: new () => { show: (config: Record<string, unknown>) => void };
};
interface Window {
  Asc: typeof Asc;
}
