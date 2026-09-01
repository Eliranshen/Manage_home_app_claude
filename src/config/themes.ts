export interface Theme {
  id: string
  name: string
  rgb: string // "r g b" for CSS rgb()
}

export const THEMES: Theme[] = [
  { id: 'indigo',  name: 'סגול',    rgb: '99 102 241'  },
  { id: 'blue',    name: 'כחול',    rgb: '59 130 246'  },
  { id: 'teal',    name: 'טורקיז',  rgb: '20 184 166'  },
  { id: 'rose',    name: 'ורוד',    rgb: '244 63 94'   },
]

export const DEFAULT_THEME = THEMES[0]
