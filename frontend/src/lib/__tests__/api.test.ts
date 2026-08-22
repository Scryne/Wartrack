import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiKeyError, apiFetch, apiUrl } from "../api";
import { useAuthStore } from "../../stores/useAuthStore";

const KEY = "test-shared-secret-0123456789";

type FetchSpy = ReturnType<typeof mockFetch>;

function mockFetch(response: Partial<Response> = {}) {
  // Typed with fetch's parameters so mock.calls is a two-element tuple rather
  // than []; `tsc` runs over src/ during the build and would reject otherwise.
  const spy = vi.fn(
    (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> =>
      Promise.resolve({ ok: true, status: 200, json: async () => ({}), ...response } as Response)
  );
  vi.stubGlobal("fetch", spy);
  return spy;
}

/** The RequestInit passed to the Nth fetch call. */
function initOf(spy: FetchSpy, call = 0): RequestInit {
  const init = spy.mock.calls[call]?.[1];
  if (!init) throw new Error(`fetch call ${call} had no RequestInit`);
  return init;
}

/** Headers passed to the Nth fetch call. */
function headersOf(spy: FetchSpy, call = 0): Headers {
  return initOf(spy, call).headers as Headers;
}

beforeEach(() => {
  useAuthStore.setState({ apiKey: KEY });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("apiFetch", () => {
  it("attaches X-API-Key to mutating requests", async () => {
    const spy = mockFetch();

    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      spy.mockClear();
      await apiFetch("/api/pins", { method });
      expect(headersOf(spy).get("X-API-Key")).toBe(KEY);
    }
  });

  it("does not attach the key to reads", async () => {
    const spy = mockFetch();

    await apiFetch("/api/feed");
    expect(headersOf(spy).get("X-API-Key")).toBeNull();

    spy.mockClear();
    await apiFetch("/api/feed", { method: "GET" });
    expect(headersOf(spy).get("X-API-Key")).toBeNull();
  });

  it("omits the header entirely when no key is configured", async () => {
    useAuthStore.setState({ apiKey: "" });
    const spy = mockFetch();

    await apiFetch("/api/pins", { method: "POST" });

    // Absent rather than empty: an empty string would be a valid-looking value.
    expect(headersOf(spy).has("X-API-Key")).toBe(false);
  });

  it("resolves the path against API_BASE", async () => {
    const spy = mockFetch();
    await apiFetch("/api/pins");

    expect(spy.mock.calls[0]?.[0]).toBe(apiUrl("/api/pins"));
  });

  it("preserves caller-supplied headers and body", async () => {
    const spy = mockFetch();

    await apiFetch("/api/pins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ a: 1 })
    });

    const headers = headersOf(spy);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("X-API-Key")).toBe(KEY);
    expect(initOf(spy).body).toBe('{"a":1}');
  });

  it("throws ApiKeyError on 401", async () => {
    mockFetch({ ok: false, status: 401 });

    await expect(apiFetch("/api/pins", { method: "POST" })).rejects.toBeInstanceOf(ApiKeyError);
  });

  it("does not throw on other non-OK statuses", async () => {
    mockFetch({ ok: false, status: 400 });

    const res = await apiFetch("/api/pins", { method: "POST" });
    expect(res.status).toBe(400);
  });
});

describe("useAuthStore", () => {
  it("trims stored keys and reports presence", () => {
    useAuthStore.getState().setApiKey("  padded-secret-value  ");
    expect(useAuthStore.getState().apiKey).toBe("padded-secret-value");
    expect(useAuthStore.getState().hasApiKey()).toBe(true);

    useAuthStore.getState().clearApiKey();
    expect(useAuthStore.getState().hasApiKey()).toBe(false);
  });

  it("persists under its own storage key, separate from settings", () => {
    useAuthStore.getState().setApiKey(KEY);

    expect(localStorage.getItem("wartracker-auth")).toContain(KEY);
    // Must never ride along with the settings payload synced to the server.
    expect(localStorage.getItem("wartracker-settings") ?? "").not.toContain(KEY);
  });
});
