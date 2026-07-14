// §8: grep the client bundle for secrets before every phase hand-off.
// Fails the build check if anything that looks privileged leaks into dist/.
//
// Patterns require an actual key BODY, not just a marker prefix —
// supabase-js legitimately embeds the string "sb_secret_" in its own
// browser guard (it throws if you pass a secret key client-side), and that
// must not trip the check.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const patterns = [
  // New-style Supabase secret key with payload attached.
  { name: "Supabase secret key", re: /sb_secret_[A-Za-z0-9_-]{16,}/ },
  // Legacy JWT service key: base64 payload containing "service_role"
  // ("c2VydmljZV9yb2xl") inside an eyJ… token.
  {
    name: "Supabase service-role JWT",
    re: /eyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]*c2VydmljZV9yb2xl[A-Za-z0-9_-]*/,
  },
  // Env-var names that should only ever exist server-side.
  { name: "service-role env name", re: /SUPABASE_SERVICE_ROLE_KEY/ },
  { name: "AniList client secret env name", re: /ANILIST_CLIENT_SECRET/ },
];

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else yield full;
  }
}

let failed = false;
let scanned = 0;
for (const file of walk("dist")) {
  if (!/\.(js|css|html|map)$/.test(file)) continue;
  scanned += 1;
  const content = readFileSync(file, "utf8");
  for (const { name, re } of patterns) {
    const match = re.exec(content);
    if (match) {
      console.error(
        `LEAK: ${name} in ${file} (…${match[0].slice(0, 24)}…)`,
      );
      failed = true;
    }
  }
}

if (scanned === 0) {
  console.error("No bundle files scanned — run `npm run build` first.");
  process.exit(1);
}
console.log(
  failed ? "Bundle check FAILED." : `Bundle check passed (${scanned} files).`,
);
process.exit(failed ? 1 : 0);
