const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }

  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

export function scrollFeedbackIntoView(anchor: HTMLElement | null): void {
  if (anchor === null || typeof anchor.scrollIntoView !== "function") {
    return;
  }

  anchor.scrollIntoView({
    behavior: prefersReducedMotion() ? "auto" : "smooth",
    block: "start",
    inline: "nearest",
  });
}
