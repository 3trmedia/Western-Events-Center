// Timezone-safe helpers for the availability calendar.
//
// The venue is in Provo, UT. Vercel's serverless functions run in UTC by
// default, while local dev typically runs in the developer's own timezone.
// Any code that calls `.toISOString()` or `toLocaleTimeString()` without an
// explicit `timeZone` silently uses the RUNTIME's local timezone — meaning
// events land on different days / show different times in prod vs. dev.
// Every date computation here is explicit about which timezone it means.

export const VENUE_TZ = 'America/Denver';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

// Canonical "YYYY-MM-DD" for a plain calendar day — no timezone involved,
// used for pure calendar math (which weekday is the 1st, how many days
// in the month, etc).
export function ymd(year: number, month1to12: number, day: number): string {
  return `${year}-${pad(month1to12)}-${pad(day)}`;
}

// Which calendar day (in the venue's timezone) does this instant fall on?
// This is the one true way to bucket an ICS event into "booked on July 3rd"
// — never use toISOString().slice(0, 10) for this, it uses UTC.
export function dateKeyInVenueTZ(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: VENUE_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

// Wall-clock time in the venue's timezone, e.g. "6:00 PM".
export function formatTimeInVenueTZ(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    timeZone: VENUE_TZ,
    hour: 'numeric',
    minute: '2-digit',
  });
}

// Number of days in a given month (1-12), using pure UTC calendar math so
// the result never depends on the server's local timezone.
export function daysInMonth(year: number, month1to12: number): number {
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
}

// Day of week (0 = Sunday) for the 1st of the month, pure UTC calendar math.
export function firstWeekdayOfMonth(year: number, month1to12: number): number {
  return new Date(Date.UTC(year, month1to12 - 1, 1)).getUTCDay();
}
