import { afterEach, describe, expect, it, vi } from "vitest";

import { scrollFeedbackIntoView } from "./feedback-scroll-service";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function mockMatchMedia(matches: boolean): ReturnType<typeof vi.fn> {
  const matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === REDUCED_MOTION_QUERY && matches,
    media: query,
  }));
  vi.stubGlobal("matchMedia", matchMedia);
  return matchMedia;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("scrollFeedbackIntoView", () => {
  it("scrolls smoothly when the user has no reduced-motion preference", () => {
    const matchMedia = mockMatchMedia(false);
    const scrollIntoView = vi.fn();
    const anchor = { scrollIntoView } as unknown as HTMLElement;

    scrollFeedbackIntoView(anchor);

    expect(matchMedia).toHaveBeenCalledWith(REDUCED_MOTION_QUERY);
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start",
      inline: "nearest",
    });
  });

  it("scrolls without animation when the user prefers reduced motion", () => {
    const matchMedia = mockMatchMedia(true);
    const scrollIntoView = vi.fn();
    const anchor = { scrollIntoView } as unknown as HTMLElement;

    scrollFeedbackIntoView(anchor);

    expect(matchMedia).toHaveBeenCalledWith(REDUCED_MOTION_QUERY);
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "auto",
      block: "start",
      inline: "nearest",
    });
  });

  it("does nothing when the anchor is null", () => {
    mockMatchMedia(false);

    expect(() => {
      scrollFeedbackIntoView(null);
    }).not.toThrow();
  });

  it("does nothing when scrollIntoView is unavailable on the anchor", () => {
    mockMatchMedia(false);
    const anchor = {} as HTMLElement;

    expect(() => {
      scrollFeedbackIntoView(anchor);
    }).not.toThrow();
  });

  it("defaults to smooth scrolling when matchMedia is unavailable", () => {
    vi.stubGlobal("matchMedia", undefined);
    const scrollIntoView = vi.fn();
    const anchor = { scrollIntoView } as unknown as HTMLElement;

    scrollFeedbackIntoView(anchor);

    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start",
      inline: "nearest",
    });
  });
});
