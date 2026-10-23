const ONES = [
  'zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix',
  'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf',
]
const TENS: Record<number, string> = { 2: 'vingt', 3: 'trente', 4: 'quarante', 5: 'cinquante', 6: 'soixante' }

// `final` = nothing else follows this group in the full number. "quatre-vingts" and "cents" only
// keep their agreement 's' when final — e.g. "trois cent mille" (no s: "mille" follows), but
// "trois cents" alone, or "trois cent cinquante" (s dropped because "cinquante" follows — same rule).
function twoDigitsToWords(n: number, final = true): string {
  if (n < 20) return ONES[n]
  if (n < 70) {
    const tens = Math.floor(n / 10)
    const unit = n % 10
    const base = TENS[tens]
    if (unit === 0) return base
    if (unit === 1) return `${base} et un`
    return `${base}-${ONES[unit]}`
  }
  if (n < 80) {
    const rest = n - 60 // 10..19
    if (rest === 11) return 'soixante et onze'
    return `soixante-${ONES[rest]}`
  }
  // 80..99
  const rest = n - 80 // 0..19
  if (rest === 0) return final ? 'quatre-vingts' : 'quatre-vingt'
  return `quatre-vingt-${ONES[rest]}`
}

function threeDigitsToWords(n: number, final = true): string {
  const hundreds = Math.floor(n / 100)
  const rest = n % 100
  if (hundreds === 0) return twoDigitsToWords(rest, final)
  const hundredsWord = hundreds === 1 ? 'cent' : `${ONES[hundreds]} cent`
  if (rest === 0) return hundreds > 1 && final ? `${hundredsWord}s` : hundredsWord
  return `${hundredsWord} ${twoDigitsToWords(rest, final)}`
}

/** "150000" -> "cent cinquante mille". Handles up to 999 999 999 999, which covers any realistic
 * invoice amount regardless of currency denomination (GNF amounts run into the hundreds of
 * thousands for a single sale). */
export function numberToFrenchWords(value: number): string {
  const n = Math.round(Math.abs(value))
  if (n === 0) return 'zéro'

  const milliard = Math.floor(n / 1_000_000_000)
  const million = Math.floor((n % 1_000_000_000) / 1_000_000)
  const mille = Math.floor((n % 1_000_000) / 1_000)
  const reste = n % 1_000

  const parts: string[] = []
  if (milliard) parts.push(`${milliard === 1 ? 'un' : threeDigitsToWords(milliard)} milliard${milliard > 1 ? 's' : ''}`)
  if (million) parts.push(`${million === 1 ? 'un' : threeDigitsToWords(million)} million${million > 1 ? 's' : ''}`)
  if (mille) parts.push(mille === 1 ? 'mille' : `${threeDigitsToWords(mille, false)} mille`)
  if (reste) parts.push(threeDigitsToWords(reste))

  return parts.join(' ')
}

/** Capitalized, ready to print on a document: "Cent cinquante mille". */
export function amountInWords(value: number): string {
  const words = numberToFrenchWords(value)
  return words.charAt(0).toUpperCase() + words.slice(1)
}
