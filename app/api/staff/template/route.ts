import ExcelJS from "exceljs";
import { NextRequest, NextResponse } from "next/server";
import { contentDisposition } from "@/lib/contentDisposition";
import { getRoles, requirePermission } from "@/lib/rolesData";
import { SUPER_ADMIN_ROLE_ID } from "@/lib/roles";
import { COLUMNS, TYPE_LABELS } from "@/lib/staff";

const LAST_ROW = 2000;

// ExcelJS, because SheetJS does not write dropdowns. No example row: one left in would load as a person.
export async function GET(req: NextRequest) {
  const session = await requirePermission(req, "manage_users");
  if (session instanceof NextResponse) return session;

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Staff", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = COLUMNS.map((c) => ({ header: c.header, width: c.width, style: { numFmt: "@" } }));
  ws.getRow(1).font = { bold: true };
  const typeColumn = ws.getColumn(COLUMNS.findIndex((c) => c.key === "type") + 1).letter;
  (ws as unknown as { dataValidations: { add: (range: string, rule: ExcelJS.DataValidation) => void } }).dataValidations.add(`${typeColumn}2:${typeColumn}${LAST_ROW}`, {
    type: "list",
    allowBlank: true,
    formulae: [`"${Object.values(TYPE_LABELS).join(",")}"`],
    showErrorMessage: true,
    errorTitle: "Staff type",
    error: "Choose from the list.",
  });

  const how = wb.addWorksheet("How to fill this in");
  how.getColumn(1).width = 100;
  const roles = (await getRoles()).filter((r) => r.id !== SUPER_ADMIN_ROLE_ID).map((r) => r.name);
  how.addRows([
    ["* Must be filled in on every row."],
    ["SACE number must be filled in for every teacher. Choose Coach only for someone who does not teach: a coach who also teaches is a teacher."],
    ["Persal number must be filled in for a State teacher."],
    ["Subject: what they teach or coach, with a comma between each one. Grade: the grades they teach, with a comma between each one. Leave Grade blank for a coach."],
    ["Someone who already has a login keeps their name and role. Only the staff details change."],
    [""],
    ["Roles on your portal today:"],
    ...roles.map((r) => [r]),
  ]);

  const out = await wb.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(out as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": contentDisposition("Staff template.xlsx"),
      "Cache-Control": "private, no-store",
    },
  });
}
