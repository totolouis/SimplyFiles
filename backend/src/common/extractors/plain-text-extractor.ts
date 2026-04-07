import { TextExtractor } from "../text-extractor.interface";

const TEXT_MIME_TYPES = [
  "application/json",
  "application/xml",
  "application/javascript",
];

const TEXT_EXTENSIONS =
  /\.(txt|md|csv|log|json|xml|js|ts|jsx|tsx|html|css|yaml|yml|env|sh|py|go|rs|java|c|cpp)$/i;

export class PlainTextExtractor implements TextExtractor {
  canHandle(mimeType: string, filename: string): boolean {
    return (
      mimeType.startsWith("text/") ||
      TEXT_MIME_TYPES.includes(mimeType) ||
      TEXT_EXTENSIONS.test(filename)
    );
  }

  async extract(buffer: Buffer): Promise<string | null> {
    const text = buffer
      .toString("utf8")
      .replace(/[^\x20-\x7E\n\r\t]/g, " ")
      .trim();
    return text.length >= 5 ? text : null;
  }
}
