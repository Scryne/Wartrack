import fs from "fs/promises";

/**
 * The success path of the summarizer: a provider answers, the answer passes the
 * Turkish guard and the place check, and it becomes the summary. The queue tests
 * only cover "no provider answered". Ollama is replaced by a stubbed fetch, so no
 * model is ever called; the place check is replaced through setPlaceCheck.
 */

const TEST_DB_RELATIVE_PATH = `./wartracker.provider.${process.pid}.db`;

const TURKISH =
  "Ordu, gece saatlerinde bir insansız hava aracının düşürüldüğünü ve can kaybı olmadığını açıkladı.";
const ENGLISH = "The army said a drone was shot down overnight and that there were no casualties.";
const SOURCE = "The army said a drone was intercepted overnight; no casualties were reported.";

type GenerateBody = { system: string; prompt: string };

function stubOllama(answers: string[]) {
  const calls: GenerateBody[] = [];
  const fetchStub = vi.fn((url: string, init?: RequestInit) => {
    expect(String(url)).toMatch(/\/api\/generate$/);
    calls.push(JSON.parse(String(init?.body)) as GenerateBody);
    const response = answers[Math.min(calls.length - 1, answers.length - 1)];
    return Promise.resolve(new Response(JSON.stringify({ response }), { status: 200, headers: { "Content-Type": "application/json" } }));
  });
  vi.stubGlobal("fetch", fetchStub);
  return calls;
}

beforeAll(async () => {
  process.env.DB_PATH = TEST_DB_RELATIVE_PATH;
  process.env.GEMINI_API_KEY = "";
  await import("../src/db");
  const { setPlaceCheck } = await import("../src/lib/placeNames");
  setPlaceCheck(() => Promise.resolve({ ok: true, p: null }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  const { setPlaceCheck } = await import("../src/lib/placeNames");
  setPlaceCheck(null);
  const { default: db, DATABASE_PATH } = await import("../src/db");
  db.close();
  await fs.unlink(DATABASE_PATH).catch(() => undefined);
  for (const suffix of ["-wal", "-shm"]) {
    await fs.unlink(`${DATABASE_PATH}${suffix}`).catch(() => undefined);
  }
});

describe("summarizer success path (stubbed Ollama)", () => {
  it("returns the model's Turkish summary on the first answer", async () => {
    const calls = stubOllama([TURKISH]);
    const { summarizeArticle } = await import("../src/services/summarize.service");

    const result = await summarizeArticle(101, SOURCE);

    expect(result.model).toBe("ollama");
    expect(result.summary).toContain("insansız hava aracının");
    expect(calls).toHaveLength(1);
    expect(calls[0].prompt).toContain(SOURCE);
  });

  it("retries with the strict prompt when the first answer is not Turkish", async () => {
    const calls = stubOllama([ENGLISH, TURKISH]);
    const { summarizeArticle } = await import("../src/services/summarize.service");

    const result = await summarizeArticle(102, SOURCE);

    expect(result.model).toBe("ollama");
    expect(result.summary).toContain("can kaybı");
    expect(calls).toHaveLength(2);
    expect(calls[1].system).not.toBe(calls[0].system);
  });

  it("writes nothing when both answers fail the guard", async () => {
    const calls = stubOllama([ENGLISH]);
    const { summarizeArticle } = await import("../src/services/summarize.service");

    const result = await summarizeArticle(103, SOURCE);

    expect(result).toEqual({ summary: "", model: "none" });
    expect(calls).toHaveLength(2);
  });

  it("accepts 'can kaybı' (Turkish for casualties) as Turkish", async () => {
    const { validateTurkishOutput } = await import("../src/lib/languageGuard");
    expect(validateTurkishOutput(TURKISH).valid).toBe(true);
    // English "can" is still caught by the other markers.
    expect(validateTurkishOutput("Israel can strike Iran and the region will respond").valid).toBe(false);
  });

  it("rejects a Turkish summary that names the wrong place", async () => {
    stubOllama([TURKISH]);
    const { setPlaceCheck } = await import("../src/lib/placeNames");
    setPlaceCheck(() => Promise.resolve({ ok: false, p: 0.1 }));
    const { summarizeArticle } = await import("../src/services/summarize.service");

    const result = await summarizeArticle(104, SOURCE);

    setPlaceCheck(() => Promise.resolve({ ok: true, p: null }));
    expect(result.model).toBe("none");
  });
});
