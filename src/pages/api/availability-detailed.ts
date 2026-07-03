import type { APIRoute } from 'astro';
import ical from 'node-ical';

export const prerender = false;

// AVAILABILITY_ICS_URL is set in Vercel project env vars (and locally in .env).
// Never hardcode it here — the URL contains a secret token that grants read access
// to the calendar's private event data.
//
// Unlike /api/availability, this endpoint DOES expose event titles and times.
// Only use it with calendars where event titles are safe to show publicly
// (event categories like "Wedding" or "Corporate Event"), not calendars where
// titles contain renter names or other private details.
const CALENDAR_ICS_URL = import.meta.env.AVAILABILITY_ICS_URL;

type DayEvent = { title: string; time: string };

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

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

  const rangeStart = new Date(year, month - 1, 1);
  const rangeEnd = new Date(year, month, 0, 23, 59, 59);

  try {
    const data = await ical.async.fromURL(CALENDAR_ICS_URL);

    const eventsByDate = new Map<string, DayEvent[]>();

    const addEvent = (dateKey: string, title: string, start: Date, end: Date | null, allDay: boolean) => {
      const time = allDay
        ? 'All Day'
        : end
          ? `${formatTime(start)} - ${formatTime(end)}`
          : formatTime(start);
      if (!eventsByDate.has(dateKey)) eventsByDate.set(dateKey, []);
      eventsByDate.get(dateKey)!.push({ title, time });
    };

    for (const key in data) {
      const event = data[key];
      if (event.type !== 'VEVENT') continue;

      const title = event.summary || 'Reserved';
      const allDay = event.datetype === 'date';

      if (event.rrule) {
        const occurrences = event.rrule.between(rangeStart, rangeEnd, true);
        const duration =
          event.start && event.end ? new Date(event.end).getTime() - new Date(event.start).getTime() : 0;
        for (const occStart of occurrences) {
          const occEnd = duration ? new Date(occStart.getTime() + duration) : null;
          addEvent(occStart.toISOString().slice(0, 10), title, occStart, occEnd, allDay);
        }
      } else if (event.start) {
        const start = new Date(event.start);
        if (start >= rangeStart && start <= rangeEnd) {
          const end = event.end ? new Date(event.end) : null;
          addEvent(start.toISOString().slice(0, 10), title, start, end, allDay);
        }
      }
    }

    const days = [];
    const cursor = new Date(rangeStart);
    while (cursor <= rangeEnd) {
      const dateKey = cursor.toISOString().slice(0, 10);
      days.push({
        date: dateKey,
        events: eventsByDate.get(dateKey) || [],
      });
      cursor.setDate(cursor.getDate() + 1);
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
