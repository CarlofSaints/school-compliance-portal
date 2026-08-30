import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rolesData";
import {
  getSpendApplications,
  createSpendApplications,
  deleteSpendImportBatch,
} from "@/lib/spendData";
import type { SpendApplication } from "@/lib/spendData";
import { getPeople } from "@/lib/peopleData";
import { getUsers } from "@/lib/userData";
import { getSpendSettings } from "@/lib/settingsData";
import { normaliseSource } from "@/lib/spendImport";
import { v4 as uuidv4 } from "uuid";

// Guards against a runaway paste: a school project list is tens of rows, not
// thousands, and every row here becomes a blob write.
const MAX_ROWS = 500;

interface IncomingRow {
  rowNumber?: number;
  projectName?: string;
  description?: string;
  estimatedAmount?: number;
  sourceOfFunds?: string;
  custodian?: string;
  // The portal user the custodian column was matched to. The raw custodian
  // text is kept too, but this is what makes the applicant a real user.
  applicantUserId?: string;
  budgeted?: boolean;
}

interface SkippedRow {
  rowNumber: number;
  projectName: string;
  reason: string;
}

// Splits a custodian cell into name + surname. Lists usually hold a first name
// only ("Graham"), so the surname is allowed to be empty.
function splitName(full: string): { name: string; surname: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { name: "", surname: "" };
  return { name: parts[0], surname: parts.slice(1).join(" ") };
}

export async function POST(req: NextRequest) {
  // Importing writes applications on other people's behalf, so this is an
  // admin action rather than a plain submit_spend one.
  const session = await requirePermission(req, "manage_spend_settings");
  if (session instanceof NextResponse) return session;

  try {
    const body = await req.json();
    const rows: IncomingRow[] = Array.isArray(body?.rows) ? body.rows : [];
    const sourceFile = String(body?.sourceFile ?? "").trim().slice(0, 200);
    const batchId = uuidv4();
    const status: SpendApplication["status"] =
      body?.status === "approved" ? "approved" : "pending";

    if (rows.length === 0) {
      return NextResponse.json({ error: "No rows to import" }, { status: 400 });
    }
    if (rows.length > MAX_ROWS) {
      return NextResponse.json(
        { error: `Too many rows (${rows.length}). Maximum is ${MAX_ROWS}.` },
        { status: 400 }
      );
    }

    const [existing, people, settings, users] = await Promise.all([
      getSpendApplications(),
      getPeople(),
      getSpendSettings(),
      getUsers(),
    ]);

    const takenNames = new Set(
      existing.map((a) => (a.projectName || "").trim().toLowerCase())
    );

    const toCreate: SpendApplication[] = [];
    const skipped: SkippedRow[] = [];
    const now = new Date().toISOString();

    for (const row of rows) {
      const rowNumber = Number(row.rowNumber) || 0;
      const projectName = String(row.projectName ?? "").trim();

      if (!projectName) {
        skipped.push({ rowNumber, projectName: "", reason: "No project name" });
        continue;
      }
      const key = projectName.toLowerCase();
      if (takenNames.has(key)) {
        skipped.push({
          rowNumber,
          projectName,
          reason: "A project with this name already exists",
        });
        continue;
      }

      const amount = Number(row.estimatedAmount);
      if (!Number.isFinite(amount) || amount < 0) {
        skipped.push({ rowNumber, projectName, reason: "Invalid amount" });
        continue;
      }

      const sourceOfFunds =
        normaliseSource(row.sourceOfFunds, settings.sourcesOfFunds) || "Other";

      // Custodian becomes the applicant. The import page resolves the custodian
      // column to a portal user, so prefer that; fall back to a unique match on
      // the school's people list, and otherwise leave the request with the
      // person doing the import rather than inventing an applicant.
      const custodian = String(row.custodian ?? "").trim();
      const chosenUser = row.applicantUserId
        ? users.find((u) => u.id === row.applicantUserId)
        : undefined;

      const custodianLower = custodian.toLowerCase();
      const peopleMatches =
        !chosenUser && custodian
          ? people.filter((p) => {
              const full = (p.name || "").trim().toLowerCase();
              return (
                full === custodianLower ||
                full.startsWith(custodianLower + " ")
              );
            })
          : [];
      const person = peopleMatches.length === 1 ? peopleMatches[0] : null;

      const applicantUserId = chosenUser?.id;
      const applicantName = chosenUser
        ? chosenUser.name
        : splitName(person ? person.name : custodian).name;
      const applicantSurname = chosenUser
        ? chosenUser.surname
        : splitName(person ? person.name : custodian).surname;
      const applicantEmail = chosenUser?.email || person?.email || "";
      const onBehalf = !!(chosenUser || custodian);

      toCreate.push({
        id: uuidv4(),
        projectName,
        description: String(row.description ?? "").trim() || projectName,
        estimatedAmount: amount,
        supplierConnection: "None",
        budgeted: !!row.budgeted,
        sourceOfFunds,
        fundingAllocations: [{ source: sourceOfFunds, amount }],
        quotes: [],
        quoteDetails: [],
        status,
        submittedBy: session.id,
        submittedByName: `${session.name} ${session.surname}`,
        submittedAt: now,
        approvals: [],
        applicantUserId,
        applicantName: applicantName || session.name,
        applicantSurname: applicantName ? applicantSurname : session.surname,
        applicantEmail,
        submittedOnBehalf: onBehalf,
        preferredQuotes: [],
        importBatchId: batchId,
        importedFrom: sourceFile,
        ...(status === "approved" ? { approvedAmount: amount } : {}),
      });

      takenNames.add(key);
    }

    await createSpendApplications(toCreate);

    // No approver or applicant emails here on purpose: an import of an existing
    // list is a data load, not a fresh request, and firing one mail per row
    // would spam every approver.
    return NextResponse.json({
      created: toCreate.length,
      skipped,
      batchId,
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Undo one import. Spend applications have no other delete path, so without
// this a mis-mapped bulk load would be permanent.
export async function DELETE(req: NextRequest) {
  const session = await requirePermission(req, "manage_spend_settings");
  if (session instanceof NextResponse) return session;

  const batchId = req.nextUrl.searchParams.get("batch");
  if (!batchId) {
    return NextResponse.json({ error: "No batch specified" }, { status: 400 });
  }

  try {
    const removed = await deleteSpendImportBatch(batchId);
    return NextResponse.json({ removed });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
