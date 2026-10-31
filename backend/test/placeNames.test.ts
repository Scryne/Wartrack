import fs from "fs/promises";
import { placeGlossaryFor, withPlaceGlossary, checkSummaryPlaces } from "../src/lib/placeNames";

describe("place glossary", () => {
  it("lists the Turkish names of the places a story mentions", () => {
    expect(placeGlossaryFor("Iran threatens to close the Strait of Hormuz")).toEqual([
      "Hormuz = Hürmüz Boğazı",
      "Iran = İran"
    ]);
  });

  it("does not list a shorter key inside a longer one", () => {
    expect(placeGlossaryFor("Tankers wait in the Persian Gulf")).toEqual(["Persian Gulf = Basra Körfezi"]);
  });

  it("lists each Turkish name once, keeping the source spelling", () => {
    expect(placeGlossaryFor("UAE and the Emirates' ports")).toEqual(["Emirates = Birleşik Arap Emirlikleri"]);
  });

  it("leaves a story without known places unchanged", () => {
    expect(withPlaceGlossary("Local council approves budget")).toBe("Local council approves budget");
  });

  it("appends the glossary after the story text", () => {
    const prompted = withPlaceGlossary("Houthi drones target Eilat");
    expect(prompted.startsWith("Houthi drones target Eilat\n\n")).toBe(true);
    expect(prompted).toContain("Houthi = Husi");
    expect(prompted).toContain("Eilat = Eilat");
  });

  it("passes every summary when no key is configured (check is off, not failing)", async () => {
    expect(await checkSummaryPlaces("Strike near Hormuz", "Humus Boğazı yakınında saldırı")).toEqual({ ok: true, p: null });
  });
});

describe("summarizer rejects a summary that moves the story elsewhere", () => {
  const TEST_DB_RELATIVE_PATH = `./wartracker.places.${process.pid}.db`;

  beforeAll(async () => {
    process.env.DB_PATH = TEST_DB_RELATIVE_PATH;
    await import("../src/db");
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    vi.doUnmock("../src/lib/placeNames");
    const { default: db, DATABASE_PATH } = await import("../src/db");
    db.close();
    await fs.unlink(DATABASE_PATH).catch(() => undefined);
    for (const suffix of ["-wal", "-shm"]) await fs.unlink(`${DATABASE_PATH}${suffix}`).catch(() => undefined);
  });

  it("retries once with the strict prompt and stores nothing if both fail the place check", async () => {
    vi.resetModules();
    const prompts: string[] = [];
    vi.stubGlobal("fetch", (_url: string, init: { body: string }) => {
      prompts.push(JSON.parse(init.body).prompt as string);
      return Promise.resolve(new Response(JSON.stringify({ response: "İran, Humus Boğazı'nı kapatmakla tehdit etti." })));
    });
    vi.doMock("../src/lib/placeNames", async (importOriginal) => ({
      ...(await importOriginal<typeof import("../src/lib/placeNames")>()),
      checkSummaryPlaces: () => Promise.resolve({ ok: false, p: 0.06 })
    }));

    const { summarizeArticle } = await import("../src/services/summarize.service");
    const result = await summarizeArticle(1, "Iran threatens to close the Strait of Hormuz");

    expect(result.model).toBe("none");
    expect(prompts).toHaveLength(2);
    // The model was told the right name both times.
    for (const prompt of prompts) expect(prompt).toContain("Hormuz = Hürmüz Boğazı");
  });
});
