// Импорт картинки даёт адрес файла: так их отдают asset-модули webpack (webpack.config.js).
// Раньше эти объявления брались из react-scripts через react-app-env.d.ts, но пакета в проекте нет.
declare module "*.svg" { const src: string; export default src; }
declare module "*.png" { const src: string; export default src; }
declare module "*.jpg" { const src: string; export default src; }
declare module "*.jpeg" { const src: string; export default src; }
declare module "*.gif" { const src: string; export default src; }
declare module "*.webp" { const src: string; export default src; }
declare module "*.ico" { const src: string; export default src; }
// Стили подключаются ради побочного эффекта (import "./x.css"); TypeScript 6 требует для таких
// импортов объявленный модуль.
declare module "*.css";
