import { Logger } from '@nestjs/common';
import { extractOcrText } from './ocr-extract';

const logger = new Logger('PdfExtract');

/**
 * Safe pdf-parse wrapper.
 *
 * pdf-parse v1 reads a test fixture (test/data/05-versions-space.pdf) at
 * *require* time when NODE_ENV !== 'test', which throws ENOENT in Docker.
 * We work around it by importing the underlying pdfjs-dist renderer directly,
 * bypassing the broken test-fixture lookup entirely.
 *
 * If the PDF yields no text (scanned document), falls back to OCR when enabled.
 */
export async function extractPdfText(
  buffer: Buffer,
  ocrEnabled = false,
): Promise<string | null> {
  try {
    // Import dynamically so the module-load side-effect only runs when needed
    const pdfParse: any = await import('pdf-parse/lib/pdf-parse.js')
      .catch(() => import('pdf-parse'));          // fallback to normal import

    const fn = pdfParse.default ?? pdfParse;
    const data = await fn(buffer);
    const text = (data?.text ?? '').replace(/\s+/g, ' ').trim();

    if (text.length >= 5) {
      return text;
    }

    // No extractable text — likely a scanned PDF. Try OCR if enabled.
    if (ocrEnabled) {
      logger.log('No extractable text in PDF, falling back to OCR');
      return extractOcrText(buffer);
    }

    return null;
  } catch (e: any) {
    // Graceful degradation — PDF will just not be searchable
    logger.warn(`Extraction failed: ${e.message}`);
    return null;
  }
}
