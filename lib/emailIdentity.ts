// ---------------------------------------------------------------------------
// Who a school's email comes FROM, and where a reply goes.
//
// The constraint that decides all of this: **the domain in a From address must
// be verified with the email provider.** A school cannot simply type
// noreply@theirschool.co.za — Resend would refuse to send, or the mail would be
// binned by the recipient's spam filter for failing SPF and DKIM. Asking a
// school's IT department to add DNS records before their portal can send
// anything is a barrier, and most of them will never do it.
//
// So the address is FIXED and the NAME varies:
//
//     Hurlyvale Primary School <noreply@schoolcompliance.co.za>
//     ^^^^^^^^^^^^^^^^^^^^^^^^  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
//     per school, no setup      one verified domain, set once
//
// A recipient sees the school's name in their inbox, which is the part they
// actually read, and a new school can send email the moment it is created.
//
// Reply-To is the field that matters more, and it needs no DNS at all: nobody
// reads noreply@, so a reply to a reminder vanishes. A school sets a real
// address and replies reach a human.
// ---------------------------------------------------------------------------

/**
 * Makes a display name safe to put in an address header.
 *
 * 🔴 Header injection: a school name containing a newline could otherwise end
 * the From header and start one of its own — a Bcc, say. The name is typed by
 * whoever set the school up, so it is untrusted input in exactly the place that
 * matters.
 */
export function sanitiseDisplayName(name: string): string {
  return String(name || "")
    // Anything that could break out of, or terminate, the header.
    .replace(/[\r\n]+/g, " ")
    // Quotes and angle brackets are address syntax, not text.
    .replace(/["<>,;:\\]/g, "")
    // Other control characters.
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 78); // RFC 5322 line-length courtesy
}

/** Deliberately loose. It exists to catch a typo and a header-injection
 *  attempt, not to adjudicate RFC 5322 — over-strict address validation
 *  rejects real addresses. */
export function isPlausibleEmail(value: string): boolean {
  const v = String(value || "").trim();
  if (!v || v.length > 254) return false;
  if (/[\r\n\s<>,;]/.test(v)) return false;
  return /^[^@]+@[^@.]+(\.[^@.]+)+$/.test(v);
}

/**
 * The From header for a school.
 *
 * `EMAIL_SENDING_DOMAIN` is what turns this on. Without it, the school's
 * built-in fromEmail is used unchanged — which is HVPS and Jeppe today, both
 * sending from a hand-written address, and neither should change underneath
 * them just because this file now exists.
 */
export function buildFromAddress(
  displayName: string,
  builtInFromEmail: string
): string {
  const domain = process.env.EMAIL_SENDING_DOMAIN?.trim();
  if (!domain) return builtInFromEmail;

  const name = sanitiseDisplayName(displayName);
  const localPart = (process.env.EMAIL_SENDING_LOCAL_PART || "noreply").trim();
  const address = `${localPart}@${domain.replace(/^@/, "")}`;
  // A name that sanitised away to nothing would leave "<addr>" with a stray
  // space, so fall back to the bare address.
  return name ? `${name} <${address}>` : address;
}

/** The reply address, or undefined to leave the header off entirely. An absent
 *  Reply-To is better than an invalid one: an invalid header can get the whole
 *  message rejected. */
export function buildReplyTo(configured: string | undefined | null): string | undefined {
  const v = String(configured || "").trim();
  return v && isPlausibleEmail(v) ? v : undefined;
}
