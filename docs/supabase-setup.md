# Supabase setup (`axrclxwittqyurwqjvdq`)

Project URL: https://axrclxwittqyurwqjvdq.supabase.co

## 1. Link the CLI (after `supabase login`)

```bash
npm run supabase:link
# or: npx supabase link --project-ref axrclxwittqyurwqjvdq
```

Enter your database password when prompted (Dashboard → Project Settings → Database).

## 2. Configure `.env`

Copy the **Session pooler** URI from [Connect](https://supabase.com/dashboard/project/axrclxwittqyurwqjvdq?showConnect=true):

```bash
DATABASE_URL="postgresql://postgres.axrclxwittqyurwqjvdq:YOUR_PASSWORD@aws-0-<region>.pooler.supabase.com:5432/postgres?schema=public"
SUPABASE_URL="https://axrclxwittqyurwqjvdq.supabase.co"
NEXT_PUBLIC_SUPABASE_URL="https://axrclxwittqyurwqjvdq.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="<from Settings → API>"
```

## 3. Deploy Prisma migrations

```bash
npm run db:push
```

## 4. Seed admin user

```bash
SEED_ADMIN_EMAIL=admin@example.com SEED_ADMIN_PASSWORD='your-secure-password' npm run seed
```

## 5. Run the app

```bash
npm run dev
```
