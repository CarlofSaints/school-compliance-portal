"use client";

import { useAuth, authFetch } from "@/lib/useAuth";
import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Toast from "@/components/Toast";
import FundingSplit, { type Allocation } from "@/components/FundingSplit";
import { DEFAULT_SUPPLIER_CONNECTIONS } from "@/lib/positions";

interface SpendSettings {
  sourcesOfFunds: string[];
  supplierConnections: string[];
}

interface QuoteDetail {
  supplierName: string;
  supplierWebsite?: string;
  supplierEmail: string;
  supplierPhone?: string;
  priceExclVat?: number;
}

interface SpendData {
  id: string;
  projectName: string;
  description: string;
  estimatedAmount: number;
  supplierConnection: string;
  budgeted: boolean;
  sourceOfFunds: string;
  fundingAllocations?: Allocation[];
  status: string;
  submittedBy: string;
  quoteDetails: QuoteDetail[];
  quotes: string[];
  applicantUserId?: string;
  applicantName?: string;
  applicantSurname?: string;
  applicantEmail?: string;
  submittedOnBehalf?: boolean;
}

interface DirectoryUser {
  id: string;
  name: string;
  surname: string;
  email: string;
}

interface QuoteEntry {
  file: File | null;
  existingPath?: string;
  supplierName: string;
  supplierWebsite: string;
  supplierEmail: string;
  supplierPhone: string;
  priceExclVat: string;
}

export default function EditSpendPage() {
  const { session, loading } = useAuth("submit_spend");
  const params = useParams();
  const router = useRouter();
  const spendId = params.id as string;

  const [data, setData] = useState<SpendData | null>(null);
  const [projectName, setProjectName] = useState("");
  const [description, setDescription] = useState("");
  const [estimatedAmount, setEstimatedAmount] = useState("");
  const [supplierConnection, setSupplierConnection] = useState("None");
  const [budgeted, setBudgeted] = useState(false);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [quotes, setQuotes] = useState<QuoteEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [onBehalf, setOnBehalf] = useState(false);
  const [applicantUserId, setApplicantUserId] = useState("");
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [applicantName, setApplicantName] = useState("");
  const [applicantSurname, setApplicantSurname] = useState("");
  const [applicantEmail, setApplicantEmail] = useState("");

  const [settings, setSettings] = useState<SpendSettings | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const fetchData = useCallback(async () => {
    const [spendRes, settingsRes, usersRes] = await Promise.all([
      authFetch(`/api/spend/${spendId}`),
      authFetch("/api/settings/spend"),
      authFetch("/api/users/directory"),
    ]);

    // Read first so an older record that only carries an applicant email can
    // still resolve to the user it belongs to.
    let directory: DirectoryUser[] = [];
    if (usersRes.ok) {
      directory = await usersRes.json();
      setUsers(directory);
    }

    if (spendRes.ok) {
      const spend: SpendData = await spendRes.json();
      setData(spend);
      setProjectName(spend.projectName);
      setDescription(spend.description);
      setEstimatedAmount(spend.estimatedAmount.toString());
      setSupplierConnection(spend.supplierConnection);
      setBudgeted(spend.budgeted);
      // Prefer the new split; fall back to a single allocation for legacy records.
      setAllocations(
        spend.fundingAllocations && spend.fundingAllocations.length > 0
          ? spend.fundingAllocations
          : [
              {
                source: spend.sourceOfFunds || "Other",
                amount: spend.estimatedAmount || 0,
              },
            ]
      );
      setOnBehalf(spend.submittedOnBehalf || false);
      setApplicantName(spend.applicantName || "");
      setApplicantSurname(spend.applicantSurname || "");
      setApplicantEmail(spend.applicantEmail || "");
      const linked =
        directory.find((u) => u.id === spend.applicantUserId) ||
        (spend.applicantEmail
          ? directory.find(
              (u) =>
                u.email.toLowerCase() ===
                (spend.applicantEmail || "").toLowerCase()
            )
          : undefined);
      setApplicantUserId(linked?.id || "");

      // Pre-populate quotes
      const quoteEntries: QuoteEntry[] = [];
      for (let i = 0; i < 4; i++) {
        const detail = spend.quoteDetails[i];
        const path = spend.quotes[i];
        if (detail) {
          quoteEntries.push({
            file: null,
            existingPath: path,
            supplierName: detail.supplierName || "",
            supplierWebsite: detail.supplierWebsite || "",
            supplierEmail: detail.supplierEmail || "",
            supplierPhone: detail.supplierPhone || "",
            priceExclVat: detail.priceExclVat?.toString() || "",
          });
        } else {
          quoteEntries.push({
            file: null,
            supplierName: "",
            supplierWebsite: "",
            supplierEmail: "",
            supplierPhone: "",
            priceExclVat: "",
          });
        }
      }
      setQuotes(quoteEntries);
    }

    if (settingsRes.ok) setSettings(await settingsRes.json());
  }, [spendId]);

  useEffect(() => {
    if (session) fetchData();
  }, [session, fetchData]);

  const sourcesOfFunds = settings?.sourcesOfFunds || [
    "Fundraising",
    "Grade 7 Gift",
    "CAPEX",
    "Expensed",
  ];
  const supplierConnections =
    settings?.supplierConnections || DEFAULT_SUPPLIER_CONNECTIONS;

  const updateQuote = (index: number, updates: Partial<QuoteEntry>) => {
    const updated = [...quotes];
    updated[index] = { ...updated[index], ...updates };
    setQuotes(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (allocations.length === 0) {
      setToast({
        message: "Select at least one source of funds.",
        type: "error",
      });
      return;
    }

    setSubmitting(true);

    const formData = new FormData();
    formData.append("projectName", projectName);
    formData.append("description", description);
    formData.append("estimatedAmount", estimatedAmount);
    formData.append("supplierConnection", supplierConnection);
    formData.append("budgeted", budgeted ? "yes" : "no");
    formData.append("fundingAllocations", JSON.stringify(allocations));
    formData.append(
      "sourceOfFunds",
      allocations.map((a) => a.source).join(", ")
    );
    formData.append("onBehalf", onBehalf ? "yes" : "no");

    if (onBehalf) {
      formData.append("applicantUserId", applicantUserId);
      formData.append("applicantName", applicantName);
      formData.append("applicantSurname", applicantSurname);
      formData.append("applicantEmail", applicantEmail);
    }

    quotes.forEach((quote, i) => {
      if (quote.file) {
        formData.append(`quote${i + 1}`, quote.file);
      }
      formData.append(`quote${i + 1}_supplierName`, quote.supplierName);
      formData.append(`quote${i + 1}_supplierWebsite`, quote.supplierWebsite);
      formData.append(`quote${i + 1}_supplierEmail`, quote.supplierEmail);
      formData.append(`quote${i + 1}_supplierPhone`, quote.supplierPhone);
      formData.append(`quote${i + 1}_priceExclVat`, quote.priceExclVat);
    });

    const res = await authFetch(`/api/spend/${spendId}`, {
      method: "PUT",
      body: formData,
    });

    if (res.ok) {
      router.push(`/spend/${spendId}`);
    } else {
      const err = await res.json();
      setToast({ message: err.error || "Failed to save", type: "error" });
    }
    setSubmitting(false);
  };

  if (loading || !data)
    return <div className="p-6">Loading...</div>;

  // Access check
  const isSubmitter = data.submittedBy === session?.id;
  const isAdmin =
    session?.permissions.includes("manage_spend_settings") ||
    session?.permissions.includes("manage_users");

  if (!isSubmitter && !isAdmin) {
    return (
      <div className="p-6 text-center text-gray-500">
        You do not have permission to edit this application.
      </div>
    );
  }

  if (data.status === "approved" || data.status === "completed") {
    return (
      <div className="p-6 text-center text-gray-500">
        This application cannot be edited in its current status.
      </div>
    );
  }

  return (
    <div>
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-dark">Edit Application</h1>
        <p className="text-gray-500 text-sm">
          Editing: {data.projectName}
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 max-w-3xl">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* On Behalf Of Toggle */}
          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={onBehalf}
                onChange={(e) => setOnBehalf(e.target.checked)}
                className="w-4 h-4 text-primary focus:ring-primary rounded"
              />
              <span className="text-sm font-medium text-gray-700">
                Filling in this form for someone else?
              </span>
            </label>
            {onBehalf && (
              <div className="mt-4">
                <label className="block text-xs text-gray-500 mb-1">
                  Who is this for?
                </label>
                <select
                  value={applicantUserId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setApplicantUserId(id);
                    const u = users.find((x) => x.id === id);
                    if (u) {
                      setApplicantName(u.name);
                      setApplicantSurname(u.surname);
                      setApplicantEmail(u.email);
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                >
                  <option value="">
                    Someone not on the portal (type the details below)
                  </option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} {u.surname} ({u.email})
                    </option>
                  ))}
                </select>
              </div>
            )}
            {onBehalf && !applicantUserId && (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Name
                  </label>
                  <input
                    type="text"
                    value={applicantName}
                    onChange={(e) => setApplicantName(e.target.value)}
                    required={onBehalf}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Surname
                  </label>
                  <input
                    type="text"
                    value={applicantSurname}
                    onChange={(e) => setApplicantSurname(e.target.value)}
                    required={onBehalf}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={applicantEmail}
                    onChange={(e) => setApplicantEmail(e.target.value)}
                    required={onBehalf}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Project Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Project Name
            </label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              rows={4}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none resize-none"
            />
          </div>

          {/* Estimated Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Estimated Amount (ZAR)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                R
              </span>
              <input
                type="number"
                value={estimatedAmount}
                onChange={(e) => setEstimatedAmount(e.target.value)}
                required
                min="0"
                step="0.01"
                className="w-full pl-7 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
              />
            </div>
          </div>

          {/* Supplier Connection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Supplier Connection
            </label>
            <select
              value={supplierConnection}
              onChange={(e) => setSupplierConnection(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
            >
              {supplierConnections.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          {/* Budgeted */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Has this been budgeted for?
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="budgeted"
                  checked={budgeted}
                  onChange={() => setBudgeted(true)}
                  className="w-4 h-4 text-primary focus:ring-primary"
                />
                <span className="text-sm">Yes</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="budgeted"
                  checked={!budgeted}
                  onChange={() => setBudgeted(false)}
                  className="w-4 h-4 text-primary focus:ring-primary"
                />
                <span className="text-sm">No</span>
              </label>
            </div>
          </div>

          {/* Source of Funds (multi-select with split) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Proposed Source(s) of Funds
            </label>
            <p className="text-xs text-gray-500 mb-2">
              Tick every source this spend will draw from. If it&apos;s split,
              enter how much comes from each.
            </p>
            <FundingSplit
              sources={sourcesOfFunds}
              value={allocations}
              onChange={setAllocations}
              estimatedAmount={parseFloat(estimatedAmount) || 0}
            />
          </div>

          {/* Quotes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Quotes (up to 4)
            </label>
            <div className="space-y-4">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="border border-gray-200 rounded-lg p-4"
                >
                  <p className="text-sm font-medium text-gray-600 mb-3">
                    Quote {i + 1}
                    {quotes[i]?.existingPath && !quotes[i]?.file && (
                      <span className="text-xs text-primary ml-2">
                        (existing file uploaded)
                      </span>
                    )}
                  </p>
                  <div className="space-y-3">
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.docx"
                      onChange={(e) =>
                        updateQuote(i, {
                          file: e.target.files?.[0] || null,
                        })
                      }
                      className="w-full text-xs file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                    />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">
                          Supplier Name
                        </label>
                        <input
                          type="text"
                          value={quotes[i]?.supplierName || ""}
                          onChange={(e) =>
                            updateQuote(i, {
                              supplierName: e.target.value,
                            })
                          }
                          className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">
                          Supplier Website
                        </label>
                        <input
                          type="url"
                          value={quotes[i]?.supplierWebsite || ""}
                          onChange={(e) =>
                            updateQuote(i, {
                              supplierWebsite: e.target.value,
                            })
                          }
                          className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">
                          Supplier Email
                        </label>
                        <input
                          type="email"
                          value={quotes[i]?.supplierEmail || ""}
                          onChange={(e) =>
                            updateQuote(i, {
                              supplierEmail: e.target.value,
                            })
                          }
                          className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">
                          Supplier Phone
                        </label>
                        <input
                          type="tel"
                          value={quotes[i]?.supplierPhone || ""}
                          onChange={(e) =>
                            updateQuote(i, {
                              supplierPhone: e.target.value,
                            })
                          }
                          className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                        />
                      </div>
                    </div>
                    <div className="mt-3">
                      <label className="block text-xs text-gray-500 mb-1">
                        Price Excl. VAT (ZAR)
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">
                          R
                        </span>
                        <input
                          type="number"
                          value={quotes[i]?.priceExclVat || ""}
                          onChange={(e) =>
                            updateQuote(i, {
                              priceExclVat: e.target.value,
                            })
                          }
                          min="0"
                          step="0.01"
                          className="w-full pl-7 pr-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="bg-primary hover:bg-primary-dark text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {submitting ? "Saving..." : "Save Changes"}
            </button>
            <button
              type="button"
              onClick={() => router.push(`/spend/${spendId}`)}
              className="px-6 py-2 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
