begin;

create temporary table seed_catalog on commit drop as
select value as unit
from jsonb_array_elements(
$catalog$
[
  {
    "slug": "mode-switching-basic-editing",
    "title": "模式切換與基本編輯",
    "description": "練習進入 Insert Mode、輸入內容並回到 Normal Mode。",
    "difficulty": "beginner",
    "estimatedMinutes": 20,
    "displayOrder": 1,
    "published": true,
    "exerciseType": "guided",
    "supportedModes": ["beginner", "memory_review"],
    "skills": [
      { "slug": "insert-normal-switch", "name": "Insert 與 Normal Mode", "description": "在插入與一般模式間安全切換。", "category": "mode", "difficulty": "beginner", "weight": 1, "primary": true }
    ],
    "solutions": [
      { "sequence": "i// <Esc>", "normalizedActions": [{ "type": "vim_command", "command": "i" }, { "type": "insert_text", "text": "// ", "textLength": 3 }, { "type": "mode_change", "mode": "normal" }], "keystrokeCount": 5, "recommended": true, "explanation": "在類別名稱前進入 Insert Mode，加入註解記號後按 Esc。" }
    ],
    "hints": [
      { "level": 1, "content": "先進入可輸入文字的模式。", "commandPreview": null },
      { "level": 2, "content": "使用 Insert Mode，完成後回到 Normal Mode。", "commandPreview": "i … Esc" },
      { "level": 3, "content": "按 i，輸入兩個斜線與空格。", "commandPreview": "i// " },
      { "level": 4, "content": "完整操作是 i// <Esc>。", "commandPreview": "i// <Esc>" }
    ],
    "variants": [
      {
        "language": "csharp",
        "count": 10,
        "title": "在類別前加入註解 {{n}}",
        "instruction": "在 Demo{{n}} 前插入 //，最後回到 Normal Mode。",
        "initialContent": "public class Demo{{n}} { }",
        "expectedContent": "public class // Demo{{n}} { }",
        "initialCursor": { "line": 0, "column": 13 },
        "completionRule": { "contentMatch": "exact", "cursorMatch": { "type": "ignore" }, "requiredMode": "normal" },
        "targetDurationMs": 12000
      }
    ]
  },
  {
    "slug": "basic-cursor-movement",
    "title": "基礎游標移動",
    "description": "以 h、j、k、l 建立不離開 Normal Mode 的精準移動習慣。",
    "difficulty": "beginner",
    "estimatedMinutes": 16,
    "displayOrder": 2,
    "published": true,
    "exerciseType": "guided",
    "supportedModes": ["beginner", "memory_review"],
    "skills": [
      { "slug": "basic-motion", "name": "h j k l 移動", "description": "使用基礎方向鍵精準移動游標。", "category": "movement", "difficulty": "beginner", "weight": 1, "primary": true }
    ],
    "solutions": [
      { "sequence": "4l", "normalizedActions": [{ "type": "vim_command", "command": "4l" }], "keystrokeCount": 2, "recommended": true, "explanation": "使用 count 搭配 l，一次向右移動四格。" }
    ],
    "hints": [
      { "level": 1, "content": "目標在目前位置右側。", "commandPreview": null },
      { "level": 2, "content": "使用向右移動指令並搭配 count。", "commandPreview": "數字 + l" },
      { "level": 3, "content": "需要向右四格。", "commandPreview": "4l" },
      { "level": 4, "content": "完整操作是 4l。", "commandPreview": "4l" }
    ],
    "variants": [
      {
        "language": "csharp",
        "count": 8,
        "title": "向右精準移動 {{n}}",
        "instruction": "將游標從 p 移到 t，不修改內容。",
        "initialContent": "var point = (1, 2); // {{n}}",
        "expectedContent": "var point = (1, 2); // {{n}}",
        "initialCursor": { "line": 0, "column": 4 },
        "completionRule": { "contentMatch": "unchanged", "cursorMatch": { "type": "exact", "line": 0, "column": 8 }, "requiredMode": "normal" },
        "targetDurationMs": 8000
      }
    ]
  },
  {
    "slug": "word-and-line-movement",
    "title": "單字與行內快速移動",
    "description": "使用 w、b、e 與行首行尾指令跨越程式碼 token。",
    "difficulty": "beginner",
    "estimatedMinutes": 20,
    "displayOrder": 3,
    "published": true,
    "exerciseType": "challenge",
    "supportedModes": ["beginner", "memory_review", "efficiency"],
    "skills": [
      { "slug": "word-motion", "name": "單字移動", "description": "以 word motion 在程式碼 token 間移動。", "category": "movement", "difficulty": "beginner", "weight": 1, "primary": true }
    ],
    "solutions": [
      { "sequence": "2w", "normalizedActions": [{ "type": "vim_command", "command": "2w" }], "keystrokeCount": 2, "recommended": true, "explanation": "用 count 加 w 直接跳到 beta。" }
    ],
    "hints": [
      { "level": 1, "content": "以單字為單位向右移動。", "commandPreview": null },
      { "level": 2, "content": "使用 word motion 與 count。", "commandPreview": "數字 + w" },
      { "level": 3, "content": "向前跨越兩個 word 起點。", "commandPreview": "2w" },
      { "level": 4, "content": "完整操作是 2w。", "commandPreview": "2w" }
    ],
    "variants": [
      {
        "language": "csharp",
        "count": 10,
        "title": "跳到下一個運算元 {{n}}",
        "instruction": "從 alpha 移到 beta 的開頭，不修改內容。",
        "initialContent": "var alpha = beta + gamma; // {{n}}",
        "expectedContent": "var alpha = beta + gamma; // {{n}}",
        "initialCursor": { "line": 0, "column": 4 },
        "completionRule": { "contentMatch": "unchanged", "cursorMatch": { "type": "exact", "line": 0, "column": 12 }, "requiredMode": "normal" },
        "targetDurationMs": 7000
      }
    ]
  },
  {
    "slug": "delete-and-change",
    "title": "刪除與修改",
    "description": "以 Operator 搭配 Motion 與文字範圍完成刪除、替換。",
    "difficulty": "intermediate",
    "estimatedMinutes": 24,
    "displayOrder": 4,
    "published": true,
    "exerciseType": "challenge",
    "supportedModes": ["beginner", "memory_review", "efficiency"],
    "skills": [
      { "slug": "change-text", "name": "刪除與修改", "description": "使用 change 與 delete operator 修改目標。", "category": "editing", "difficulty": "intermediate", "weight": 1, "primary": true }
    ],
    "solutions": [
      { "sequence": "ci\"approved<Esc>", "normalizedActions": [{ "type": "vim_command", "command": "ci\"" }, { "type": "insert_text", "text": "approved", "textLength": 8 }, { "type": "mode_change", "mode": "normal" }], "keystrokeCount": 12, "recommended": true, "explanation": "ci\" 只替換雙引號內的狀態文字。" }
    ],
    "hints": [
      { "level": 1, "content": "只修改引號內的文字。", "commandPreview": null },
      { "level": 2, "content": "使用 change 搭配引號文字物件。", "commandPreview": "c + i + 引號" },
      { "level": 3, "content": "先按 ci\"，再輸入新狀態。", "commandPreview": "ci\"approved" },
      { "level": 4, "content": "完整操作是 ci\"approved<Esc>。", "commandPreview": "ci\"approved<Esc>" }
    ],
    "variants": [
      {
        "language": "csharp",
        "count": 12,
        "title": "修改字串狀態 {{n}}",
        "instruction": "將 draft 改成 approved，保留雙引號。",
        "initialContent": "var status = \"draft\"; // {{n}}",
        "expectedContent": "var status = \"approved\"; // {{n}}",
        "initialCursor": { "line": 0, "column": 14 },
        "completionRule": { "contentMatch": "exact", "cursorMatch": { "type": "ignore" }, "requiredMode": "normal" },
        "targetDurationMs": 10000
      }
    ]
  },
  {
    "slug": "copy-paste-undo-repeat",
    "title": "複製、貼上、復原與重複",
    "description": "用行級 yank、paste、undo 與 repeat 操作重複編輯。",
    "difficulty": "intermediate",
    "estimatedMinutes": 20,
    "displayOrder": 5,
    "published": true,
    "exerciseType": "challenge",
    "supportedModes": ["beginner", "memory_review", "efficiency"],
    "skills": [
      { "slug": "copy-paste", "name": "複製與貼上", "description": "以行級 yank 與 paste 重複程式碼。", "category": "copy_paste", "difficulty": "intermediate", "weight": 1, "primary": true }
    ],
    "solutions": [
      { "sequence": "yyp", "normalizedActions": [{ "type": "vim_command", "command": "yyp" }], "keystrokeCount": 3, "recommended": true, "explanation": "yy 複製整行，p 將它貼到下一行。" }
    ],
    "hints": [
      { "level": 1, "content": "先複製整行，再貼到下方。", "commandPreview": null },
      { "level": 2, "content": "使用 linewise yank 與 put。", "commandPreview": "yy + p" },
      { "level": 3, "content": "連續按 yy，再按 p。", "commandPreview": "yyp" },
      { "level": 4, "content": "完整操作是 yyp。", "commandPreview": "yyp" }
    ],
    "variants": [
      {
        "language": "csharp",
        "count": 10,
        "title": "複製宣告行 {{n}}",
        "instruction": "將目前宣告複製到下一行。",
        "initialContent": "var item{{n}} = 1;",
        "expectedContent": "var item{{n}} = 1;\nvar item{{n}} = 1;",
        "initialCursor": { "line": 0, "column": 0 },
        "completionRule": { "contentMatch": "exact", "cursorMatch": { "type": "ignore" }, "requiredMode": "normal" },
        "targetDurationMs": 7000
      }
    ]
  },
  {
    "slug": "line-find-and-jump",
    "title": "行內搜尋與精準跳轉",
    "description": "使用 f、t、分號與逗號在目前行內定位字元。",
    "difficulty": "intermediate",
    "estimatedMinutes": 20,
    "displayOrder": 6,
    "published": true,
    "exerciseType": "review",
    "supportedModes": ["memory_review", "efficiency"],
    "skills": [
      { "slug": "line-find", "name": "行內搜尋", "description": "以 f 與 t 精準跳到目前行的目標字元。", "category": "find", "difficulty": "intermediate", "weight": 1, "primary": true }
    ],
    "solutions": [
      { "sequence": "fT", "normalizedActions": [{ "type": "vim_command", "command": "fT" }], "keystrokeCount": 2, "recommended": true, "explanation": "fT 直接跳到目前行下一個大寫 T。" }
    ],
    "hints": [
      { "level": 1, "content": "目標字元在目前行。", "commandPreview": null },
      { "level": 2, "content": "使用 find character 指令。", "commandPreview": "f + 字元" },
      { "level": 3, "content": "尋找大寫 T。", "commandPreview": "fT" },
      { "level": 4, "content": "完整操作是 fT。", "commandPreview": "fT" }
    ],
    "variants": [
      {
        "language": "csharp",
        "count": 10,
        "title": "跳到 Target {{n}}",
        "instruction": "將游標移到 Target 的大寫 T，不修改內容。",
        "initialContent": "var result = source.Target; // {{n}}",
        "expectedContent": "var result = source.Target; // {{n}}",
        "initialCursor": { "line": 0, "column": 0 },
        "completionRule": { "contentMatch": "unchanged", "cursorMatch": { "type": "exact", "line": 0, "column": 20 }, "requiredMode": "normal" },
        "targetDurationMs": 6500
      }
    ]
  },
  {
    "slug": "search-and-code-navigation",
    "title": "全文搜尋與程式碼定位",
    "description": "使用 /、?、n、N、* 與 # 在多行程式碼中定位。",
    "difficulty": "intermediate",
    "estimatedMinutes": 20,
    "displayOrder": 7,
    "published": true,
    "exerciseType": "review",
    "supportedModes": ["memory_review", "efficiency"],
    "skills": [
      { "slug": "document-search", "name": "全文搜尋", "description": "以搜尋指令跨行定位識別字。", "category": "search", "difficulty": "intermediate", "weight": 1, "primary": true }
    ],
    "solutions": [
      { "sequence": "/target<Enter>", "normalizedActions": [{ "type": "search", "query": "target", "direction": "forward" }], "keystrokeCount": 8, "recommended": true, "explanation": "使用 /target 從目前位置向後搜尋。" }
    ],
    "hints": [
      { "level": 1, "content": "目標在下一行，使用全文搜尋。", "commandPreview": null },
      { "level": 2, "content": "使用向後搜尋指令。", "commandPreview": "/查詢" },
      { "level": 3, "content": "搜尋 target。", "commandPreview": "/target" },
      { "level": 4, "content": "完整操作是 /target<Enter>。", "commandPreview": "/target<Enter>" }
    ],
    "variants": [
      {
        "language": "typescript",
        "count": 10,
        "title": "搜尋 target 宣告 {{n}}",
        "instruction": "搜尋並移到第二行 target 的開頭。",
        "initialContent": "const first = 1;\nconst target = {{n}};",
        "expectedContent": "const first = 1;\nconst target = {{n}};",
        "initialCursor": { "line": 0, "column": 0 },
        "completionRule": { "contentMatch": "unchanged", "cursorMatch": { "type": "exact", "line": 1, "column": 6 }, "requiredMode": "normal" },
        "targetDurationMs": 9000
      }
    ]
  },
  {
    "slug": "text-objects",
    "title": "文字物件",
    "description": "使用 iw、aw 與成對符號文字物件精準修改內容。",
    "difficulty": "advanced",
    "estimatedMinutes": 28,
    "displayOrder": 8,
    "published": true,
    "exerciseType": "challenge",
    "supportedModes": ["memory_review", "efficiency"],
    "skills": [
      { "slug": "quoted-text-object", "name": "引號文字物件", "description": "以引號文字物件修改字串內容。", "category": "text_object", "difficulty": "advanced", "weight": 1, "primary": true }
    ],
    "solutions": [
      { "sequence": "ci\"approved<Esc>", "normalizedActions": [{ "type": "vim_command", "command": "ci\"" }, { "type": "insert_text", "text": "approved", "textLength": 8 }, { "type": "mode_change", "mode": "normal" }], "keystrokeCount": 12, "recommended": true, "explanation": "ci\" 不需先選取即可替換引號內文字。" }
    ],
    "hints": [
      { "level": 1, "content": "把引號內部視為一個文字物件。", "commandPreview": null },
      { "level": 2, "content": "使用 change inside quotes。", "commandPreview": "ci + 引號" },
      { "level": 3, "content": "按 ci\" 後輸入 approved。", "commandPreview": "ci\"approved" },
      { "level": 4, "content": "完整操作是 ci\"approved<Esc>。", "commandPreview": "ci\"approved<Esc>" }
    ],
    "variants": [
      {
        "language": "javascript",
        "count": 10,
        "title": "修改 JavaScript 字串 {{n}}",
        "instruction": "只將雙引號內的 draft{{n}} 改成 approved。",
        "initialContent": "const label = \"draft{{n}}\";",
        "expectedContent": "const label = \"approved\";",
        "initialCursor": { "line": 0, "column": 15 },
        "completionRule": { "contentMatch": "exact", "cursorMatch": { "type": "ignore" }, "requiredMode": "normal" },
        "targetDurationMs": 8000
      },
      {
        "language": "json",
        "count": 4,
        "title": "修改 JSON 字串 {{n}}",
        "instruction": "只將 label 的字串內容改成 approved。",
        "initialContent": "{ \"label\": \"draft{{n}}\" }",
        "expectedContent": "{ \"label\": \"approved\" }",
        "initialCursor": { "line": 0, "column": 12 },
        "completionRule": { "contentMatch": "exact", "cursorMatch": { "type": "ignore" }, "requiredMode": "normal" },
        "targetDurationMs": 8500
      }
    ]
  },
  {
    "slug": "visual-mode-ranges",
    "title": "Visual Mode 與範圍操作",
    "description": "使用 Characterwise 與 Linewise Visual Mode 操作選取範圍。",
    "difficulty": "advanced",
    "estimatedMinutes": 16,
    "displayOrder": 9,
    "published": true,
    "exerciseType": "challenge",
    "supportedModes": ["memory_review", "efficiency"],
    "skills": [
      { "slug": "visual-word-change", "name": "Visual 範圍修改", "description": "以 Visual Mode 選取單字並修改。", "category": "visual", "difficulty": "advanced", "weight": 1, "primary": true }
    ],
    "solutions": [
      { "sequence": "viwcfinal<Esc>", "normalizedActions": [{ "type": "mode_change", "mode": "visual" }, { "type": "vim_command", "command": "iwc" }, { "type": "insert_text", "text": "final", "textLength": 5 }, { "type": "mode_change", "mode": "normal" }], "keystrokeCount": 10, "recommended": true, "explanation": "viw 選取目前單字，c 後輸入 final。" }
    ],
    "hints": [
      { "level": 1, "content": "先選取目前單字，再修改。", "commandPreview": null },
      { "level": 2, "content": "使用 Visual Mode 搭配 inner word。", "commandPreview": "viw" },
      { "level": 3, "content": "viw 選取後按 c，輸入 final。", "commandPreview": "viwcfinal" },
      { "level": 4, "content": "完整操作是 viwcfinal<Esc>。", "commandPreview": "viwcfinal<Esc>" }
    ],
    "variants": [
      {
        "language": "html",
        "count": 4,
        "title": "修改 HTML 文字 {{n}}",
        "instruction": "用 Visual Mode 將 span 內的 draft{{n}} 改成 final。",
        "initialContent": "<span>draft{{n}}</span>",
        "expectedContent": "<span>final</span>",
        "initialCursor": { "line": 0, "column": 6 },
        "completionRule": { "contentMatch": "exact", "cursorMatch": { "type": "ignore" }, "requiredMode": "normal" },
        "targetDurationMs": 10000
      },
      {
        "language": "css",
        "count": 4,
        "title": "修改 CSS selector {{n}}",
        "instruction": "用 Visual Mode 將 class 名稱 draft{{n}} 改成 final。",
        "initialContent": ".draft{{n}} { color: red; }",
        "expectedContent": ".final { color: red; }",
        "initialCursor": { "line": 0, "column": 1 },
        "completionRule": { "contentMatch": "exact", "cursorMatch": { "type": "ignore" }, "requiredMode": "normal" },
        "targetDurationMs": 10000
      }
    ]
  },
  {
    "slug": "vim-composition-efficiency",
    "title": "Vim 組合思維與效率",
    "description": "組合 Count、Operator、Motion 與 Text Object，以更少按鍵完成任務。",
    "difficulty": "advanced",
    "estimatedMinutes": 16,
    "displayOrder": 10,
    "published": true,
    "exerciseType": "challenge",
    "supportedModes": ["efficiency"],
    "skills": [
      { "slug": "operator-composition", "name": "Operator 組合", "description": "組合 count、operator 與 motion 完成高效率編輯。", "category": "composition", "difficulty": "advanced", "weight": 1, "primary": true }
    ],
    "solutions": [
      { "sequence": "d2w", "normalizedActions": [{ "type": "vim_command", "command": "d2w" }], "keystrokeCount": 3, "recommended": true, "explanation": "將 delete operator 與 2w 組合，一次刪除兩個 word 範圍。" }
    ],
    "hints": [
      { "level": 1, "content": "用一次組合操作刪除前兩個單字。", "commandPreview": null },
      { "level": 2, "content": "使用 delete operator、count 與 word motion。", "commandPreview": "d + 2 + w" },
      { "level": 3, "content": "把 d 與 2w 組合。", "commandPreview": "d2w" },
      { "level": 4, "content": "完整操作是 d2w。", "commandPreview": "d2w" }
    ],
    "variants": [
      {
        "language": "sql",
        "count": 4,
        "title": "精簡 SQL 欄位 {{n}}",
        "instruction": "用一次組合操作刪除前兩個 word 範圍。",
        "initialContent": "select old_name, old_value from items_{{n}};",
        "expectedContent": "select old_value from items_{{n}};",
        "initialCursor": { "line": 0, "column": 7 },
        "completionRule": { "contentMatch": "exact", "cursorMatch": { "type": "ignore" }, "requiredMode": "normal" },
        "targetDurationMs": 7000
      },
      {
        "language": "markdown",
        "count": 4,
        "title": "精簡 Markdown 文字 {{n}}",
        "instruction": "刪除開頭兩個單字，只保留 words 與編號。",
        "initialContent": "old quick words {{n}}",
        "expectedContent": "words {{n}}",
        "initialCursor": { "line": 0, "column": 0 },
        "completionRule": { "contentMatch": "exact", "cursorMatch": { "type": "ignore" }, "requiredMode": "normal" },
        "targetDurationMs": 6500
      }
    ]
  }
]
$catalog$::jsonb
);

insert into public.learning_units (
  slug,
  title,
  description,
  difficulty,
  estimated_minutes,
  display_order,
  is_published
)
select
  unit ->> 'slug',
  unit ->> 'title',
  unit ->> 'description',
  unit ->> 'difficulty',
  (unit ->> 'estimatedMinutes')::smallint,
  (unit ->> 'displayOrder')::smallint,
  (unit ->> 'published')::boolean
from seed_catalog
on conflict (slug) do update set
  title = excluded.title,
  description = excluded.description,
  difficulty = excluded.difficulty,
  estimated_minutes = excluded.estimated_minutes,
  display_order = excluded.display_order,
  is_published = excluded.is_published,
  updated_at = now();

insert into public.skills (slug, name, description, category, difficulty)
select distinct
  skill ->> 'slug',
  skill ->> 'name',
  skill ->> 'description',
  skill ->> 'category',
  skill ->> 'difficulty'
from seed_catalog
cross join lateral jsonb_array_elements(unit -> 'skills') as skill
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  difficulty = excluded.difficulty,
  updated_at = now();

delete from public.unit_skills
using public.learning_units, seed_catalog
where unit_skills.unit_id = learning_units.id
  and learning_units.slug = seed_catalog.unit ->> 'slug';

insert into public.unit_skills (
  unit_id,
  skill_id,
  is_primary,
  display_order
)
select
  learning_units.id,
  skills.id,
  (skill ->> 'primary')::boolean,
  skill_order::smallint
from seed_catalog
join public.learning_units
  on learning_units.slug = seed_catalog.unit ->> 'slug'
cross join lateral jsonb_array_elements(unit -> 'skills')
  with ordinality as skill_data(skill, skill_order)
join public.skills on skills.slug = skill ->> 'slug';

create temporary table seed_exercise_rows on commit drop as
select
  expanded.*,
  row_number() over (
    partition by expanded.unit ->> 'slug'
    order by expanded.variant_order, expanded.ordinal
  )::integer as exercise_number
from (
  select
    seed_catalog.unit,
    variant_data.variant,
    variant_data.variant_order,
    ordinal
  from seed_catalog
  cross join lateral jsonb_array_elements(unit -> 'variants')
    with ordinality as variant_data(variant, variant_order)
  cross join lateral generate_series(
    1,
    (variant_data.variant ->> 'count')::integer
  ) as ordinal
) as expanded;

insert into public.exercises (
  unit_id,
  slug,
  title,
  instruction,
  language,
  exercise_type,
  difficulty,
  initial_content,
  expected_content,
  initial_cursor,
  completion_rule,
  supported_modes,
  target_duration_ms,
  version,
  is_published
)
select
  learning_units.id,
  (unit ->> 'slug') || '-' || lpad(exercise_number::text, 2, '0'),
  replace(variant ->> 'title', '{{n}}', ordinal::text),
  replace(variant ->> 'instruction', '{{n}}', ordinal::text),
  variant ->> 'language',
  unit ->> 'exerciseType',
  unit ->> 'difficulty',
  replace(variant ->> 'initialContent', '{{n}}', ordinal::text),
  replace(variant ->> 'expectedContent', '{{n}}', ordinal::text),
  variant -> 'initialCursor',
  variant -> 'completionRule',
  array(
    select jsonb_array_elements_text(unit -> 'supportedModes')
  ),
  (variant ->> 'targetDurationMs')::integer,
  1,
  (unit ->> 'published')::boolean
from seed_exercise_rows
join public.learning_units
  on learning_units.slug = unit ->> 'slug'
on conflict (slug) do update set
  unit_id = excluded.unit_id,
  title = excluded.title,
  instruction = excluded.instruction,
  language = excluded.language,
  exercise_type = excluded.exercise_type,
  difficulty = excluded.difficulty,
  initial_content = excluded.initial_content,
  expected_content = excluded.expected_content,
  initial_cursor = excluded.initial_cursor,
  completion_rule = excluded.completion_rule,
  supported_modes = excluded.supported_modes,
  target_duration_ms = excluded.target_duration_ms,
  version = excluded.version,
  is_published = excluded.is_published,
  updated_at = now();

delete from public.exercise_skills
using public.exercises, seed_exercise_rows
where exercise_skills.exercise_id = exercises.id
  and exercises.slug =
    (unit ->> 'slug') || '-' || lpad(exercise_number::text, 2, '0');

insert into public.exercise_skills (
  exercise_id,
  skill_id,
  weight,
  is_primary
)
select
  exercises.id,
  skills.id,
  (skill ->> 'weight')::numeric(4, 3),
  (skill ->> 'primary')::boolean
from seed_exercise_rows
join public.exercises
  on exercises.slug =
    (unit ->> 'slug') || '-' || lpad(exercise_number::text, 2, '0')
cross join lateral jsonb_array_elements(unit -> 'skills') as skill
join public.skills on skills.slug = skill ->> 'slug';

delete from public.exercise_solutions
using public.exercises, seed_exercise_rows
where exercise_solutions.exercise_id = exercises.id
  and exercises.slug =
    (unit ->> 'slug') || '-' || lpad(exercise_number::text, 2, '0');

insert into public.exercise_solutions (
  exercise_id,
  sequence,
  normalized_actions,
  keystroke_count,
  is_recommended,
  explanation,
  display_order
)
select
  exercises.id,
  replace(solution ->> 'sequence', '{{n}}', ordinal::text),
  solution -> 'normalizedActions',
  (solution ->> 'keystrokeCount')::smallint,
  (solution ->> 'recommended')::boolean,
  solution ->> 'explanation',
  solution_order::smallint
from seed_exercise_rows
join public.exercises
  on exercises.slug =
    (unit ->> 'slug') || '-' || lpad(exercise_number::text, 2, '0')
cross join lateral jsonb_array_elements(unit -> 'solutions')
  with ordinality as solution_data(solution, solution_order);

delete from public.exercise_hints
using public.exercises, seed_exercise_rows
where exercise_hints.exercise_id = exercises.id
  and exercises.slug =
    (unit ->> 'slug') || '-' || lpad(exercise_number::text, 2, '0');

insert into public.exercise_hints (
  exercise_id,
  level,
  content,
  command_preview
)
select
  exercises.id,
  (hint ->> 'level')::smallint,
  replace(hint ->> 'content', '{{n}}', ordinal::text),
  case
    when hint -> 'commandPreview' = 'null'::jsonb then null
    else replace(hint ->> 'commandPreview', '{{n}}', ordinal::text)
  end
from seed_exercise_rows
join public.exercises
  on exercises.slug =
    (unit ->> 'slug') || '-' || lpad(exercise_number::text, 2, '0')
cross join lateral jsonb_array_elements(unit -> 'hints') as hint;

commit;
