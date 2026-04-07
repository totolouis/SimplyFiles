import { TextExtractor } from "../text-extractor.interface";
import { extractOcrText } from "../ocr-extract";

export class OcrTextExtractor implements TextExtractor {
  canHandle(mimeType: string, filename: string): boolean {
    return (
      mimeType.startsWith("image/") ||
      /\.(jpe?g|png|tiff?|bmp|webp|gif)$/i.test(filename)
    );
  }

  async extract(buffer: Buffer): Promise<string | null> {
    return extractOcrText(buffer);
  }
}
