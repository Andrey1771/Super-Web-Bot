import autoprefixer from 'autoprefixer';
import tailwindcss from '@tailwindcss/postcss';

export default {
  plugins: [
    // Tailwind 4: плагин PostCSS вынесен в отдельный пакет.
    tailwindcss,
    // Префиксы для наших собственных стилей по browserslist из package.json.
    autoprefixer,
  ],
};
