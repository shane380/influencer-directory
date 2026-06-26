// Self-service admin password reset. Run it yourself:
//   node scripts/reset-password.mjs shane@namaclo.com
//   node scripts/reset-password.mjs shane@namaclo.com "MyNewPassword123"
// If no password is given, a strong temporary one is generated and printed to
// YOUR terminal. Uses the service-role key from .env.local. Then log in at the
// ADMIN app /login (not the creators subdomain) with email + this password.

import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";

const email = process.argv[2];
if (!email) {
  console.error("Usage: node scripts/reset-password.mjs <email> [newPassword]");
  process.exit(1);
}
const newPassword = process.argv[3] || ("Nama-" + randomBytes(5).toString("hex") + "-" + randomBytes(2).toString("hex").toUpperCase());

const env = readFileSync(".env.local", "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Find the auth user by email (paginate).
let user = null;
for (let page = 1; page <= 20 && !user; page++) {
  const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
  if (error) { console.error("listUsers error:", error.message); process.exit(1); }
  user = (data.users || []).find((u) => (u.email || "").toLowerCase() === email.toLowerCase());
  if (!data.users || data.users.length < 200) break;
}
if (!user) { console.error("No auth user found for", email); process.exit(1); }

const { error } = await db.auth.admin.updateUserById(user.id, { password: newPassword });
if (error) { console.error("update error:", error.message); process.exit(1); }

console.log("\n✓ Password reset for", user.email);
console.log("  New password:", newPassword);
console.log("  Log in at the ADMIN app /login (e.g. https://influencer-directory-self.vercel.app/login)\n");
