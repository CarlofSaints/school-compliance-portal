"use client";

import { useAuth, authFetch } from "@/lib/useAuth";
import { useState, useEffect, useCallback } from "react";
import { GOVERNANCE_LABEL } from "@/lib/positions";
import Toast from "@/components/Toast";
import PersonPhoto from "@/components/PersonPhoto";
import PhotoUpload from "@/components/PhotoUpload";
import { TAG_COLOR_CLASSES } from "@/lib/tags";

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
  phone: string;
  tagIds?: string[];
  photoUrl?: string | null;
}

interface UserOption {
  id: string;
  name: string;
  surname: string;
  email: string;
}

export default function PeoplePage() {
  const { session, loading } = useAuth("manage_people");
  const [people, setPeople] = useState<PersonRecord[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editPerson, setEditPerson] = useState<PersonRecord | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [tags, setTags] = useState<TagRecord[]>([]);
  // Editable in Admin > People Types, so it is fetched rather than imported.
  const [positions, setPositions] = useState<string[]>([]);
  // The photo is handled apart from the text fields: it uploads to its own
  // route, and only once the person exists and has an id.
  const [photoFile, setPhotoFile] = useState<Blob | null>(null);
  const [photoRemoved, setPhotoRemoved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    position: "",
    userId: "",
    name: "",
    email: "",
    phone: "",
    tagIds: [] as string[],
  });

  // The configured list, plus any position somebody still holds that has since
  // been taken off it. Without the second part, removing a position in People
  // Types would make everyone on it disappear from this page with no way to
  // reach them.
  const shownPositions = [
    ...positions,
    ...people
      .map((p) => p.position)
      .filter(
        (pos) =>
          pos && !positions.some((known) => known.toLowerCase() === pos.toLowerCase())
      )
      .filter((pos, i, all) => all.indexOf(pos) === i),
  ];

  const fetchData = useCallback(async () => {
    const [peopleRes, usersRes, tagsRes, positionsRes] = await Promise.all([
      authFetch("/api/people"),
      authFetch("/api/users"),
      authFetch("/api/tags"),
      authFetch("/api/settings/positions", { cache: "no-store" }),
    ]);
    if (peopleRes.ok) setPeople(await peopleRes.json());
    if (usersRes.ok) setUsers(await usersRes.json());
    if (tagsRes.ok) setTags(await tagsRes.json());
    if (positionsRes.ok) {
      const list = await positionsRes.json();
      if (Array.isArray(list)) setPositions(list);
    }
  }, []);

  useEffect(() => {
    if (session) fetchData();
  }, [session, fetchData]);

  const openCreate = () => {
    setEditPerson(null);
    setForm({ position: positions[0] || "", userId: "", name: "", email: "", phone: "", tagIds: [] });
    setPhotoFile(null);
    setPhotoRemoved(false);
    setShowModal(true);
  };

  const openEdit = (person: PersonRecord) => {
    setEditPerson(person);
    setPhotoFile(null);
    setPhotoRemoved(false);
    setForm({
      position: person.position,
      userId: person.userId || "",
      name: person.name,
      email: person.email,
      phone: person.phone,
      tagIds: person.tagIds || [],
    });
    setShowModal(true);
  };

  const handleUserSelect = (userId: string) => {
    const user = users.find((u) => u.id === userId);
    setForm({
      ...form,
      userId,
      name: user ? `${user.name} ${user.surname}` : form.name,
      email: user ? user.email : form.email,
    });
  };

  // Applies whatever the photo control was left in: a newly picked image is
  // uploaded, a cleared one is deleted, and an untouched one is left alone.
  // profilePic is deliberately NOT part of the person payload, so saving the
  // text fields can never blank a photo.
  const savePhoto = async (personId: string): Promise<string | null> => {
    if (photoFile) {
      const body = new FormData();
      body.append("photo", photoFile, "photo.jpg");
      const res = await authFetch(`/api/people/${personId}/photo`, {
        method: "POST",
        body,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "The photo could not be saved.");
      }
      const saved = await res.json().catch(() => null);
      return saved?.profilePic ?? null;
    } else if (photoRemoved) {
      await authFetch(`/api/people/${personId}/photo`, { method: "DELETE" });
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    const payload = {
      position: form.position,
      userId: form.userId || null,
      tagIds: form.tagIds,
      name: form.name,
      email: form.email,
      phone: form.phone,
    };

    if (editPerson) {
      const res = await authFetch(`/api/people/${editPerson.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        try {
          await savePhoto(editPerson.id);
          setToast({ message: "Person updated", type: "success" });
          setShowModal(false);
        } catch (err) {
          // The details saved; say so, rather than reporting a failure that
          // would have them enter everything again.
          setToast({
            message:
              (err instanceof Error ? err.message : "The photo could not be saved.") +
              " The other details were saved.",
            type: "error",
          });
        }
        fetchData();
      } else {
        setToast({ message: "That person could not be saved.", type: "error" });
      }
    } else {
      // The id is made here so the photo can be stored under this person's own
      // path BEFORE the record exists, and then saved onto it as part of the
      // same create. Creating first and uploading afterwards raced people.json
      // and lost: the upload reached an instance that had not yet seen the new
      // person, and was told there was no such person.
      const newId = crypto.randomUUID();
      let profilePic = "";
      let photoProblem = "";
      if (photoFile) {
        try {
          profilePic = (await savePhoto(newId)) || "";
        } catch (err) {
          photoProblem =
            err instanceof Error ? err.message : "The photo could not be saved.";
        }
      }

      const res = await authFetch("/api/people", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, id: newId, profilePic }),
      });
      if (res.ok) {
        setToast(
          photoProblem
            ? {
                message:
                  photoProblem +
                  " The person was added, so add the photo by editing them.",
                type: "error",
              }
            : { message: "Person added", type: "success" }
        );
        setShowModal(false);
        fetchData();
      } else {
        setToast({ message: "That person could not be added.", type: "error" });
      }
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this person?")) return;
    const res = await authFetch(`/api/people/${id}`, { method: "DELETE" });
    if (res.ok) {
      setToast({ message: "Person removed", type: "success" });
      fetchData();
    }
  };

  if (loading) return <div className="p-6">Loading...</div>;

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-dark">People & Positions</h1>
          <p className="text-gray-500 text-sm">Manage {GOVERNANCE_LABEL} positions and linked users</p>
        </div>
        <button
          onClick={openCreate}
          className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          + Add Person
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {shownPositions.map((pos) => {
          const positionPeople = people.filter((p) => p.position === pos);
          const offList = !positions.some(
            (known) => known.toLowerCase() === pos.toLowerCase()
          );
          return (
            <div
              key={pos}
              className="bg-white rounded-xl shadow-sm border border-gray-100 p-4"
            >
              <h3 className="font-medium text-dark text-sm mb-3">
                {pos}
                {offList && (
                  <span
                    className="ml-2 text-[11px] font-normal px-2 py-0.5 rounded-full bg-amber-100 text-amber-800"
                    title="This position is not on the People Types list. Add it back, or move these people to one that is."
                  >
                    not on the list
                  </span>
                )}
              </h3>
              {positionPeople.length > 0 ? (
                positionPeople.map((person) => (
                  <div
                    key={person.id}
                    className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <PersonPhoto
                        name={person.name}
                        photoUrl={person.photoUrl}
                        size="sm"
                      />
                      <div className="min-w-0">
                      <p className="text-sm font-medium">{person.name || "Unassigned"}</p>
                      <p className="text-xs text-gray-400">{person.email}</p>
                      {person.phone && (
                        <p className="text-xs text-gray-400">{person.phone}</p>
                      )}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => openEdit(person)}
                        className="text-primary text-xs hover:text-primary-dark"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(person.id)}
                        className="text-risk-high text-xs hover:text-red-700 ml-2"
                      >
                        x
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-gray-400 italic">No one assigned</p>
              )}
            </div>
          );
        })}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-lg p-6">
            <h2 className="text-lg font-semibold mb-4">
              {editPerson ? "Edit Person" : "Add Person"}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Position</label>
                <select
                  value={form.position}
                  required
                  onChange={(e) => setForm({ ...form, position: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                >
                  {form.position === "" && (
                    <option value="" disabled>
                      Choose a position
                    </option>
                  )}
                  {form.position !== "" &&
                    !positions.some(
                      (p) => p.toLowerCase() === form.position.toLowerCase()
                    ) && (
                      // Their current position has been taken off the list.
                      // Offered anyway, so opening the form does not silently
                      // reassign them to whichever position happens to be first.
                      <option value={form.position}>
                        {form.position} (not on the list)
                      </option>
                    )}
                  {positions.map((pos) => (
                    <option key={pos} value={pos}>{pos}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Link to User Account
                </label>
                <select
                  value={form.userId}
                  onChange={(e) => handleUserSelect(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                >
                  <option value="">-- No linked user --</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} {u.surname} ({u.email})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Tags</label>
                {tags.length === 0 ? (
                  <p className="text-xs text-gray-400">
                    No tags yet. Create them in Admin &gt; Tags.
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
                  Tags decide who has to approve a fund application. Someone
                  without a login can be emailed but cannot click Approve.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                />
              </div>
              <PhotoUpload
                name={form.name}
                currentUrl={editPerson?.photoUrl}
                file={photoFile}
                removed={photoRemoved}
                onPick={setPhotoFile}
                onRemove={setPhotoRemoved}
              />
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-primary hover:bg-primary-dark text-white py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {saving ? "Saving..." : editPerson ? "Save" : "Add Person"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-6 py-2 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
