// Демо-команда для страницы «О нас» — ровно та, что заведена на стенде через админку:
// имена, роли, подписи, описания и фотографии.
//
// ВАЖНО: это выдуманные люди для витрины-демонстрации, а не сотрудники. На боевом сайте
// раздел «Meet the team» — публичное утверждение о конкретных живых людях, и держать там
// вымышленных нельзя. Перед запуском список чистится (см. docs/pre-launch.md):
//
//   db.SiteSettings.updateOne({ _id: "site" }, { $unset: { TeamJson: "" } })
//
// после чего раздел на странице просто исчезает — пустой список это его законное состояние.
//
// Фотографии лежат в assets/team/*.webp (выгружены из медиатеки стенда) и копируются в
// uploads-том, в /uploads/demo-team/ — как обложки из seed-game-covers. Адрес пишется от корня
// сайта, а не с хостом: так он работает на любом стенде, а не только на localhost.
//
// Идемпотентно: файлы перезаписываются, TeamJson заменяется целиком — повторный запуск
// ничего не дублирует.
//
// ПОСЛЕ ЗАПУСКА НУЖЕН ПЕРЕЗАПУСК BACKEND: настройки читаются из базы один раз при первом
// обращении и дальше живут в памяти (SiteSettingsStore), обновляясь только при сохранении
// из админки. Прямая запись в базу мимо приложения ему не видна:
//   docker compose restart backend
// Пишет в тот же документ настроек, который правится в админке (Settings → Meet the team),
// поэтому после сида список виден и редактируется там же.

// Защита от случайного запуска на боевой базе: сиды пишут выдуманные данные, а seed-discounts
// стирает все скидки. Запуск только с явным ALLOW_DEMO_SEED=1 (см. seeds/README.md).
if (process.env.ALLOW_DEMO_SEED !== "1") {
  print("Отказ: демо-сиды запускаются только с ALLOW_DEMO_SEED=1. Это стенд, а не боевая база?");
  quit(1);
}

const fs = require('fs');
const path = require('path');

const dbx = db.getSiblingDB('SteamShopDatabase');

const assetsDir = process.env.SEED_ASSETS_DIR || '/seeds/assets/team';
const uploadsRoot = process.env.SEED_UPLOADS_DIR || '/seed-uploads';
const teamDir = path.join(uploadsRoot, 'demo-team');
const PHOTO_PREFIX = '/uploads/demo-team/';

// Порядок — порядок карточек на странице. photo — файл в assets/team.
const team = [
  {
    name: 'Mara Delacroix',
    role: 'Head of Support',
    badge: 'Support',
    description: 'Answers tickets and live chat, and decides when a refund is faster than an argument.',
    photo: 'mara.webp',
  },
  {
    name: 'Owen Bright',
    role: 'Store Operations',
    badge: 'Operations',
    description: 'Watches key stock and delivery, so an order never sits waiting for a key nobody ordered.',
    photo: 'owen.webp',
  },
  {
    name: 'Sana Iqbal',
    role: 'Catalog Curator',
    badge: 'Catalog',
    description: 'Picks what goes on the shelf and writes the descriptions that are not copied from the publisher.',
    photo: 'sana.webp',
  },
  {
    name: 'Teodor Lind',
    role: 'Partnerships',
    badge: 'Partners',
    description: 'Talks to distributors and checks that every batch of keys comes from where it claims to.',
    photo: 'teodor.webp',
  },
];

fs.mkdirSync(teamDir, { recursive: true });

const members = team.map(({ photo, ...member }) => {
  const source = path.join(assetsDir, photo);
  if (!fs.existsSync(source)) {
    // Без файла карточка честно покажет букву — лучше, чем битая картинка.
    print('Нет файла ' + source + ' — ' + member.name + ' останется без фото.');
    return { ...member, photoUrl: '' };
  }
  fs.writeFileSync(path.join(teamDir, photo), fs.readFileSync(source));
  return { ...member, photoUrl: PHOTO_PREFIX + photo };
});

dbx.SiteSettings.updateOne(
  { _id: 'site' },
  {
    $set: {
      TeamJson: JSON.stringify(members),
      UpdatedAtUtc: new Date(),
      UpdatedBy: 'seed-team.js',
    },
  },
  { upsert: true }
);

print('Демо-команда записана: ' + members.length + ' чел., фото с ' + members.filter((m) => m.photoUrl).length + '. Правится в админке: Settings → Meet the team.');
print('Перезапустите backend, чтобы он перечитал настройки: docker compose restart backend');
