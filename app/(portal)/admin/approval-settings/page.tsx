"use client";

import { useAuth, authFetch } from "@/lib/useAuth";
import { useState, useEffect, useCallback } from "react";
import Toast from "@/components/Toast";
import { TAG_COLOR_CLASSES } from "@/lib/tagData";

interface TagRecord {
  id: string;
  name: string;
  color: string;
  memberCount: number;
}

interface PersonRecord {
  id: string;
  position: string;
  name: string;
  email: string;
  hasLogin: boolean;
}

// Either a tag (a group) or one named person off the register — never both.
// See lib/approvalSettings.ts.
interface Requirement {
  tagId?: string;
  personId?: string;
  mode: "all" | "any";
}

interface Tier {
  id: string;
  label: string;
  minAmount: number;
  maxAmount: number | null;
  logOnly: boolean;
  requirements: Requirement[];
}

export default function ApprovalSettingsPage() {
  const { session, loading } = useAuth("manage_approval_settings");
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [notifyEach, setNotifyEach] = useState(true);
  const [tags, setTags] = useState<TagRecord[]>([]);
  const [people, setPeople] = useState<PersonRecord[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const load = useCallback(async () => {
    const [settingsRes, tagsRes, peopleRes] = await Promise.all([
      authFetch("/api/settings/approval"),
      authFetch("/api/tags"),
      authFetch("/api/people/directory"),
    ]);
    if (settingsRes.ok) {
      const s = await settingsRes.json();
      setTiers(s.tiers || []);
      setNotifyEach(s.notifyApplicantOnEachApproval !== false);
      setProblems(s.problems || []);
    }
    if (tagsRes.ok) setTags(await tagsRes.json());
    if (peopleRes.ok) setPeople(await peopleRes.json());
  }, []);

  useEffect(() => {
    if (session) load();
  }, [session, load]);

  const update = (id: string, patch: Partial<Tier>) => {
    setTiers((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    setDirty(true);
  };

  const addTier = () => {
    const highest = tiers.reduce(
      (max, t) => Math.max(max, t.maxAmount ?? t.minAmount),
      0
    );
    setTiers((prev) => [
      ...prev,
      {
        id: `tier-${Date.now()}`,
        label: "New band",
        minAmount: highest,
        maxAmount: null,
        logOnly: false,
        requirements: [],
      },
    ]);
    setDirty(true);
  };

  const removeTier = (id: string) => {
    setTiers((prev) => prev.filter((t) => t.id !== id));
    setDirty(true);
  };

  const addRequirement = (tierId: string) => {
    const firstUnused = tags.find(
      (tag) =>
        !tiers
          .find((t) => t.id === tierId)
          ?.requirements.some((r) => r.tagId === tag.id)
    );
    if (!firstUnused) {
      setToast({ message: "No more tags to add", type: "error" });
      return;
    }
    setTiers((prev) =>
      prev.map((t) =>
        t.id === tierId
          ? {
              ...t,
              requirements: [
                ...t.requirements,
                { tagId: firstUnused.id, mode: "all" as const },
              ],
            }
          : t
      )
    );
    setDirty(true);
  };

  const updateRequirement = (
    tierId: string,
    index: number,
    patch: Partial<Requirement>
  ) => {
    setTiers((prev) =>
      prev.map((t) =>
        t.id === tierId
          ? {
              ...t,
              requirements: t.requirements.map((r, i) =>
                i === index ? { ...r, ...patch } : r
              ),
            }
          : t
      )
    );
    setDirty(true);
  };

  const removeRequirement = (tierId: string, index: number) => {
    setTiers((prev) =>
      prev.map((t) =>
        t.id === tierId
          ? { ...t, requirements: t.requirements.filter((_, i) => i !== index) }
          : t
      )
    );
    setDirty(true);
  };

  // Tick / untick one named person as an approver for this band. A person
  // requirement carries no tagId at all, so it can never be mistaken for a
  // tag row.
  const togglePerson = (tierId: string, personId: string, on: boolean) => {
    setTiers((prev) =>
      prev.map((t) => {
        if (t.id !== tierId) return t;
        const without = t.requirements.filter((r) => r.personId !== personId);
        return {
          ...t,
          requirements: on
            ? [...without, { personId, mode: "all" as const }]
            : without,
        };
      })
    );
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    const res = await authFetch("/api/settings/approval", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tiers,
        notifyApplicantOnEachApproval: notifyEach,
      }),
    });
    setSaving(false);
    if (res.ok) {
      const s = await res.json();
      setTiers(s.tiers || []);
      setProblems(s.problems || []);
      setDirty(false);
      setToast({ message: "Approval settings saved", type: "success" });
    } else {
      const err = await res.json().catch(() => ({}));
      setToast({
        message: err.error || "Could not save the settings",
        type: "error",
      });
    }
  };

  const tagById = (id: string) => tags.find((t) => t.id === id);

  const sorted = [...tiers].sort((a, b) => a.minAmount - b.minAmount);

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

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-dark">
            Fund Application Approval Settings
          </h1>
          <p className="text-gray-500 text-sm">
            How much can be spent before someone has to approve it, and who
          </p>
        </div>
        <button
          onClick={save}
          disabled={saving || !dirty}
          className="bg-primary hover:bg-primary-dark disabled:bg-gray-300 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          {saving ? "Saving..." : dirty ? "Save Changes" : "Saved"}
        </button>
      </div>

      {problems.length > 0 && (
        <div className="bg-risk-medium/10 border border-risk-medium/30 rounded-xl p-4 mb-6">
          <p className="text-sm font-medium text-risk-medium mb-2">
            Check these before relying on the workflow
          </p>
          <ul className="list-disc pl-5 text-xs text-gray-700 space-y-1">
            {problems.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-4">
        {sorted.map((tier) => (
          <div
            key={tier.id}
            className="bg-white rounded-xl shadow-sm border border-gray-100 p-5"
          >
            <div className="flex flex-wrap items-end gap-3 mb-4">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs text-gray-500 mb-1">
                  What this band is called
                </label>
                <input
                  type="text"
                  value={tier.label}
                  onChange={(e) => update(tier.id, { label: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">From</label>
                <input
                  type="number"
                  min={0}
                  value={tier.minAmount}
                  onChange={(e) =>
                    update(tier.id, { minAmount: Number(e.target.value) || 0 })
                  }
                  className="w-32 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Up to (blank = no limit)
                </label>
                <input
                  type="number"
                  min={0}
                  value={tier.maxAmount ?? ""}
                  placeholder="No limit"
                  onChange={(e) =>
                    update(tier.id, {
                      maxAmount:
                        e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                  className="w-36 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                />
              </div>
              <button
                onClick={() => removeTier(tier.id)}
                className="text-risk-high hover:text-red-700 text-xs font-medium px-2 py-2"
              >
                Remove band
              </button>
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-700 mb-3">
              <input
                type="checkbox"
                checked={tier.logOnly}
                onChange={(e) =>
                  update(tier.id, { logOnly: e.target.checked })
                }
                className="accent-primary"
              />
              No approval needed, but the application is still logged
            </label>

            {!tier.logOnly && (
              <div className="border-t border-gray-100 pt-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-gray-500">
                    Who has to approve in this band
                  </p>
                  <button
                    onClick={() => addRequirement(tier.id)}
                    className="text-primary hover:text-primary-dark text-xs font-medium"
                  >
                    + Add approver tag
                  </button>
                </div>

                {tier.requirements.length === 0 && (
                  <p className="text-xs text-risk-medium">
                    No approver set. Applications in this band will wait with
                    nobody able to action them.
                  </p>
                )}

                {tier.requirements.some((r) => r.tagId) && (
                  <div className="space-y-2">
                    {tier.requirements.map((req, i) => {
                      // Person requirements render as tick boxes below. The
                      // index is what update/remove address, so skip in place
                      // rather than filtering the array and renumbering it.
                      if (!req.tagId) return null;
                      const tag = tagById(req.tagId);
                      return (
                        <div
                          key={`${req.tagId}-${i}`}
                          className="flex flex-wrap items-center gap-2"
                        >
                          <select
                            value={req.mode}
                            onChange={(e) =>
                              updateRequirement(tier.id, i, {
                                mode: e.target.value as "all" | "any",
                              })
                            }
                            className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs outline-none"
                          >
                            <option value="all">All of</option>
                            <option value="any">Any one of</option>
                          </select>
                          <select
                            value={req.tagId}
                            onChange={(e) =>
                              updateRequirement(tier.id, i, {
                                tagId: e.target.value,
                              })
                            }
                            className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs outline-none"
                          >
                            {/* A tag deleted behind our back still shows, so
                                the row cannot silently become a different tag. */}
                            {!tag && (
                              <option value={req.tagId}>
                                (removed tag)
                              </option>
                            )}
                            {tags.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                          </select>
                          {tag && (
                            <span
                              className={`px-2 py-1 rounded text-xs font-medium ${
                                TAG_COLOR_CLASSES[tag.color] ||
                                TAG_COLOR_CLASSES.slate
                              }`}
                            >
                              {tag.memberCount}{" "}
                              {tag.memberCount === 1 ? "person" : "people"}
                            </span>
                          )}
                          {tag && tag.memberCount === 0 && (
                            <span className="text-xs text-risk-high">
                              nobody carries this tag
                            </span>
                          )}
                          <button
                            onClick={() => removeRequirement(tier.id, i)}
                            className="text-gray-400 hover:text-risk-high text-xs"
                          >
                            remove
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="mt-3 border-t border-gray-100 pt-3">
                  <p className="text-xs text-gray-500 mb-2">
                    Or name people from the register directly — use this when
                    the approver is one position-holder rather than a committee
                  </p>
                  {people.length === 0 ? (
                    <p className="text-xs text-gray-400">
                      Nobody is on the register yet. Add them in Admin &gt;
                      People.
                    </p>
                  ) : (
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      {people.map((p) => (
                        <label
                          key={p.id}
                          className="flex items-center gap-2 text-sm text-gray-700"
                        >
                          <input
                            type="checkbox"
                            checked={tier.requirements.some(
                              (r) => r.personId === p.id
                            )}
                            onChange={(e) =>
                              togglePerson(tier.id, p.id, e.target.checked)
                            }
                            className="accent-primary"
                          />
                          <span className="font-medium">{p.position}</span>
                          <span className="text-gray-500 truncate">
                            {p.name}
                          </span>
                          {/* Only a login can click Approve, so say so here
                              rather than letting the band look configured. */}
                          {!p.hasLogin && (
                            <span className="text-xs text-risk-high whitespace-nowrap">
                              no login — cannot approve
                            </span>
                          )}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <button
        onClick={addTier}
        className="mt-4 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
      >
        + Add a band
      </button>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mt-6">
        <h2 className="font-semibold text-dark mb-3">Applicant emails</h2>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={notifyEach}
            onChange={(e) => {
              setNotifyEach(e.target.checked);
              setDirty(true);
            }}
            className="accent-primary"
          />
          Email the applicant every time an approver decides
        </label>
        <p className="text-xs text-gray-400 mt-2">
          The applicant is always emailed once the last approval is in, whether
          or not this is ticked.
        </p>
      </div>
    </div>
  );
}
