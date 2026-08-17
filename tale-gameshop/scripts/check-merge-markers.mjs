import fs from "fs";
import path from "path";

const rootDir = path.resolve(process.cwd(), "src");
// Настоящий маркер конфликта занимает строку целиком: «<<<<<<< ветка», ровно семь «=»,
// «||||||| base» или «>>>>>>> ветка». Поиск по подстроке ловил баннеры-комментарии
// вида /* ======== */ и ронял сборку на файлах без единого конфликта.
const markerPattern = /^(?:<{7}(?:\s.*)?|={7}|\|{7}(?:\s.*)?|>{7}(?:\s.*)?)$/;
const allowedExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".css", ".json", ".md"]);

const violations = [];

const walk = (dir) => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "dist") {
      continue;
    }

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }

    if (!allowedExtensions.has(path.extname(entry.name))) {
      continue;
    }

    const content = fs.readFileSync(fullPath, "utf8");
    const relativePath = path.relative(process.cwd(), fullPath);

    content.split(/\r?\n/).forEach((line, index) => {
      if (markerPattern.test(line.trimEnd())) {
        violations.push(`${relativePath}:${index + 1}: ${line.trim()}`);
      }
    });
  }
};

if (!fs.existsSync(rootDir)) {
  console.error("src directory not found");
  process.exit(1);
}

walk(rootDir);

if (violations.length > 0) {
  console.error("Merge conflict markers detected:\n");
  console.error(violations.join("\n"));
  process.exit(1);
}

console.log("No merge conflict markers found in src.");
