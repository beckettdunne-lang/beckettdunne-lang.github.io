// Deletes the signed-in person's Grade Book account and all their grades.
// Called from Settings > Delete account. If they're on a free trial, it cancels the trial
// in Lemon Squeezy first so their card is never charged.
// Uses the same LEMONSQUEEZY_API_KEY and LEMONSQUEEZY_TEST_API_KEY secrets as lemon-webhook.
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json(405, { error: "Use POST" });

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: { user } } = jwt ? await db.auth.getUser(jwt) : { data: { user: null } };
  if (!user) return json(401, { error: "Sign in first." });

  const { data: row } = await db.from("access").select("sub_id, sub_status, test_mode, paid_at").eq("user_id", user.id).maybeSingle();

  // Don't charge someone for an account they deleted.
  if (row?.sub_id && !row.paid_at && ["on_trial", "past_due", "unpaid", "active"].includes(row.sub_status ?? "")) {
    const keyName = row.test_mode ? "LEMONSQUEEZY_TEST_API_KEY" : "LEMONSQUEEZY_API_KEY";
    const key = Deno.env.get(keyName);
    if (!key) { console.error(keyName + " is not set"); return json(500, { error: "Couldn't cancel your free trial, so your account wasn't deleted. Try again later." }); }
    const res = await fetch(`https://api.lemonsqueezy.com/v1/subscriptions/${encodeURIComponent(row.sub_id)}`, {
      method: "DELETE",
      headers: { Accept: "application/vnd.api+json", "Content-Type": "application/vnd.api+json", Authorization: `Bearer ${key}` },
    });
    if (!res.ok) {
      console.error("cancel before delete failed", res.status, await res.text());
      return json(502, { error: "Couldn't cancel your free trial, so your account wasn't deleted. Try again in a minute." });
    }
  }

  // Deleting the user also deletes their gradebooks and access rows (on delete cascade).
  const { error } = await db.auth.admin.deleteUser(user.id);
  if (error) { console.error("delete user failed", error); return json(500, { error: "Couldn't delete your account. Try again in a minute." }); }
  console.log("deleted account", user.id);
  return json(200, { ok: true });
});
