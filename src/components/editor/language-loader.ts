import { StreamLanguage } from "@codemirror/language";
import type { Extension } from "@codemirror/state";

import type { SupportedLanguage } from "../../types";

export async function loadLanguageExtension(
  language: SupportedLanguage,
): Promise<Extension> {
  switch (language) {
    case "csharp": {
      const { csharp } = await import("@codemirror/legacy-modes/mode/clike");
      return StreamLanguage.define(csharp);
    }
    case "typescript": {
      const { javascript } = await import("@codemirror/lang-javascript");
      return javascript({ typescript: true });
    }
    case "javascript": {
      const { javascript } = await import("@codemirror/lang-javascript");
      return javascript();
    }
    case "json": {
      const { json } = await import("@codemirror/lang-json");
      return json();
    }
    case "html": {
      const { html } = await import("@codemirror/lang-html");
      return html();
    }
    case "css": {
      const { css } = await import("@codemirror/lang-css");
      return css();
    }
    case "sql": {
      const { sql } = await import("@codemirror/lang-sql");
      return sql();
    }
    case "markdown": {
      const { markdown } = await import("@codemirror/lang-markdown");
      return markdown();
    }
    case "plaintext":
      return [];
  }
}
