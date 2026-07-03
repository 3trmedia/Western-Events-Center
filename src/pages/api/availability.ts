import type { APIRoute } from 'astro';
import ical from 'node-ical';

export const prerender = false;

// AVAILABILITY_ICS_URL is set in Vercel project env vars (and locally in .env).
// Never hardcode it here — the URL contains a secret token that grants read access
// to the calendar's private event data.
const CALENDAR_ICS_URL = import.meta.env.AVAILABILITY_ICS_URL;
const DAYS_AHEAD = 21;

export const GET: APIRoute = async () => {
  if (!CALENDAR_ICS_URL) {
    return new Response(
      JSON.stringify({ error: 'AVAILABILITY_ICS_URL is not set' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const data = await ical.async.fromURL(CALENDAR_ICS_URL);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + DAYS_AHEAD);

    const bookedDays = new Set<string>();

    for (const key in data) {
      const event = data[key];
      if (event.type !== 'VEVENT') continue;

      if (event.rrule) {
        const occurrences = event.rrule.between(today, endDate, true);
        for (const date of occurrences) {
          bookedDays.add(date.toISOString().slice(0, 10));
        }
      } else if (event.start) {
        const start = new Date(event.start);
        if (start >= today && start <= endDate) {
          bookedDays.add(start.toISOString().slice(0, 10));
        }
      }
    }

    // Only booked/not-booked is exposed publicly — event titles from the
    // calendar (renter names, event descriptions) are never sent to the client.
    const days = [];
    for (let i = 0; i < DAYS_AHEAD; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() + i);
      const dateKey = date.toISOString().slice(0, 10);
      days.push({
        date: dateKey,
        booked: bookedDays.has(dateKey),
      });
    }

    return new Response(JSON.stringify({ days }), {
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
