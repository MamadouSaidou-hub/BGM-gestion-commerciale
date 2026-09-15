import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import * as schema from './schema'
import * as authSchema from './auth-schema'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error('DATABASE_URL is not set — expected a postgres:// connection string.')
}

const pool = new Pool({
  connectionString,
  // Supabase (and most managed Postgres) require TLS; node-postgres doesn't enable it automatically
  // just because the URL says postgres:// or sslmode=require.
  ssl: connectionString.includes('localhost') || connectionString.includes('127.0.0.1') ? false : { rejectUnauthorized: false },
  // Keep well under a typical serverless-plan connection cap — this app also runs many independent
  // function instances (one per route), so a low per-instance max matters more than a high one.
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
})

// Without a listener, a dropped idle connection surfaces as an uncaught exception that crashes the
// whole process instead of just failing the next query that needs a fresh connection.
pool.on('error', (error) => {
  console.error('Unexpected error on idle Postgres client', error)
})

export const db = drizzle(pool, { schema: { ...schema, ...authSchema } })
