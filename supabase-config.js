// Supabase settings for Grade Book.
// If these are set back to PASTE values, Grade Book runs without accounts and saves grades on each device only.
// To turn on sign-in: Supabase dashboard > Project Settings > API (or "Connect").
//   url: the Project URL, like https://abcdefgh.supabase.co
//   key: the "anon" / "publishable" key. Never use the "service_role" or "secret" key here.
// Both values are safe to publish. The rules in supabase.sql are what keep each person's grades private.
window.GB_SUPABASE = {
  url: "https://fnbcebulnbhsgpgynbon.supabase.co",
  key: "sb_publishable_20xxW3icj2l9oVubwAggDA_AhR9hwBU"
};

// Stripe Payment Link for the $5 one-time purchase.
// Stripe dashboard > Payment Links > Grade Book > copy the link. It looks like https://buy.stripe.com/....
// Test-mode links start with https://buy.stripe.com/test_ and only take test cards.
// The app adds ?client_reference_id=<account id> so the stripe-webhook function knows who paid.
// While this is empty, the app shows "Buying Grade Book opens soon" instead of a Buy button.
window.GB_CHECKOUT = "https://buy.stripe.com/fZu8wPbVLaoK4rJ6X63cc00";
