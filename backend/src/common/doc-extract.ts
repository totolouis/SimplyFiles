import { Logger } from '@nestjs/common';

const logger = new Logger('DocExtract');

/**
 * Extract plain text from .docx and .odt files using mammoth.
 * mammoth handles both formats natively.
 */
export async function extractDocText(buffer: Buffer): Promise<string | null> {
  try {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    const text = (result.value || '').replace(/\s+/g, ' ').trim();
    return text.length >= 5 ? text : null;
  } catch (e: any) {
    logger.warn(`Extraction failed: ${e.message}`);
    return null;
  }
}
