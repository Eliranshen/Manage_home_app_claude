export interface PersonColors {
  eliran: string
  amit: string
  or: string
  aviv: string
  sivan: string
}

export interface Theme {
  id: string
  name: string
  accent: string   // "r g b" for CSS rgb()
  bg: string       // "r g b" main background
  surf: string     // "r g b" card / surface
  personColors: PersonColors
}

export const THEMES: Theme[] = [
  {
    id: 'night',
    name: 'לילה',
    accent: '99 102 241',
    bg: '3 7 18',
    surf: '17 24 39',
    personColors: {
      eliran: '#818cf8',
      amit:   '#34d399',
      or:     '#fb923c',
      aviv:   '#f472b6',
      sivan:  '#94a3b8',
    },
  },
  {
    id: 'ocean',
    name: 'ים',
    accent: '56 189 248',
    bg: '2 10 30',
    surf: '7 20 50',
    personColors: {
      eliran: '#38bdf8',
      amit:   '#818cf8',
      or:     '#34d399',
      aviv:   '#fbbf24',
      sivan:  '#94a3b8',
    },
  },
  {
    id: 'forest',
    name: 'יער',
    accent: '52 211 153',
    bg: '3 12 8',
    surf: '8 26 15',
    personColors: {
      eliran: '#4ade80',
      amit:   '#60a5fa',
      or:     '#fb923c',
      aviv:   '#f472b6',
      sivan:  '#fbbf24',
    },
  },
  {
    id: 'crimson',
    name: 'לוהט',
    accent: '251 113 133',
    bg: '15 4 4',
    surf: '30 8 8',
    personColors: {
      eliran: '#fb7185',
      amit:   '#fb923c',
      or:     '#fbbf24',
      aviv:   '#c084fc',
      sivan:  '#94a3b8',
    },
  },
  {
    id: 'purple',
    name: 'סגול',
    accent: '167 139 250',
    bg: '8 5 18',
    surf: '18 12 38',
    personColors: {
      eliran: '#a78bfa',
      amit:   '#60a5fa',
      or:     '#34d399',
      aviv:   '#f472b6',
      sivan:  '#fbbf24',
    },
  },
]

export const DEFAULT_THEME = THEMES[0]
