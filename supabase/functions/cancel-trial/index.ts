// Cancels the signed-in person's Grade Book free trial so their card is never charged.
// Called from Settings > Cancel free trial. Needs the same LEMONSQUEEZY_API_KEY and
// LEMONSQUEEZY_TEST_API_KEY secrets as lemon-webhook.
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

  const { data: row, error } = await db.from("access").select("sub_id, sub_status, test_mode, paid_at").eq("user_id", user.id).maybeSingle();
  if (error) { console.error("read access failed", error); return json(500, { error: "Could not load your trial." }); }
  if (!row?.sub_id || row.paid_at) return json(400, { error: "There is no free trial to cancel." });
  if (row.sub_status === "cancelled") return json(200, { ok: true });
  if (row.sub_status !== "on_trial") return json(400, { error: "There is no free trial to cancel." });

  const keyName = row.test_mode ? "LEMONSQUEEZY_TEST_API_KEY" : "LEMONSQUEEZY_API_KEY";
  const key = Deno.env.get(keyName);
  if (!key) { console.error(keyName + " is not set"); return json(500, { error: "Cancelling isn't set up yet. Cancel from your Lemon Squeezy receipt email instead." }); }

  const res = await fetch(`https://api.lemonsqueezy.com/v1/subscriptions/${encodeURIComponent(row.sub_id)}`, {
    method: "DELETE",
    headers: { Accept: "application/vnd.api+json", "Content-Type": "application/vnd.api+json", Authorization: `Bearer ${key}` },
  });
  if (!res.ok) { console.error("cancel failed", res.status, await res.text()); return json(502, { error: "Lemon Squeezy didn't cancel it. Try again in a minute." }); }

  await db.from("access").update({ sub_status: "cancelled" }).eq("user_id", user.id);
  return json(200, { ok: true });
});
