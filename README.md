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

## The $5 purchase

Grade Book costs $5, paid once. There's no free trial and no subscription. People make an account, then buy Grade Book at Lemon Squeezy checkout before they can add classes. There's no way to use Grade Book without an account.

How it works:

- `supabase.sql` makes the `access` table: one row per account with `paid_at` and `free_forever`. People can read their own row but can't change it.
- Saving grades needs `free_forever` or `paid_at`. Reading, deleting, and downloading grades always work.
- `supabase/functions/lemon-webhook` gets Lemon Squeezy's `order_created` and `order_refunded` events, checks the signature, and sets or clears `paid_at`. It still has code for subscription events from when Grade Book had a free trial; those events are no longer sent.
- `supabase/functions/cancel-trial` is left over from the free trial. The app no longer calls it.
- `supabase/functions/delete-account` runs when someone taps Delete account in Settings. It deletes the account; the grades and access rows go with it.
- `icon.svg`, `favicon.ico`, `icon-192.png`, `icon-512.png` and `apple-touch-icon.png` are the site icons. `og.png` is the picture shown when someone shares the link.
- `terms.html` and `privacy.html` are the Terms and Privacy Policy. Their contact address is beckettdunne@gmail.com.

## Friends

Everyone picks a username at sign-up (3 to 20 lowercase letters, numbers or `_`, unique, can't be changed). Accounts made before usernames existed pick one the first time they open the Friends tab.

- `profiles` holds each account's username, short name ("Sam L.") and sharing choice: `none` (default), `gpa`, or `letters`.
- `friendships` has one row per pair, `pending` or `accepted`. `shared_stats` holds the GPA and class letters someone chose to share. `friend_events` and `high_fives` hold grade-ups and high fives.
- The app only uses database functions for friends: `username_available`, `set_username`, `send_friend_request`, `respond_friend_request`, `remove_friend`, `get_friends`, `get_feed`, `high_five` and `record_grade_up`. Nobody can read `friendships`, `friend_events`, `high_fives` or anyone else's `shared_stats` directly. `get_friends` only returns grades for accepted friends, at the level each friend chose.

Two accounts are free forever: beckettdunne@gmail.com and 29baberke@ecfs.org. To give someone else free access for good, run this in the SQL Editor with their email:

```sql
update public.access set free_forever = true, paid_at = coalesce(paid_at, now()), note = 'free forever'
where user_id = (select id from auth.users where lower(email) = 'friend@example.com');
```

### Set up Lemon Squeezy

The Lemon Squeezy account must belong to someone 18 or older.

1. **Product:** Products > New product. Name it Grade Book and choose **Single payment**, $5. Under **Confirmation modal**, set the button link to `https://gradebook.fun/?paid=1`.
2. **Checkout link:** on the product, click Share and copy the link. Put it in `window.GB_CHECKOUT` in `supabase-config.js`.
3. **Webhook:** Settings > Webhooks.
   - URL: `https://fnbcebulnbhsgpgynbon.supabase.co/functions/v1/lemon-webhook`
   - Signing secret: a long random password.
   - Events: `order_created` and `order_refunded`.
4. **Secret:** in Supabase, Edge Functions > Secrets, set `LEMONSQUEEZY_WEBHOOK_SECRET` to the signing secret from step 3.

Test mode and live mode each need their own product and webhook.

## Move grades from the Claude version

In the old Grade Book, go to Settings > Export grades. In this one, sign in, then use **Import a backup file** on the setup screen, or Settings > Import grades.

## Domain

`gradebook.fun` is registered with Hostinger. Its DNS has four A records for `@` (185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153) and a CNAME for `www` pointing to `beckettdunne-lang.github.io`.

## Keeping Supabase awake

The free Supabase plan pauses a project after about a week with no activity. `.github/workflows/keep-supabase-awake.yml` runs a small database query every day at 15:37 UTC so that doesn't happen. It reads the URL and key from `supabase-config.js`, so it needs no secrets. To run it by hand, open the Actions tab, choose "Keep Supabase awake", then "Run workflow".

If a run fails, GitHub emails the repo owner. A failure usually means the project is already paused. Restore it in the Supabase dashboard.

GitHub turns off scheduled workflows in a repo with no commits for 60 days. If that happens, the Actions tab shows a button to turn it back on.
