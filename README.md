# Metro Station Register

An offline-first Metro station earning register built with Next.js, IndexedDB, Prisma, and PostgreSQL.

## Local development

1. Install Node.js 20.9 or newer and enable Corepack.
2. Install packages:

   ```powershell
   corepack pnpm install
   ```

3. Copy `.env.example` to `.env` and set `DATABASE_URL` to the local PostgreSQL instance. Keep this file private.
4. Apply the Prisma schema and generate its client:

   ```powershell
   corepack pnpm db:migrate
   corepack pnpm db:generate
   ```

5. Start the app:

   ```powershell
   corepack pnpm dev
   ```

Register edits are written to the browser's IndexedDB first. Pending snapshots remain in a durable local queue when the station server or PostgreSQL is unreachable. The Next.js server uses Prisma to write to PostgreSQL; browser code never receives database credentials. A concurrent edit based on an older server revision is shown as a conflict rather than silently overwriting the server record.

## Validation

```powershell
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```
