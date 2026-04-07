import { TextExtractor } from "../text-extractor.interface";
import { extractDocText } from "../doc-extract";

const DOC_MIME_TYPES = [
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.oasis.opendocument.text",
];

export class DocTextExtractor implements TextExtractor {
  canHandle(mimeType: string, filename: string): boolean {
    return DOC_MIME_TYPES.includes(mimeType) || /\.(docx|odt)$/i.test(filename);
  }

  async extract(buffer: Buffer): Promise<string | null> {
    return extractDocText(buffer);
  }
}
