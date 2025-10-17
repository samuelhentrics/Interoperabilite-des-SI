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
    const { from, event, body } = req.body || {};
    try {
        const result = await sendWebhook(from, event, body);
        return res.status(200).send(result);
    } catch (err: any) {
        console.error('Error triggering webhook:', err);
        return res.status(500).send({ error: 'Internal server error', details: err && err.message ? err.message : String(err) });
    }
});

// Top-level reusable function to send a webhook to all subscribers (excluding sender)
async function sendWebhook(from: string, event: string, body: any) {
    if (!from || typeof from !== 'string') {
        throw new Error('Field "from" (string) is required');
    }
    if (!event || typeof event !== 'string') {
        throw new Error('Field "event" (string) is required');
    }

    const payload = { event, from, body: body || null };
    console.log('Triggering webhook...');

    // fetch all distinct users
    let allUsers: string[] = [];
    try {
        const usersRes = await dbQuery('SELECT DISTINCT who FROM subscribers');
        allUsers = usersRes.rows.map((r: any) => r.who);
    } catch (err: any) {
        console.error('DB error fetching all users', err);
        throw err;
    }

    // Persist event
    let eventRow: any;
    try {
        const ev = await dbQuery('INSERT INTO events (event, payload, sender, status) VALUES ($1, $2, $3, $4) RETURNING *', [event, payload, from, 'pending']);
        eventRow = ev.rows[0];
    } catch (err: any) {
        console.error('DB error inserting event', err);
        throw err;
    }

    const hmacSignature = generateHmac(payload);
    const targetWho = allUsers.filter(u => u !== from);

    if (targetWho.length === 0) {
        await dbQuery('UPDATE events SET status = $1 WHERE id = $2', ['no_matching_subscribers', eventRow.id]);
        return { message: 'No matching subscribers found', results: [] };
    }

    // Select matching subscribers
    let targetsRes: any;
    try {
        const placeholders = targetWho.map((_, i) => `$${i + 1}`).join(',');
        targetsRes = await dbQuery(`SELECT * FROM subscribers WHERE who IN (${placeholders})`, targetWho as any[]);
    } catch (err: any) {
        console.error('DB error selecting targets', err);
        throw err;
    }

    const targets = targetsRes.rows as Array<{ id: string; who: string; url: string }>;
    if (targets.length === 0) {
        await dbQuery('UPDATE events SET status = $1 WHERE id = $2', ['no_matching_subscribers', eventRow.id]);
        return { message: 'No matching subscribers found', results: [] };
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

            const text = await r.text().catch(() => '');
            if (r.ok) {
                console.log(`Notification sent to ${t.who} -> ${t.url}`);
                results.push({ who: t.who, url: t.url, ok: true, status: r.status });
                await dbQuery('INSERT INTO event_results (event_id, subscriber_id, status, response) VALUES ($1, $2, $3, $4)', [eventRow.id, t.id, 'ok', text]);
            } else {
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

    console.log('All notifications processed for event', eventRow.id);
    try {
        await dbQuery('UPDATE events SET status = $1 WHERE id = $2', ['done', eventRow.id]);
    } catch (err: any) {
        console.error('DB error updating event status', err);
    }

    return { message: 'Event processed', results };
}

// FOR ADD A NEW DEMANDE
// api/demandes l'idée est de recevoir le message puis de le webhooker à tous les abonnés

app.post('/api/demandes', async (req, res) => {
    console.log('ANALIA')
    const { message } = req.body;

    
    const from = req.body.from;
    const body = req.body.body;
    const event = 'add-demande';

    if (!message) {
        return res.status(400).send({ error: 'Message is required' });
    }

    // Webhook the message to all subscribers
    try {
        await sendWebhook(from, event, body);
    } catch (err: any) {
        console.error('Error sending webhook notifications', err);
        return res.status(500).send({ error: 'Internal server error' });
    }

    return res.status(200).send({ message: 'Webhook notifications sent' });
});

// idem pour le put
app.put('/api/demandes/:id', async (req, res) => {
    const { message } = req.body;

    const from = req.body.from;
    const body = req.body.body;
    const event = 'update-demande';

    if (!message) {
        return res.status(400).send({ error: 'Message is required' });
    }

    // Webhook the message to all subscribers
    try {
        await sendWebhook(from, event, body);
    } catch (err: any) {
        console.error('Error sending webhook notifications', err);
        return res.status(500).send({ error: 'Internal server error' });
    }

    return res.status(200).send({ message: 'Webhook notifications sent' });
});

// delete 
app.delete('/api/demandes/:id', async (req, res) => {
    const { message } = req.body;
    
    const from = req.body.from;
    const body = req.body.body;
    const event = 'delete-demande';

    if (!message) {
        return res.status(400).send({ error: 'Message is required' });
    }

    // Webhook the message to all subscribers
    try {
        await sendWebhook(from, event, body);
    } catch (err: any) {
        console.error('Error sending webhook notifications', err);
        return res.status(500).send({ error: 'Internal server error' });
    }

    return res.status(200).send({ message: 'Webhook notifications sent' });
});

const PORT = 3000;

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

export default app;
