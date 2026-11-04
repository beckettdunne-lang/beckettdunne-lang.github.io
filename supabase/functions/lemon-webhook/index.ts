// Lemon Squeezy webhook for Grade Book.
// Lemon Squeezy calls this when someone buys Grade Book or gets a refund.
// It checks the signature, then marks that account as paid (or not paid) in public.access.
// Needs the secret LEMONSQUEEZY_WEBHOOK_SECRET, set to the same signing secret as the webhook in Lemon Squeezy.
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const enc = new TextEncoder();

async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(body)));
  return Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
}

function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const reply = (status: number, text: string) => new Response(text, { status, headers: { "Content-Type": "text/plain" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply(405, "Use POST");
  const secret = Deno.env.get("LEMONSQUEEZY_WEBHOOK_SECRET");
  if (!secret) { console.error("LEMONSQUEEZY_WEBHOOK_SECRET is not set"); return reply(500, "LEMONSQUEEZY_WEBHOOK_SECRET is not set"); }

  const raw = await req.text();
  const sig = (req.headers.get("X-Signature") ?? "").toLowerCase();
  if (!sig || !sameText(await hmacHex(secret, raw), sig)) { console.error("Signature did not match. Check that the signing secret is the same in Lemon Squeezy and Supabase."); return reply(401, "Bad signature"); }

  let body: any;
  try { body = JSON.parse(raw); } catch { return reply(400, "Bad JSON"); }
  const event = body?.meta?.event_name;
  const userId = body?.meta?.custom_data?.user_id;
  const orderId = String(body?.data?.id ?? "");
  const attrs = body?.data?.attributes ?? {};
  console.log("event", event, "order", orderId, "has account", typeof userId === "string" && UUID.test(userId));
  if (typeof userId !== "string" || !UUID.test(userId)) return reply(200, "No Grade Book account on this order");

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (event === "order_created" && attrs.status === "paid") {
    const note = attrs.test_mode ? "test mode order" : null;
    const { error } = await db.from("access")
      .upsert({ user_id: userId, paid_at: new Date().toISOString(), order_id: orderId, note }, { onConflict: "user_id" });
    if (error) { console.error("mark paid failed", error); return reply(500, "Could not save"); }
    return reply(200, "Marked paid");
  }

  if (event === "order_refunded") {
    const { error } = await db.from("access")
      .update({ paid_at: null, note: "refunded" })
      .eq("user_id", userId).eq("order_id", orderId).eq("free_forever", false);
    if (error) { console.error("refund failed", error); return reply(500, "Could not save"); }
    return reply(200, "Marked refunded");
  }

  return reply(200, "Ignored " + event);
});
