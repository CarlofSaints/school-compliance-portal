"use client";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { branding, hexToRgb } from "@/lib/branding";

const PRIMARY_RGB = hexToRgb(branding.colors.primary);

interface QuoteDetail {
  supplierName: string;
  supplierWebsite?: string;
  supplierEmail: string;
  supplierPhone?: string;
  priceExclVat?: number;
}

interface SpendApp {
  id: string;
  projectName: string;
  description: string;
  estimatedAmount: number;
  supplierConnection?: string;
  budgeted?: boolean;
  sourceOfFunds?: string;
  quoteDetails?: QuoteDetail[];
  status: string;
  submittedByName: string;
  submittedAt: string;
  applicantName?: string;
  applicantSurname?: string;
  submittedOnBehalf?: boolean;
  approvedAmount?: number;
  approvals: {
    userName: string;
    position: string;
    decision: string;
    comments: string;
    decidedAt: string;
  }[];
}

const STATUS_DISPLAY: Record<string, string> = {
  pending: "APPLIED",
  pending_decision: "PENDING DECISION",
  approved: "APPROVED",
  rejected: "DECLINED",
  requires_changes: "NEEDS MORE WORK",
  completed: "COMPLETED",
};

async function loadLogoBase64(): Promise<string | null> {
  try {
    const response = await fetch(branding.logo);
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function generateSpendPDF(app: SpendApp) {
  const doc = new jsPDF();
  let y = 15;

  // Logo
  const logo = await loadLogoBase64();
  if (logo) {
    doc.addImage(logo, "PNG", 14, y, 20, 24);
    y += 5;
  }

  // Title
  doc.setFontSize(18);
  doc.setTextColor(...PRIMARY_RGB); // primary color
  doc.text(branding.fullName, logo ? 40 : 14, y);
  y += 7;
  doc.setFontSize(10);
  doc.setTextColor(136, 136, 136);
  doc.text(branding.tagline, logo ? 40 : 14, y);
  y += 12;

  // Application title
  doc.setFontSize(14);
  doc.setTextColor(26, 26, 26);
  doc.text(`Spend Application — ${app.projectName}`, 14, y);
  y += 8;

  // Status badge
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`Status: ${STATUS_DISPLAY[app.status] || app.status}`, 14, y);
  y += 10;

  // Application Details
  doc.setFontSize(11);
  doc.setTextColor(26, 26, 26);
  doc.text("Application Details", 14, y);
  y += 2;

  autoTable(doc, {
    startY: y,
    theme: "grid",
    headStyles: { fillColor: PRIMARY_RGB },
    body: [
      ["Description", app.description],
      [
        "Estimated Amount",
        `R${app.estimatedAmount.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`,
      ],
      ["Source of Funds", app.sourceOfFunds || "-"],
      ["Budgeted", app.budgeted ? "Yes" : "No"],
      ["Supplier Connection", app.supplierConnection || "-"],
      [
        "Submitted By",
        app.submittedOnBehalf
          ? `${app.submittedByName} (on behalf of ${app.applicantName} ${app.applicantSurname})`
          : app.submittedByName,
      ],
      ["Submitted On", new Date(app.submittedAt).toLocaleDateString()],
      ...(app.approvedAmount
        ? [
            [
              "Approved Amount",
              `R${app.approvedAmount.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}`,
            ],
          ]
        : []),
    ],
    columnStyles: {
      0: { cellWidth: 45, fontStyle: "bold" },
      1: { cellWidth: "auto" },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 10;

  // Quote Details
  if (app.quoteDetails && app.quoteDetails.length > 0) {
    doc.setFontSize(11);
    doc.setTextColor(26, 26, 26);
    doc.text("Quote Details", 14, y);
    y += 2;

    autoTable(doc, {
      startY: y,
      theme: "grid",
      headStyles: { fillColor: PRIMARY_RGB },
      head: [["#", "Supplier", "Email", "Phone", "Price Excl. VAT"]],
      body: app.quoteDetails.map((q, i) => [
        `${i + 1}`,
        q.supplierName || "-",
        q.supplierEmail || "-",
        q.supplierPhone || "-",
        q.priceExclVat
          ? `R${q.priceExclVat.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}`
          : "-",
      ]),
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  // Approval History
  if (app.approvals.length > 0) {
    doc.setFontSize(11);
    doc.setTextColor(26, 26, 26);
    doc.text("Approval History", 14, y);
    y += 2;

    autoTable(doc, {
      startY: y,
      theme: "grid",
      headStyles: { fillColor: PRIMARY_RGB },
      head: [["Name", "Position", "Decision", "Comments", "Date"]],
      body: app.approvals.map((a) => [
        a.userName,
        a.position,
        STATUS_DISPLAY[a.decision] ||
          a.decision.charAt(0).toUpperCase() + a.decision.slice(1),
        a.comments || "-",
        new Date(a.decidedAt).toLocaleDateString(),
      ]),
    });
  }

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(136, 136, 136);
    doc.text(
      `Generated on ${new Date().toLocaleDateString()} — Page ${i} of ${pageCount}`,
      14,
      doc.internal.pageSize.height - 10
    );
  }

  doc.save(`${app.projectName.replace(/[^a-zA-Z0-9]/g, "_")}_application.pdf`);
}
