import { HebrewCalendar, flags } from '@hebcal/core'

export type HolidayType = 'chag' | 'erev' | 'chol-hamoed' | 'modern' | 'minor'

export interface IsraeliHoliday {
  date: Date
  name: string
  type: HolidayType
}

// Map @hebcal/core English descriptions → Hebrew names
const NAME_MAP: Record<string, string> = {
  // Rosh Hashana
  'Rosh Hashana': 'ראש השנה',
  'Rosh Hashana 1': 'ראש השנה',
  'Rosh Hashana 2': 'ראש השנה (יום ב׳)',
  'Erev Rosh Hashana': 'ערב ראש השנה',
  // Yom Kippur
  'Yom Kippur': 'יום כיפור',
  'Erev Yom Kippur': 'ערב יום כיפור',
  // Sukkot
  'Sukkot I': 'סוכות',
  'Sukkot II': 'סוכות (יום ב׳)',
  "Sukkot III (CH''M)": 'חול המועד סוכות',
  "Sukkot IV (CH''M)": 'חול המועד סוכות',
  "Sukkot V (CH''M)": 'חול המועד סוכות',
  "Sukkot VI (CH''M)": 'חול המועד סוכות',
  'Sukkot VII (Hoshana Raba)': 'הושענא רבא',
  'Shemini Atzeret': 'שמיני עצרת',
  'Simchat Torah': 'שמחת תורה',
  'Erev Sukkot': 'ערב סוכות',
  // Chanukah
  'Chanukah: 1 Candle': 'חנוכה (יום א׳)',
  'Chanukah: 2 Candles': 'חנוכה (יום ב׳)',
  'Chanukah: 3 Candles': 'חנוכה (יום ג׳)',
  'Chanukah: 4 Candles': 'חנוכה (יום ד׳)',
  'Chanukah: 5 Candles': 'חנוכה (יום ה׳)',
  'Chanukah: 6 Candles': 'חנוכה (יום ו׳)',
  'Chanukah: 7 Candles': 'חנוכה (יום ז׳)',
  'Chanukah: 8 Candles': 'חנוכה (יום ח׳)',
  // Winter / Spring
  'Tu BiShvat': 'ט״ו בשבט',
  'Purim': 'פורים',
  'Shushan Purim': 'שושן פורים',
  'Erev Purim': 'ערב פורים',
  // Pesach
  'Erev Pesach': 'ערב פסח',
  'Pesach I': 'פסח',
  'Pesach II': 'פסח (יום ב׳)',
  "Pesach II (CH''M)": 'חול המועד פסח',
  "Pesach III (CH''M)": 'חול המועד פסח',
  "Pesach IV (CH''M)": 'חול המועד פסח',
  "Pesach V (CH''M)": 'חול המועד פסח',
  "Pesach VI (CH''M)": 'חול המועד פסח',
  'Pesach VII': 'שביעי של פסח',
  'Pesach VIII': 'אחרון של פסח',
  // Modern Israeli holidays
  'Yom HaShoah': 'יום השואה',
  'Yom HaZikaron': 'יום הזיכרון',
  "Yom HaAtzma'ut": 'יום העצמאות',
  "Lag B'Omer": 'ל״ג בעומר',
  'Yom Yerushalayim': 'יום ירושלים',
  // Shavuot
  'Erev Shavuot': 'ערב שבועות',
  'Shavuot': 'שבועות',
  'Shavuot I': 'שבועות',
  'Shavuot II': 'שבועות (יום ב׳)',
  // Summer / other
  "Tisha B'Av": 'תשעה באב',
  "Tu B'Av": 'ט״ו באב',
  'Rosh Hashana LaBehemot': 'ראש השנה לבהמות',
}

function toHebrewName(desc: string): string {
  if (NAME_MAP[desc]) return NAME_MAP[desc]
  // Fallback: Chanukah prefix
  if (desc.startsWith('Chanukah')) return `חנוכה`
  return desc
}

function toType(eventFlags: number): HolidayType {
  if (eventFlags & flags.EREV) return 'erev'
  if (eventFlags & flags.CHOL_HAMOED) return 'chol-hamoed'
  if (eventFlags & flags.MODERN_HOLIDAY) return 'modern'
  if (eventFlags & flags.CHAG) return 'chag'
  return 'minor'
}

const MASK =
  flags.CHAG |
  flags.EREV |
  flags.CHOL_HAMOED |
  flags.MODERN_HOLIDAY |
  flags.MINOR_HOLIDAY

const cache = new Map<number, IsraeliHoliday[]>()

function forGregorianYear(year: number): IsraeliHoliday[] {
  if (cache.has(year)) return cache.get(year)!

  try {
    const events = HebrewCalendar.calendar({
      year,
      isHebrewYear: false,
      il: true,
      candlelighting: false,
      sedrot: false,
      omer: false,
      shabbat: false,
      mask: MASK,
    })

    const holidays: IsraeliHoliday[] = events
      .filter(e => !(e.getFlags() & flags.CHUL_ONLY))
      .map(e => {
        const greg = e.getDate().greg()
        return {
          date: new Date(greg.getFullYear(), greg.getMonth(), greg.getDate()),
          name: toHebrewName(e.getDesc()),
          type: toType(e.getFlags()),
        }
      })

    cache.set(year, holidays)
    return holidays
  } catch {
    return []
  }
}

export function getHolidaysForDay(day: Date): IsraeliHoliday[] {
  const y = day.getFullYear()
  // A single Gregorian year covers most of one Hebrew year; check adjacent too
  const pool = [...forGregorianYear(y - 1), ...forGregorianYear(y), ...forGregorianYear(y + 1)]
  return pool.filter(
    h =>
      h.date.getFullYear() === day.getFullYear() &&
      h.date.getMonth() === day.getMonth() &&
      h.date.getDate() === day.getDate(),
  )
}

export function hasHoliday(day: Date): boolean {
  return getHolidaysForDay(day).length > 0
}
