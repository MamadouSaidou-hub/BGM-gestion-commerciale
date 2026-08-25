import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: ['./lib/db/schema.ts', './lib/db/auth-schema.ts'],
  out: './lib/db/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'file:./dev.db',
  },
})
