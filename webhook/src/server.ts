import express, { Request, Response } from 'express';
import bodyParser from 'body-parser';
import crypto from 'crypto';
import cors from 'cors';

type Event = {
    event: string,
    user: {
        id: number,
        name: string,
        email: string
    }
}

const app = express();
app.use(bodyParser.json());
app.use(cors());

app.use(cors({
  origin: ['http://localhost:4200', 'http://localhost:4201'],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-Signature'],
  optionsSuccessStatus: 204,
}));

type Subscriber = { who: string; url: string };
let subscribers: Subscriber[] = [];
const SECRET = 'your-secret-key';

function generateHmac(data: any): string {
    const hmac = crypto.createHmac('sha256', SECRET);
    return hmac.update(JSON.stringify(data)).digest('hex');
}

app.post('/test', (req: Request, res: Response) => {
    res.status(200).send({ message: 'Server is running' });
});

app.post('/subscribe', (req: Request, res: Response) => {
    const { who, url } = req.body;

    if (!who || typeof who !== 'string') {
        return res.status(400).send({ error: 'Field "who" (string) is required for subscription' });
    }
    if (!url || typeof url !== 'string') {
        return res.status(400).send({ error: 'Field "url" (string) is required for subscription' });
    }

    // Avoid duplicates by who+url
    const exists = subscribers.find(s => s.who === who && s.url === url);
    if (exists) {
        return res.status(200).send({ message: 'Already subscribed', subscriber: exists });
    }

    const sub: Subscriber = { who, url };
    subscribers.push(sub);
    console.log(`Client subscribed: ${who} -> ${url}`);

    return res.status(200).send({ message: 'Subscription successful', subscriber: sub });
});

// List subscribers (for debug)
app.get('/subscribers', (_req: Request, res: Response) => {
    return res.status(200).send({ subscribers });
});

// Unsubscribe endpoint
app.post('/unsubscribe', (req: Request, res: Response) => {
    const { who, url } = req.body;
    if (!who || typeof who !== 'string') {
        return res.status(400).send({ error: 'Field "who" (string) is required to unsubscribe' });
    }

    const before = subscribers.length;
    if (url && typeof url === 'string') {
        subscribers = subscribers.filter(s => !(s.who === who && s.url === url));
    } else {
        // remove all subscriptions for who
        subscribers = subscribers.filter(s => s.who !== who);
    }

    const after = subscribers.length;
    return res.status(200).send({ message: 'Unsubscribed', removed: before - after });
});

app.post('/trigger-event', async (req: Request, res: Response) => {
    const { from, event, body, who } = req.body as { from?: string; event?: string; body?: any; who?: string[] };

    if (!from || typeof from !== 'string') {
        return res.status(400).send({ error: 'Field "from" (string) is required' });
    }
    if (!event || typeof event !== 'string') {
        return res.status(400).send({ error: 'Field "event" (string) is required' });
    }

    // Build event payload; include sender identity
    const payload = {
        event,
        from,
        body: body || null
    };

    const hmacSignature = generateHmac(payload);

    // If who is not provided or empty array -> send to nobody (per spec)
    if (!who || !Array.isArray(who) || who.length === 0) {
        return res.status(200).send({ message: 'No recipients specified; nothing sent' });
    }

    const targets = subscribers.filter(s => who.includes(s.who));

    if (targets.length === 0) {
        return res.status(200).send({ message: 'No matching subscribers found' });
    }

    const results: { who: string; url: string; ok: boolean; status?: number; error?: string }[] = [];

    await Promise.all(targets.map(async (t) => {
        try {
            const r = await fetch(t.url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Signature': hmacSignature
                },
                body: JSON.stringify(payload)
            });

            if (r.ok) {
                console.log(`Notification sent to ${t.who} -> ${t.url}`);
                results.push({ who: t.who, url: t.url, ok: true, status: r.status });
            } else {
                const text = await r.text().catch(() => '<no body>');
                console.error(`Failed to send notification to ${t.who} -> ${t.url}: ${text}`);
                results.push({ who: t.who, url: t.url, ok: false, status: r.status, error: text });
            }
        } catch (err: any) {
            console.error(`Error sending to ${t.who} -> ${t.url}:`, err && err.message ? err.message : err);
            results.push({ who: t.who, url: t.url, ok: false, error: err && err.message ? err.message : String(err) });
        }
    }));

    return res.status(200).send({ message: 'Event processed', results });
});

// FOR ADD A NEW DEMANDE

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
