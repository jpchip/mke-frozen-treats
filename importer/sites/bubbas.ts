import type { Browser } from "npm:puppeteer";
import { MkeFrozenTreatsImporter } from "../importer.interface.ts";

// Bubba's runs on Popmenu, and the HTML pages (including /events) sit behind a
// Cloudflare managed challenge that blocks headless Chrome regardless of stealth
// plugins or spoofed headers. Popmenu's GraphQL API is not challenged and serves
// the same calendar data the page renders, so we query it directly instead of
// scraping the DOM.
const GRAPHQL_URL = 'https://www.bubbasfrozencustard.com/graphql';

// Popmenu restaurant id for Bubba's; found in the page's Apollo state as
// "restaurantId":10778. Stable per restaurant/domain.
const RESTAURANT_ID = 10778;

interface CalendarEventRecord {
    name: string;
    startAt: string;
    isAllDay: boolean;
}

interface CalendarEventsResponse {
    data?: {
        calendarEvents?: {
            records: CalendarEventRecord[];
        };
    };
    // deno-lint-ignore no-explicit-any
    errors?: any;
}

export async function load(_browser: Browser, _site: MkeFrozenTreatsImporter.Site): Promise<string> {
    console.log('Loading Bubbas...');

    const response = await fetch(GRAPHQL_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Origin': 'https://www.bubbasfrozencustard.com',
            'Referer': 'https://www.bubbasfrozencustard.com/events',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        body: JSON.stringify({
            query: `{ calendarEvents(restaurantId: ${RESTAURANT_ID}) { records { name startAt isAllDay } } }`,
        }),
    });

    if (!response.ok) {
        throw new Error(`Bubbas GraphQL request failed with status ${response.status}`);
    }

    const json: CalendarEventsResponse = await response.json();

    if (json.errors || !json.data?.calendarEvents?.records) {
        throw new Error(`Bubbas GraphQL request returned errors: ${JSON.stringify(json.errors)}`);
    }

    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());

    const flavorEvent = json.data.calendarEvents.records.find(
        (record) => record.isAllDay && record.startAt === today
    );

    if (!flavorEvent) {
        throw new Error(`No flavor of the day found for ${today}`);
    }

    return flavorEvent.name.trim();
}
