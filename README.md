# Grade Book

Live at https://gradebook.fun

The old address, https://beckettdunne-lang.github.io/gradebook/, forwards here.

Grade Book is one page (`index.html`). `CNAME` sets the custom domain for GitHub Pages. With sign-in turned on, each person's grades are saved to their account in Supabase. Without it, grades stay in the browser.

## Do it yourself

Step-by-step instructions for the jobs you'll do most often. Most only need a web browser.

Where things are:

| What | Where |
|---|---|
| The website's code | This repo on github.com, branch `main` |
| Accounts, grades, who paid, friends | supabase.com, project "Gradebook" |
| Payments, orders, refunds | dashboard.stripe.com |
| The domain gradebook.fun | hostinger.com |

### Set up Stripe payments

Payments go through a Stripe Payment Link. The app adds the buyer's account ID to the link, and the `stripe-webhook` function marks that account paid when Stripe says the payment went through.

1. **Payment Link.** In Stripe, open **Payment Links** and create one for a product called Grade Book, $5, one-time. Under **After payment**, choose **Don't show confirmation page**, and enter `https://gradebook.fun/?paid=1`. This sends buyers back to the app.
2. **Webhook.** In Stripe, open **Developers > Webhooks** (it may be called **Workbench** or **Event destinations**) and add an endpoint:
   - Endpoint URL: `https://fnbcebulnbhsgpgynbon.supabase.co/functions/v1/stripe-webhook`
   - Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded` and `charge.refunded`.
   - After saving, reveal the **Signing secret**. It starts with `whsec_`.
3. **Secret.** In Supabase, open **Edge Functions > Secrets** and add `STRIPE_WEBHOOK_SECRET` with the signing secret from step 2.
4. **Payouts.** In Stripe, finish activating the account and add a bank account, so payments can be paid out. The Stripe account must belong to someone 18 or older.
5. **Test with real money.** In a private browser window, make a new account on gradebook.fun, tap **Buy Grade Book for $5**, and pay with a real card. You should land back in Grade Book with confetti. Then refund yourself (see "Refund someone" below). The app should go back to the Buy screen for that account.

Stripe's test mode has its own Payment Links, webhooks and signing secrets. A test link starts with `https://buy.stripe.com/test_` and only takes test cards like 4242 4242 4242 4242. If you test that way, add a test-mode webhook and use its signing secret in Supabase, then switch everything back to live.

### Change the checkout link

Do this if you make a new Payment Link.

1. In Stripe, open **Payment Links**, click Grade Book, and copy its link. It starts with `https://buy.stripe.com/`.
2. On github.com, open this repo and click the file `supabase-config.js`.
3. Click the pencil icon (**Edit this file**) at the top right of the file.
4. Find the line that starts with `window.GB_CHECKOUT =`. Replace only the link between the quote marks with your new link. Keep the quote marks and the `;` at the end.
5. Click **Commit changes...**, keep **Commit directly to the main branch**, and click **Commit changes**.
6. Wait 1 to 2 minutes, then check the **Actions** tab. The newest run should have a green check. See "The site didn't update" below if it's red.

### Give someone free access

1. In Supabase, open your project, then **SQL Editor** > **New query**.
2. Paste this, and change the email to theirs (keep the quote marks):

   ```sql
   update public.access set free_forever = true, paid_at = coalesce(paid_at, now()), note = 'free forever'
   where user_id = (select id from auth.users where lower(email) = 'friend@example.com');
   ```

3. Click **Run**. It should say 1 row was changed. If it says 0, there's no account with that email yet: check the spelling, or ask them to sign up first.
4. They may need to reload the page.

To take free access away, run the same thing with `free_forever = false, paid_at = null, note = null`.

### Refund someone

1. In Stripe, open **Payments** and find their payment. You can search by email.
2. Click the payment, then **Refund**, and refund the full $5.
3. That's it. Stripe tells Grade Book, and their account goes back to the Buy screen. Their grades stay saved. A partial refund doesn't change their access.

The Terms say all sales are final, so you don't have to give refunds. You can still give one if you decide to, for example after an accidental double purchase. If you'd rather refund them and let them keep using Grade Book, refund them and then give them free access (above).

### See who has paid

In Supabase, open **SQL Editor** > **New query**, paste this, and click **Run**:

```sql
select u.email, p.username, a.paid_at, a.free_forever, a.note
from auth.users u
left join public.access a on a.user_id = u.id
left join public.profiles p on p.user_id = u.id
order by u.created_at desc;
```

`paid_at` is when they paid. Empty means they haven't paid.

### The site didn't update after a change

1. On github.com, open the **Actions** tab. Each change starts a run called "pages build and deployment".
   - Yellow dot: still working. Wait a few minutes.
   - Green check: it worked. Reload gradebook.fun with Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows), or open it in a private window.
   - Red X: it failed. Keep going.
2. Click the failed run and read the error. If it says **"in progress deployment"** or **"Please cancel ... first"**, a stuck deploy is blocking new ones:
   1. Open the repo's **Settings > Pages**.
   2. Under **Build and deployment > Source**, switch to **GitHub Actions**, then switch back to **Deploy from a branch**.
   3. Pick branch `main` and folder `/ (root)`, and click **Save**.
   4. Don't touch the **Custom domain** box.
3. Start a new deploy by making any small commit. For example, open `README.md`, click the pencil, add a space at the end of a line, and commit. Re-running an old failed run usually gets stuck, so make a new commit instead.
4. Never use the pencil next to **Default branch** in Settings > General. It renames the branch and breaks the site.

### Supabase is paused, or nobody can sign in

The free Supabase plan pauses a project after about a week with no activity. The daily "Keep Supabase awake" workflow (below) normally prevents this. If people can't sign in or see "Could not reach the sign-in service":

1. Sign in at supabase.com and open the project.
2. If it says the project is paused, click **Restore project**. It takes a few minutes. Grades and accounts are kept.
3. Check the **Actions** tab for "Keep Supabase awake". If it says scheduled runs are turned off, click the button to turn them back on.

### Someone didn't get a password-reset email

New accounts don't need a confirmation email (Confirm email is off). Password-reset emails still go through Supabase's built-in sender, which only sends a few emails per hour.

- Ask them to wait an hour, check spam, and try **Forgot your password?** again.
- If it keeps happening, connect a free email service like Resend under Authentication > Emails > SMTP settings.

### Change someone's username

Usernames can't be changed in the app. If someone asks, run this in the SQL Editor (new username must be 3 to 20 lowercase letters, numbers or `_`, and not taken):

```sql
update public.profiles set username = 'new_name'
where user_id = (select id from auth.users where lower(email) = 'friend@example.com');
```

### Delete someone's account

People can do this themselves in Settings > Delete account. To do it for them: in Supabase, open **Authentication > Users**, find their email, click the **...** menu, and choose **Delete user**. Their grades, friends and payment record are deleted with it. This doesn't refund them; do that in Stripe first if needed.

### Make a code change with Claude

To have Claude change the site later, start a Claude Code session with this repo, and paste in the "Grade Book: summary so far" notes from your last chat so it knows how everything fits together.

## Turn on sign-in

1. Make a free account at https://supabase.com and create a project.
2. **SQL Editor:** paste everything in `supabase.sql` and run it. This makes the grades table and the rules that keep each person's grades private.
3. **Authentication > URL Configuration:** set **Site URL** to `https://gradebook.fun/` and add the same address under **Redirect URLs**. Confirmation and password-reset emails link back here.
4. **Project Settings > API:** copy the **Project URL** and the **anon / publishable** key into `supabase-config.js`. Don't use the service_role or secret key.

**Confirm email** is turned off (Authentication > Sign In / Providers > Email), so new users are signed in as soon as they create an account. The app handles both settings: if you turn confirmation back on, sign-up shows "Open the link we emailed" instead. Supabase's built-in email sender only sends a few emails per hour, which still matters for password-reset emails.

## The $5 purchase

New accounts get one free day: 24 hours from when the account is made, with no card. After that, Grade Book costs $5, paid once, with no subscription. Nobody is charged automatically; they buy it at Stripe checkout when they choose. There's no way to use Grade Book without an account.

How it works:

- `supabase.sql` makes the `access` table: one row per account with `trial_ends_at` (account creation + 24 hours), `paid_at` and `free_forever`. People can read their own row but can't change it.
- Saving grades needs `free_forever`, `paid_at`, or a `trial_ends_at` in the future. Reading, deleting, and downloading grades always work.
- To give someone more free time, set their `trial_ends_at` later in the SQL Editor, for example `update public.access set trial_ends_at = now() + interval '3 days' where user_id = (select id from auth.users where lower(email) = 'friend@example.com');`.
- `supabase/functions/stripe-webhook` gets Stripe's `checkout.session.completed`, `checkout.session.async_payment_succeeded` and `charge.refunded` events, checks the `Stripe-Signature` header, and sets or clears `paid_at`. It finds the account from the checkout's `client_reference_id`, which the app adds to the Payment Link.
- `supabase/functions/lemon-webhook` is from when payments went through Lemon Squeezy. It still works for old Lemon Squeezy orders but gets no new ones.
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

Payment setup is under "Set up Stripe payments" near the top of this file.

## Move grades from the Claude version

In the old Grade Book, go to Settings > Export grades. In this one, sign in, then use **Import a backup file** on the setup screen, or Settings > Import grades.

## Domain

`gradebook.fun` is registered with Hostinger. Its DNS has four A records for `@` (185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153) and a CNAME for `www` pointing to `beckettdunne-lang.github.io`.

## Keeping Supabase awake

The free Supabase plan pauses a project after about a week with no activity. `.github/workflows/keep-supabase-awake.yml` runs a small database query every day at 15:37 UTC so that doesn't happen. It reads the URL and key from `supabase-config.js`, so it needs no secrets. To run it by hand, open the Actions tab, choose "Keep Supabase awake", then "Run workflow".

If a run fails, GitHub emails the repo owner. A failure usually means the project is already paused. Restore it in the Supabase dashboard.

GitHub turns off scheduled workflows in a repo with no commits for 60 days. If that happens, the Actions tab shows a button to turn it back on.
