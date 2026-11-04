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

// Lemon Squeezy checkout link for the $5 one-time purchase.
// Lemon Squeezy dashboard > Products > Grade Book > Share, then copy the checkout link.
// It looks like https://YOURSTORE.lemonsqueezy.com/buy/1234abcd-....
// While this is empty, the app shows "Buying Grade Book opens soon" instead of a Buy button.
window.GB_CHECKOUT = "https://gradebook.lemonsqueezy.com/checkout/buy/912bb9a4-7220-40c7-a7e9-e701b27f7695";
