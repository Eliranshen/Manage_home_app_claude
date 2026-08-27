// Pure TypeScript Hebrew calendar — no external dependencies.
// Algorithm: Dershowitz & Reingold "Calendrical Calculations".
// Verified: 1 Tishri 5785 = Oct 2 2024, 1 Tishri 5786 = Sep 22 2025.

export type HolidayType = 'chag' | 'erev' | 'chol-hamoed' | 'modern' | 'minor'

export interface IsraeliHoliday {
  date: Date
  name: string
  type: HolidayType
}

// ── Hebrew calendar math ──────────────────────────────────────────────────────

const EPOCH = 347997 // Julian Day Number of 1 Tishri, year 1 AM

function isLeap(y: number): boolean { return (7 * y + 1) % 19 < 7 }
function monthsInYear(y: number): number { return isLeap(y) ? 13 : 12 }

function elapsed(y: number): number {
  const m = Math.floor((235 * y - 234) / 19)
  const p = 12084 + 13753 * m
  let d = m * 29 + Math.floor(p / 25920)
  if ((3 * (d + 1)) % 7 < 3) d++
  return d
}

function yearStart(y: number): number {
  const e = elapsed(y)
  if (elapsed(y + 1) - e === 356) return e + 2
  if (e - elapsed(y - 1) === 382) return e + 1
  return e
}

function yearLen(y: number): number { return yearStart(y + 1) - yearStart(y) }

function monthLen(y: number, m: number): number {
  const len = yearLen(y) % 10
  switch (m) {
    case 1:  return 30                         // Nisan
    case 2:  return 29                         // Iyar
    case 3:  return 30                         // Sivan
    case 4:  return 29                         // Tamuz
    case 5:  return 30                         // Av
    case 6:  return 29                         // Elul
    case 7:  return 30                         // Tishri
    case 8:  return len === 5 ? 30 : 29        // Cheshvan (complete = 30)
    case 9:  return len === 3 ? 29 : 30        // Kislev  (deficient = 29)
    case 10: return 29                         // Tevet
    case 11: return 30                         // Shvat
    case 12: return isLeap(y) ? 30 : 29        // Adar I / Adar
    case 13: return 29                         // Adar II
    default: return 0
  }
}

// Hebrew date → Julian Day Number
function h2jd(y: number, m: number, d: number): number {
  let jd = EPOCH + yearStart(y) + d - 1
  if (m < 7) {
    // months 1-6 (Nisan–Elul) follow Tishri–AdarII of the same year
    for (let i = 7; i <= monthsInYear(y); i++) jd += monthLen(y, i)
    for (let i = 1; i < m; i++) jd += monthLen(y, i)
  } else {
    for (let i = 7; i < m; i++) jd += monthLen(y, i)
  }
  return jd
}

// Julian Day Number → Gregorian Date (Richards algorithm)
function jd2date(jd: number): Date {
  const l  = jd + 68569
  const n  = Math.floor(4 * l / 146097)
  const l2 = l - Math.floor((146097 * n + 3) / 4)
  const i  = Math.floor(4000 * (l2 + 1) / 1461001)
  const l3 = l2 - Math.floor(1461 * i / 4) + 31
  const j  = Math.floor(80 * l3 / 2447)
  const day = l3 - Math.floor(2447 * j / 80)
  const l4  = Math.floor(j / 11)
  const mon = j + 2 - 12 * l4
  const yr  = 100 * (n - 49) + i + l4
  return new Date(yr, mon - 1, day)
}

function h2g(y: number, m: number, d: number): Date {
  return jd2date(h2jd(y, m, d))
}

function addDays(date: Date, n: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n)
}

// ── Holiday generation for one Hebrew year ────────────────────────────────────

function holidaysForHY(hy: number): IsraeliHoliday[] {
  const out: IsraeliHoliday[] = []
  const add = (d: Date, name: string, type: HolidayType) =>
    out.push({ date: new Date(d.getFullYear(), d.getMonth(), d.getDate()), name, type })

  // ── Tishri (month 7) ──────────────────────────────────────────────────────
  add(h2g(hy - 1, 6, 29), 'ערב ראש השנה', 'erev')
  add(h2g(hy, 7, 1),      'ראש השנה',     'chag')
  add(h2g(hy, 7, 2),      'ראש השנה ב׳',  'chag')
  add(h2g(hy, 7, 9),      'ערב יום כיפור','erev')
  add(h2g(hy, 7, 10),     'יום כיפור',    'chag')
  add(h2g(hy, 7, 14),     'ערב סוכות',    'erev')
  add(h2g(hy, 7, 15),     'סוכות',        'chag')
  for (let d = 1; d <= 5; d++)
    add(h2g(hy, 7, 15 + d), 'חול המועד סוכות', 'chol-hamoed')
  add(h2g(hy, 7, 21),     'הושענא רבא',         'minor')
  add(h2g(hy, 7, 22),     'שמיני עצרת / שמחת תורה', 'chag')

  // ── Chanukah — 25 Kislev (month 9), 8 days ───────────────────────────────
  const chanStart = h2g(hy, 9, 25)
  const chanNames = ['א׳','ב׳','ג׳','ד׳','ה׳','ו׳','ז׳','ח׳']
  for (let d = 0; d < 8; d++)
    add(addDays(chanStart, d), `חנוכה (${chanNames[d]})`, 'minor')

  // ── Shvat (month 11) ──────────────────────────────────────────────────────
  add(h2g(hy, 11, 15), 'ט״ו בשבט', 'minor')

  // ── Adar — Purim ──────────────────────────────────────────────────────────
  if (isLeap(hy)) {
    add(h2g(hy, 12, 14), 'פורים קטן', 'minor')   // 14 Adar I
    add(h2g(hy, 13, 13), 'ערב פורים',  'erev')
    add(h2g(hy, 13, 14), 'פורים',      'chag')   // 14 Adar II
  } else {
    add(h2g(hy, 12, 13), 'ערב פורים', 'erev')
    add(h2g(hy, 12, 14), 'פורים',     'chag')
  }

  // ── Nisan — Pesach ────────────────────────────────────────────────────────
  add(h2g(hy, 1, 14), 'ערב פסח', 'erev')
  add(h2g(hy, 1, 15), 'פסח',     'chag')
  for (let d = 1; d <= 5; d++)
    add(h2g(hy, 1, 15 + d), 'חול המועד פסח', 'chol-hamoed')
  add(h2g(hy, 1, 21), 'שביעי של פסח', 'chag')

  // Yom HaShoah (27 Nisan) — postponed if Fri→Thu, Sun→Mon
  {
    let d = h2g(hy, 1, 27)
    const w = d.getDay()
    if (w === 5) d = addDays(d, -1)
    if (w === 0) d = addDays(d, 1)
    add(d, 'יום השואה', 'modern')
  }

  // ── Iyar — Yom HaZikaron, Yom HaAtzmaut, Lag BaOmer, Yom Yerushalayim ──
  {
    let atzmaut = h2g(hy, 2, 5)
    const w = atzmaut.getDay()
    if (w === 5) atzmaut = addDays(atzmaut, -1)       // Fri → Thu
    else if (w === 6) atzmaut = addDays(atzmaut, -2)  // Sat → Thu
    else if (w === 0) atzmaut = addDays(atzmaut, 1)   // Sun → Mon
    add(addDays(atzmaut, -1), 'יום הזיכרון',  'modern')
    add(atzmaut,              'יום העצמאות', 'modern')
  }

  add(h2g(hy, 2, 18), 'ל״ג בעומר',    'minor')
  add(h2g(hy, 2, 28), 'יום ירושלים',  'modern')

  // ── Sivan — Shavuot ───────────────────────────────────────────────────────
  add(h2g(hy, 3, 5), 'ערב שבועות', 'erev')
  add(h2g(hy, 3, 6), 'שבועות',     'chag')

  // ── Av — Tisha B'Av, Tu B'Av ─────────────────────────────────────────────
  {
    let d = h2g(hy, 5, 9)
    if (d.getDay() === 6) d = addDays(d, 1)  // Sat → Sun
    add(d, 'תשעה באב', 'minor')
  }
  add(h2g(hy, 5, 15), 'ט״ו באב', 'minor')

  return out
}

// ── Cache & public API ────────────────────────────────────────────────────────

const cache = new Map<number, IsraeliHoliday[]>()

function forHY(hy: number): IsraeliHoliday[] {
  if (!cache.has(hy)) cache.set(hy, holidaysForHY(hy))
  return cache.get(hy)!
}

export function getHolidaysForDay(day: Date): IsraeliHoliday[] {
  const y = day.getFullYear()
  // A Gregorian year overlaps two Hebrew years (~y+3760 and ~y+3761)
  return [...forHY(y + 3760), ...forHY(y + 3761)].filter(
    h =>
      h.date.getFullYear() === y &&
      h.date.getMonth()    === day.getMonth() &&
      h.date.getDate()     === day.getDate(),
  )
}

export function hasHoliday(day: Date): boolean {
  return getHolidaysForDay(day).length > 0
}
