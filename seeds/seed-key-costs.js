// Демо-себестоимость ключей: закупочная цена для тех ключей, у которых её нет.
//
// ВНИМАНИЕ: это ВЫДУМАННЫЕ числа для демо-стенда, а не настоящие закупки. Ключи, залитые до
// появления учёта расходов, реальной цены не имеют и взять её неоткуда — без них отчёты о
// прибыли и складе показывают нули. Сид заполняет пробел правдоподобными значениями, чтобы
// отчёты можно было посмотреть в работе.
//
// Настоящие цены проставляются в админке: Inventory value → «Fill in missing purchase prices».
// Там же видно, какие партии ещё без цены. Чтобы снять демо-цены и вернуться к пустому:
//   db.GameKeys.updateMany({BatchId:/^demo-cost-/},
//     {$unset:{UnitCost:"",CostCurrency:"",Supplier:"",BatchId:"",AcquiredAtUtc:""}})
//
// Идемпотентен: трогает только ключи БЕЗ закупочной цены, поэтому повторный запуск ничего не
// перезаписывает — ни демо-цены, ни настоящие, заведённые руками.
// Детерминирован: наценка и поставщик считаются от slug игры, повторный прогон даёт то же.

// Защита от случайного запуска на боевой базе: сиды пишут выдуманные данные, а seed-discounts
// стирает все скидки. Запуск только с явным ALLOW_DEMO_SEED=1 (см. seeds/README.md).
if (process.env.ALLOW_DEMO_SEED !== "1") {
  print("Отказ: демо-сиды запускаются только с ALLOW_DEMO_SEED=1. Это стенд, а не боевая база?");
  quit(1);
}

const dbx = db.getSiblingDB("SteamShopDatabase");

function hash(value) {
  let h = 7;
  for (let i = 0; i < value.length; i++) {
    h = (h * 31 + value.charCodeAt(i)) >>> 0;
  }
  return h;
}

// Ключевой перекуп живёт на разнице 25–45% от цены витрины. Доля считается от slug, чтобы у
// разных игр она отличалась, но не прыгала между запусками.
const SUPPLIERS = ["Kinguin", "G2A", "Eneba", "Direct from publisher"];

let games = 0;
let keys = 0;
let skipped = 0;

dbx.Games.find({}, { slug: 1, title: 1, name: 1, price: 1, currency: 1 }).forEach((game) => {
  const gameId = game._id.toString();
  const pending = dbx.GameKeys.countDocuments({ GameId: gameId, UnitCost: { $exists: false } });
  if (pending === 0) {
    return;
  }

  const salePrice = parseFloat(game.price ? game.price.toString() : "0");
  if (!(salePrice > 0)) {
    // Без цены продажи считать не от чего — оставляем как есть, пусть отчёт честно скажет
    // «без себестоимости», а не покажет ноль как факт.
    skipped += pending;
    print(`skip: ${game.slug || gameId} has no sale price, ${pending} key(s) left without cost`);
    return;
  }

  const slug = (game.slug || gameId).toLowerCase();
  const h = hash(slug);
  const marginPercent = 25 + (h % 21); // 25–45%
  const unitCost = Math.round(salePrice * (1 - marginPercent / 100) * 100) / 100;
  const supplier = SUPPLIERS[h % SUPPLIERS.length];
  const currency = game.currency || "USD";

  // Дату закупки берём из времени создания записи ключа: это единственный настоящий след того,
  // когда партия появилась, и он делает отчёт по возрасту запаса осмысленным.
  let updated = 0;
  dbx.GameKeys.find({ GameId: gameId, UnitCost: { $exists: false } }, { _id: 1 }).forEach((key) => {
    dbx.GameKeys.updateOne(
      { _id: key._id },
      {
        $set: {
          UnitCost: NumberDecimal(unitCost.toFixed(2)),
          CostCurrency: currency,
          Supplier: supplier,
          BatchId: `demo-cost-${slug}`,
          AcquiredAtUtc: key._id.getTimestamp(),
        },
      }
    );
    updated += 1;
  });

  games += 1;
  keys += updated;
  print(`${game.title || game.name || slug}: ${updated} key(s) at ${unitCost.toFixed(2)} ${currency} (${supplier}, ${marginPercent}% margin)`);
});

print(`key costs: ${keys} key(s) priced across ${games} game(s); ${skipped} left without cost`);
