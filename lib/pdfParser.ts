// PDFs are no longer parsed here — they are sent to Claude as a native
// document block by the compliance engine. This module only handles the
// lightweight, dependency-free formats.
export async function extractTextFromBuffer(
  buffer: Buffer,
  ext: string
): Promise<string> {
  const extension = ext.toLowerCase().replace(".", "");

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
