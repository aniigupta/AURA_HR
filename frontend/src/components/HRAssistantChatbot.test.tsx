/**
 * Sample React Testing Library suite accompanying the HRMS Test Plan.
 *
 * Each test maps to a Test Case ID from the plan. The AI chatbot is the
 * highest-risk component in the frontend: it renders server-supplied text,
 * carries conversation state across turns, and must degrade gracefully when
 * the AI provider is unreachable — so it is the reference example for
 * loading / success / error / state-reset coverage.
 *
 * Uses fireEvent rather than @testing-library/user-event so it runs against
 * the dependencies already in package.json. See the plan's automation
 * section for the recommended (not yet installed) user-event upgrade.
 *
 * Run:  npx vitest run src/components/HRAssistantChatbot.test.tsx
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import HRAssistantChatbot from "./HRAssistantChatbot";
import { apiFetch, ApiError } from "@/utils/api";

vi.mock("@/utils/api", async () => {
  const actual = await vi.importActual<typeof import("@/utils/api")>("@/utils/api");
  return { ...actual, apiFetch: vi.fn() };
});

const mockUser = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "test_employee@company.com",
  role: "Employee" as const,
  organization_name: "Test Company Inc",
  is_active: true,
  mfa_enabled: false,
  profile: { first_name: "Asha", last_name: "Employee" },
};

let currentUser: typeof mockUser | null = mockUser;

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: currentUser, isLoading: false }),
}));

const mockedApiFetch = vi.mocked(apiFetch);

// jsdom implements no layout engine, so scrollIntoView (used by the chat
// auto-scroll effect) is undefined there. Stub it rather than guarding the
// component for the benefit of a test environment.
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

function openAssistant() {
  render(<HRAssistantChatbot />);
  fireEvent.click(screen.getByRole("button", { name: /Open HR Policy Assistant/i }));
  return screen.getByPlaceholderText(/Ask about leaves, timings, policies/i) as HTMLInputElement;
}

function ask(input: HTMLInputElement, text: string) {
  fireEvent.change(input, { target: { value: text } });
  fireEvent.submit(input.closest("form")!);
}

beforeEach(() => {
  currentUser = mockUser;
  mockedApiFetch.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("AI-UI — HR Policy Assistant chatbot", () => {
  it("AI-UI-001: renders nothing for an unauthenticated visitor", () => {
    currentUser = null;
    const { container } = render(<HRAssistantChatbot />);
    expect(container).toBeEmptyDOMElement();
  });

  it("AI-UI-002: opens on trigger and greets the user by name and tenant", () => {
    openAssistant();

    expect(screen.getByText(/Test Company Inc AI Assistant/i)).toBeInTheDocument();
    expect(screen.getByText(/Asha/)).toBeInTheDocument();
  });

  it("AI-UI-003: sends a question, shows the pending state, then renders the reply and its sources", async () => {
    let resolveReply: (value: unknown) => void = () => {};
    mockedApiFetch.mockImplementation(
      () => new Promise((resolve) => { resolveReply = resolve; })
    );

    const input = openAssistant();
    ask(input, "What is my leave balance?");

    // The user's message echoes immediately and the composer clears + locks.
    expect(await screen.findByText("What is my leave balance?")).toBeInTheDocument();
    expect(input).toHaveValue("");
    expect(input).toBeDisabled();

    resolveReply({
      reply: "You have **12** casual leaves remaining.",
      sources: ["Employee Profile", "Leave Policy"],
    });

    expect(await screen.findByText(/casual leaves remaining/i)).toBeInTheDocument();
    expect(screen.getByText(/Sources: Employee Profile, Leave Policy/i)).toBeInTheDocument();
    await waitFor(() => expect(input).toBeEnabled());

    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/assistant/chat",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("AI-UI-010: degrades gracefully when the AI provider errors, without losing the transcript", async () => {
    mockedApiFetch.mockRejectedValue(new ApiError("AI service unavailable", 503));

    openAssistant();
    fireEvent.click(screen.getByRole("button", { name: /Check my current leave balance/i }));

    expect(await screen.findByText(/Connection issue/i)).toBeInTheDocument();
    expect(screen.getByText(/AI service unavailable/i)).toBeInTheDocument();
    // The question the user asked is still on screen — no transcript wipe on
    // failure. Two matches: the suggestion chip, and the echoed user turn.
    expect(screen.getAllByText("Check my current leave balance")).toHaveLength(2);
    // And the composer is usable again so the user can retry.
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/Ask about leaves, timings, policies/i)).toBeEnabled()
    );
  });

  it("AI-UI-012: caps outbound history at 6 turns and never replays the local welcome message", async () => {
    mockedApiFetch.mockImplementation((_endpoint, options) => {
      const body = JSON.parse((options?.body as string) ?? "{}");
      return Promise.resolve({ reply: `Echo ${body.message}`, sources: [] });
    });

    const input = openAssistant();

    for (let i = 1; i <= 5; i++) {
      ask(input, `Question ${i}`);
      await screen.findByText(`Echo Question ${i}`);
    }

    const lastCallBody = JSON.parse(mockedApiFetch.mock.lastCall?.[1]?.body as string);
    expect(lastCallBody.history).toHaveLength(6);
    expect(
      lastCallBody.history.every((m: { content: string }) => !m.content.includes("HR Policy Assistant"))
    ).toBe(true);
    // Roles are normalized to the Gemini contract: assistant -> model.
    expect(new Set(lastCallBody.history.map((m: { role: string }) => m.role))).toEqual(
      new Set(["user", "model"])
    );
  });

  it("AI-UI-015: blocks whitespace-only submissions before any network call", () => {
    const input = openAssistant();
    ask(input, "   ");

    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it("AI-UI-013: the reset greeting is not replayed as history after a clear", async () => {
    // Regression: the greeting used to live in `messages` and was filtered out
    // by an exact-id match on "welcome-1". The greeting produced by "Clear
    // conversation" carried a different id, so it slipped into the next
    // request's history and the model was told it had said it.
    mockedApiFetch.mockImplementation((_endpoint, options) => {
      const body = JSON.parse((options?.body as string) ?? "{}");
      return Promise.resolve({ reply: `Echo ${body.message}`, sources: [] });
    });

    const input = openAssistant();
    ask(input, "First question");
    await screen.findByText("Echo First question");

    fireEvent.click(screen.getByTitle(/Clear conversation/i));
    await waitFor(() => expect(screen.queryByText("First question")).not.toBeInTheDocument());

    ask(input, "Question after reset");
    await screen.findByText("Echo Question after reset");

    const body = JSON.parse(mockedApiFetch.mock.lastCall?.[1]?.body as string);
    expect(body.history).toEqual([]);
  });

  it("AI-UI-020: clearing the conversation resets to a single welcome turn", async () => {
    mockedApiFetch.mockResolvedValue({ reply: "Office hours are 09:30 to 18:30.", sources: [] });

    const input = openAssistant();
    ask(input, "What are the office timings?");
    await screen.findByText(/Office hours are/i);

    fireEvent.click(screen.getByTitle(/Clear conversation/i));

    await waitFor(() => {
      expect(screen.queryByText("What are the office timings?")).not.toBeInTheDocument();
    });
    expect(screen.getByText(/Asha/)).toBeInTheDocument();
  });

  // REGRESSION GUARD — SEC-011 (P0), fixed. formatInline() previously built an
  // HTML string and handed it to dangerouslySetInnerHTML, so any markup in an
  // assistant reply was injected raw. Because the rule-based fallback engine
  // (app/core/ai.py) echoes admin-uploaded policy content back verbatim, that
  // made every policy body a stored-XSS vector reaching every employee who
  // asked about it. formatInline now returns React nodes, so the text is
  // escaped. Do not reintroduce dangerouslySetInnerHTML here.
  it("AI-UI-025: renders AI replies as text, never as markup (SEC-011)", async () => {
    mockedApiFetch.mockResolvedValue({
      reply: "<img src=x onerror=\"window.__pwned=true\"> Contact HR for details.",
      sources: [],
    });

    const input = openAssistant();
    ask(input, "Injection probe");

    const transcript = await screen.findByText(/Contact HR for details/i);
    const block = transcript.closest("p,li")!;

    // The exploitable vector is the event-handler attribute, not <script>:
    // markup inserted via innerHTML does not run <script>, but DOES fire
    // onerror/onload handlers.
    expect(block.querySelector("[onerror]")).toBeNull();
    expect(block.querySelector("img")).toBeNull();
    expect((window as unknown as Record<string, unknown>).__pwned).toBeUndefined();
    // The payload survives as visible text — escaped, not swallowed.
    expect(block.textContent).toContain("<img src=x");
  });

  it("AI-UI-026: still renders bold and inline code from markdown replies", async () => {
    mockedApiFetch.mockResolvedValue({
      reply: "You have **12** casual leaves. Use `/employee/leaves` to apply.",
      sources: [],
    });

    const input = openAssistant();
    ask(input, "Formatting probe");

    const bold = await screen.findByText("12");
    expect(bold.tagName).toBe("STRONG");
    expect(screen.getByText("/employee/leaves").tagName).toBe("CODE");
  });
});
