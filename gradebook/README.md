# Grade Book

Live at https://beckettdunne-lang.github.io/gradebook/

Grade Book is one page (`index.html`). With sign-in turned on, each person's grades are saved to their account in Supabase. Without it, grades stay in the browser.

## Turn on sign-in

1. Make a free account at https://supabase.com and create a project.
2. **SQL Editor:** paste everything in `supabase.sql` and run it. This makes the grades table and the rules that keep each person's grades private.
3. **Authentication > URL Configuration:** set **Site URL** to `https://beckettdunne-lang.github.io/gradebook/` and add the same address under **Redirect URLs**. Confirmation and password-reset emails link back here.
4. **Project Settings > API:** copy the **Project URL** and the **anon / publishable** key into `supabase-config.js`. Don't use the service_role or secret key.

Email confirmation is on by default, so new users confirm their email before they can sign in. Supabase's built-in email sender only sends a few emails per hour. That's fine for a few friends. To skip confirmation, turn off **Confirm email** under Authentication > Sign In / Providers > Email.

## Move grades from the Claude version

In the old Grade Book, go to Settings > Export grades. In this one, sign in, then use **Import a backup file** on the setup screen, or Settings > Import grades.
