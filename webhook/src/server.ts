import express, { Request, Response } from 'express';
import bodyParser from 'body-parser';
import crypto from 'crypto';
import { Pool } from 'pg';
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
app.use(cors()); app.use(cors({ origin: ['http://localhost:4200', 'http://localhost:4201'], methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type', 'X-Signature'], optionsSuccessStatus: 204, }));

type Subscriber = { id?: string; who: string; url: string };

// Read SECRET from env or default (override in production)
const SECRET = process.env.WEBHOOK_SECRET || 'your-secret-key';

// Postgres pool (use env vars or defaults)
const pgHost = process.env.PGHOST || 'webhook-db';
const pgPort = parseInt(process.env.PGPORT || '5432', 10);
const pgUser = process.env.PGUSER || 'webhook';
const pgPassword = process.env.PGPASSWORD || 'webhook';
const pgDatabase = process.env.PGDATABASE || 'webhook_db';

const pool = new Pool({ host: pgHost, port: pgPort, user: pgUser, password: pgPassword, database: pgDatabase });

async function dbQuery(queryText: string, params?: any[]) {
    const client = await pool.connect();
    try {
        const r = await client.query(queryText, params);
        return r;
    } finally {
        client.release();
    }
}

function generateHmac(data: any): string {
    const hmac = crypto.createHmac('sha256', SECRET);
    return hmac.update(JSON.stringify(data)).digest('hex');
}

app.post('/test', (req: Request, res: Response) => {
    res.status(200).send({ message: 'Server is running' });
});

app.post('/subscribe', async (req: Request, res: Response) => {
    const { who, url } = req.body;

    if (!who || typeof who !== 'string') {
        return res.status(400).send({ error: 'Field "who" (string) is required for subscription' });
    }
    if (!url || typeof url !== 'string') {
        return res.status(400).send({ error: 'Field "url" (string) is required for subscription' });
    }

    try {
        // Try insert, if unique constraint prevents it, return existing
        const insertRes = await dbQuery(
            `INSERT INTO subscribers (who, url) VALUES ($1, $2) ON CONFLICT (who, url) DO UPDATE SET who = EXCLUDED.who RETURNING *`,
            [who, url]
        );
        const row = insertRes.rows[0];
        console.log(`Client subscribed: ${who} -> ${url}`);
        return res.status(200).send({ message: 'Subscription successful', subscriber: row });
    } catch (err: any) {
        console.error('DB error on subscribe', err);
        return res.status(500).send({ error: 'Internal server error' });
    }
});

// List subscribers (for debug)
app.get('/subscribers', async (_req: Request, res: Response) => {
    try {
        const r = await dbQuery('SELECT * FROM subscribers ORDER BY created_at DESC');
        return res.status(200).send({ subscribers: r.rows });
    } catch (err: any) {
        console.error('DB error listing subscribers', err);
        return res.status(500).send({ error: 'Internal server error' });
    }
});

// Unsubscribe endpoint
app.post('/unsubscribe', async (req: Request, res: Response) => {
    const { who, url } = req.body;
    if (!who || typeof who !== 'string') {
        return res.status(400).send({ error: 'Field "who" (string) is required to unsubscribe' });
    }

    try {
        let result;
        if (url && typeof url === 'string') {
            result = await dbQuery('DELETE FROM subscribers WHERE who = $1 AND url = $2 RETURNING *', [who, url]);
        } else {
            result = await dbQuery('DELETE FROM subscribers WHERE who = $1 RETURNING *', [who]);
        }
        return res.status(200).send({ message: 'Unsubscribed', removed: result.rowCount });
    } catch (err: any) {
        console.error('DB error on unsubscribe', err);
        return res.status(500).send({ error: 'Internal server error' });
    }
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

    console.log('Triggering webhook...');
    // Persist event
    let eventRow: any;
    try {
        const ev = await dbQuery('INSERT INTO events (event, payload, sender, status) VALUES ($1, $2, $3, $4) RETURNING *', [event, payload, from, 'pending']);
        eventRow = ev.rows[0];
    } catch (err: any) {
        console.error('DB error inserting event', err);
        return res.status(500).send({ error: 'Internal server error' });
    }

    const hmacSignature = generateHmac(payload);

    // If who is not provided or empty array -> send to nobody (per spec)
    if (!who || !Array.isArray(who) || who.length === 0) {
        // Update event status to no_recipients
        await dbQuery('UPDATE events SET status = $1 WHERE id = $2', ['no_recipients', eventRow.id]);
        return res.status(200).send({ message: 'No recipients specified; nothing sent' });
    }

    // Select matching subscribers from DB
    let targetsRes;
    try {
        const placeholders = who.map((_, i) => `$${i + 1}`).join(',');
        targetsRes = await dbQuery(`SELECT * FROM subscribers WHERE who IN (${placeholders})`, who as any[]);
    } catch (err: any) {
        console.error('DB error selecting targets', err);
        return res.status(500).send({ error: 'Internal server error' });
    }

    const targets = targetsRes.rows as Array<{ id: string; who: string; url: string }>;

    if (targets.length === 0) {
        await dbQuery('UPDATE events SET status = $1 WHERE id = $2', ['no_matching_subscribers', eventRow.id]);
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
                // Persist result
                const text = await r.text().catch(() => '');
                await dbQuery('INSERT INTO event_results (event_id, subscriber_id, status, response) VALUES ($1, $2, $3, $4)', [eventRow.id, t.id, 'ok', text]);
            } else {
                const text = await r.text().catch(() => '<no body>');
                console.error(`Failed to send notification to ${t.who} -> ${t.url}: ${text}`);
                results.push({ who: t.who, url: t.url, ok: false, status: r.status, error: text });
                await dbQuery('INSERT INTO event_results (event_id, subscriber_id, status, response) VALUES ($1, $2, $3, $4)', [eventRow.id, t.id, 'failed', text]);
            }
        } catch (err: any) {
            console.error(`Error sending to ${t.who} -> ${t.url}:`, err && err.message ? err.message : err);
            results.push({ who: t.who, url: t.url, ok: false, error: err && err.message ? err.message : String(err) });
            await dbQuery('INSERT INTO event_results (event_id, subscriber_id, status, response) VALUES ($1, $2, $3, $4)', [eventRow.id, t.id, 'error', err && err.message ? err.message : String(err)]);
        }
    }));

    // Update event status to done
    console.log('All notifications processed for event', eventRow.id);
    try {
        await dbQuery('UPDATE events SET status = $1 WHERE id = $2', ['done', eventRow.id]);
    } catch (err: any) {
        console.error('DB error updating event status', err);
    }

    return res.status(200).send({ message: 'Event processed', results });
});

// FOR ADD A NEW DEMANDE

const PORT = 3000;

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

export default app;
