// The xlsx-specific half of the project-list import. Kept apart from
// lib/spendImport.ts so the API route can share the pure validation without
// pulling the spreadsheet library into a server bundle.

export interface ParsedWorkbook {
  sheetNames: string[];
  sheets: Record<string, unknown[][]>;
}

// Reads every sheet into a plain grid whose indexes line up with Excel's own:
// grid[0] is row 1 and column index 0 is column A, even when the used range
// starts further in (a list that begins at B2 is common). Without this the
// preview would name the wrong row and column back to the user.
export async function parseWorkbook(
  buffer: ArrayBuffer
): Promise<ParsedWorkbook> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheets: Record<string, unknown[][]> = {};

  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const options: {
      header: 1;
      raw: boolean;
      defval: string;
      blankrows: boolean;
      range?: string;
    } = { header: 1, raw: false, defval: "", blankrows: true };

    const ref = ws?.["!ref"];
    if (ref) {
      const range = XLSX.utils.decode_range(ref);
      range.s.r = 0;
      range.s.c = 0;
      options.range = XLSX.utils.encode_range(range);
    }

    sheets[name] = XLSX.utils.sheet_to_json(ws, options) as unknown[][];
  }

  return { sheetNames: wb.SheetNames, sheets };
}
