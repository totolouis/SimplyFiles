import { extractOcrText } from "./ocr-extract";

// Mock tesseract.js
const mockRecognize = jest.fn();
const mockTerminate = jest.fn();
const mockCreateWorker = jest.fn();

jest.mock("tesseract.js", () => ({
  createWorker: (...args: any[]) => mockCreateWorker(...args),
}));

describe("extractOcrText", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTerminate.mockResolvedValue(undefined);
    mockCreateWorker.mockResolvedValue({
      recognize: mockRecognize,
      terminate: mockTerminate,
    });
  });

  it("should return extracted text when OCR produces >= 5 chars", async () => {
    mockRecognize.mockResolvedValue({
      data: { text: "Hello World" },
    });

    const result = await extractOcrText(Buffer.from("fake-image"));

    expect(result).toBe("Hello World");
    expect(mockCreateWorker).toHaveBeenCalledWith(
      ["eng", "fra"],
      undefined,
      expect.objectContaining({ errorHandler: expect.any(Function) }),
    );
    expect(mockTerminate).toHaveBeenCalled();
  });

  it("should return null when OCR text is less than 5 chars", async () => {
    mockRecognize.mockResolvedValue({
      data: { text: "Hi" },
    });

    const result = await extractOcrText(Buffer.from("fake-image"));

    expect(result).toBeNull();
    expect(mockTerminate).toHaveBeenCalled();
  });

  it("should return null when OCR text is empty", async () => {
    mockRecognize.mockResolvedValue({
      data: { text: "" },
    });

    const result = await extractOcrText(Buffer.from("fake-image"));

    expect(result).toBeNull();
  });

  it("should return null on OCR failure", async () => {
    mockCreateWorker.mockRejectedValue(new Error("Tesseract init failed"));

    const result = await extractOcrText(Buffer.from("fake-image"));

    expect(result).toBeNull();
  });

  it("should return null when recognize throws", async () => {
    mockRecognize.mockRejectedValue(new Error("Recognition failed"));

    const result = await extractOcrText(Buffer.from("fake-image"));

    expect(result).toBeNull();
    expect(mockTerminate).toHaveBeenCalled();
  });

  it("should handle terminate failure gracefully", async () => {
    mockRecognize.mockResolvedValue({
      data: { text: "Some text here" },
    });
    mockTerminate.mockRejectedValue(new Error("Terminate failed"));

    const result = await extractOcrText(Buffer.from("fake-image"));

    expect(result).toBe("Some text here");
  });

  it("should return text with exactly 5 chars", async () => {
    mockRecognize.mockResolvedValue({
      data: { text: "12345" },
    });

    const result = await extractOcrText(Buffer.from("fake-image"));

    expect(result).toBe("12345");
  });

  it("should return null with exactly 4 chars", async () => {
    mockRecognize.mockResolvedValue({
      data: { text: "1234" },
    });

    const result = await extractOcrText(Buffer.from("fake-image"));

    expect(result).toBeNull();
  });

  it("should call errorHandler without crashing", async () => {
    let capturedErrorHandler: any;
    mockCreateWorker.mockImplementation((_langs: any, _oem: any, opts: any) => {
      capturedErrorHandler = opts.errorHandler;
      return Promise.resolve({
        recognize: mockRecognize,
        terminate: mockTerminate,
      });
    });
    mockRecognize.mockResolvedValue({ data: { text: "Valid text" } });

    await extractOcrText(Buffer.from("fake-image"));

    expect(capturedErrorHandler).toBeDefined();
    expect(() => capturedErrorHandler("some error")).not.toThrow();
  });
});
