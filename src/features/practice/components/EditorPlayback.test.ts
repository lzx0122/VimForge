import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

import EditorPlayback from "./EditorPlayback.vue";

afterEach(() => {
  vi.useRealTimers();
});

describe("EditorPlayback", () => {
  it("scrolls the playback block into view before starting", async () => {
    const wrapper = mount(EditorPlayback, {
      props: {
        command: "ciw",
        completedContent: "const value = true;",
      },
    });
    const scrollIntoView = vi.fn();
    Object.defineProperty(wrapper.get(".editor-playback").element, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });

    await wrapper.get('[data-testid="start-playback"]').trigger("click");

    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "center",
    });
    expect(wrapper.get('[data-testid="playback-completed-content"]').text()).toContain(
      "const value = true;",
    );
  });

  it("uses a slower default interval while highlighting each key", async () => {
    vi.useFakeTimers();
    const wrapper = mount(EditorPlayback, {
      props: {
        command: "ci",
        completedContent: "const value = true;",
      },
    });

    await wrapper.get('[data-testid="start-playback"]').trigger("click");
    expect(wrapper.get('kbd[aria-current="step"]').text()).toBe("c");

    await vi.advanceTimersByTimeAsync(599);
    expect(wrapper.get('kbd[aria-current="step"]').text()).toBe("c");
    expect(wrapper.emitted("playbackComplete")).toBeUndefined();

    await vi.advanceTimersByTimeAsync(1);
    expect(wrapper.get('kbd[aria-current="step"]').text()).toBe("i");

    await vi.advanceTimersByTimeAsync(600);
    expect(wrapper.emitted("playbackComplete")).toHaveLength(1);
  });

  it("accepts a shorter delay for deterministic callers", async () => {
    vi.useFakeTimers();
    const wrapper = mount(EditorPlayback, {
      props: {
        command: "ci",
        completedContent: "const value = true;",
        stepDelayMs: 10,
      },
    });

    await wrapper.get('[data-testid="start-playback"]').trigger("click");
    await vi.advanceTimersByTimeAsync(20);

    expect(wrapper.emitted("playbackComplete")).toHaveLength(1);
  });
});
