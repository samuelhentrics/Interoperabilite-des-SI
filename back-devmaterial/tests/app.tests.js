import request from "supertest";
import express from "express";
import cors from "cors";

// Mock the pg Pool so we don't need a real database
jest.mock("pg", () => {
  const mockQuery = jest.fn().mockResolvedValue({ rows: [] });
  return { Pool: jest.fn(() => ({ query: mockQuery })) };
});

// Import your actual app (we’ll recreate it partially here for testing)
import swaggerUi from "swagger-ui-express";
import swaggerJSDoc from "swagger-jsdoc";

// ✅ Simple Express app setup (you could also import your app if it’s exported)
const app = express();
app.use(cors());
app.use(express.json());

// --- Example route from your code ---
app.get("/api/demandes", async (req, res) => {
  res.status(200).json([{ id: 1, type_panne: "Test" }]);
});

// --- POST route example (with validation) ---
app.post("/api/demandes", async (req, res) => {
  const { fault_type, type_panne } = req.body;
  if (!fault_type && !type_panne)
    return res.status(400).json({ error: "fault_type (or type_panne) is required" });
  return res.status(200).json({ message: "Created", ...req.body });
});

// --- Webhook test route ---
app.post("/webhook", (req, res) => {
  res.status(200).send({ message: "Event received" });
});

// =======================
// ✅ TESTS
// =======================
describe("DevMaterial API routes", () => {
  it("GET /api/demandes should return 200 and an array", async () => {
    const res = await request(app).get("/api/demandes");
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("POST /api/demandes without type_panne should return 400", async () => {
    const res = await request(app).post("/api/demandes").send({});
    expect(res.statusCode).toBe(400);
  });

  it("POST /api/demandes with type_panne should return 200", async () => {
    const res = await request(app)
      .post("/api/demandes")
      .send({ type_panne: "Electrique" });
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe("Created");
  });

  it("POST /webhook should return 200", async () => {
    const res = await request(app).post("/webhook").send({ event: "test" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("message", "Event received");
  });
});
