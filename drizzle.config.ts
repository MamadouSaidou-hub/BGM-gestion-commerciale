import { defineConfig } from 'drizzle-kit'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set — expected a postgres:// connection string.')
}

export default defineConfig({
  schema: ['./lib/db/schema.ts', './lib/db/auth-schema.ts'],
  out: './lib/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
})
