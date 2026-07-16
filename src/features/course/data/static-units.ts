export interface StaticCourseUnit {
  slug: string;
  title: string;
  commands: string;
  exerciseCount: number;
  prerequisiteSuggestion?: string;
}

export const STATIC_COURSE_UNITS: readonly StaticCourseUnit[] = [
  {
    slug: "mode-switching-basic-editing",
    title: "模式切換與基本編輯",
    commands: "i a I A o O Esc",
    exerciseCount: 10,
  },
  {
    slug: "basic-cursor-movement",
    title: "基礎游標移動",
    commands: "h j k l",
    exerciseCount: 8,
    prerequisiteSuggestion: "建議先熟悉模式切換與 Esc。",
  },
  {
    slug: "word-and-line-movement",
    title: "單字與行內快速移動",
    commands: "w W b B e 0 ^ $",
    exerciseCount: 10,
    prerequisiteSuggestion: "建議先熟悉基礎游標移動。",
  },
  {
    slug: "delete-and-change",
    title: "刪除與修改",
    commands: "x X d dd D dw de d$ c cc C cw ce",
    exerciseCount: 12,
    prerequisiteSuggestion: "建議先熟悉單字與行內移動。",
  },
  {
    slug: "copy-paste-undo-repeat",
    title: "複製、貼上、復原與重複",
    commands: "y yy yw p P u Ctrl-r .",
    exerciseCount: 10,
    prerequisiteSuggestion: "建議先熟悉刪除與修改。",
  },
  {
    slug: "line-find-and-jump",
    title: "行內搜尋與精準跳轉",
    commands: "f F t T ; ,",
    exerciseCount: 10,
    prerequisiteSuggestion: "建議先熟悉單字與行內移動。",
  },
  {
    slug: "search-and-code-navigation",
    title: "全文搜尋與程式碼定位",
    commands: "/ ? n N * #",
    exerciseCount: 10,
    prerequisiteSuggestion: "建議先熟悉基礎游標移動。",
  },
  {
    slug: "text-objects",
    title: "文字物件",
    commands: "iw aw i\" a\" i' a' i( a( i[ a[ i{ a{",
    exerciseCount: 14,
    prerequisiteSuggestion: "建議先熟悉刪除、修改與 Operator。",
  },
  {
    slug: "visual-mode-ranges",
    title: "Visual Mode 與範圍操作",
    commands: "v V Ctrl-v o d c y > <",
    exerciseCount: 8,
    prerequisiteSuggestion: "建議先熟悉刪除、修改與複製。",
  },
  {
    slug: "vim-composition-efficiency",
    title: "Vim 組合思維與效率",
    commands: "Count、Operator、Motion、Text Object",
    exerciseCount: 8,
    prerequisiteSuggestion: "建議先熟悉移動、Operator 與文字物件。",
  },
];
