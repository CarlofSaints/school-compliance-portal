# Adding a New School (Tenant) to the Compliance Portal

This one codebase (`school-compliance-portal`) powers a separate, fully isolated
compliance portal for **every** school. HVPS and Jeppe Girls already run on it.
This guide is the complete, repeatable process for adding the next school.

---

## 1. How it actually works (read this first)

There is **no central "main" site**. Each school is its own deployment:

```
            ONE GitHub repo: school-compliance-portal
                          │  (the shared code)
        ┌─────────────────┼─────────────────────┐
        ▼                 ▼                       ▼
 Vercel project      Vercel project          Vercel project
 "hvps-compliance"   "jeppe-girls-..."       "newschool-..."   ← you create this
        │                 │                       │
 NEXT_PUBLIC_SCHOOL  NEXT_PUBLIC_SCHOOL      NEXT_PUBLIC_SCHOOL
   = hvps              = jeppe                 = newschool
        │                 │                       │
 Blob store A        Blob store B            Blob store C   (own users + data)
        ▼                 ▼                       ▼
 hvps-compliance     jeppe-girls-...         newschool-...
   .vercel.app         .vercel.app             .vercel.app
```

Three things make each school its own portal:

1. **`NEXT_PUBLIC_SCHOOL`** — an environment variable on the Vercel project. It
   picks which branding block to use from `lib/branding.ts`. This is what makes
   the site say "Jeppe Girls" vs "HVPS", show the right logo, and use the right
   colours.
2. **Its own Vercel project** — gives it its own URL (the project name *is* the
   URL: `jeppe-girls-compliance` → `jeppe-girls-compliance.vercel.app`).
3. **Its own private Blob store** — gives it its own users, policies, checks,
   etc. Nothing crosses between schools because the data lives in different
   stores.

### ⭐ The golden rule (this trips everyone up)

> **`NEXT_PUBLIC_SCHOOL` is read at BUILD time, not live. After you set or change
> it, you MUST redeploy.** The logo, colours, and name all flip together on that
> rebuild — never before.

If a brand-new site shows the wrong logo / grey colours, it's almost always
because it was built *before* the env var was set. **Redeploy fixes it.**

---

## 2. Where the branding lives

All school-specific branding is in **one file: `lib/branding.ts`**. Each school
is one entry in the `SCHOOLS` object. Nothing else in the code mentions a school
by name — Sidebar, login, dashboard, emails and PDFs all read from this config.

| Field            | What it controls                                              |
| ---------------- | ------------------------------------------------------------- |
| `shortName`      | Sidebar heading, "Not an issue for X" labels (e.g. `JGHS`)    |
| `fullName`       | Login + dashboard + email + PDF headers                       |
| `portalSubtitle` | Small text under the sidebar heading                          |
| `tagline`        | Longer descriptor (login, email/PDF subtitle, page title)     |
| `slogan`         | Motto in the login + email footer (set `""` to hide)          |
| `sloganSuffix`   | Optional text after the slogan (HVPS uses "STRIVE")           |
| `logo`           | Path to the logo file in `/public` (e.g. `/logo-jeppe.png`)   |
| `logoAlt`        | Alt text for the logo                                         |
| `fromEmail`      | Resend "From" address (see Email note below)                  |
| `colors.primary` | Buttons, headings, email header. **White text sits on it.**   |
| `colors.primaryDark` | Hover state for primary buttons                           |
| `colors.dark`    | Sidebar background + near-black body text                     |
| `colors.primaryTint` | Light tint for the email header subtitle                  |
| `colors.accent`  | Sidebar brand name + active-nav highlight (see Colour note)   |

### ⚠️ Colour note — important for bright brand colours

The app puts **white text on `primary`** in ~30 places (buttons, avatars, email
header). So `primary` must be **dark enough for white to be readable** — cyan,
navy, black, dark green, etc.

If a school's brand colour is **bright** (yellow, lime, light orange), do NOT put
it in `primary` — white text on it is unreadable. Instead:

- Set `primary` (and usually `dark`) to **black** or a dark neutral.
- Put the bright brand colour in **`accent`** — it shows as the sidebar brand
  name and active-nav highlight on the dark sidebar, which looks great and reads
  fine.

This is exactly how Jeppe is set up: `primary` = black, `accent` = `#fcb517`
(Jeppe yellow). For a school whose brand colour is already dark (like HVPS cyan),
just set `accent` equal to `primary`.

### Email note

All schools currently send from `noreply@outerjoin.co.za` (the display name
differentiates the school), because that domain is verified in Resend. To use a
school's own domain (e.g. `noreply@newschool.co.za`) you must first verify that
domain in Resend → Domains. Until then, keep the OuterJoin sender. Email failing
does **not** break the app — user creation still works, the welcome email just
won't send.

---

## 3. Step-by-step: add a new school

Example: a school called "Riverside College", key `riverside`.

### Step 1 — Add the branding entry (code)
In `lib/branding.ts`, copy an existing block inside `SCHOOLS` and edit it:

```ts
  riverside: {
    key: "riverside",
    shortName: "Riverside",
    fullName: "Riverside College",
    portalSubtitle: "Compliance Portal",
    tagline: "SGB Compliance Portal",
    slogan: "Their motto here",       // or "" to hide
    logo: "/logo-riverside.png",
    logoAlt: "Riverside College Crest",
    fromEmail: "Riverside Compliance <noreply@outerjoin.co.za>",
    colors: {
      primary: "#123456",             // dark enough for white text
      primaryDark: "#0e2a44",
      dark: "#123456",
      primaryTint: "#dbe7f3",
      accent: "#123456",              // or a bright brand colour
    },
  },
```

### Step 2 — Add the logo
Drop the logo PNG into `/public` with the exact name from `logo` above
(`/public/logo-riverside.png`).

### Step 3 — Commit & push
```cmd
cd /d "C:\Users\CarlDosSantos-(OUTER\Projects\hvps-compliance"
git add -A && git commit -m "Add Riverside College tenant" && git push
```

### Step 4 — Create the Vercel project
Vercel → **Add New → Project** → import `school-compliance-portal` →
**name it** (the name becomes the URL, e.g. `riverside-compliance` →
`riverside-compliance.vercel.app`). Don't worry if the first build looks
generic — that's expected until the env vars are set.

### Step 5 — Create a PRIVATE Blob store
In the new project → **Storage → Create Database → Blob** → set access to
**Private** → create. When prompted, **include the read-write token in
Production + Preview** and leave the **prefix blank/default** so the variable is
named exactly **`BLOB_READ_WRITE_TOKEN`**.

> If `BLOB_READ_WRITE_TOKEN` doesn't appear in the project's env vars (you only
> see `BLOB_STORE_ID` / `BLOB_WEBHOOK_PUBLIC_KEY`), open the store → copy the
> token from its `.env.local`/Quickstart snippet → add it manually as an env var
> named **exactly** `BLOB_READ_WRITE_TOKEN`. The app requires that exact name.

### Step 6 — Set the environment variables
On the new project → Settings → Environment Variables (Production + Preview):

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_SCHOOL` | `riverside` (must match the `key` in branding.ts) |
| `SEED_SECRET` | any string you choose (used once, in Step 8) |
| `ANTHROPIC_API_KEY` | an Anthropic key (reuse or create a new one) |
| `RESEND_API_KEY` | a Resend key (optional — email works only with this) |
| `NEXT_PUBLIC_SITE_URL` | `https://riverside-compliance.vercel.app` |
| `BLOB_READ_WRITE_TOKEN` | (auto-added by the Blob store in Step 5) |

### Step 7 — Redeploy  ⭐
Deployments → newest → **⋯ → Redeploy**. This is the build that picks up
`NEXT_PUBLIC_SCHOOL` — **now** the logo, colours and name become the school's.

### Step 8 — Seed the first admin
Visit once in a browser:
```
https://riverside-compliance.vercel.app/api/seed?secret=<your SEED_SECRET>
```
You should get `{"success":true, ...}`. This creates the super-admin
(`carl@outerjoin.co.za` / `Admin@123`) + roles + permissions in the new store.

### Step 9 — Verify & hand over
- Log in at `/login`, change the admin password when prompted.
- Confirm the crest, colours and name are correct (hard-refresh if the logo
  looks cached).
- Create the school's real users from Admin → Users.

Done. The new school is live and fully isolated from the others.

---

## 4. Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| New site shows the **HVPS crest** / **grey** colours | Built before `NEXT_PUBLIC_SCHOOL` was set → using the neutral `generic` fallback | Set the env var, then **Redeploy** |
| Logo is a **broken image** | `logo` path doesn't match the file in `/public`, or the file wasn't pushed | Check the filename + that it's committed |
| Saves fail / data doesn't persist | `BLOB_READ_WRITE_TOKEN` missing or wrong name | Add it exactly as `BLOB_READ_WRITE_TOKEN` (Step 5) |
| Compliance check fails instantly | `ANTHROPIC_API_KEY` missing/invalid, or no billing on the key | Set a valid key with credit |
| Welcome/reset emails don't arrive | Sending domain not verified in Resend | Use `noreply@outerjoin.co.za`, or verify the school's domain |
| Buttons look unreadable (pale text) | A **bright** colour was put in `primary` | Move it to `accent`; make `primary` dark (see Colour note) |

---

## 5. Future: customer self-service

The natural next step (when there's volume) is a small public site where a school
signs up, pays, and you get a notification to run this checklist — or, further
out, automated provisioning via the Vercel + Blob APIs. This guide is the manual
process that any such automation would replicate, so it's the foundation for it.
