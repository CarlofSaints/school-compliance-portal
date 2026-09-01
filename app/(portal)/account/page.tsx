"use client";

import { useAuth, authFetch, updateSession, getSession, setSession } from "@/lib/useAuth";
import Link from "next/link";
import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Toast from "@/components/Toast";
import PhotoUpload from "@/components/PhotoUpload";

interface LinkedPerson {
  id: string;
  position: string;
  photoUrl: string | null;
}

function AccountContent() {
  const { session, loading } = useAuth();
  const searchParams = useSearchParams();
  const forceChange = searchParams.get("changePassword") === "1";

  const [name, setName] = useState(session?.name || "");
  const [surname, setSurname] = useState(session?.surname || "");
  const [email, setEmail] = useState(session?.email || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [activeTab, setActiveTab] = useState<"profile" | "password">(
    forceChange ? "password" : "profile"
  );

  // A photo belongs to the register entry, not to the login, so that an
  // administrator setting it in Admin > People and somebody setting their own
  // here are writing the same thing. It is also what the People page renders.
  const [person, setPerson] = useState<LinkedPerson | null>(null);
  const [personLoaded, setPersonLoaded] = useState(false);
  const [photoFile, setPhotoFile] = useState<Blob | null>(null);
  const [photoRemoved, setPhotoRemoved] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadAccount = useCallback(async () => {
    const res = await authFetch("/api/account", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      setPerson(data.person ?? null);
    }
    setPersonLoaded(true);
  }, []);

  useEffect(() => {
    if (session) loadAccount();
  }, [session, loadAccount]);

  // The photo saves through the register entry's own route, never as part of
  // the profile payload, so saving your name can never blank your picture.
  const savePhoto = async () => {
    if (!person) return;
    if (photoFile) {
      const body = new FormData();
      body.append("photo", photoFile, "photo.jpg");
      const res = await authFetch(`/api/people/${person.id}/photo`, {
        method: "POST",
        body,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Your photo could not be saved.");
      }
    } else if (photoRemoved) {
      await authFetch(`/api/people/${person.id}/photo`, { method: "DELETE" });
    }
  };

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);

    const res = await authFetch("/api/account", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, surname, email }),
    });

    if (res.ok) {
      updateSession({ name, surname, email });
      try {
        await savePhoto();
        setPhotoFile(null);
        setPhotoRemoved(false);
        await loadAccount();
        setToast({ message: "Profile updated", type: "success" });
      } catch (err) {
        // The details saved. Say so, rather than reporting a failure that
        // would have them type everything again.
        setToast({
          message:
            (err instanceof Error ? err.message : "Your photo could not be saved.") +
            " Your other details were saved.",
          type: "error",
        });
      }
    } else {
      setToast({ message: "Failed to update profile", type: "error" });
    }
    setSaving(false);
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setToast({ message: "Passwords do not match", type: "error" });
      return;
    }
    const res = await authFetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    if (res.ok) {
      setToast({ message: "Password changed", type: "success" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      // Re-read session to clear forcePasswordChange state
      const s = getSession();
      if (s) setSession(s);
    } else {
      const data = await res.json();
      setToast({ message: data.error || "Failed", type: "error" });
    }
  };

  if (loading || !session) return <div className="p-6">Loading...</div>;

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-dark">My Account</h1>
        <p className="text-gray-500 text-sm">Manage your profile and security</p>
      </div>

      {forceChange && (
        <div className="bg-risk-medium/10 border border-risk-medium/30 text-risk-medium px-4 py-3 rounded-lg mb-6 text-sm">
          You must change your password before continuing.
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="border-b border-gray-100 flex">
          <button
            onClick={() => setActiveTab("profile")}
            className={`px-6 py-3 text-sm font-medium transition-colors ${
              activeTab === "profile"
                ? "text-primary border-b-2 border-primary"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Profile
          </button>
          <button
            onClick={() => setActiveTab("password")}
            className={`px-6 py-3 text-sm font-medium transition-colors ${
              activeTab === "password"
                ? "text-primary border-b-2 border-primary"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Password
          </button>
        </div>

        <div className="p-6">
          {activeTab === "profile" ? (
            <form onSubmit={handleProfileUpdate} className="space-y-4 max-w-md">
              {personLoaded && person && (
                <div className="pb-4 border-b border-gray-100">
                  <PhotoUpload
                    name={`${name} ${surname}`.trim()}
                    currentUrl={person.photoUrl}
                    file={photoFile}
                    removed={photoRemoved}
                    onPick={setPhotoFile}
                    onRemove={setPhotoRemoved}
                  />
                  <p className="text-xs text-gray-400 mt-2">
                    This is the photo shown against {person.position} on the{" "}
                    <Link href="/people" className="text-primary hover:underline">
                      People
                    </Link>{" "}
                    page.
                  </p>
                </div>
              )}
              {personLoaded && !person && (
                <div className="pb-4 border-b border-gray-100">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Photo
                  </label>
                  <p className="text-xs text-gray-500">
                    You are not on the People register yet, so there is nowhere for
                    a photo to appear. Ask an administrator to add you in Admin
                    &gt; People and link it to this login.
                  </p>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Surname</label>
                <input
                  type="text"
                  value={surname}
                  onChange={(e) => setSurname(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <input
                  type="text"
                  value={session.roleName}
                  disabled
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-500"
                />
              </div>
              <button
                type="submit"
                className="bg-primary hover:bg-primary-dark text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Save Changes
              </button>
            </form>
          ) : (
            <form onSubmit={handlePasswordChange} className="space-y-4 max-w-md">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Current Password
                </label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  New Password
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                />
              </div>
              <button
                type="submit"
                className="bg-primary hover:bg-primary-dark text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Change Password
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AccountPage() {
  return (
    <Suspense fallback={<div className="p-6">Loading...</div>}>
      <AccountContent />
    </Suspense>
  );
}
