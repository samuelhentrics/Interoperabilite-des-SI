import request from 'supertest';
// Ensure TypeScript knows about jest globals
import '@jest/globals';

// ---- Mock PG so no real DB is needed ----
jest.mock('pg', () => {
  // one shared query mock that always resolves to empty rows by default
  const query = jest.fn().mockResolvedValue({ rows: [], rowCount: 0 });
  const connect = jest.fn().mockResolvedValue({ query, release: jest.fn() });
  const PoolMock = jest.fn(() => ({ connect }));
  return { Pool: PoolMock };
});

// (Optional) If any test path ends up calling fetch, keep it deterministic
global.fetch = jest.fn(async () =>
  new Response('', { status: 200 })
) as unknown as typeof fetch;

// import the real app AFTER mocks
import app from '../src/server';

describe('Webhook service', () => {
  it('POST /test should return 200 and message', async () => {
    const res = await request(app).post('/test').send({});
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message', 'Server is running');
  });

  it('POST /subscribe without body should 400 (missing fields)', async () => {
    const res = await request(app).post('/subscribe').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/who/i);
  });

  it('GET /subscribers should 200 and return array', async () => {
    const res = await request(app).get('/subscribers');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.subscribers)).toBe(true);
  });

  it('POST /unsubscribe missing "who" should 400', async () => {
    const res = await request(app).post('/unsubscribe').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/who/i);
  });

  it('POST /trigger-event without "from" should 400', async () => {
    const res = await request(app)
      .post('/trigger-event')
      .send({ event: 'user.created' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/from/i);
  });
});
