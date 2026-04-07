export interface TextExtractor {
  /** Returns true if this extractor can handle the given file. */
  canHandle(mimeType: string, filename: string): boolean;

  /** Extract text content from the buffer. Returns null if no text could be extracted. */
  extract(buffer: Buffer): Promise<string | null>;
}
