import { TextExtractor } from "../text-extractor.interface";
import { extractPdfText } from "../pdf-extract";

export class PdfTextExtractor implements TextExtractor {
  constructor(private readonly ocrEnabled: boolean) {}

  canHandle(mimeType: string, filename: string): boolean {
    return mimeType === "application/pdf" || /\.pdf$/i.test(filename);
  }

  async extract(buffer: Buffer): Promise<string | null> {
    return extractPdfText(buffer, this.ocrEnabled);
  }
}
