import type { APIRoute } from 'astro';
import ical from 'node-ical';
import { dateKeyInVenueTZ, daysInMonth, formatTimeInVenueTZ, ymd } from '../../lib/calendar-dates';

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

  // See availability.ts — padded query net, actual day bucketing happens via
  // dateKeyInVenueTZ below, not via these boundaries.
  const queryStart = new Date(Date.UTC(year, month - 1, 1) - 24 * 60 * 60 * 1000);
  const queryEnd = new Date(Date.UTC(year, month - 1, numDays, 23, 59, 59) + 24 * 60 * 60 * 1000);

  const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;

  try {
    const data = await ical.async.fromURL(CALENDAR_ICS_URL);

    const eventsByDate = new Map<string, DayEvent[]>();

    const addEvent = (start: Date, title: string, end: Date | null, allDay: boolean) => {
      const dateKey = dateKeyInVenueTZ(start);
      if (!dateKey.startsWith(monthPrefix)) return;

      const time = allDay
        ? 'All Day'
        : end
          ? `${formatTimeInVenueTZ(start)} - ${formatTimeInVenueTZ(end)}`
          : formatTimeInVenueTZ(start);

      if (!eventsByDate.has(dateKey)) eventsByDate.set(dateKey, []);
      eventsByDate.get(dateKey)!.push({ title, time });
    };

    for (const key in data) {
      const event = data[key];
      if (event.type !== 'VEVENT') continue;

      const title = event.summary || 'Reserved';
      const allDay = event.datetype === 'date';

      if (event.rrule) {
        const occurrences = event.rrule.between(queryStart, queryEnd, true);
        const duration =
          event.start && event.end ? new Date(event.end).getTime() - new Date(event.start).getTime() : 0;
        for (const occStart of occurrences) {
          const occEnd = duration ? new Date(occStart.getTime() + duration) : null;
          addEvent(occStart, title, occEnd, allDay);
        }
      } else if (event.start) {
        const start = new Date(event.start);
        const end = event.end ? new Date(event.end) : null;
        addEvent(start, title, end, allDay);
      }
    }

    const days = [];
    for (let day = 1; day <= numDays; day++) {
      const dateKey = ymd(year, month, day);
      days.push({
        date: dateKey,
        events: eventsByDate.get(dateKey) || [],
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
