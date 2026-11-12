declare module "svg-to-pdfkit" {
  function SVGtoPDF(
    doc: unknown,
    svg: string,
    x?: number,
    y?: number,
    options?: Record<string, unknown>
  ): void;
  export default SVGtoPDF;
}
