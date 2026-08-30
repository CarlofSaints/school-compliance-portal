"use client";

import { useAuth, authFetch } from "@/lib/useAuth";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Toast from "@/components/Toast";
import FundingSplit, { type Allocation } from "@/components/FundingSplit";
import { DEFAULT_SUPPLIER_CONNECTIONS, GOVERNANCE_LABEL } from "@/lib/positions";

interface SpendSettings {
  sourcesOfFunds: string[];
  supplierConnections: string[];
}

interface DirectoryUser {
  id: string;
  name: string;
  surname: string;
  email: string;
}

interface QuoteEntry {
  file: File | null;
  supplierName: string;
  supplierWebsite: string;
  supplierEmail: string;
  supplierPhone: string;
  priceExclVat: string;
}

const emptyQuote = (): QuoteEntry => ({
  file: null,
  supplierName: "",
  supplierWebsite: "",
  supplierEmail: "",
  supplierPhone: "",
  priceExclVat: "",
});

export default function NewSpendPage() {
  const { session, loading } = useAuth("submit_spend");
  const router = useRouter();
  const [projectName, setProjectName] = useState("");
  const [description, setDescription] = useState("");
  const [estimatedAmount, setEstimatedAmount] = useState("");
  const [supplierConnection, setSupplierConnection] = useState("None");
  const [budgeted, setBudgeted] = useState(false);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [quotes, setQuotes] = useState<QuoteEntry[]>([
    emptyQuote(),
    emptyQuote(),
    emptyQuote(),
    emptyQuote(),
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  // On-behalf-of state
  const [onBehalf, setOnBehalf] = useState(false);
  const [applicantUserId, setApplicantUserId] = useState("");
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [applicantName, setApplicantName] = useState("");
  const [applicantSurname, setApplicantSurname] = useState("");
  const [applicantEmail, setApplicantEmail] = useState("");

  // Dynamic settings
  const [settings, setSettings] = useState<SpendSettings | null>(null);

  const fetchSettings = useCallback(async () => {
    const [res, usersRes] = await Promise.all([
      authFetch("/api/settings/spend"),
      authFetch("/api/users/directory"),
    ]);
    if (res.ok) {
      const data = await res.json();
      setSettings(data);
      if (data.supplierConnections.length > 0) {
        setSupplierConnection(data.supplierConnections[0]);
      }
    }
    if (usersRes.ok) setUsers(await usersRes.json());
  }, []);

  useEffect(() => {
    if (session) fetchSettings();
  }, [session, fetchSettings]);

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

    // On-behalf-of fields
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
        formData.append(`quote${i + 1}_supplierName`, quote.supplierName);
        formData.append(`quote${i + 1}_supplierWebsite`, quote.supplierWebsite);
        formData.append(`quote${i + 1}_supplierEmail`, quote.supplierEmail);
        formData.append(`quote${i + 1}_supplierPhone`, quote.supplierPhone);
        formData.append(`quote${i + 1}_priceExclVat`, quote.priceExclVat);
      }
    });

    const res = await authFetch("/api/spend", {
      method: "POST",
      body: formData,
    });

    if (res.ok) {
      const data = await res.json();
      router.push(`/spend/${data.id}`);
    } else {
      const data = await res.json();
      setToast({ message: data.error || "Submission failed", type: "error" });
    }
    setSubmitting(false);
  };

  if (loading) return <div className="p-6">Loading...</div>;

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
        <h1 className="text-2xl font-bold text-dark">
          New Spend Application
        </h1>
        <p className="text-gray-500 text-sm">
          Submit a spend request for {GOVERNANCE_LABEL} approval
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
                    placeholder="First name"
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
                    placeholder="Surname"
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
                    placeholder="email@example.com"
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
              placeholder="e.g. Classroom Painting"
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
              placeholder="Describe the project, justification, and expected outcomes..."
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
              Are any of the suppliers connected to the school in some way?
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
                  checked={budgeted === true}
                  onChange={() => setBudgeted(true)}
                  className="w-4 h-4 text-primary focus:ring-primary"
                />
                <span className="text-sm text-gray-700">Yes</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="budgeted"
                  checked={budgeted === false}
                  onChange={() => setBudgeted(false)}
                  className="w-4 h-4 text-primary focus:ring-primary"
                />
                <span className="text-sm text-gray-700">No</span>
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
                    {quotes[i].file && (
                      <p className="text-xs text-primary truncate">
                        {quotes[i].file!.name}
                      </p>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">
                          Supplier Name
                        </label>
                        <input
                          type="text"
                          value={quotes[i].supplierName}
                          onChange={(e) =>
                            updateQuote(i, {
                              supplierName: e.target.value,
                            })
                          }
                          placeholder="Company name"
                          className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">
                          Supplier Website{" "}
                          <span className="text-gray-400">(optional)</span>
                        </label>
                        <input
                          type="url"
                          value={quotes[i].supplierWebsite}
                          onChange={(e) =>
                            updateQuote(i, {
                              supplierWebsite: e.target.value,
                            })
                          }
                          placeholder="https://..."
                          className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">
                          Supplier Contact Email
                        </label>
                        <input
                          type="email"
                          value={quotes[i].supplierEmail}
                          onChange={(e) =>
                            updateQuote(i, {
                              supplierEmail: e.target.value,
                            })
                          }
                          placeholder="supplier@example.com"
                          className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">
                          Supplier Contact Number{" "}
                          <span className="text-gray-400">(optional)</span>
                        </label>
                        <input
                          type="tel"
                          value={quotes[i].supplierPhone}
                          onChange={(e) =>
                            updateQuote(i, {
                              supplierPhone: e.target.value,
                            })
                          }
                          placeholder="012 345 6789"
                          className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                        />
                      </div>
                    </div>
                    <div className="mt-3">
                      <label className="block text-xs text-gray-500 mb-1">
                        Total Price Excluding VAT (ZAR)
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">
                          R
                        </span>
                        <input
                          type="number"
                          value={quotes[i].priceExclVat}
                          onChange={(e) =>
                            updateQuote(i, {
                              priceExclVat: e.target.value,
                            })
                          }
                          min="0"
                          step="0.01"
                          placeholder="0.00"
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
              {submitting ? "Submitting..." : "Submit Application"}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
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
