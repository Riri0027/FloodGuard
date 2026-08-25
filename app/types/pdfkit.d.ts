declare module 'pdfkit' {
  import { EventEmitter } from 'node:events';

  interface TextOptions {
    align?: 'left' | 'center' | 'right' | 'justify';
    width?: number;
    lineGap?: number;
  }

  interface ImageOptions { fit?: [number, number]; }

  class PDFDocument extends EventEmitter {
    x: number;
    y: number;
    constructor(options?: { margin?: number; size?: string; info?: { Title?: string } });
    fillColor(color: string): this;
    font(name: string): this;
    fontSize(size: number): this;
    text(text: string, options?: TextOptions): this;
    text(text: string, x: number, y: number, options?: TextOptions): this;
    heightOfString(text: string, options?: TextOptions): number;
    moveDown(lines?: number): this;
    moveTo(x: number, y: number): this;
    lineTo(x: number, y: number): this;
    rect(x: number, y: number, width: number, height: number): this;
    image(source: Buffer | string, x: number, y: number, options?: ImageOptions): this;
    fill(): this;
    stroke(): this;
    addPage(): this;
    end(): void;
  }

  export default PDFDocument;
}
