import { tk } from "./i18n/translate";

// The "Who" of a sign-in attempt nobody signed in for. Written by the server
// in English (like every stored summary) and translated by the page when shown.
// Fixed labels, because what a stranger typed must never stand in for a person.
export const UNKNOWN_ADDRESS = tk("Unknown address");
export const UNKNOWN_CONNECTION = tk("Unknown connection");
export const UNKNOWN_ACTORS = new Set([UNKNOWN_ADDRESS, UNKNOWN_CONNECTION]);
