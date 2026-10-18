"use client";

import { useAuth, authFetch, apiErrorMessage } from "@/lib/useAuth";
import { useState, useEffect, useCallback } from "react";
import Toast from "@/components/Toast";
import { useT } from "@/components/I18nProvider";
import { TAG_COLOR_CLASSES } from "@/lib/tags";


// Sentinel for the Person picker meaning "this user is not on the register
// yet, put them on it now". Every real option is a person id, so this cannot
// collide with one.
const NEW_PERSON = "__new__";

interface UserRecord {
  id: string;
  name: string;
  surname: string;
  email: string;
  role: string;
  forcePasswordChange: boolean;
  createdAt: string;
  tagIds?: string[];
  canSpendTranslationCredits?: boolean;
  roleName?: string;
}

interface RoleRecord {
  id: string;
  name: string;
}

// A person on the school's People register. The link between a user and a
// person lives on the PERSON record (person.userId) and is also editable from
// Admin > People - this page is the same relationship seen from the user's
// side, not a second copy of it.
interface TagRecord {
  id: string;
  name: string;
  color: string;
}

interface PersonRecord {
  id: string;
  position: string;
  userId: string | null;
  name: string;
  email: string;
}

export default function UsersPage() {
  const t = useT();
  // Open to anyone who may view users; editing is gated separately below.
  const { session, loading } = useAuth(["view_users", "manage_users"]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [roles, setRoles] = useState<RoleRecord[]>([]);
  const [people, setPeople] = useState<PersonRecord[]>([]);
  const [tags, setTags] = useState<TagRecord[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser] = useState<UserRecord | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [repairing, setRepairing] = useState(false);
  // Id of the row whose login email is currently being sent, so only that
  // row shows a spinner rather than the whole table going busy.
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    surname: "",
    email: "",
    password: "",
    role: "viewer",
    forcePasswordChange: true,
    sendEmail: false,
    personId: "",
    position: "",
    tagIds: [] as string[],
    canSpendTranslationCredits: false,
  });
  const [showPassword, setShowPassword] = useState(false);
  // Editable in Admin > People Types, so it is fetched. This dropdown was left
  // on the built-in constant when the rest moved over, so a position added in
  // People Types never appeared here and there was no way to put somebody on
  // it from the user form.
  const [positions, setPositions] = useState<string[]>([]);
  const canManage = session?.permissions.includes("manage_users") ?? false;
  // Last sign-in per user id, fetched ONCE per page load and apart from the
  // user list (which refetches after every edit). Same gate as the Sign-ins
  // view: anyone it refuses, or a failed read, simply gets no column.
  const [lastSignIn, setLastSignIn] = useState<Record<string, string> | null>(null);
  const showSignIns = lastSignIn !== null;
  const signedIn = !!session;
  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    authFetch("/api/activity/signins?lastOnly=1")
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as { last?: Record<string, string> };
        if (live) setLastSignIn(data.last || {});
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [signedIn]);

  const fetchData = useCallback(async () => {
    const [usersRes, rolesRes, peopleRes, tagsRes, positionsRes] =
      await Promise.all([
        authFetch("/api/users"),
        authFetch("/api/roles"),
        authFetch("/api/people"),
        authFetch("/api/tags"),
        authFetch("/api/settings/positions", { cache: "no-store" }),
      ]);
    if (usersRes.ok) setUsers(await usersRes.json());
    if (rolesRes.ok) setRoles(await rolesRes.json());
    // Needs manage_people. An admin without it simply sees no People column
    // rather than a broken page.
    if (peopleRes.ok) setPeople(await peopleRes.json());
    if (tagsRes.ok) setTags(await tagsRes.json());
    if (positionsRes.ok) {
      const list = await positionsRes.json();
      if (Array.isArray(list)) setPositions(list);
    }
  }, []);

  const personForUser = useCallback(
    (userId: string) => people.find((p) => p.userId === userId),
    [people]
  );

  useEffect(() => {
    if (session) fetchData();
  }, [session, fetchData]);

  const openCreate = () => {
    setEditUser(null);
    setForm({
      name: "",
      surname: "",
      email: "",
      password: "",
      role: "viewer",
      forcePasswordChange: true,
      sendEmail: false,
      personId: "",
      position: "",
      tagIds: [],
      canSpendTranslationCredits: false,
    });
    setShowModal(true);
  };

  const openEdit = (user: UserRecord) => {
    setEditUser(user);
    setForm({
      name: user.name,
      surname: user.surname,
      email: user.email,
      password: "",
      role: user.role,
      forcePasswordChange: user.forcePasswordChange,
      sendEmail: false,
      personId: personForUser(user.id)?.id || "",
      position: "",
      tagIds: user.tagIds || [],
      canSpendTranslationCredits: !!user.canSpendTranslationCredits,
    });
    setShowModal(true);
  };

  // The person record owns the link, so changing it here writes to People:
  // claim the newly chosen person and release the one this user held before.
  const syncPersonLink = async (userId: string, personId: string) => {
    const previous = personForUser(userId);
    if (previous?.id === personId) return true;

    let ok = true;
    if (previous) {
      const res = await authFetch(`/api/people/${previous.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: null }),
      });
      ok = ok && res.ok;
    }
    if (personId) {
      const res = await authFetch(`/api/people/${personId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      ok = ok && res.ok;
    }
    return ok;
  };

  // Puts a user on the People register from here, instead of sending whoever
  // is creating them off to Admin > People to add the same name a second time.
  //
  // The register entry is created already pointing at the user, so there is no
  // separate link step that could half-succeed. Name and email are taken from
  // the fields above rather than asked for again.
  const createPersonFor = async (userId: string): Promise<boolean> => {
    // The link lives on the person, so a user who already held one has to let
    // go of it before taking a new one.
    const previous = personForUser(userId);
    if (previous) {
      const res = await authFetch(`/api/people/${previous.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: null }),
      });
      if (!res.ok) return false;
    }

    const res = await authFetch("/api/people", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        position: form.position,
        name: `${form.name} ${form.surname}`.trim(),
        email: form.email,
        userId,
      }),
    });
    return res.ok;
  };

  const linkPerson = (userId: string) =>
    form.personId === NEW_PERSON
      ? createPersonFor(userId)
      : syncPersonLink(userId, form.personId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // A register entry with no position cannot be created, and defaulting one
    // would quietly file somebody as whatever happened to be first in the list.
    if (form.personId === NEW_PERSON && !form.position) {
      setToast({
        message: t("Choose the position this person holds on the register."),
        type: "error",
      });
      return;
    }
    if (editUser) {
      const updates: Record<string, unknown> = {
        name: form.name,
        surname: form.surname,
        email: form.email,
        role: form.role,
        forcePasswordChange: form.forcePasswordChange,
        tagIds: form.tagIds,
        canSpendTranslationCredits: form.canSpendTranslationCredits,
      };
      if (form.password) updates.password = form.password;
      const res = await authFetch(`/api/users/${editUser.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const linked = await linkPerson(editUser.id);
        setToast({
          message: linked
            ? t("User updated")
            : t("User updated, but the People link could not be saved"),
          type: linked ? "success" : "error",
        });
        setShowModal(false);
        fetchData();
      } else {
        setToast({ message: await apiErrorMessage(res), type: "error" });
      }
    } else {
      if (!form.password) {
        setToast({ message: t("Password is required"), type: "error" });
        return;
      }
      const res = await authFetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        const created = await res.json();
        const linked = form.personId
          ? await linkPerson(created.id)
          : true;
        setToast({
          message: linked
            ? t("User created")
            : t("User created, but the People link could not be saved"),
          type: linked ? "success" : "error",
        });
        setShowModal(false);
        fetchData();
      } else {
        setToast({ message: await apiErrorMessage(res), type: "error" });
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t("Delete this user?"))) return;
    const res = await authFetch(`/api/users/${id}`, { method: "DELETE" });
    if (res.ok) {
      setToast({ message: t("User deleted"), type: "success" });
      fetchData();
    }
  };

  // Sends the person a link to choose their own password.
  //
  // Deliberately NOT "resend their credentials": passwords are stored hashed,
  // so the one they were originally given cannot be read back and re-sent. The
  // old version of this route pretended otherwise and mailed people a password
  // it never actually set, which is why nobody could get in.
  const resendLoginEmail = async (user: UserRecord) => {
    setSendingTo(user.id);
    setNotice(null);
    try {
      const res = await authFetch(`/api/users/${user.id}/notify`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setToast({
          message: data.error || t("Could not send the email."),
          type: "error",
        });
        return;
      }
      setToast({
        message: t("Sent to {email}. The link expires in {minutes} minutes.", { email: data.sentTo || user.email, minutes: data.expiresInMinutes ?? 60 }),
        type: "success",
      });
    } catch {
      setToast({ message: t("Could not send the email."), type: "error" });
    } finally {
      setSendingTo(null);
    }
  };

  // Puts back any account that is in storage but has fallen out of the list.
  // Only ever adds, so it is safe to press at any time.
  const rebuildFromStorage = async () => {
    setRepairing(true);
    setNotice(null);
    const res = await authFetch("/api/users/repair-index", { method: "POST" });
    if (res.ok) {
      const result = await res.json();
      const secured = result.backfilled
        ? " " +
          (result.backfilled === 1
            ? t("{count} existing account is now stored so it can be restored in full if the list ever loses it.", { count: result.backfilled })
            : t("{count} existing accounts are now stored so they can be restored in full if the list ever loses them.", { count: result.backfilled }))
        : "";
      setNotice(
        result.count === 0
          ? t("Nothing missing. Every account in storage is already listed.") + secured
          : (result.count === 1
              ? t("Put back {count} account:", { count: result.count })
              : t("Put back {count} accounts:", { count: result.count })) +
            ` ${result.restored
              .map((u: { name: string; email: string }) => `${u.name} (${u.email})`)
              .join(", ")}.`
      );
      fetchData();
    } else {
      setNotice(t("The user list could not be rebuilt."));
    }
    setRepairing(false);
  };

  if (loading) return <div className="p-6">{t("Loading...")}</div>;

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-dark">{t("Users")}</h1>
          <p className="text-gray-500 text-sm">
            {canManage
              ? t("Manage user accounts")
              : t("Who is on the portal, and what they are tagged as")}
          </p>
        </div>
        {canManage && (
          <div className="flex gap-2 shrink-0">
            <button
              onClick={rebuildFromStorage}
              disabled={repairing}
              title={t("Finds accounts that are in storage but missing from this list, and puts them back")}
              className="border border-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              {repairing ? t("Checking...") : t("Rebuild list from storage")}
            </button>
            <button
              onClick={openCreate}
              className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              {t("+ Add User")}
            </button>
          </div>
        )}
      </div>

      {notice && (
        <div className="mb-4 rounded-xl border border-gray-200 bg-white p-3 text-sm text-gray-700">
          {notice}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left px-6 py-3 font-medium text-gray-500">{t("Name")}</th>
              <th className="text-left px-6 py-3 font-medium text-gray-500">{t("Email")}</th>
              <th className="text-left px-6 py-3 font-medium text-gray-500">{t("Role")}</th>
              <th className="text-left px-6 py-3 font-medium text-gray-500">{t("Tags")}</th>
              <th className="text-left px-6 py-3 font-medium text-gray-500">{t("Person")}</th>
              <th className="text-left px-6 py-3 font-medium text-gray-500">{t("Status")}</th>
              {showSignIns && <th className="text-left px-6 py-3 font-medium text-gray-500">{t("Last sign-in")}</th>}
              <th className="text-right px-6 py-3 font-medium text-gray-500">{t("Actions")}</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const roleName =
                roles.find((r) => r.id === user.role)?.name ||
                user.roleName ||
                user.role;
              const person = personForUser(user.id);
              return (
                <tr key={user.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-xs font-bold">
                        {user.name[0]}{user.surname[0]}
                      </div>
                      <span className="font-medium">{user.name} {user.surname}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-gray-600">{user.email}</td>
                  <td className="px-6 py-4">
                    <span className="bg-primary/10 text-primary-dark px-2 py-1 rounded text-xs font-medium">
                      {roleName}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {user.tagIds && user.tagIds.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {user.tagIds.map((id) => {
                          const tag = tags.find((t) => t.id === id);
                          if (!tag) return null;
                          return (
                            <span
                              key={id}
                              className={`px-2 py-1 rounded text-xs font-medium ${
                                TAG_COLOR_CLASSES[tag.color] ||
                                TAG_COLOR_CLASSES.slate
                              }`}
                            >
                              {tag.name}
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <span className="text-gray-300 text-xs">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {person ? (
                      <span
                        className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded text-xs font-medium"
                        title={person.name}
                      >
                        {person.position}
                      </span>
                    ) : (
                      <span className="text-gray-300 text-xs">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {user.forcePasswordChange ? (
                      <span className="text-risk-medium text-xs">{t("Never signed in")}</span>
                    ) : (
                      <span className="text-emerald-600 text-xs">{t("Active")}</span>
                    )}
                  </td>
                  {showSignIns && (
                    <td className="px-6 py-4 text-gray-600 text-xs whitespace-nowrap">
                      {lastSignIn?.[user.id]
                        ? new Date(lastSignIn[user.id]).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
                        : "-"}
                    </td>
                  )}
                  <td className="px-6 py-4 text-right">
                    {canManage ? (
                      <>
                        {/* Only for people who have never signed in. Once
                            somebody has their own password the honest way
                            back in is Forgot your password? on the sign-in
                            page, which needs no admin at all. */}
                        {user.forcePasswordChange && (
                          <button
                            onClick={() => resendLoginEmail(user)}
                            disabled={sendingTo === user.id}
                            title={t("Email {email} a link to choose their own password", { email: user.email })}
                            className="text-primary hover:text-primary-dark mr-3 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {sendingTo === user.id ? t("Sending...") : t("Resend login email")}
                          </button>
                        )}
                        <button
                          onClick={() => openEdit(user)}
                          className="text-primary hover:text-primary-dark mr-3 text-xs font-medium"
                        >
                          {t("Edit")}
                        </button>
                        <button
                          onClick={() => handleDelete(user.id)}
                          className="text-risk-high hover:text-red-700 text-xs font-medium"
                        >
                          {t("Delete")}
                        </button>
                      </>
                    ) : (
                      <span className="text-gray-300 text-xs">{t("View only")}</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {users.length === 0 && (
              <tr>
                <td colSpan={showSignIns ? 8 : 7} className="px-6 py-12 text-center text-gray-400">
                  {t("No users yet.")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold">{editUser ? t("Edit User") : t("Create User")}</h2>
            </div>
            {/* This form creates an account for SOMEBODY ELSE, so the
                browser's saved logins must not be offered here: Chrome will
                otherwise fill the email and password with the signed-in
                person's own saved credentials, and an admin who tabs past
                them creates the account under the wrong address. */}
            <form
              onSubmit={handleSubmit}
              autoComplete="off"
              className="p-6 space-y-4"
            >
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t("Name")}</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                    autoComplete="off"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t("Surname")}</label>
                  <input
                    type="text"
                    value={form.surname}
                    onChange={(e) => setForm({ ...form, surname: e.target.value })}
                    required
                    autoComplete="off"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("Email")}</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                  autoComplete="off"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t("Password")} {editUser && t("(leave blank to keep current)")}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    required={!editUser}
                    autoComplete="new-password"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                  >
                    {showPassword ? t("Hide") : t("Show")}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("Role")}</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  disabled={roles.length === 0}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none disabled:bg-gray-50 disabled:text-gray-500"
                >
                  {roles.length === 0 ? (
                    // Reading the role list needs manage_roles, which the
                    // SGB/Board Admin role deliberately does not have. Show the
                    // role the user already holds rather than an empty box that
                    // looks like the record has no role. Saving keeps it: the
                    // form still carries the original id.
                    <option value={form.role}>
                      {editUser?.roleName || form.role || "-"}
                    </option>
                  ) : (
                    roles.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))
                  )}
                </select>
                {roles.length === 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    {t("Changing the role needs the Manage Roles & Permissions permission.")}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t("Tags")}
                </label>
                {tags.length === 0 ? (
                  <p className="text-xs text-gray-400">
                    {t("No tags yet. Create them in Admin > Tags.")}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {tags.map((t) => {
                      const on = form.tagIds.includes(t.id);
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() =>
                            setForm({
                              ...form,
                              tagIds: on
                                ? form.tagIds.filter((x) => x !== t.id)
                                : [...form.tagIds, t.id],
                            })
                          }
                          className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                            TAG_COLOR_CLASSES[t.color] || TAG_COLOR_CLASSES.slate
                          } ${on ? "ring-2 ring-primary" : "opacity-40 hover:opacity-70"}`}
                        >
                          {t.name}
                        </button>
                      );
                    })}
                  </div>
                )}
                <p className="text-xs text-gray-400 mt-1">
                  {t("Tags decide who has to approve a fund application.")}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t("Person")}
                </label>
                <select
                  value={form.personId}
                  onChange={(e) => setForm({ ...form, personId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                >
                  <option value="">{t("Not on the People register")}</option>
                  {session?.permissions.includes("manage_people") && (
                    <option value={NEW_PERSON}>
                      {t("Add them to the People register")}
                    </option>
                  )}
                  {people.map((p) => {
                    // A person can only be one user. Flag any already claimed
                    // by somebody else rather than hiding them, so it is clear
                    // why a name cannot be picked.
                    const takenBy =
                      p.userId && p.userId !== editUser?.id
                        ? users.find((u) => u.id === p.userId)
                        : undefined;
                    return (
                      <option key={p.id} value={p.id} disabled={!!takenBy}>
                        {p.position}
                        {p.name ? ` - ${p.name}` : ""}
                        {takenBy
                          ? ` (${t("already")} ${takenBy.name} ${takenBy.surname})`
                          : ""}
                      </option>
                    );
                  })}
                </select>
                {form.personId === NEW_PERSON && (
                  <div className="mt-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {t("Position on the register")}
                    </label>
                    <select
                      value={form.position}
                      onChange={(e) =>
                        setForm({ ...form, position: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                    >
                      <option value="">{t("Choose a position")}</option>
                      {positions.map((pos) => (
                        <option key={pos} value={pos}>
                          {pos}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <p className="text-xs text-gray-400 mt-1">
                  {form.personId === NEW_PERSON
                    ? t("The name and email typed above are used for the register entry, so there is nothing to type twice.")
                    : t("Links this login to the People register. The same link can also be set from Admin > People.")}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.forcePasswordChange}
                    onChange={(e) => setForm({ ...form, forcePasswordChange: e.target.checked })}
                    className="accent-primary"
                  />
                  {t("Force password change on login")}
                </label>
              </div>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.canSpendTranslationCredits}
                  onChange={(e) => setForm({ ...form, canSpendTranslationCredits: e.target.checked })}
                  className="accent-primary mt-0.5"
                />
                <span>
                  {t("Can spend translation credits")}
                  <span className="block text-xs text-gray-400">
                    {t("May translate a new document with the school's credits. Anyone can read a document already translated.")}
                  </span>
                </span>
              </label>
              {!editUser && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.sendEmail}
                    onChange={(e) => setForm({ ...form, sendEmail: e.target.checked })}
                    className="accent-primary"
                  />
                  {t("Send welcome email with credentials")}
                </label>
              )}
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  className="flex-1 bg-primary hover:bg-primary-dark text-white py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  {editUser ? t("Save Changes") : t("Create User")}
                </button>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-6 py-2 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  {t("Cancel")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
