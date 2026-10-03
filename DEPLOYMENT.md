# Production deployment: Supabase + Vercel

The current local build uses `coaching.db`, `reviews.json`, and `uploads/`. Those files are not durable on Vercel serverless functions, so production must use Supabase first.

## 1. Create Supabase resources

1. Create a new Supabase project.
2. In the SQL editor, run `supabase/schema.sql`.
3. Copy the project URL and the **service role** key. Never expose that key in browser JavaScript.
4. Create a private backup of the local `coaching.db`, `reviews.json`, and `uploads/` before migration.

## 2. Configure Vercel

1. Create a Vercel project from this folder or its Git repository.
2. Add the values from `.env.example` in Vercel Project Settings → Environment Variables.
3. Set a unique `ADMIN_PASSWORD`; do not use the local default.
4. Deploy only after the application data layer is switched from local SQLite to Supabase.

## 3. Required migration work

The database schema and environment configuration are ready. The next implementation step is replacing `platform-store.js` and `planner-store.js` with Supabase-backed stores, then uploading the existing local data and images.

## 4. Post-deployment checks

- Login and logout work over HTTPS.
- A new client, template, workout session, payment, and weekly check-in survive a new deployment.
- Uploaded images load from Supabase Storage.
- Backup exports are tested from a production account.
