// Линтер здесь ровно для одного: правил хуков React. Типы такие ошибки не ловят —
// хук, добавленный после раннего `return`, компилируется, а падает уже у клиента
// (так чат поддержки уронил всё приложение при первом открытии окна).
//
// Полный набор правил намеренно не подключаем: в проекте свои договорённости о стиле,
// и разбирать тысячу замечаний заодно с этим никто не просил.
import parser from "@typescript-eslint/parser";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/**/*.test.{ts,tsx}"],
    languageOptions: {
      parser,
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      // Нарушение порядка хуков — всегда поломка во время работы, а не вопрос вкуса.
      "react-hooks/rules-of-hooks": "error",
      // Забытая зависимость даёт устаревшее замыкание — чинить стоит, но останавливать
      // сборку из-за накопившихся случаев не будем.
      "react-hooks/exhaustive-deps": "warn",
    },
  },
];
