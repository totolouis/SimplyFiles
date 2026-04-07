declare module 'pdf-parse/lib/pdf-parse.js' {
  import { Options, Result } from 'pdf-parse';
  function pdfParse(dataBuffer: Buffer, options?: Options): Promise<Result>;
  export default pdfParse;
}
