// back-devmaterial/__tests__/api.test.js
import { jest } from "@jest/globals";

// Mock 'pg' BEFORE importing the app
jest.unstable_mockModule("pg", () => {
  const mockQuery = jest.fn().mockResolvedValue({ rows: [] });
  const Pool = jest.fn(() => ({ query: mockQuery }));
  return {
    // ESM default export that contains Pool (matches `import pkg from "pg"`)
    default: { Pool },
    // also expose named export in case code changes to `import { Pool } from "pg"`
    Pool
  };
});

const { default: app } = await import("../src/index.js");
import request from "supertest";

describe("DevMaterial API", () => {
  it("GET /api/demandes returns 200 (array)", async () => {
    const res = await request(app).get("/api/demandes");
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("POST /api/demandes without type returns 400", async () => {
    const res = await request(app).post("/api/demandes").send({});
    expect(res.statusCode).toBe(400);
  });

  it("POST /webhook returns 200", async () => {
    const res = await request(app).post("/webhook").send({ event: "test" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("message", "Event received");
  });
});
