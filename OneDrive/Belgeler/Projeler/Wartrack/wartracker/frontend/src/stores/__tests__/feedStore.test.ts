import { describe, expect, it } from "vitest";
import { useFeedStore } from "../useFeedStore";
import { useWatchlistStore } from "../useWatchlistStore";

describe("useFeedStore filteredArticles", () => {
  it("sorts watchlist matched articles before others", () => {
    useWatchlistStore.setState({ keywords: ["iran"] });

    useFeedStore.setState({
      articles: [
        {
          id: 1,
          guid: "a-1",
          title: "Global markets update",
          description: "desc",
          link: "https://example.com/1",
          pubDate: new Date().toISOString(),
          source: "BBC World",
          category: "haber"
        },
        {
          id: 2,
          guid: "a-2",
          title: "Iran border tensions increase",
          description: "desc",
          link: "https://example.com/2",
          pubDate: new Date().toISOString(),
          source: "Reuters World",
          category: "haber"
        }
      ]
    });

    const ordered = useFeedStore.getState().filteredArticles();

    expect(ordered).toHaveLength(2);
    expect(ordered[0].id).toBe(2);
    expect(ordered[1].id).toBe(1);
  });
});
