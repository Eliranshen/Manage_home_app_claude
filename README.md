# ManageHomeApp

A family home-management PWA — currently a **Google Calendar weekly agenda** that automatically classifies events by family member. Built solo, in Hebrew with full RTL support, designed to be installed like a native app on mobile.

**Use case:** two parents, three kids, one shared Google Calendar. The app reads the week's events and figures out — from the event title alone — who each event belongs to, then renders a color-coded, per-person, day-by-day view.

## Features

- **Google OAuth sign-in** via Google Identity Services, with persistent login (token cached in `localStorage`) and silent, automatic token refresh before expiry — no repeated login prompts.
- **Weekly calendar view** (Sunday–Saturday) pulled live from Google Calendar, with week navigation.
- **Automatic event classification by person** — no manual tagging. Each event title is matched against a configurable roster of family members, including correct handling of Hebrew prefix letters (ל/ו/ש/ב/כ/ה/מ) so "לאור" matches "אור" but "אורלי" doesn't.
- **Multi-person events** — an event mentioning two names is shown under both, each in their own color.
- **Filter by person**, with a sensible default bucket for unassigned events.
- **Event search** across the calendar with paginated "load more" results.
- **Installable PWA** — add to home screen, works like a native app, auto-updates.
- **Dark mode**, full RTL Hebrew UI throughout.

## Tech stack

| Layer | Choice |
|---|---|
| Framework | React 18 + TypeScript, built with Vite 5 |
| Styling | Tailwind CSS 3 |
| PWA | `vite-plugin-pwa` (Workbox-based service worker) |
| Auth | Google Identity Services (`initTokenClient`), OAuth 2.0, `calendar.readonly` scope, entirely client-side |
| Data | Google Calendar API v3 — read-only, no backend |

## Architecture notes

- **The calendar is the single source of truth.** The app never writes to Google Calendar — strictly read-only.
- **No backend (yet).** OAuth and API calls happen entirely in the browser. Auth tokens live in `localStorage`, refreshed silently a few minutes before expiry.
- **Classification is title-based, not calendar-based.** Rather than requiring separate calendars per family member, the app parses event titles against a small roster (`src/config/people.ts`) using whole-word matching with Hebrew prefix awareness (`src/utils/classifyEvent.ts`) — so one shared calendar stays the single input.

## Running locally

```bash
npm install
npm run dev
```

Requires a Google OAuth Client ID (Google Cloud Console → OAuth 2.0 Client, Web application) exposed as an env var:

```
VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

`http://localhost:5173` (or whatever port Vite picks) must be added to **Authorized JavaScript origins** on that OAuth client.

## Roadmap

- Shared shopping list
- Move shared state (people roster, shopping list) to Supabase for multi-device sync
- Deploy to Vercel
- Share the app between both household members' devices

## Status

Core calendar module complete: OAuth, weekly fetch, per-person classification, filtering, search, and PWA install are all working end-to-end. Next up is the shared shopping list module.
