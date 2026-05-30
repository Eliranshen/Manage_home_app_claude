import { PEOPLE, DEFAULT_OWNER_ID, type Person } from '../config/people'

// Returns true when `word` (a single whitespace-delimited token from a title)
// is an exact match for `name`, OR is a Hebrew prefix string followed by `name`.
// Prefixes checked: ל ו ש ב כ ה מ (one or more, in any combination).
//
// Examples for name="אור":
//   "אור"    → true  (exact)
//   "לאור"   → true  (ל + אור)
//   "ולאור"  → true  (ו + ל + אור)
//   "אורלי"  → false ("אורלי" does not end with "אור")
//   "לאורלי" → false ("לאורלי" does not end with "אור")
function wordMatchesName(word: string, name: string): boolean {
  if (word === name) return true
  if (!word.endsWith(name)) return false
  const prefix = word.slice(0, word.length - name.length)
  return /^[ולשבכהמ]+$/.test(prefix)
}

const defaultOwner = PEOPLE.find((p) => p.id === DEFAULT_OWNER_ID)!

export function classifyEvent(title: string): Person {
  const words = title.trim().split(/\s+/)

  for (const person of PEOPLE) {
    if (person.id === DEFAULT_OWNER_ID) continue
    const names = [person.name, ...person.aliases]
    if (words.some((w) => names.some((n) => wordMatchesName(w, n)))) {
      return person
    }
  }

  return defaultOwner
}
