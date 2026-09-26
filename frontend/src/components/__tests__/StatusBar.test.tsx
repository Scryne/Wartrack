import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import StatusBar from "../StatusBar";
import { useConnectionStore } from "../../stores/useConnectionStore";
import { useEventStore } from "../../stores/useEventStore";
import { useFeedStore } from "../../stores/useFeedStore";
import { useWatchlistStore } from "../../stores/useWatchlistStore";

describe("StatusBar", () => {
  it("renders connection and threat state", () => {
    useConnectionStore.setState({ connected: true });
    useEventStore.setState({ threatLevel: 4 });
    useWatchlistStore.setState({ keywords: ["iran"] });
    useFeedStore.setState({
      articles: [
        {
          id: 100,
          guid: "g-100",
          title: "Iran military update",
          description: "desc",
          link: "https://example.com/a",
          pubDate: new Date().toISOString(),
          source: "Reuters World",
          category: "haber"
        }
      ]
    });

    render(<StatusBar />);

    expect(screen.getByText("CANLI")).toBeInTheDocument();
    expect(screen.getByText("YÜKSEK RİSK")).toBeInTheDocument();
    expect(screen.getByText("1 izlenen haber")).toBeInTheDocument();
  });
});
