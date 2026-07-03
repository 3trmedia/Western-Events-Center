import type { APIRoute } from 'astro';
import ical from 'node-ical';
import { dateKeyInVenueTZ, daysInMonth, ymd } from '../../lib/calendar-dates';

export const prerender = false;

// AVAILABILITY_ICS_URL is set in Vercel project env vars (and locally in .env).
// Never hardcode it here — the URL contains a secret token that grants read access
// to the calendar's private event data.
const CALENDAR_ICS_URL = import.meta.env.AVAILABILITY_ICS_URL;

export const GET: APIRoute = async ({ url }) => {
  if (!CALENDAR_ICS_URL) {
    return new Response(
      JSON.stringify({ error: 'AVAILABILITY_ICS_URL is not set' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const now = new Date();
  const year = Number(url.searchParams.get('year')) || now.getFullYear();
  const month = Number(url.searchParams.get('month')) || now.getMonth() + 1; // 1-12
  const numDays = daysInMonth(year, month);

  // Query a window padded a day on each side of the target month — the ICS
  // query window is just a net to catch occurrences; which calendar day
  // (in the venue's timezone) each occurrence actually lands on is decided
  // below via dateKeyInVenueTZ, not by this window's boundaries.
  const queryStart = new Date(Date.UTC(year, month - 1, 1) - 24 * 60 * 60 * 1000);
  const queryEnd = new Date(Date.UTC(year, month - 1, numDays, 23, 59, 59) + 24 * 60 * 60 * 1000);

  const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;

  try {
    const data = await ical.async.fromURL(CALENDAR_ICS_URL);

    const bookedDays = new Set<string>();

    const addIfInMonth = (date: Date) => {
      const key = dateKeyInVenueTZ(date);
      if (key.startsWith(monthPrefix)) bookedDays.add(key);
    };

    for (const key in data) {
      const event = data[key];
      if (event.type !== 'VEVENT') continue;

      if (event.rrule) {
        const occurrences = event.rrule.between(queryStart, queryEnd, true);
        for (const date of occurrences) addIfInMonth(date);
      } else if (event.start) {
        addIfInMonth(new Date(event.start));
      }
    }

    // Only booked/not-booked is exposed publicly — event titles from the
    // calendar (renter names, event descriptions) are never sent to the client.
    const days = [];
    for (let day = 1; day <= numDays; day++) {
      const dateKey = ymd(year, month, day);
      days.push({
        date: dateKey,
        booked: bookedDays.has(dateKey),
      });
    }

    return new Response(JSON.stringify({ year, month, days }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=1800, s-maxage=1800',
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Could not load availability' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
