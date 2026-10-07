// Продакшен: собирает реплику rs0 из одного узла и заводит логин приложения.
// Запускается сервисом mongo-setup под администратором при каждом `up`; повторный запуск безопасен.

const dbName = process.env.MONGO_DB;
const user = process.env.MONGO_APP_USER;
const pwd = process.env.MONGO_APP_PASSWORD;
if (!dbName || !user || !pwd) {
  throw new Error("MONGO_DB, MONGO_APP_USER and MONGO_APP_PASSWORD are required");
}

try {
  rs.status();
} catch (e) {
  if (e.codeName !== "NotYetInitialized") throw e;
  rs.initiate({ _id: "rs0", members: [{ _id: 0, host: "mongo1:27017" }] });
  print("replica set rs0 initiated");
}

// Создавать пользователей можно только на primary — ждём, пока узел им станет.
for (let i = 0; !db.hello().isWritablePrimary; i++) {
  if (i > 120) throw new Error("mongo1 did not become primary in 60 s");
  sleep(500);
}

// Только своя база: чтение/запись и индексы. Ни других баз, ни управления сервером.
const roles = [
  { role: "readWrite", db: dbName },
  { role: "dbAdmin", db: dbName },
];
const appDb = db.getSiblingDB(dbName);
if (appDb.getUser(user)) {
  appDb.updateUser(user, { pwd, roles });
  print(`user ${user} updated`);
} else {
  appDb.createUser({ user, pwd, roles });
  print(`user ${user} created`);
}
