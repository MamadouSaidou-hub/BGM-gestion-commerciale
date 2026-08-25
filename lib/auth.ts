import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { nextCookies } from 'better-auth/next-js'
import { admin } from 'better-auth/plugins'
import { db } from './db/client'
import { account, session, user, verification } from './db/auth-schema'

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'sqlite',
    schema: { user, session, account, verification },
  }),
  emailAndPassword: {
    enabled: true,
  },
  user: {
    additionalFields: {
      role: {
        type: 'string',
        defaultValue: 'gestionnaire',
        input: false,
      },
      storeId: {
        type: 'number',
        required: false,
        input: false,
      },
    },
  },
  plugins: [
    admin({
      defaultRole: 'gestionnaire',
      adminRoles: ['admin'],
    }),
    // nextCookies() must be the last plugin — it auto-attaches Set-Cookie headers to the current
    // Next.js response for whichever better-auth endpoint just ran in this request.
    nextCookies(),
  ],
})
