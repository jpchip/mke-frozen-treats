import type { Browser } from "npm:puppeteer";
import { MkeFrozenTreatsImporter } from "../importer.interface.ts";

// Bubba's runs on Popmenu. The restaurant HTML (including /events) sits behind
// a Cloudflare managed challenge that blocks headless Chrome, and the same
// zone's /graphql alias 403s DigitalOcean / other datacenter IPs. Popmenu's
// own GraphQL host is not under that bot-fight policy and serves the same
// calendar the page renders, so we query it directly.
const GRAPHQL_URL = 'https://api.popmenu.com/graphql';
const GRAPHQL_ORIGIN = 'https://api.popmenu.com/';

// Popmenu restaurant id for Bubba's; found in the page's Apollo state as
// "restaurantId":10778. Stable per restaurant/domain.
const RESTAURANT_ID = 10778;
const CALENDAR_QUERY =
    `{ calendarEvents(restaurantId: ${RESTAURANT_ID}) { records { name startAt isAllDay } } }`;

const BROWSER_USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

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

interface GraphQlHttpResult {
    status: number;
    body: string;
}

function graphqlHeaders(): Record<string, string> {
    return {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Origin': 'https://www.bubbasfrozencustard.com',
        'Referer': 'https://www.bubbasfrozencustard.com/events',
        'User-Agent': BROWSER_USER_AGENT,
        'Accept-Language': 'en-US,en;q=0.9',
    };
}

async function fetchViaDeno(): Promise<GraphQlHttpResult> {
    const response = await fetch(GRAPHQL_URL, {
        method: 'POST',
        headers: graphqlHeaders(),
        body: JSON.stringify({ query: CALENDAR_QUERY }),
    });

    return { status: response.status, body: await response.text() };
}

async function fetchViaBrowser(browser: Browser): Promise<GraphQlHttpResult> {
    const page = await browser.newPage();
    try {
        await page.setUserAgent(BROWSER_USER_AGENT);
        // A real document load picks up Cloudflare's __cf_bm cookie. The API
        // root is a 404 page, but it is same-origin with /graphql and is not
        // behind the restaurant site's managed challenge.
        await page.goto(GRAPHQL_ORIGIN, { waitUntil: 'domcontentloaded', timeout: 15000 });

        return await page.evaluate(async (url: string, query: string) => {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Origin': 'https://www.bubbasfrozencustard.com',
                    'Referer': 'https://www.bubbasfrozencustard.com/events',
                },
                body: JSON.stringify({ query }),
                credentials: 'include',
            });
            return { status: response.status, body: await response.text() };
        }, GRAPHQL_URL, CALENDAR_QUERY);
    } finally {
        await page.close();
    }
}

function summarizeBody(body: string): string {
    return body.replace(/\s+/g, ' ').trim().slice(0, 180);
}

export async function load(browser: Browser, _site: MkeFrozenTreatsImporter.Site): Promise<string> {
    console.log('Loading Bubbas...');

    let result = await fetchViaDeno();
    if (result.status === 403) {
        console.log('Bubbas GraphQL got 403 from this host, retrying through the browser...');
        result = await fetchViaBrowser(browser);
    }

    if (result.status !== 200) {
        throw new Error(
            `Bubbas GraphQL request failed with status ${result.status}: ${summarizeBody(result.body)}`,
        );
    }

    const json: CalendarEventsResponse = JSON.parse(result.body);

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
