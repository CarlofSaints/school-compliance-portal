"use client";

import { useAuth, authFetch } from "@/lib/useAuth";
import { useState, useEffect, useCallback, useMemo } from "react";
import { POSITIONS, GOVERNANCE_LABEL } from "@/lib/positions";
import { TAG_COLOR_CLASSES } from "@/lib/tagData";
import PersonPhoto from "@/components/PersonPhoto";
import { branding } from "@/lib/branding";

interface DirectoryPerson {
  id: string;
  position: string;
  name: string;
  email: string;
  phone: string;
  photoUrl: string | null;
  tagIds: string[];
  hasLogin: boolean;
}

interface TagRecord {
  id: string;
  name: string;
  color: string;
}

export default function PeopleDirectoryPage() {
  // Login only. This is the register as everybody sees it; editing it stays on
  // Admin > People behind manage_people.
  const { session, loading } = useAuth();
  const [people, setPeople] = useState<DirectoryPerson[]>([]);
  const [tags, setTags] = useState<TagRecord[]>([]);
  const [query, setQuery] = useState("");
  const [loaded, setLoaded] = useState(false);

  const fetchData = useCallback(async () => {
    const [peopleRes, tagsRes] = await Promise.all([
      authFetch("/api/people/directory", { cache: "no-store" }),
      authFetch("/api/tags", { cache: "no-store" }),
    ]);
    if (peopleRes.ok) setPeople(await peopleRes.json());
    if (tagsRes.ok) setTags(await tagsRes.json());
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (session) fetchData();
  }, [session, fetchData]);

  const tagsById = useMemo(
    () => new Map(tags.map((t) => [t.id, t])),
    [tags]
  );

  // Grouped in the order the positions are defined, which runs roughly by
  // seniority, rather than alphabetically. A governing body reads wrongly with
  // the Principal filed under P between Maintenance and Secretary.
  const groups = useMemo(() => {
    const term = query.trim().toLowerCase();
    const matches = (p: DirectoryPerson) =>
      !term ||
      p.name.toLowerCase().includes(term) ||
      p.position.toLowerCase().includes(term) ||
      p.email.toLowerCase().includes(term);

    const shown = people.filter(matches);
    const ordered = POSITIONS.map((position) => ({
      position,
      members: shown.filter((p) => p.position === position),
    })).filter((g) => g.members.length > 0);

    // A position that has been renamed or removed from the code list would
    // otherwise vanish from the page while still being on somebody's record.
    const known = new Set<string>(POSITIONS);
    const others = shown.filter((p) => !known.has(p.position));
    if (others.length > 0) {
      const byPosition = new Map<string, DirectoryPerson[]>();
      for (const p of others) {
        byPosition.set(p.position, [...(byPosition.get(p.position) || []), p]);
      }
      for (const [position, members] of byPosition) {
        ordered.push({ position, members });
      }
    }
    return ordered;
  }, [people, query]);

  const total = people.length;
  const shownCount = groups.reduce((n, g) => n + g.members.length, 0);

  if (loading) return <div className="p-6">Loading...</div>;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-dark">Our People</h1>
        <p className="text-gray-500 text-sm mt-1">
          {branding.fullName} {GOVERNANCE_LABEL}
          {total > 0 && (
            <>
              {" "}
              &middot; {total} {total === 1 ? "person" : "people"}
            </>
          )}
        </p>
      </div>

      {total > 3 && (
        <div className="mb-6 max-w-sm">
          <div className="relative">
            <svg
              className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or position"
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
            />
          </div>
        </div>
      )}

      {!loaded ? (
        <p className="text-sm text-gray-500">Loading the register...</p>
      ) : total === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-10 text-center">
          <p className="text-gray-500 text-sm">
            Nobody has been added to the register yet.
          </p>
          {session?.permissions.includes("manage_people") && (
            <a
              href="/admin/people"
              className="inline-block mt-3 text-primary text-sm hover:underline"
            >
              Add people in Admin &gt; People
            </a>
          )}
        </div>
      ) : shownCount === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-10 text-center">
          <p className="text-gray-500 text-sm">
            Nobody matches &ldquo;{query}&rdquo;.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map((group) => (
            <section key={group.position}>
              <h2 className="text-xs font-semibold tracking-wide text-gray-400 uppercase mb-3">
                {group.position}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {group.members.map((person) => (
                  <div
                    key={person.id}
                    className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 text-center hover:shadow-md transition-shadow"
                  >
                    <div className="flex justify-center mb-4">
                      <PersonPhoto
                        name={person.name}
                        photoUrl={person.photoUrl}
                        size="xl"
                        className="ring-4 ring-gray-50"
                      />
                    </div>
                    <p className="font-semibold text-dark leading-tight">
                      {person.name || "Unassigned"}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {person.position}
                    </p>

                    {person.tagIds.length > 0 && (
                      <div className="flex flex-wrap justify-center gap-1 mt-3">
                        {person.tagIds.map((id) => {
                          const tag = tagsById.get(id);
                          if (!tag) return null;
                          return (
                            <span
                              key={id}
                              className={`text-[11px] px-2 py-0.5 rounded-full ${
                                TAG_COLOR_CLASSES[tag.color] ||
                                TAG_COLOR_CLASSES.slate
                              }`}
                            >
                              {tag.name}
                            </span>
                          );
                        })}
                      </div>
                    )}

                    {(person.email || person.phone) && (
                      <div className="mt-4 pt-4 border-t border-gray-50 space-y-1.5">
                        {person.email && (
                          <a
                            href={`mailto:${person.email}`}
                            className="flex items-center justify-center gap-1.5 text-xs text-gray-500 hover:text-primary transition-colors break-all"
                          >
                            <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                            {person.email}
                          </a>
                        )}
                        {person.phone && (
                          <a
                            href={`tel:${person.phone.replace(/\s+/g, "")}`}
                            className="flex items-center justify-center gap-1.5 text-xs text-gray-500 hover:text-primary transition-colors"
                          >
                            <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                            </svg>
                            {person.phone}
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
