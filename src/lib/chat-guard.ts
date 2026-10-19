// Contact details in chat, and when they are allowed.
//
// Before a booking exists there is no honest reason to swap phone numbers: the
// work, the price, the time and the photos all fit in the chat. A number at
// that point is almost always an attempt to take the job off the platform,
// where neither side is covered and we see none of it.
//
// Once the booking is confirmed the reason becomes real — the provider is on
// their way, running late, cannot find the door — so the block lifts on its
// own. Blocking there would be hostile, and people would route around it.
//
// This will not catch everyone. Someone determined will photograph a number or
// spell it strangely enough to slip past. It is meant to stop the easy path,
// not to be airtight, and it errs towards letting a message through: a blocked
// legitimate message is worse than a missed number, because the sender has no
// idea what to change.

/** The first status at which a booking is real enough to need coordination. */
const OPEN_FROM: ReadonlySet<string> = new Set([
  'scheduled', 'active', 'awaiting_confirmation', 'completed',
])

export function contactAllowed(offerStatus?: string | null): boolean {
  return !!offerStatus && OPEN_FROM.has(offerStatus)
}

// Digits spelled as words, in the four languages the apps ship. People fall
// back to this the moment digits stop working.
const WORD_DIGITS: Record<string, string> = {
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6',
  seven: '7', eight: '8', nine: '9',
  nul: '0', een: '1', twee: '2', drie: '3', vier: '4', vijf: '5', zes: '6',
  zeven: '7', acht: '8', negen: '9',
  zéro: '0', un: '1', deux: '2', trois: '3', quatre: '4', cinq: '5', six_fr: '6',
  sept: '7', huit: '8', neuf: '9',
  null: '0', eins: '1', zwei: '2', drei: '3', vier_de: '4', fünf: '5', sechs: '6',
  sieben: '7', acht_de: '8', neun: '9',
}

const EMAIL = /[A-Z0-9._%+-]+\s*(?:@|\(at\)|\[at\]|\sat\s)\s*[A-Z0-9.-]+\s*(?:\.|\(dot\)|\sdot\s)\s*[A-Z]{2,}/i

// A handle, or an invitation to continue somewhere else.
const OFF_PLATFORM = new RegExp(
  '(?:whats\\s?app|w\\.?a\\.?p|telegram|signal|instagram|insta\\b|snapchat|' +
  'facebook|messenger|viber|skype)',
  'i',
)
const HANDLE = /(?:^|\s)@[A-Za-z0-9._]{3,}/

/**
 * Digits that belong to a date, a time or a price, removed before counting.
 *
 * "14:00 - 16:00" and "15-03-2026" each carry eight digits, which is as many
 * as a short phone number. Counting them raw blocks people for arranging the
 * very appointment the chat exists for, so they come out first and whatever
 * remains is judged on its own.
 */
function withoutDatesAndPrices(text: string): string {
  // Day and month are range-checked, and the whole thing must stand alone.
  // A loose pattern swallowed "97-78-78-78" as if it were a date and let the
  // number straight through — the guard removing the very thing it guards
  // against.
  return text
    .replace(/\b([01]?\d|2[0-3])\s*[:.]\s*[0-5]\d\b/g, ' ')            // 14:00
    .replace(
      /\b(0?[1-9]|[12]\d|3[01])\s*[-/.]\s*(0?[1-9]|1[0-2])\s*[-/.]\s*(\d{4}|\d{2})\b(?!\s*[-/.]\s*\d)/g,
      ' ',                                                              // 15-03-2026
    )
    .replace(/[€$£]\s*[\d.,]+/g, ' ')                                   // €1.250,00
    .replace(/[\d.,]+\s*(?:euro|eur|usd)\b/gi, ' ')                     // 1250 euro
}

/**
 * A run of digits long enough to be a phone number, however it is spaced.
 *
 * Eight is the floor. A Dutch mobile is ten digits with the trunk zero and
 * nine without, but people write partial and foreign numbers too — "97 78 78
 * 78" is eight and unmistakably a number to call. Below eight the odds flip
 * towards house numbers, quantities and years.
 */
function hasPhoneRun(text: string): boolean {
  const cleaned = withoutDatesAndPrices(text)

  // Separators people put between digits, removed before counting.
  const squashed = cleaned.replace(/[\s.\-()/_+]/g, '')
  if (/\d{8,}/.test(squashed)) return true

  // Digits spelled out, possibly mixed with figures: "nul 6 vijf negen…"
  const tokens = cleaned.toLowerCase().split(/[^a-zà-ÿ0-9]+/).filter(Boolean)
  let run = ''
  for (const tok of tokens) {
    const d = /^\d+$/.test(tok) ? tok : WORD_DIGITS[tok]
    if (d) {
      run += d
      if (run.length >= 8) return true
    } else {
      run = ''
    }
  }
  return false
}

export type ContactHit = 'phone' | 'email' | 'handle' | 'off_platform'

/** What the message appears to be sharing, or null if nothing stands out. */
export function detectContact(text?: string | null): ContactHit | null {
  if (!text) return null
  if (EMAIL.test(text)) return 'email'
  if (hasPhoneRun(text)) return 'phone'
  if (HANDLE.test(text)) return 'handle'
  // Naming another app only counts alongside something that looks like a
  // handle or a number — "I'll send the photos on WhatsApp" is not an attempt
  // to leave, and blocking it would be absurd.
  if (OFF_PLATFORM.test(text) && /\d{6,}|@[A-Za-z0-9._]{3,}/.test(text)) return 'off_platform'
  return null
}
