import { File } from "../modules/files/file.entity";
import { TextExtractor } from "./text-extractor.interface";
import { PdfTextExtractor } from "./extractors/pdf-text-extractor";
import { DocTextExtractor } from "./extractors/doc-text-extractor";
import { PlainTextExtractor } from "./extractors/plain-text-extractor";
import { OcrTextExtractor } from "./extractors/ocr-text-extractor";

function buildExtractorChain(ocrEnabled: boolean): TextExtractor[] {
  const extractors: TextExtractor[] = [
    new PdfTextExtractor(ocrEnabled),
    new DocTextExtractor(),
    new PlainTextExtractor(),
  ];

  if (ocrEnabled) {
    extractors.push(new OcrTextExtractor());
  }

  return extractors;
}

export async function extractTextFromFile(
  file: File,
  buffer: Buffer,
  ocrEnabled = false,
): Promise<string | null> {
  const mimeType = file.mimeType || "";
  const filename = file.filename || "";
  const extractors = buildExtractorChain(ocrEnabled);

  for (const extractor of extractors) {
    if (extractor.canHandle(mimeType, filename)) {
      return extractor.extract(buffer);
    }
  }

  return null;
}
