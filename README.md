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
| Payments, orders, refunds | app.lemonsqueezy.com, store "gradebook" |
| The domain gradebook.fun | hostinger.com |

### Go live when Lemon Squeezy approves the store

Do these in order. Until step 6, nobody can pay real money.

1. **Payouts.** In Lemon Squeezy, open Settings > Payouts and make sure a bank account or PayPal is added. This is where your money goes.
2. **Copy the product to live mode.** With test mode still on, open Products, click the **...** next to Grade Book, and choose **Copy to live mode**.
3. **Turn off test mode.** It's the switch at the bottom left of the Lemon Squeezy dashboard.
4. **Check the live product.** Open Products > Grade Book. It should be a **Single payment** of $5. Under **Confirmation modal**, the button link should be `https://gradebook.fun/?paid=1`. Save if you changed anything.
5. **Add the live webhook.** Open Settings > Webhooks and click **+**. Test and live mode have separate webhooks, so this is needed even though the test one exists.
   - Callback URL: `https://fnbcebulnbhsgpgynbon.supabase.co/functions/v1/lemon-webhook`
   - Signing secret: the same one you used for the test webhook. If you don't remember it, make up a new long password, and also put it in Supabase: Edge Functions > Secrets > `LEMONSQUEEZY_WEBHOOK_SECRET` > edit. Then the test webhook will stop working, which is fine once you're live.
   - Events: check `order_created` and `order_refunded`.
   - Click **Save webhook**.
6. **Put the live checkout link in the app.**
   1. In Lemon Squeezy, open Products > Grade Book, click **Share**, and copy the checkout link. It starts with `https://gradebook.lemonsqueezy.com/`.
   2. On github.com, open this repo and click the file `supabase-config.js`.
   3. Click the pencil icon (**Edit this file**) at the top right of the file.
   4. Find the line that starts with `window.GB_CHECKOUT =`. Replace only the link between the quote marks with your new link. Keep the quote marks and the `;` at the end.
   5. Click **Commit changes...**, keep **Commit directly to the main branch**, and click **Commit changes**.
   6. Wait 1 to 2 minutes, then check the **Actions** tab. The newest run should have a green check. See "The site didn't update" below if it's red.
7. **Test with real money.** In a private browser window, make a new account on gradebook.fun, tap **Buy Grade Book for $5**, and pay with a real card. You should land back in Grade Book with confetti. Then refund yourself (see "Refund someone" below). The app should go back to the Buy screen for that account.

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

1. In Lemon Squeezy, open **Orders** and find their order. You can search by email.
2. Click the order, then **Refund**, and confirm.
3. That's it. Lemon Squeezy tells Grade Book, and their account goes back to the Buy screen. Their grades stay saved.

The Terms promise a full refund if they ask within 14 days of paying. If you'd rather refund them and let them keep using Grade Book, refund them and then give them free access (above).

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

### Someone didn't get their confirmation email

Supabase's built-in email sender only sends a few emails per hour, so emails can be late when several people sign up at once.

- Ask them to wait an hour, check spam, and use **Forgot your password?** on the sign-in page if they still can't get in.
- If it keeps happening, either turn off **Confirm email** in Supabase (Authentication > Sign In / Providers > Email), or connect a free email service like Resend under Authentication > Emails > SMTP settings.

### Change someone's username

Usernames can't be changed in the app. If someone asks, run this in the SQL Editor (new username must be 3 to 20 lowercase letters, numbers or `_`, and not taken):

```sql
update public.profiles set username = 'new_name'
where user_id = (select id from auth.users where lower(email) = 'friend@example.com');
```

### Delete someone's account

People can do this themselves in Settings > Delete account. To do it for them: in Supabase, open **Authentication > Users**, find their email, click the **...** menu, and choose **Delete user**. Their grades, friends and payment record are deleted with it. This doesn't refund them; do that in Lemon Squeezy first if needed.

### Make a code change with Claude

To have Claude change the site later, start a Claude Code session with this repo, and paste in the "Grade Book: summary so far" notes from your last chat so it knows how everything fits together.

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
