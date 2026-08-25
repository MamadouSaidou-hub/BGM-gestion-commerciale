import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from './schema'
import * as authSchema from './auth-schema'

const client = createClient({
  url: process.env.DATABASE_URL ?? 'file:./dev.db',
})

export const db = drizzle(client, { schema: { ...schema, ...authSchema } })
