"use client";

import { useAuth, authFetch } from "@/lib/useAuth";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Toast from "@/components/Toast";

const SUPPLIER_CONNECTIONS = [
  "None",
  "Parent",
  "SGB Member",
  "Friend of Parent",
  "Teacher",
  "Relative of Teacher",
  "Relative of Parent",
  "Relative of SGB Member",
];

const SOURCE_OF_FUNDS = [
  "Fundraising",
  "Grade 7 Gift",
  "CAPEX",
  "Expensed",
];

interface QuoteEntry {
  file: File | null;
  supplierName: string;
  supplierWebsite: string;
  supplierEmail: string;
  supplierPhone: string;
}

const emptyQuote = (): QuoteEntry => ({
  file: null,
  supplierName: "",
  supplierWebsite: "",
  supplierEmail: "",
  supplierPhone: "",
});

export default function NewSpendPage() {
  const { session, loading } = useAuth("submit_spend");
  const router = useRouter();
  const [projectName, setProjectName] = useState("");
  const [description, setDescription] = useState("");
  const [estimatedAmount, setEstimatedAmount] = useState("");
  const [supplierConnection, setSupplierConnection] = useState("None");
  const [budgeted, setBudgeted] = useState(false);
  const [sourceOfFunds, setSourceOfFunds] = useState("Fundraising");
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

  const updateQuote = (index: number, updates: Partial<QuoteEntry>) => {
    const updated = [...quotes];
    updated[index] = { ...updated[index], ...updates };
    setQuotes(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    const formData = new FormData();
    formData.append("projectName", projectName);
    formData.append("description", description);
    formData.append("estimatedAmount", estimatedAmount);
    formData.append("supplierConnection", supplierConnection);
    formData.append("budgeted", budgeted ? "yes" : "no");
    formData.append("sourceOfFunds", sourceOfFunds);

    quotes.forEach((quote, i) => {
      if (quote.file) {
        formData.append(`quote${i + 1}`, quote.file);
        formData.append(`quote${i + 1}_supplierName`, quote.supplierName);
        formData.append(`quote${i + 1}_supplierWebsite`, quote.supplierWebsite);
        formData.append(`quote${i + 1}_supplierEmail`, quote.supplierEmail);
        formData.append(`quote${i + 1}_supplierPhone`, quote.supplierPhone);
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
          Submit a spend request for SGB approval
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 max-w-3xl">
        <form onSubmit={handleSubmit} className="space-y-5">
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
              {SUPPLIER_CONNECTIONS.map((opt) => (
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

          {/* Source of Funds */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Proposed Source of Funds
            </label>
            <select
              value={sourceOfFunds}
              onChange={(e) => setSourceOfFunds(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
            >
              {SOURCE_OF_FUNDS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
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
