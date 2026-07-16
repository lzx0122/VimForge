import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_SETTINGS, useSettingsStore } from "../../../stores/settings-store";
import SettingsPage from "./SettingsPage.vue";

describe("SettingsPage", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  function mountSettingsPage() {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useSettingsStore();
    store.$patch({
      ...DEFAULT_SETTINGS,
      initialized: true,
      persistenceStatus: "local",
    });
    const updateSettings = vi
      .spyOn(store, "updateSettings")
      .mockImplementation(async (patch) => {
        store.$patch(patch);
    });
    const wrapper = mount(SettingsPage, {
      global: { plugins: [pinia] },
    });

    return { store, updateSettings, wrapper };
  }

  it("limits editor font size to 12 through 28", async () => {
    const { store, updateSettings, wrapper } = mountSettingsPage();
    const input = wrapper.get('[data-testid="editor-font-size"]');

    expect(input.attributes("min")).toBe("12");
    expect(input.attributes("max")).toBe("28");
    expect(input.element).toMatchObject({ value: "16" });

    await input.setValue("28");

    expect(updateSettings).toHaveBeenCalledWith({ editorFontSize: 28 });
    expect(store.editorFontSize).toBe(28);
  });

  it("updates line numbers, recent keypresses, and sound", async () => {
    const { updateSettings, wrapper } = mountSettingsPage();

    await wrapper.get('[data-testid="show-line-numbers"]').setValue(false);
    await wrapper.get('[data-testid="show-keypresses"]').setValue(false);
    await wrapper.get('[data-testid="sound-enabled"]').setValue(true);

    expect(updateSettings).toHaveBeenCalledWith({ showLineNumbers: false });
    expect(updateSettings).toHaveBeenCalledWith({ showKeypresses: false });
    expect(updateSettings).toHaveBeenCalledWith({ soundEnabled: true });
  });

  it("offers 5, 10, and 20 as the default question count", async () => {
    const { store, updateSettings, wrapper } = mountSettingsPage();
    const selector = wrapper.get('[data-testid="question-count-selector"]');

    expect(
      selector
        .findAll('input[type="radio"]')
        .map((input) => input.attributes("value")),
    ).toEqual(["5", "10", "20"]);
    expect(selector.get('input[value="10"]').element).toMatchObject({
      checked: true,
    });

    await selector.get('input[value="20"]').setValue();

    expect(updateSettings).toHaveBeenCalledWith({
      preferredQuestionCount: 20,
    });
    expect(store.preferredQuestionCount).toBe(20);
  });

  it("shows whether settings are local, synced, or waiting after an error", async () => {
    const { store, wrapper } = mountSettingsPage();

    expect(wrapper.get('[data-testid="settings-status"]').text()).toContain(
      "保存在這台裝置",
    );

    store.$patch({
      persistenceStatus: "error",
      errorMessage: "設定已保存在這台裝置，但暫時無法同步。",
    });
    await wrapper.vm.$nextTick();

    expect(wrapper.get('[role="alert"]').text()).toContain("暫時無法同步");
  });
});
