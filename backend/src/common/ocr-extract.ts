import { Logger } from "@nestjs/common";

const logger = new Logger("OcrExtract");

/**
 * Extract text from an image buffer using Tesseract.js OCR.
 * Returns null if OCR produces no usable text.
 */
export async function extractOcrText(buffer: Buffer): Promise<string | null> {
  let worker: any = null;
  try {
    const { createWorker } = require("tesseract.js");

    worker = await createWorker(["eng", "fra"], undefined, {
      errorHandler: (e: any) => {
        logger.warn(`Tesseract worker error: ${e}`);
      },
    });

    const {
      data: { text },
    } = await worker.recognize(buffer);
    logger.debug(`OCR extracted ${text.length} chars`);
    return text.length >= 5 ? text : null;
  } catch (e: any) {
    logger.warn(`OCR extraction failed: ${e.message}`);
    return null;
  } finally {
    if (worker) {
      await worker.terminate().catch(() => {});
    }
  }
}
