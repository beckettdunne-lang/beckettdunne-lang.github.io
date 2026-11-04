# Grade Book

Live at https://gradebook.fun

The old address, https://beckettdunne-lang.github.io/gradebook/, forwards here.

Grade Book is one page (`index.html`). `CNAME` sets the custom domain for GitHub Pages. With sign-in turned on, each person's grades are saved to their account in Supabase. Without it, grades stay in the browser.

## Turn on sign-in

1. Make a free account at https://supabase.com and create a project.
2. **SQL Editor:** paste everything in `supabase.sql` and run it. This makes the grades table and the rules that keep each person's grades private.
3. **Authentication > URL Configuration:** set **Site URL** to `https://gradebook.fun/` and add the same address under **Redirect URLs**. Confirmation and password-reset emails link back here.
4. **Project Settings > API:** copy the **Project URL** and the **anon / publishable** key into `supabase-config.js`. Don't use the service_role or secret key.

Email confirmation is on by default, so new users confirm their email before they can sign in. Supabase's built-in email sender only sends a few emails per hour. That's fine for a few friends. To skip confirmation, turn off **Confirm email** under Authentication > Sign In / Providers > Email.

## Free trial and the $5 purchase

New accounts get a 14-day free trial. After that, Grade Book costs $5, paid once through Lemon Squeezy. Accounts made before payments started are marked as paid. "Use without an account" also gets a 14-day trial on that device. After it ends, the person needs to make an account and buy.

How it works:

- `supabase.sql` makes the `access` table. Each account gets a row with `trial_ends_at` and `paid_at` when it's created. People can read their own row but can't change it.
- Saving grades to an account needs `paid_at` set or a trial that hasn't ended. Reading, deleting, and downloading grades always work.
- `supabase/functions/lemon-webhook` is a Supabase Edge Function. Lemon Squeezy calls it after a purchase or refund. It checks the signature, then sets or clears `paid_at`.
- The Buy button opens the checkout link in `supabase-config.js` with the account's ID attached, so the webhook knows which account paid.

Two accounts are free forever: beckettdunne@gmail.com and 29baberke@ecfs.org. To give someone else free access for good, run this in the SQL Editor with their email:

```sql
update public.access set free_forever = true, paid_at = coalesce(paid_at, now()), note = 'free forever'
where user_id = (select id from auth.users where lower(email) = 'friend@example.com');
```

### Set up Lemon Squeezy

The Lemon Squeezy account must belong to someone 18 or older.

1. **Store:** make a store at https://lemonsqueezy.com. Test mode works right away. Real payments start after Lemon Squeezy approves the store.
2. **Product:** Products > New product. Name it Grade Book, choose **Single payment**, and set the price to $5. Under **Confirmation modal**, set the button link to `https://gradebook.fun/?paid=1`.
3. **Checkout link:** on the product, click Share and copy the checkout link. Paste it into `window.GB_CHECKOUT` in `supabase-config.js`.
4. **Webhook:** Settings > Webhooks > add one.
   - URL: `https://fnbcebulnbhsgpgynbon.supabase.co/functions/v1/lemon-webhook`
   - Signing secret: make up a long random password and keep a copy.
   - Events: `order_created` and `order_refunded`.
5. **Secret:** in Supabase, go to Edge Functions > Secrets. Add `LEMONSQUEEZY_WEBHOOK_SECRET` with the same signing secret.

## Move grades from the Claude version

In the old Grade Book, go to Settings > Export grades. In this one, sign in, then use **Import a backup file** on the setup screen, or Settings > Import grades.

## Domain

`gradebook.fun` is registered with Hostinger. Its DNS has four A records for `@` (185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153) and a CNAME for `www` pointing to `beckettdunne-lang.github.io`.
