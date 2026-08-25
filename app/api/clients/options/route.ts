import { NextResponse } from 'next/server'
import { getClientOptions } from '@/lib/db/queries'

export async function GET() {
  const clients = await getClientOptions()
  return NextResponse.json({ clients })
}
