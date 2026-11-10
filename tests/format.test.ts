import { describe, expect, it } from 'vitest'
import { isPastDue } from '@/lib/format'

describe('isPastDue', () => {
  it('is false for a due date later today or in the future', () => {
    const today = new Date()
    expect(isPastDue(today.toISOString())).toBe(false)
    const future = new Date()
    future.setDate(future.getDate() + 5)
    expect(isPastDue(future.toISOString())).toBe(false)
  })

  it('is true for a due date earlier than today, even by one day', () => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    expect(isPastDue(yesterday.toISOString())).toBe(true)
  })

  it('compares by day, not by exact time of day', () => {
    const laterToday = new Date()
    laterToday.setHours(23, 59, 59, 999)
    expect(isPastDue(laterToday.toISOString())).toBe(false)

    const earlierToday = new Date()
    earlierToday.setHours(0, 0, 0, 0)
    expect(isPastDue(earlierToday.toISOString())).toBe(false)
  })
})
