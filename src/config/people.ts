export type PersonType = 'child' | 'parent'

export interface Person {
  id: string
  name: string
  type: PersonType
  color: string      // CSS color used for badges and indicators
  aliases: string[]  // additional names to match in event titles
}

// The person whose id matches DEFAULT_OWNER_ID gets events that match no one else.
export const DEFAULT_OWNER_ID = 'eliran'

export const PEOPLE: Person[] = [
  {
    id: 'amit',
    name: 'עמית',
    type: 'child',
    color: '#818cf8', // indigo-400
    aliases: [],
  },
  {
    id: 'or',
    name: 'אור',
    type: 'child',
    color: '#34d399', // emerald-400
    aliases: [],
  },
    {
    id: 'aviv',
    name: 'אביב',
    type: 'child',
    color: '#fb923c', // orange-400
    aliases: [],
  },
  {
    id: 'eliran',
    name: 'אלירן',
    type: 'parent',
    color: '#6c67c7', // orange-400
    aliases: [],
  },
    {
    id: 'sivan',
    name: 'סיון',
    type: 'parent',
    color: '#935f11', // orange-400
    aliases: [],
  },
]
