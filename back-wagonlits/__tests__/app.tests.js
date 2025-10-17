import { jest } from "@jest/globals";

// Ensure test mode (avoid app.listen + webhook subscribe)
process.env.NODE_ENV = "test";

// Mock 'pg' BEFORE importing the app
jest.unstable_mockModule("pg", () => {
  const mockQuery = jest.fn().mockResolvedValue({ rows: [] });
  const Pool = jest.fn(() => ({ query: mockQuery }));
  return {
    default: { Pool },
    Pool
  };
});

// ✅ Mock swagger so that default export has { serve, setup }
jest.unstable_mockModule("swagger-ui-express", () => {
  const serve = (_req, _res, next) => next();
  const setup = () => (_req, _res, next) => next();
  return {
    default: { serve, setup },
    serve,
    setup
  };
});

// Mock swagger-jsdoc to return an empty spec
jest.unstable_mockModule("swagger-jsdoc", () => {
  return {
    default: () => ({})
  };
});

// Now import the app AFTER mocks
const { default: app } = await import("../src/server.js");
import request from "supertest";

describe("Wagonlits API", () => {
  it("GET /api/demandes returns 200 (array)", async () => {
    const res = await request(app).get("/api/demandes");
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("POST /api/demandes without type returns 400", async () => {
    const res = await request(app).post("/api/demandes").send({ numero: "WAG-9999" });
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("POST /webhook returns 200", async () => {
    const res = await request(app).post("/webhook").send({ event: "test" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("message", "Event received");
  });

  it("GET /health returns ok", async () => {
    const res = await request(app).get("/health");
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
