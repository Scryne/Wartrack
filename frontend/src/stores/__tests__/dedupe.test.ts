import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import { useFeedStore } from "../useFeedStore";
import { useMapStore } from "../useMapStore";
import type { Article, Pin } from "../../types";

function makeArticle(id: number): Article {
  return {
    id,
    guid: `g-${id}`,
    title: `Article ${id}`,
    description: "desc",
    link: `https://e.test/${id}`,
    pubDate: new Date().toISOString(),
    source: "Reuters World",
    category: "haber"
  };
}

function makePin(id: number): Pin {
  return {
    id,
    lat: 32,
    lng: 36,
    title: `Pin ${id}`,
    description: "",
    category: "strike",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

/** D20: realtime prepends shift the offset window, so a page can repeat rows. */
describe("useFeedStore.loadMore", () => {
  beforeEach(() => {
    useFeedStore.setState({
      articles: [makeArticle(1), makeArticle(2)],
      page: 0,
      hasMore: true,
      loading: false,
      total: 2
    });
  });

  it("does not append articles already on screen", async () => {
    // Server returns a page overlapping what the store already holds.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ data: [makeArticle(2), makeArticle(3)], total: 3 })
      }))
    );

    await useFeedStore.getState().loadMore();

    const ids = useFeedStore.getState().articles.map((a) => a.id);
    expect(ids).toEqual([1, 2, 3]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps hasMore based on the server page size, not the deduped count", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ data: [makeArticle(1), makeArticle(2)], total: 2 })
      }))
    );

    await useFeedStore.getState().loadMore();

    // Every row was a duplicate, but a short page still means no more remain.
    expect(useFeedStore.getState().articles.map((a) => a.id)).toEqual([1, 2]);
    expect(useFeedStore.getState().hasMore).toBe(false);
  });
});

/** D24: the POST response and the pin:created socket event race. */
describe("useMapStore.addPin", () => {
  beforeEach(() => {
    useMapStore.setState({ pins: [] });
  });

  it("ignores a pin whose id is already present", () => {
    useMapStore.getState().addPin(makePin(1));
    useMapStore.getState().addPin(makePin(1));

    expect(useMapStore.getState().pins).toHaveLength(1);
  });

  it("still prepends genuinely new pins", () => {
    useMapStore.getState().addPin(makePin(1));
    useMapStore.getState().addPin(makePin(2));

    expect(useMapStore.getState().pins.map((p) => p.id)).toEqual([2, 1]);
  });
});
