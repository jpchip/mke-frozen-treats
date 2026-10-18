import type { Browser } from "npm:puppeteer";
import { MkeFrozenTreatsImporter } from "../importer.interface.ts";

// Bubba's runs on Popmenu. Restaurant HTML is behind a Cloudflare managed
// challenge, and GraphQL from DigitalOcean / other datacenter IPs gets the
// same "Just a moment..." page. Popmenu's GraphQL host still serves the
// calendar the page renders, so we query it directly from this machine and
// fall back to Browserless stealth + a residential proxy when Cloudflare
// blocks the droplet.
const GRAPHQL_URL = 'https://api.popmenu.com/graphql';
const EVENTS_URL = 'https://www.bubbasfrozencustard.com/events';
const SITE_GRAPHQL_URL = 'https://www.bubbasfrozencustard.com/graphql';
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
        calendar?: { time?: number };
        graphql?: { value?: unknown };
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

    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());

    // Wrapped in an async function by BrowserQL. Same-origin /graphql reuses
    // the cookies from the events page; if that POST is still challenged, the
    // rendered FullCalendar "today" title is the same flavor string.
    const evaluateScript = `
        if (/just a moment/i.test(document.title)) {
            return JSON.stringify({ status: 403, body: document.documentElement.outerHTML });
        }
        const response = await fetch(${JSON.stringify(SITE_GRAPHQL_URL)}, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({ query: ${JSON.stringify(CALENDAR_QUERY)} }),
            credentials: 'include',
        });
        const body = await response.text();
        if (response.status === 200 && !/just a moment/i.test(body)) {
            return JSON.stringify({ status: response.status, body });
        }
        const el = document.querySelector('.fc-event-today .fc-event-title');
        const flavor = el?.textContent?.trim();
        if (flavor) {
            return JSON.stringify({
                status: 200,
                body: JSON.stringify({
                    data: {
                        calendarEvents: {
                            records: [{ name: flavor, startAt: ${JSON.stringify(today)}, isAllDay: true }],
                        },
                    },
                }),
            });
        }
        return JSON.stringify({ status: response.status, body });
    `;

    // Load the events page (the zone that actually challenges), not the API
    // 404. A short solve() catches a Turnstile widget if one is present;
    // waiting for FullCalendar is what tells us the interstitial is gone.
    const bqlQuery = `
        mutation GetBubbasCalendar {
            goto(url: ${JSON.stringify(EVENTS_URL)}, waitUntil: load, timeout: 45000) { status }
            solve(timeout: 15000) { found solved time }
            calendar: waitForSelector(selector: ".fc", timeout: 45000) { time }
            graphql: evaluate(content: ${JSON.stringify(evaluateScript)}, timeout: 20000) { value }
        }
    `;

    const response = await fetch(
        `${BROWSERLESS_BQL_URL}?token=${encodeURIComponent(token)}&proxy=residential&timeout=120000`,
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

    console.log(
        `Bubbas stealth goto=${json.data?.goto?.status ?? 'none'} solve found=${json.data?.solve?.found} solved=${json.data?.solve?.solved}`,
    );

    if (json.data?.graphql?.value == null) {
        throw new Error('Bubbas Browserless stealth returned no GraphQL result');
    }

    return parseEvaluateValue(json.data.graphql.value);
}

function parseEvaluateValue(value: unknown): GraphQlHttpResult {
    if (typeof value === 'string') {
        return JSON.parse(value);
    }
    if (value && typeof value === 'object' && 'status' in value && 'body' in value) {
        return value as GraphQlHttpResult;
    }
    throw new Error(`Bubbas Browserless stealth returned an unexpected result: ${JSON.stringify(value).slice(0, 180)}`);
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
