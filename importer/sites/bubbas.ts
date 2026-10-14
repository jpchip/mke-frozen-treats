import type { Browser } from "npm:puppeteer";
import { MkeFrozenTreatsImporter } from "../importer.interface.ts";

// Bubba's runs on Popmenu. Restaurant HTML is behind a Cloudflare managed
// challenge, and GraphQL from DigitalOcean / other datacenter IPs gets the
// same "Just a moment..." page. Popmenu's GraphQL host still serves the
// calendar the page renders, so we query it directly from this machine and
// fall back to Browserless stealth + a residential proxy when Cloudflare
// blocks the droplet.
const GRAPHQL_URL = 'https://api.popmenu.com/graphql';
const GRAPHQL_ORIGIN = 'https://api.popmenu.com/';
const BROWSERLESS_BQL_URL = 'https://production-sfo.browserless.io/stealth/bql';

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

interface BrowserlessBqlResponse {
    data?: {
        goto?: { status?: number };
        solve?: { found?: boolean; solved?: boolean };
        graphql?: { value?: string };
    };
    errors?: Array<{ message?: string }>;
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

function summarizeBody(body: string): string {
    return body.replace(/\s+/g, ' ').trim().slice(0, 180);
}

function looksLikeCloudflareChallenge(status: number, body: string): boolean {
    return status === 403 || /just a moment/i.test(body);
}

async function fetchViaDeno(): Promise<GraphQlHttpResult> {
    const response = await fetch(GRAPHQL_URL, {
        method: 'POST',
        headers: graphqlHeaders(),
        body: JSON.stringify({ query: CALENDAR_QUERY }),
    });

    return { status: response.status, body: await response.text() };
}

async function fetchViaBrowserless(): Promise<GraphQlHttpResult> {
    const token = Deno.env.get('BROWSERLESS_TOKEN');
    if (!token) {
        throw new Error('Bubbas GraphQL is Cloudflare-blocked from this host and BROWSERLESS_TOKEN is not set');
    }

    // The evaluate script is wrapped in an async function by BrowserQL, so
    // `await` / `return` work as they would in page.evaluate.
    const evaluateScript = `
        const response = await fetch(${JSON.stringify(GRAPHQL_URL)}, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Origin': 'https://www.bubbasfrozencustard.com',
                'Referer': 'https://www.bubbasfrozencustard.com/events',
            },
            body: JSON.stringify({ query: ${JSON.stringify(CALENDAR_QUERY)} }),
            credentials: 'include',
        });
        return JSON.stringify({ status: response.status, body: await response.text() });
    `;

    const bqlQuery = `
        mutation GetBubbasCalendar {
            goto(url: ${JSON.stringify(GRAPHQL_ORIGIN)}, waitUntil: load, timeout: 30000) { status }
            solve(type: cloudflare, timeout: 45000) { found solved time }
            graphql: evaluate(content: ${JSON.stringify(evaluateScript)}, timeout: 20000) { value }
        }
    `;

    const response = await fetch(
        `${BROWSERLESS_BQL_URL}?token=${encodeURIComponent(token)}&proxy=residential&timeout=60000`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: bqlQuery }),
        },
    );

    const raw = await response.text();
    if (!response.ok) {
        throw new Error(
            `Bubbas Browserless stealth request failed with status ${response.status}: ${summarizeBody(raw)}`,
        );
    }

    const json: BrowserlessBqlResponse = JSON.parse(raw);
    if (json.errors?.length) {
        throw new Error(`Bubbas Browserless stealth returned errors: ${JSON.stringify(json.errors)}`);
    }

    if (json.data?.solve) {
        console.log(
            `Bubbas Cloudflare solve: found=${json.data.solve.found} solved=${json.data.solve.solved}`,
        );
    }

    if (!json.data?.graphql?.value) {
        throw new Error('Bubbas Browserless stealth returned no GraphQL result');
    }

    const result: GraphQlHttpResult = JSON.parse(json.data.graphql.value);
    return result;
}

function flavorFromCalendar(json: CalendarEventsResponse): string {
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

export async function load(_browser: Browser, _site: MkeFrozenTreatsImporter.Site): Promise<string> {
    console.log('Loading Bubbas...');

    let result = await fetchViaDeno();
    if (looksLikeCloudflareChallenge(result.status, result.body)) {
        console.log('Bubbas GraphQL got a Cloudflare challenge from this host, retrying through Browserless stealth...');
        result = await fetchViaBrowserless();
    }

    if (result.status !== 200 || looksLikeCloudflareChallenge(result.status, result.body)) {
        throw new Error(
            `Bubbas GraphQL request failed with status ${result.status}: ${summarizeBody(result.body)}`,
        );
    }

    return flavorFromCalendar(JSON.parse(result.body));
}
