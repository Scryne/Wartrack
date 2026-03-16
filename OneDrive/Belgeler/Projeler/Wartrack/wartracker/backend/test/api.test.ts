import fs from "fs/promises";
import path from "path";
import cors from "cors";
import express, { type Express } from "express";
import request from "supertest";

const TEST_DB_RELATIVE_PATH = "./wartracker.test.db";

let app: Express;

beforeAll(async () => {
  process.env.DB_PATH = TEST_DB_RELATIVE_PATH;
  process.env.BRIEF_MODEL_ENABLED = "0";

  const { runMigrations } = await import("../src/db/migrate");

  runMigrations();

  const [{ default: apiRouter }, { default: briefRouter }] = await Promise.all([
    import("../src/routes"),
    import("../src/routes/brief")
  ]);

  app = express();
  app.use(cors());
  app.use(express.json());
  app.set("io", { emit: () => undefined });
  app.use("/api", apiRouter);
  app.use("/api/brief", briefRouter);
});

afterAll(async () => {
  const { default: db } = await import("../src/db");
  db.close();

  const projectRoot = path.resolve(__dirname, "..");
  const dbPath = path.resolve(projectRoot, TEST_DB_RELATIVE_PATH);
  const files = [dbPath, `${dbPath}-wal`, `${dbPath}-shm`];

  await Promise.all(
    files.map(async (file) => {
      try {
        await fs.unlink(file);
      } catch {
        return;
      }
    })
  );
});

describe("backend api smoke", () => {
  it("returns health payload", async () => {
    const response = await request(app).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.service).toBe("wartracker-backend");
  });

  it("returns feed with pagination envelope", async () => {
    const response = await request(app).get("/api/feed?limit=5");

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(typeof response.body.total).toBe("number");
    expect(response.body.limit).toBe(5);
  });

  it("updates settings and reads updated values", async () => {
    const putResponse = await request(app).put("/api/settings/ai.interval").send({ value: "3" });
    const getResponse = await request(app).get("/api/settings");

    expect(putResponse.status).toBe(200);
    expect(putResponse.body.ok).toBe(true);
    expect(getResponse.status).toBe(200);
    expect(getResponse.body["ai.interval"]).toBe("3");
  });

  it("supports pin create update delete flow", async () => {
    const uniqueTitle = `Pin-${Date.now()}`;

    const createResponse = await request(app).post("/api/pins").send({
      lat: 32.1,
      lng: 36.7,
      title: uniqueTitle,
      description: "test pin",
      category: "strike"
    });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.title).toBe(uniqueTitle);

    const pinId = Number(createResponse.body.id);
    expect(Number.isInteger(pinId)).toBe(true);

    const updateResponse = await request(app).put(`/api/pins/${pinId}`).send({
      title: `${uniqueTitle}-updated`,
      description: "updated pin",
      category: "movement"
    });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.success).toBe(true);

    const listResponse = await request(app).get("/api/pins");
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.some((pin: { id: number }) => pin.id === pinId)).toBe(true);

    const deleteResponse = await request(app).delete(`/api/pins/${pinId}`);
    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body.success).toBe(true);
  });
});
