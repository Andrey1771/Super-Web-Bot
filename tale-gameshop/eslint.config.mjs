// Линтер здесь ровно для одного: правил хуков React. Типы такие ошибки не ловят —
// хук, добавленный после раннего `return`, компилируется, а падает уже у клиента
// (так чат поддержки уронил всё приложение при первом открытии окна).
//
// Полный набор правил намеренно не подключаем: в проекте свои договорённости о стиле,
// и разбирать тысячу замечаний заодно с этим никто не просил.
//
// Код разбирает парсер Babel. Парсер @typescript-eslint держится за программный API компилятора
// TypeScript, которого у TypeScript 7 нет; правилам ниже типы не нужны, достаточно синтаксиса.
// Синтаксис включается плагинами парсера напрямую: пресеты Babel при разборе не применяются.
// JSX — только в .tsx: в обычном .ts запись <T>value — это приведение типа, а не тег.
import parser from "@babel/eslint-parser";
import reactHooks from "eslint-plugin-react-hooks";
import i18next from "eslint-plugin-i18next";

const babelParser = (jsx) => ({
  parser,
  ecmaVersion: "latest",
  sourceType: "module",
  parserOptions: {
    requireConfigFile: false,
    babelOptions: {
      babelrc: false,
      configFile: false,
      parserOpts: {
        plugins: [["typescript", { dts: false }], ...(jsx ? ["jsx"] : []), "decorators-legacy"],
      },
    },
  },
});

export default [
  { files: ["src/**/*.ts"], ignores: ["src/**/*.test.ts"], languageOptions: babelParser(false) },
  { files: ["src/**/*.tsx"], ignores: ["src/**/*.test.tsx"], languageOptions: babelParser(true) },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/**/*.test.{ts,tsx}"],
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
  // Витрина и кабинет переведены через словари (src/locales): голая английская строка в JSX —
  // это текст, который не переключится вместе с языком сайта. Админка остаётся английской и
  // из проверки исключена, как и мини-приложение Telegram, у которого свой язык.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/**/*.test.{ts,tsx}",
      "src/components/admin/**",
      "src/components/admin-panel/**",
      // Таблица админки (замена DevExtreme): служебные надписи в ней — английские, как вся админка.
      "src/components/grid/**",
      "src/pages/admin/**",
      "src/components/orders/**",
      "src/components/layout/**",
      "src/components/bot/**",
      "src/features/miniapp/**",
      "src/components/ui/StickySaveBar.tsx",
      "src/components/ui/Drawer.tsx",
      // Справочные тексты, которые по решению владельца пока остаются английскими.
      "src/content/**",
      "src/components/faq-page/faq-page.tsx",
      "src/components/rewards-page/CashbackFaq.tsx",
    ],
    plugins: {
      i18next,
    },
    rules: {
      "i18next/no-literal-string": [
        "error",
        {
          mode: "jsx-text-only",
          words: {
            // Знаки, числа, валюты и одиночные символы текстом не считаются.
            exclude: ["[^\\p{L}]*", "TS", "Tale Shop", "Stripe", "stripe", "BTCPay", "Steam", "Keycloak"],
          },
        },
      ],
    },
  },
];
