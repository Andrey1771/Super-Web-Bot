import fs from "fs";
import path from "path";

const rootDir = path.resolve(process.cwd(), "src");
const markerPattern = /(<<<<<<<|=======|>>>>>>>)/;
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
    if (!markerPattern.test(content)) {
      continue;
    }

    const relativePath = path.relative(process.cwd(), fullPath);
    const lines = content.split(/\r?\n/);

    lines.forEach((line, index) => {
      if (markerPattern.test(line)) {
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
