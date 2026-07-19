import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import ResumeSessionDialog from "./ResumeSessionDialog.vue";

describe("ResumeSessionDialog", () => {
  it("offers resume, reset, and abandon choices for an unfinished attempt", async () => {
    const wrapper = mount(ResumeSessionDialog, {
      props: { hasAttemptDraft: true },
    });

    expect(wrapper.get('[role="dialog"]').attributes("aria-modal")).toBe(
      "true",
    );
    expect(wrapper.get('[role="dialog"]').attributes("aria-labelledby")).toBe(
      "resume-session-title",
    );
    expect(wrapper.text()).toContain("發現尚未完成的練習");
    expect(wrapper.text()).toContain("未完成的單題內容仍保存在這台裝置");

    await wrapper.get('[data-action="resume"]').trigger("click");
    await wrapper.get('[data-action="reset-attempt"]').trigger("click");
    await wrapper.get('[data-action="abandon"]').trigger("click");

    expect(wrapper.emitted("resume")).toHaveLength(1);
    expect(wrapper.emitted("resetAttempt")).toHaveLength(1);
    expect(wrapper.emitted("abandon")).toHaveLength(1);
  });

  it("does not offer attempt reset when only session progress is available", () => {
    const wrapper = mount(ResumeSessionDialog, {
      props: { hasAttemptDraft: false },
    });

    expect(wrapper.text()).toContain("題組進度仍保存在這台裝置");
    expect(wrapper.find('[data-action="reset-attempt"]').exists()).toBe(false);
    expect(wrapper.get('[data-action="resume"]').text()).toContain("繼續題組");
  });
});
