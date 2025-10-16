import express, { Request, Response } from 'express';
import bodyParser from 'body-parser';
import crypto from 'crypto';

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

let subscribedUrl: string | null = null;
const SECRET = 'your-secret-key';

function generateHmac(data: Event): string {
    const hmac = crypto.createHmac('sha256', SECRET);
    return hmac.update(JSON.stringify(data)).digest('hex');
}

app.post('/test', (req: Request, res: Response) => {
    res.status(200).send({ message: 'Server is running' });
});

app.post('/subscribe', (req: Request, res: Response) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).send({ error: 'URL is required for subscription' });
    }

    subscribedUrl = url;
    console.log(`Client subscribed to: ${url}`);

    return res.status(200).send({ message: 'Subscription successful' });
});

app.post('/trigger-event', async (req: Request, res: Response) => {
    if (!subscribedUrl) {
        return res.status(400).send({ error: 'No client subscribed' });
    }

    const eventData: Event = {
        event: 'user_registered',
        user: {
            id: 1,
            name: 'John Doe',
            email: 'john.doe@example.com'
        }
    };

    const hmacSignature = generateHmac(eventData);

    try {
    
        const result = await fetch(subscribedUrl, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-Signature': hmacSignature
            },
            body: JSON.stringify(eventData)
        });

        if (result.ok) {
            console.log('Notification sent successfully');
            return res.status(200).send({ message: 'Event triggered and notification sent' });
        } else {
            console.error('Failed to send notification');
            return res.status(500).send({ error: 'Failed to send notification' });
        }
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).send({ error: 'Error while sending notification' });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
