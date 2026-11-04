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

People make an account, then add a card at checkout to start a 3-day free trial. When the trial ends, the card is charged $5 one time, unless they cancelled in Settings. There's no way to use Grade Book without an account.

Lemon Squeezy only allows card-first trials on subscriptions. So the product is a $5 yearly subscription with a 3-day trial, and the webhook cancels the subscription right after the $5 charge so it never renews.

How it works:

- `supabase.sql` makes the `access` table: one row per account with the trial end date, subscription status, and `paid_at`. People can read their own row but can't change it.
- Saving grades needs one of: `free_forever`, `paid_at`, an active trial (plus 12 hours while the charge goes through), or a cancelled trial that hasn't ended yet. Reading, deleting, and downloading grades always work.
- `supabase/functions/lemon-webhook` gets Lemon Squeezy's events, checks the signature, and updates `access`. After the $5 charge it cancels the subscription through the Lemon Squeezy API.
- `supabase/functions/cancel-trial` runs when someone taps Cancel free trial in Settings.
- `terms.html` and `privacy.html` are the Terms and Privacy Policy. Their contact address is beckettdunne@gmail.com.

Two accounts are free forever: beckettdunne@gmail.com and 29baberke@ecfs.org. To give someone else free access for good, run this in the SQL Editor with their email:

```sql
update public.access set free_forever = true, paid_at = coalesce(paid_at, now()), note = 'free forever'
where user_id = (select id from auth.users where lower(email) = 'friend@example.com');
```

### Set up Lemon Squeezy

The Lemon Squeezy account must belong to someone 18 or older.

1. **Product:** Products > New product. Name it Grade Book and choose **Subscription**. Set the price to $5, billed every **year**, and turn on a **free trial** of **3 days**. Under **Confirmation modal**, set the button link to `https://gradebook.fun/?paid=1`.
2. **Checkout link:** on the product, click Share and copy the link. Put it in `window.GB_CHECKOUT` in `supabase-config.js`.
3. **Webhook:** Settings > Webhooks.
   - URL: `https://fnbcebulnbhsgpgynbon.supabase.co/functions/v1/lemon-webhook`
   - Signing secret: a long random password.
   - Events: `order_created`, `order_refunded`, `subscription_created`, `subscription_updated`, `subscription_payment_success`, `subscription_payment_refunded`.
4. **API key:** Settings > API > new key. Test mode and live mode have separate keys.
5. **Secrets:** in Supabase, Edge Functions > Secrets:
   - `LEMONSQUEEZY_WEBHOOK_SECRET`: the signing secret from step 3.
   - `LEMONSQUEEZY_TEST_API_KEY`: the test-mode API key.
   - `LEMONSQUEEZY_API_KEY`: the live-mode API key, once the store is live.

Test mode and live mode each need their own product, webhook, and API key.

## Move grades from the Claude version

In the old Grade Book, go to Settings > Export grades. In this one, sign in, then use **Import a backup file** on the setup screen, or Settings > Import grades.

## Domain

`gradebook.fun` is registered with Hostinger. Its DNS has four A records for `@` (185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153) and a CNAME for `www` pointing to `beckettdunne-lang.github.io`.
