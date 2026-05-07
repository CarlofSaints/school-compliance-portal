import { PDFParse } from "pdf-parse";

export async function extractTextFromBuffer(
  buffer: Buffer,
  ext: string
): Promise<string> {
  const extension = ext.toLowerCase().replace(".", "");

  if (extension === "pdf") {
    try {
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      const result = await parser.getText();
      await parser.destroy();
      return result.text || "[No text found in PDF]";
    } catch (err) {
      console.error("PDF parse error:", err);
      return "[Could not extract text from PDF]";
    }
  }

  if (extension === "txt" || extension === "md") {
    return buffer.toString("utf-8");
  }

  if (extension === "docx") {
    try {
      const JSZip = (await import("jszip" as string)).default;
      const zip = await JSZip.loadAsync(buffer);
      const doc = await zip.file("word/document.xml")?.async("text");
      if (doc) {
        return doc
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
      }
    } catch {
      // Fall through
    }
    return "[Could not extract text from DOCX - install jszip for DOCX support]";
  }

  return buffer.toString("utf-8");
}
