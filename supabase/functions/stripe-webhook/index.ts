// Stripe webhook for Grade Book.
// Stripe calls this after someone pays through the Grade Book Payment Link, after a refund,
// and when a refund is cancelled or fails.
// It checks Stripe's signature, then sets or clears paid_at in public.access.
//
// The app opens the Payment Link with ?client_reference_id=<the account's user id>, so the
// checkout.session.completed event says which account paid.
//
// Secret (Supabase > Edge Functions > Secrets):
//   STRIPE_WEBHOOK_SECRET  the endpoint's signing secret from Stripe (starts with whsec_)
// Test mode and live mode endpoints have different signing secrets.
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const enc = new TextEncoder();
const TOLERANCE_SECONDS = 300;

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

// Stripe-Signature looks like "t=1700000000,v1=abc...,v1=def...". The signed text is "<t>.<raw body>".
async function validSignature(header: string, raw: string, secret: string): Promise<boolean> {
  let t = "";
  const v1: string[] = [];
  for (const part of header.split(",")) {
    const [k, v] = part.split("=", 2);
    if (k === "t") t = v ?? "";
    if (k === "v1" && v) v1.push(v);
  }
  if (!t || !v1.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > TOLERANCE_SECONDS) return false;
  const expected = await hmacHex(secret, `${t}.${raw}`);
  return v1.some((s) => sameText(s, expected));
}

const reply = (status: number, text: string) => new Response(text, { status, headers: { "Content-Type": "text/plain" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply(405, "Use POST");
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!secret) { console.error("STRIPE_WEBHOOK_SECRET is not set"); return reply(500, "STRIPE_WEBHOOK_SECRET is not set"); }

  const raw = await req.text();
  if (!(await validSignature(req.headers.get("Stripe-Signature") ?? "", raw, secret))) {
    console.error("Signature did not match. Check that STRIPE_WEBHOOK_SECRET is this endpoint's signing secret (test and live differ).");
    return reply(400, "Bad signature");
  }

  let event: any;
  try { event = JSON.parse(raw); } catch { return reply(400, "Bad JSON"); }
  const type: string = event?.type ?? "";
  const obj = event?.data?.object ?? {};
  const live = !!event?.livemode;
  console.log("event", type, "id", obj.id, "live", live);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Paid through the Payment Link. (async_payment_succeeded covers slower payment methods.)
  if (type === "checkout.session.completed" || type === "checkout.session.async_payment_succeeded") {
    const userId = obj.client_reference_id;
    if (typeof userId !== "string" || !UUID.test(userId)) return reply(200, "No Grade Book account on this checkout");
    if (obj.mode !== "payment" || obj.payment_status !== "paid" || !(Number(obj.amount_total) > 0)) return reply(200, "Not paid yet");
    const orderId = String(obj.payment_intent || obj.id);
    const { error } = await db.from("access").upsert(
      { user_id: userId, paid_at: new Date().toISOString(), order_id: orderId, test_mode: !live, note: live ? "stripe" : "stripe test mode" },
      { onConflict: "user_id" });
    if (error) { console.error("mark paid failed", error); return reply(500, "Could not save"); }
    return reply(200, "Marked paid");
  }

  // A full refund removes access. Partial refunds keep it.
  if (type === "charge.refunded") {
    if (!obj.refunded || !obj.payment_intent) return reply(200, "Partial refund; access kept");
    const { error } = await db.from("access").update({ paid_at: null, note: "refunded" })
      .eq("order_id", String(obj.payment_intent)).eq("free_forever", false);
    if (error) { console.error("refund failed", error); return reply(500, "Could not save"); }
    return reply(200, "Marked refunded");
  }

  // A refund that was cancelled or failed: the money stayed with us, so give access back.
  if ((type === "charge.refund.updated" || type === "refund.updated" || type === "refund.failed") && obj.object === "refund") {
    if (!(obj.status === "canceled" || obj.status === "failed") || !obj.payment_intent) return reply(200, "Refund still active");
    const { error } = await db.from("access").update({ paid_at: new Date().toISOString(), note: `stripe (refund ${obj.status})` })
      .eq("order_id", String(obj.payment_intent)).eq("note", "refunded").is("paid_at", null);
    if (error) { console.error("restore after refund failed", error); return reply(500, "Could not save"); }
    return reply(200, "Restored access");
  }

  return reply(200, "Ignored " + type);
});
