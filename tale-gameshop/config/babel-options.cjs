/**
 * Единые настройки Babel для сборки (webpack) и тестов (Jest): что собирается, то и тестируется.
 *
 * TypeScript компилирует Babel, а не ts-loader: так проект не зависит от программного API
 * компилятора TypeScript, которого у TypeScript 7 нет. Сам TypeScript остаётся для проверки
 * типов (`npx tsc --noEmit`).
 *
 * Декораторы: сервисы размечены @injectable/@inject для inversify. Метаданные типов
 * (design:paramtypes) пишет babel-plugin-transform-typescript-metadata — по ним контейнер
 * понимает, что подставлять в конструктор.
 *
 * Режим JSX задаётся явно. Без этого пресет React берёт режим из окружения Babel, а оно при
 * сборке по умолчанию «development»: в production-бандл попадал jsxDEV, которого в боевой
 * сборке React нет, и витрина падала на старте белым экраном.
 *
 * @param {{ development?: boolean }} [options]
 */
module.exports = function createBabelOptions({ development = false } = {}) {
    return {
        babelrc: false,
        configFile: false,
        presets: [
            '@babel/preset-env',
            ['@babel/preset-react', { runtime: 'automatic', development }],
            // В Babel 8 по умолчанию вырезаются только импорты с явным `import type`. В проекте
            // типы импортируются и обычным import (как позволял ts-loader), поэтому просим
            // прежнее поведение: импорт, который используется только как тип, убирается.
            ['@babel/preset-typescript', { onlyRemoveTypeImports: false }]
        ],
        // Babel 8: вместо loose у плагина полей — общие допущения. Старые декораторы (legacy)
        // требуют полей через присваивание, как было в loose-режиме Babel 7. Поля классов
        // превращает preset-env — уже после пресета TypeScript, который первым убирает `declare`.
        assumptions: {
            setPublicClassFields: true,
            privateFieldsAsProperties: true
        },
        plugins: [
            'babel-plugin-transform-typescript-metadata',
            ['@babel/plugin-proposal-decorators', { version: 'legacy' }]
        ]
    };
};
