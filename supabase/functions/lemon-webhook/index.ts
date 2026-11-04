// Lemon Squeezy webhook for Grade Book.
// Lemon Squeezy calls this when someone starts a trial, pays, cancels, or gets a refund.
// It checks the signature, then updates that account's row in public.access.
//
// How the 3-day trial works: the Grade Book product is a $5 yearly subscription with a
// 3-day free trial, so Lemon Squeezy takes a card first. When the $5 charge goes through,
// this function cancels the subscription so it never renews. The $5 is a one-time charge.
//
// Secrets (Supabase > Edge Functions > Secrets):
//   LEMONSQUEEZY_WEBHOOK_SECRET  the webhook signing secret in Lemon Squeezy (required)
//   LEMONSQUEEZY_API_KEY         a live-mode API key, used to cancel after the $5 charge
//   LEMONSQUEEZY_TEST_API_KEY    a test-mode API key, used the same way for test orders
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

// Cancel a subscription so it never charges again. Returns true when Lemon Squeezy accepts it.
async function cancelSubscription(subId: string, testMode: boolean): Promise<boolean> {
  const key = Deno.env.get(testMode ? "LEMONSQUEEZY_TEST_API_KEY" : "LEMONSQUEEZY_API_KEY");
  if (!key) {
    console.error(`Cannot cancel subscription ${subId}: ${testMode ? "LEMONSQUEEZY_TEST_API_KEY" : "LEMONSQUEEZY_API_KEY"} is not set. It will renew in a year unless cancelled in Lemon Squeezy.`);
    return false;
  }
  const res = await fetch(`https://api.lemonsqueezy.com/v1/subscriptions/${encodeURIComponent(subId)}`, {
    method: "DELETE",
    headers: { Accept: "application/vnd.api+json", "Content-Type": "application/vnd.api+json", Authorization: `Bearer ${key}` },
  });
  if (!res.ok) {
    console.error(`Cancel of subscription ${subId} failed: ${res.status} ${await res.text()}. Cancel it by hand in Lemon Squeezy.`);
    return false;
  }
  return true;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply(405, "Use POST");
  const secret = Deno.env.get("LEMONSQUEEZY_WEBHOOK_SECRET");
  if (!secret) { console.error("LEMONSQUEEZY_WEBHOOK_SECRET is not set"); return reply(500, "LEMONSQUEEZY_WEBHOOK_SECRET is not set"); }

  const raw = await req.text();
  const sig = (req.headers.get("X-Signature") ?? "").toLowerCase();
  if (!sig || !sameText(await hmacHex(secret, raw), sig)) { console.error("Signature did not match. Check that the signing secret is the same in Lemon Squeezy and Supabase."); return reply(401, "Bad signature"); }

  let body: any;
  try { body = JSON.parse(raw); } catch { return reply(400, "Bad JSON"); }
  const event: string = body?.meta?.event_name ?? "";
  const custom = body?.meta?.custom_data?.user_id;
  const userId: string | null = typeof custom === "string" && UUID.test(custom) ? custom : null;
  const id = String(body?.data?.id ?? "");
  const attrs = body?.data?.attributes ?? {};
  const testMode = !!attrs.test_mode;
  console.log("event", event, "id", id, "has account", !!userId, "test", testMode);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const fail = (what: string, error: unknown) => { console.error(what, error); return reply(500, "Could not save"); };

  // One-time orders. A trial's first order is $0, so only orders that took money count.
  if (event === "order_created") {
    if (!userId) return reply(200, "No Grade Book account on this order");
    if (attrs.status !== "paid" || !(Number(attrs.total) > 0)) return reply(200, "Order has no charge yet");
    const { error } = await db.from("access").upsert(
      { user_id: userId, paid_at: new Date().toISOString(), order_id: id, test_mode: testMode, note: testMode ? "test mode order" : null },
      { onConflict: "user_id" });
    return error ? fail("mark paid failed", error) : reply(200, "Marked paid");
  }

  if (event === "order_refunded") {
    if (!userId) return reply(200, "No Grade Book account on this order");
    const { error } = await db.from("access").update({ paid_at: null, note: "refunded" })
      .eq("user_id", userId).eq("order_id", id).eq("free_forever", false);
    return error ? fail("refund failed", error) : reply(200, "Marked refunded");
  }

  // Subscription changes: trial started, cancelled, expired, card failed, and so on.
  if (event.startsWith("subscription_") && body?.data?.type === "subscriptions") {
    const row: Record<string, unknown> = { sub_id: id, sub_status: attrs.status ?? null, test_mode: testMode };
    if (attrs.trial_ends_at) row.trial_ends_at = attrs.trial_ends_at;
    if (attrs.urls?.customer_portal) row.portal_url = attrs.urls.customer_portal;
    if (event === "subscription_created") {
      if (!userId) return reply(200, "No Grade Book account on this subscription");
      const { error } = await db.from("access").upsert({ user_id: userId, ...row }, { onConflict: "user_id" });
      return error ? fail("save subscription failed", error) : reply(200, "Saved subscription");
    }
    // Later changes only apply to the account's current subscription.
    const { error } = await db.from("access").update(row).eq("sub_id", id);
    return error ? fail("update subscription failed", error) : reply(200, "Updated subscription");
  }

  // The $5 charge after the trial. Mark paid, then cancel so it never renews.
  if (event === "subscription_payment_success") {
    const subId = String(attrs.subscription_id ?? "");
    if (!(Number(attrs.total) > 0)) return reply(200, "No charge on this invoice");
    let q = db.from("access").update({ paid_at: new Date().toISOString(), order_id: "invoice-" + id, test_mode: testMode, note: testMode ? "test mode payment" : null });
    q = userId ? q.eq("user_id", userId) : q.eq("sub_id", subId);
    const { error } = await q;
    if (error) return fail("mark paid failed", error);
    if (subId) await cancelSubscription(subId, testMode);
    return reply(200, "Marked paid");
  }

  if (event === "subscription_payment_refunded") {
    const { error } = await db.from("access").update({ paid_at: null, note: "refunded" })
      .eq("order_id", "invoice-" + id).eq("free_forever", false);
    return error ? fail("refund failed", error) : reply(200, "Marked refunded");
  }

  return reply(200, "Ignored " + event);
});
