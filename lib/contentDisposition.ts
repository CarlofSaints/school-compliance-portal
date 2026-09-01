// HTTP headers are Latin-1. A filename with an em dash or an accent in it makes
// Content-Disposition throw outright, which turns a working download into a
// 500. So the plain filename is stripped back to ASCII for old clients and the
// real one is sent as RFC 6266 filename*, which everything current reads.
export function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "'");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(
    filename
  )}`;
}

export const DOWNLOAD_CONTENT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  txt: "text/plain; charset=utf-8",
  md: "text/markdown; charset=utf-8",
};
