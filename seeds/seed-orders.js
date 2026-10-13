// Демо-заказы на НАСТОЯЩИЕ игры каталога — оплаченные, но ещё без ключей.
//
// Зачем: в базе стенда были заказы, заведённые вручную, — на несуществующие игры, с ценами
// вроде 7567 и «выданными» ключами, которых нет в GameKeys. Из-за этого отчёты показывали
// выручку из ниоткуда и нулевую себестоимость: продажи есть, а ни один ключ не выдан.
//
// Эти заказы сделаны так, чтобы их можно было провести через настоящий конвейер выдачи:
// позиции ссылаются на игры, у которых есть ключи в пуле, статус — AWAITING_KEYS (оплачено,
// ключи не выданы). Дальше админка («Deliver keys» на заказе) или довыдача при пополнении
// пула реально забирают ключи из пула, проставляют покупателя и дату выдачи — и в отчётах
// появляется себестоимость проданного.
//
// Идемпотентен: свои заказы находит по префиксу номера DEMO- и пересоздаёт. Настоящие
// заказы не трогает.
// Детерминирован: выбор игр, количества и даты считаются от slug.

// Защита от случайного запуска на боевой базе: сиды пишут выдуманные данные, а seed-discounts
// стирает все скидки. Запуск только с явным ALLOW_DEMO_SEED=1 (см. seeds/README.md).
if (process.env.ALLOW_DEMO_SEED !== "1") {
  print("Отказ: демо-сиды запускаются только с ALLOW_DEMO_SEED=1. Это стенд, а не боевая база?");
  quit(1);
}

const dbx = db.getSiblingDB("SteamShopDatabase");

const ORDER_PREFIX = "DEMO-";
const BUYERS = [
  "alex.demo@example.com",
  "marina.demo@example.com",
  "chris.demo@example.com",
  "yuki.demo@example.com",
  "sam.demo@example.com",
];

function hash(value) {
  let h = 7;
  for (let i = 0; i < value.length; i++) {
    h = (h * 31 + value.charCodeAt(i)) >>> 0;
  }
  return h;
}

const removed = dbx.Orders.deleteMany({ OrderNumber: { $regex: "^" + ORDER_PREFIX } }).deletedCount;
print(`cleanup: removed ${removed} demo order(s)`);

// Берём только игры, у которых ключи реально лежат в пуле: заказ без запаса не выдастся и
// повиснет в ожидании, а это не то состояние, которое стоит показывать по умолчанию.
const gamesWithStock = dbx.GameKeys.distinct("GameId", { UserId: "", Voided: { $ne: true } });
const games = gamesWithStock
  .map((id) => {
    try {
      return dbx.Games.findOne({ _id: ObjectId(id) }, { slug: 1, title: 1, name: 1, price: 1, currency: 1 });
    } catch (e) {
      return null;
    }
  })
  .filter((game) => game && game.price)
  .sort((a, b) => (a.slug || "").localeCompare(b.slug || ""));

if (games.length === 0) {
  print("no games with keys in stock — nothing to order");
} else {
  const now = new Date();
  let created = 0;
  let units = 0;
  let revenue = 0;

  // Двадцать заказов за последний месяц: достаточно, чтобы отчёт за период был не пустым,
  // и не столько, чтобы демо-данные заслонили настоящие.
  for (let i = 0; i < 20; i++) {
    const seed = hash(`demo-order-${i}`);
    const buyer = BUYERS[seed % BUYERS.length];
    // Разносим по последним 30 дням, кроме сегодняшнего: отчёт «за прошлый месяц» должен
    // что-то показывать сразу.
    const daysAgo = 1 + (seed % 29);
    const placedAt = new Date(now.getTime() - daysAgo * 86400000);

    const itemCount = 1 + (seed % 2);
    const items = [];
    let subtotal = 0;

    for (let j = 0; j < itemCount; j++) {
      const game = games[(seed + j * 7) % games.length];
      const quantity = 1 + ((seed + j) % 2);
      const unitPrice = parseFloat(game.price.toString());
      const lineTotal = Math.round(unitPrice * quantity * 100) / 100;
      subtotal += lineTotal;
      units += quantity;

      items.push({
        ItemId: `${ORDER_PREFIX}${i}-${j}`,
        ProductType: "Game",
        GameId: game._id.toString(),
        Title: game.title || game.name || game.slug,
        CoverUrl: "",
        Slug: game.slug || null,
        Platform: null,
        Region: null,
        Quantity: quantity,
        UnitPrice: NumberDecimal(unitPrice.toFixed(2)),
        UnitDiscount: NumberDecimal("0"),
        FinalUnitPrice: NumberDecimal(unitPrice.toFixed(2)),
        LineTotal: NumberDecimal(lineTotal.toFixed(2)),
        Pricing: { PriceSource: "catalog", PromoId: null, CouponCode: null, OriginalUnitPrice: null, DiscountPercent: null },
        // Пустая доставка — ключи ещё не выданы. Их проставит конвейер, а не сид: смысл
        // именно в том, чтобы выдача произошла по-настоящему.
        Delivery: { DeliveryType: "Key", Keys: [], DeliveredAt: null },
      });
    }

    subtotal = Math.round(subtotal * 100) / 100;
    revenue += subtotal;
    // Детерминированный GUID вместо случайного: повторный прогон даёт те же заказы, а нули
    // в начале сразу выдают демо-запись, если она попадётся в поддержке.
    const guid = `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
    const number = `${ORDER_PREFIX}${placedAt.toISOString().slice(0, 10).replace(/-/g, "")}-${String(i).padStart(3, "0")}`;

    dbx.Orders.insertOne({
      OrderId: guid,
      OrderGuid: guid,
      OrderNumber: number,
      UserId: buyer,
      UserName: buyer,
      PaymentProvider: "stripe",
      PaymentIntentId: `pi_demo_${i}`,
      GameId: items[0].GameId,
      GameName: items[0].Title,
      IsPaid: true,
      IsFulfilled: false,
      BuyerCountry: null,
      OrderDate: placedAt,
      CreatedAt: placedAt,
      PaidAt: placedAt,
      UpdatedAt: placedAt,
      SnapshotVersion: 1,
      Status: "AWAITING_KEYS",
      PaymentStatus: "PAID",
      FulfillmentStatus: "PENDING_KEYS",
      TotalAmount: NumberDecimal(subtotal.toFixed(2)),
      SubtotalAmount: NumberDecimal(subtotal.toFixed(2)),
      DiscountTotal: NumberDecimal("0"),
      TaxTotal: NumberDecimal("0"),
      PromoCode: null,
      PromoDiscountAmount: null,
      RequiresDeliveryVerification: false,
      Currency: "USD",
      Notes: "demo seed",
      Totals: {
        Subtotal: NumberDecimal(subtotal.toFixed(2)),
        DiscountTotal: NumberDecimal("0"),
        TaxTotal: NumberDecimal("0"),
        Total: NumberDecimal(subtotal.toFixed(2)),
      },
      Events: [{ Type: "paid", Message: "Demo order seeded as paid.", Actor: "seed", CreatedAt: placedAt }],
      Items: items,
    });
    created += 1;
  }

  print(`orders: ${created} demo order(s), ${units} unit(s), ${revenue.toFixed(2)} USD — all awaiting keys`);
  print("next: deliver them through the admin (Orders → Deliver keys) so keys leave the pool and cost appears");
}
