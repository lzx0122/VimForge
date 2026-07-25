import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import RecentKeypresses from "./RecentKeypresses.vue";

describe("RecentKeypresses", () => {
  it("renders no region when there are no keys", () => {
    const wrapper = mount(RecentKeypresses, {
      props: { keys: [] },
    });

    expect(wrapper.find('[aria-label="最近按鍵"]').exists()).toBe(false);
  });

  it("renders a region with the keys as ordered tokens", () => {
    const wrapper = mount(RecentKeypresses, {
      props: { keys: ["i", "x", "Esc"] },
    });

    const region = wrapper.get('[aria-label="最近按鍵"]');
    const tokens = region.findAll('[data-testid="recent-key"]');

    expect(tokens.map((token) => token.text())).toEqual(["i", "x", "Esc"]);
  });
});
