import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import StatusBar from "../StatusBar";
import { useConnectionStore } from "../../stores/useConnectionStore";
import { useEventStore } from "../../stores/useEventStore";
import { useFeedStore } from "../../stores/useFeedStore";
import { useWatchlistStore } from "../../stores/useWatchlistStore";
import { useAuthStore } from "../../stores/useAuthStore";
import { useSettingsStore } from "../../stores/useSettingsStore";

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

  it("tells a refused key apart from a dead server, and opens Settings for it", () => {
    useAuthStore.setState({ apiKey: "" });
    useConnectionStore.setState({ connected: false, problem: "unauthorized" });
    useSettingsStore.setState({ open: false });
    const { unmount } = render(<StatusBar />);

    fireEvent.click(screen.getByRole("button", { name: /ANAHTAR GEREKLİ/ }));
    expect(useSettingsStore.getState()).toMatchObject({ open: true, openTab: "security" });
    expect(screen.queryByText("BAĞLANTI YOK")).not.toBeInTheDocument();
    unmount();

    useAuthStore.setState({ apiKey: "wrong-key" });
    render(<StatusBar />);
    expect(screen.getByRole("button", { name: /ANAHTAR GEÇERSİZ/ })).toBeInTheDocument();
  });

  it("still says the server is unreachable when that is the problem", () => {
    useConnectionStore.setState({ connected: false, problem: "offline" });
    render(<StatusBar />);
    expect(screen.getByText("BAĞLANTI YOK")).toBeInTheDocument();
  });

  it("goes back to normal once connected", () => {
    useConnectionStore.setState({ problem: "unauthorized" });
    useConnectionStore.getState().setConnected(true);
    expect(useConnectionStore.getState().problem).toBe("none");
  });
});
