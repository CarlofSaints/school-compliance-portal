"use client";

import { DEFAULT_POLICY_CATEGORIES, REQUIRED_POLICY_CATEGORY } from "@/lib/policyCategories";
import { useAuth, authFetch } from "@/lib/useAuth";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import FileUpload from "@/components/FileUpload";
import Toast from "@/components/Toast";

export default function UploadPolicyPage() {
  const { loading } = useAuth("upload_policies");
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(REQUIRED_POLICY_CATEGORY);
  const [categories, setCategories] = useState<string[]>(DEFAULT_POLICY_CATEGORIES);
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // The school's own list, from Admin > Policy Categories. Seeded with the
  // built-in defaults so the dropdown is never momentarily empty.
  useEffect(() => {
    let cancelled = false;
    authFetch("/api/settings/policy-categories")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && Array.isArray(data) && data.length) {
          setCategories(data);
        }
      })
      .catch(() => {
        // Keep the defaults; the upload itself does not depend on this.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setToast({ message: "Please select a file", type: "error" });
      return;
    }
    setSubmitting(true);

    const formData = new FormData();
    formData.append("name", name);
    formData.append("description", description);
    formData.append("category", category);
    formData.append("file", file);

    const res = await authFetch("/api/policies", {
      method: "POST",
      body: formData,
    });

    if (res.ok) {
      const data = await res.json();
      router.push(`/policies/${data.id}`);
    } else {
      const data = await res.json();
      setToast({ message: data.error || "Upload failed", type: "error" });
    }
    setSubmitting(false);
  };

  if (loading) return <div className="p-6">Loading...</div>;

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-dark">Upload Policy</h1>
        <p className="text-gray-500 text-sm">Add a new policy to the repository</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Policy Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g. Financial Management Policy"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Brief description of the policy..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none resize-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
            >
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Policy Document
            </label>
            <FileUpload
              onChange={setFile}
              value={file}
              label="Upload policy document (PDF, DOCX, TXT)"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="bg-primary hover:bg-primary-dark text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {submitting ? "Uploading..." : "Upload Policy"}
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
