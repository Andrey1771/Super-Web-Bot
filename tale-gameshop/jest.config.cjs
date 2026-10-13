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

    // Тот же Babel, что у сборки (config/babel-options.cjs): пресеты, декораторы inversify и
    // метаданные типов. Настройки переданы прямо, а не файлом .babelrc: иначе Babel не
    // применил бы их к ESM-пакетам из node_modules, которые ниже тоже пропускаются через него.
    transform: {
        '^.+\\.[jt]sx?$': ['babel-jest', require('./config/babel-options.cjs')()]
    },

    // По умолчанию node_modules не трансформируются, но часть библиотек публикуется только в
    // ESM — их приходится пропускать через тот же Babel. Шаблон учитывает и обратные слэши:
    // на Windows пути приходят с ними.
    transformIgnorePatterns: ['[/\\\\]node_modules[/\\\\](?!keycloak-js|@react-keycloak|marked|inversify|@inversifyjs)'],

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
