# ManageHomeApp — הוראות פרויקט ל-Claude Code

## מה זה
PWA משפחתי לניהול הבית, בעברית, RTL מלא, dark mode.
שלב נוכחי: לו"ז שבועי שמושך אירועים מ-Google Calendar ומסווג אותם לפי בני הבית.
בהמשך יתווספו רשימת קניות ומודולים נוספים.
המשתמשים: אני ואשתי, בנייד (מותקן כ-PWA).

## Stack
- Vite 5 + React + TypeScript
- Tailwind 3
- vite-plugin-pwa
- Google Identity Services (GIS) — OAuth בצד הלקוח
- Google Calendar API v3 (read-only)
- ללא backend בשלב זה

## החלטות ארכיטקטורה (אל תשנה בלי לשאול)
- **PWA, לא native** — קוד אחד, מותקן על מסך הבית, מתעדכן אוטומטית.
- **היומן הוא מקור האמת** — האפליקציה read-only, לא כותבת ליומן.
- **OAuth בצד הלקוח** עם `initTokenClient`, scope `calendar.readonly`.
  ה-Client ID נקרא מ-`import.meta.env.VITE_GOOGLE_CLIENT_ID`.
- **Token בזיכרון בלבד, לא ב-localStorage.** רענון משתמש ב-re-auth שקט (`prompt: ''`).
- **סיווג לפי שם בכותרת האירוע**, לא לפי יומנים נפרדים.

## סיווג אירועים
- מרשם אנשים: `src/config/people.ts` — לכל אדם: id, שם, סוג (child/parent), צבע, aliases.
- התאמת **מילה שלמה** בכותרת, עם התעלמות מאות שימוש בעברית (ל / ו / ש / ב / כ / ה / מ).
- **לא substring** — "אור" מתאים ל"אור" ול"לאור", אבל לא ל"אורלי".
- כמה שמות באירוע → משויך לכולם, בכל הצבעים.
- ללא שם מזוהה → ברירת מחדל ל-default owner (אני) + תגית "כללי".

## קונבנציות
- כל ה-UI בעברית, RTL מלא (`dir="rtl"`), dark mode.
- TypeScript נקי (ללא שגיאות) לפני סיום כל שלב.
- שמות משתנים ומונחים טכניים באנגלית; טקסט שמופנה למשתמש — בעברית.

## סטטוס נוכחי
- [x] שלב 1 — שלד הפרויקט (Vite + React + TS + Tailwind + PWA, RTL, dark mode)
- [x] שלב 2 — OAuth: התחברות/התנתקות, טיפול בתפוגת token, re-auth שקט
- [x] שלב 3 — שליפת אירועי השבוע מ-calendarId='primary'
- [X] שלב 4 — סיווג לפי אדם + תצוגה מחולקת לימים (ראשון–שבת) + סינון לפי אדם
- [x] שלב 5 — התקנה כ-PWA (סיום שלב הליבה)

## Roadmap (אחרי הליבה)
- רשימת קניות משותפת
- מעבר ל-Supabase עבור state משותף (מרשם אנשים, קניות) — free tier
- פריסה ב-Vercel (להוסיף את כתובת ה-production ל-Authorized JavaScript origins בגוגל)
- שיתוף האפליקציה בין שני המשתמשים

## Gotchas
- כתובת ה-dev `http://localhost:5173` חייבת להיות רשומה ב-Authorized JavaScript origins
  ב-Google Auth Platform. אם Vite עולה על פורט אחר — להוסיף גם אותו.
- מצב Testing בגוגל: רק test users (אני + אשתי) יכולים להתחבר. מסך
  "Google hasn't verified this app" תקין — Advanced → Continue.
- אזהרות Cross-Origin-Opener-Policy מ-GIS ב-console הן בדרך כלל רעש לא מזיק.

## אופן עבודה
- בנייה צעד-צעד. לעצור בסוף כל שלב ולחכות לאישור לפני המעבר לשלב הבא.
- לא לבנות backend או פיצ'רים עתידיים לפני ששלב הליבה עובד.
