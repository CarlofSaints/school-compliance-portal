"use client";

import { useAuth, authFetch } from "@/lib/useAuth";
import { useState, useEffect, useCallback } from "react";
import { POSITIONS } from "@/lib/positions";
import Toast from "@/components/Toast";

interface PersonRecord {
  id: string;
  position: string;
  userId: string | null;
  name: string;
  email: string;
  phone: string;
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
  const [form, setForm] = useState({
    position: POSITIONS[0],
    userId: "",
    name: "",
    email: "",
    phone: "",
  });

  const fetchData = useCallback(async () => {
    const [peopleRes, usersRes] = await Promise.all([
      authFetch("/api/people"),
      authFetch("/api/users"),
    ]);
    if (peopleRes.ok) setPeople(await peopleRes.json());
    if (usersRes.ok) setUsers(await usersRes.json());
  }, []);

  useEffect(() => {
    if (session) fetchData();
  }, [session, fetchData]);

  const openCreate = () => {
    setEditPerson(null);
    setForm({ position: POSITIONS[0], userId: "", name: "", email: "", phone: "" });
    setShowModal(true);
  };

  const openEdit = (person: PersonRecord) => {
    setEditPerson(person);
    setForm({
      position: person.position,
      userId: person.userId || "",
      name: person.name,
      email: person.email,
      phone: person.phone,
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      position: form.position,
      userId: form.userId || null,
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
        setToast({ message: "Person updated", type: "success" });
        setShowModal(false);
        fetchData();
      }
    } else {
      const res = await authFetch("/api/people", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setToast({ message: "Person added", type: "success" });
        setShowModal(false);
        fetchData();
      }
    }
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
          <p className="text-gray-500 text-sm">Manage SGB positions and linked users</p>
        </div>
        <button
          onClick={openCreate}
          className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          + Add Person
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {POSITIONS.map((pos) => {
          const positionPeople = people.filter((p) => p.position === pos);
          return (
            <div
              key={pos}
              className="bg-white rounded-xl shadow-sm border border-gray-100 p-4"
            >
              <h3 className="font-medium text-dark text-sm mb-3">{pos}</h3>
              {positionPeople.length > 0 ? (
                positionPeople.map((person) => (
                  <div
                    key={person.id}
                    className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0"
                  >
                    <div>
                      <p className="text-sm font-medium">{person.name || "Unassigned"}</p>
                      <p className="text-xs text-gray-400">{person.email}</p>
                      {person.phone && (
                        <p className="text-xs text-gray-400">{person.phone}</p>
                      )}
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
                  onChange={(e) => setForm({ ...form, position: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                >
                  {POSITIONS.map((pos) => (
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
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  className="flex-1 bg-primary hover:bg-primary-dark text-white py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  {editPerson ? "Save" : "Add Person"}
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
