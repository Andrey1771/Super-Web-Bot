/**
 * Настройка тестов фронтенда.
 *
 * Тесты в проекте лежали с самого начала (пять файлов и setupTests.ts), но запустить их было
 * нечем: раннера в зависимостях не было, а `npm test` был заглушкой «no test specified».
 * Здесь подключён Jest — под тот же Babel, которым собирает webpack, поэтому отдельного
 * набора правил для тестов не появляется: что собирается, то и тестируется.
 *
 * Конфиг в .cjs, потому что в package.json стоит "type": "module", а Jest читает конфиг как
 * CommonJS.
 */
module.exports = {
    // Тесты рисуют компоненты и читают DOM — нужен браузерный энвайронмент.
    testEnvironment: 'jsdom',

    setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],

    // Пресеты те же, что у сборки (.babelrc), плюс декораторы: сервисы размечены
    // @injectable/@inject для inversify, а webpack компилирует такие файлы ts-loader'ом, который
    // декораторы понимает сам. Babel'ю это нужно объяснить — иначе тест не может импортировать
    // ничего, что тянет за собой контейнер зависимостей.
    transform: {
        '^.+\\.[jt]sx?$': ['babel-jest', {
            babelrc: false,
            configFile: false,
            presets: ['@babel/preset-env', '@babel/preset-react', '@babel/preset-typescript'],
            plugins: [
                // Метаданные типов: по ним inversify понимает, что подставлять в конструктор.
                'babel-plugin-transform-typescript-metadata',
                ['@babel/plugin-proposal-decorators', { legacy: true }],
                ['@babel/plugin-transform-class-properties', { loose: true }]
            ]
        }]
    },

    // По умолчанию node_modules не трансформируются, но часть библиотек публикуется только в
    // ESM — их приходится пропускать через тот же Babel. Шаблон учитывает и обратные слэши:
    // на Windows пути приходят с ними.
    transformIgnorePatterns: ['[/\\\\]node_modules[/\\\\](?!keycloak-js|@react-keycloak)'],

    moduleNameMapper: {
        // axios 1.x публикуется как ESM-пакет ("type": "module"), и Jest грузить его не умеет.
        // Берём его же сборку под CommonJS — код приложения этого не замечает.
        '^axios$': '<rootDir>/node_modules/axios/dist/node/axios.cjs',
        // Стили и картинки к поведению отношения не имеют: компонент импортирует их ради сборки.
        '\\.(css|less|sass|scss)$': '<rootDir>/config/jest/style-mock.cjs',
        '\\.(png|jpe?g|gif|svg|webp|avif|ico|bmp|woff2?|ttf|eot|mp4|webm)$': '<rootDir>/config/jest/file-mock.cjs'
    },

    testMatch: ['<rootDir>/src/**/*.test.{ts,tsx,js,jsx}'],

    // Пути, по которым Jest ищет модули: как в webpack — только node_modules и src.
    moduleDirectories: ['node_modules', '<rootDir>/src'],

    clearMocks: true
};
