// The backup file route takes a blob path from the browser. This asserts the
// scope check that keeps it inside the school's own prefix. No server.
//
//   npx tsx scripts/check-backup-export.ts

import { isBackupPathInScope, isUnsafeBlobPath, BACKUP_CHUNK_BYTES } from "../lib/blobPath";

let pass = 0;
let fail = 0;
function check(label: string, got: unknown, want: unknown) {
  if (got === want) {
    pass++;
    console.log(`  ok   ${label}`);
  } else {
    fail++;
    console.error(`  FAIL ${label}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`);
  }
}

const P = "hvps/";
console.log("\nPaths the backup file route must accept");
check("a normal file", isBackupPathInScope(P, "hvps/users.json"), true);
check("a nested document", isBackupPathInScope(P, "hvps/policies/abc/Policy v2.pdf"), true);
check("a file name with a plain backslash", isBackupPathInScope(P, "hvps/docs/a\\b.pdf"), true);

console.log("\n🔴 Paths it must refuse");
check("another school's prefix", isBackupPathInScope(P, "jeppe/users.json"), false);
check("a prefix that only starts the same", isBackupPathInScope(P, "hvps-old/users.json"), false);
check("the prefix with no file", isBackupPathInScope(P, "hvps/"), false);
check("no prefix at all", isBackupPathInScope(P, "users.json"), false);
check("climbing out with ..", isBackupPathInScope(P, "hvps/../jeppe/users.json"), false);
check("climbing out with %2e%2e", isBackupPathInScope(P, "hvps/%2e%2e/jeppe/users.json"), false);
check("climbing out between backslashes", isBackupPathInScope(P, "hvps\\..\\jeppe\\users.json"), false);
check("a .. hidden by a tab", isBackupPathInScope(P, "hvps/.\t./jeppe/users.json"), false);
check("an absolute URL", isBackupPathInScope(P, "https://x.private.blob.vercel-storage.com/jeppe/users.json"), false);
check("an absolute path", isBackupPathInScope(P, "/hvps/users.json"), false);
check("no path given", isBackupPathInScope(P, null), false);
check("a prefix without its slash is never trusted", isBackupPathInScope("hvps", "hvps/users.json"), false);

console.log("\nThe shared unsafe-path rule is unchanged");
check(". is unsafe", isUnsafeBlobPath("a/./b"), true);
check("a dotted file name is fine", isUnsafeBlobPath("a/.hidden/b..json"), false);

console.log("\nA part fits a function response (~4.5MB)");
check("chunk under the cap", BACKUP_CHUNK_BYTES < 4_500_000, true);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
