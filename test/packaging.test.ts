/**
 * Сторож упаковки: инварианты, которые ломают ОПУБЛИКОВАННЫЙ пакет, оставаясь
 * зелёными во всех остальных проверках.
 *
 * Главный из них — расширение .js в относительных импортах. Оно выглядит как
 * опечатка в .ts-файле, и его тянет «поправить». Ловушка в том, что после такой
 * правки не падает ничего: vitest резолвит путь и без расширения, tsc с
 * moduleResolution: "Bundler" — тоже, сборка проходит. Ломается только запуск
 * собранного dist/ под чистым Node у пользователя, то есть ровно там, где мы
 * этого уже не увидим.
 *
 * Поэтому инвариант закреплён статически, а в CI дополнительно поднимается
 * собранный бинарь (шаг «MCP package: build and smoke the compiled binary»).
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));

const WHY =
  'moduleResolution: "Bundler" не переписывает пути импортов, поэтому расширение обязано быть уже в исходнике; без него собранный ESM не резолвится под чистым Node (ERR_MODULE_NOT_FOUND), хотя vitest, tsc и сборка остаются зелёными.';

/** Все .ts-файлы пакета в src/, рекурсивно. */
function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...sourceFiles(full));
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) found.push(full);
  }
  return found;
}

/**
 * Спецификаторы модулей из статических import/export и динамического import().
 * Строки в коде под это не попадают: совпадение требует ключевого слова рядом.
 */
function moduleSpecifiers(source: string): string[] {
  const patterns = [
    /(?:^|\n)\s*(?:import|export)\s[\s\S]*?\sfrom\s*["']([^"']+)["']/g, // import x from "y"
    /(?:^|\n)\s*import\s*["']([^"']+)["']/g, //                            import "y"
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g, //                           import("y")
  ];
  const out: string[] = [];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) out.push(match[1]!);
  }
  return out;
}

const FILES = sourceFiles(join(packageRoot, "src"));

describe("контракт упаковки: опубликованный пакет должен стартовать на чистом Node", () => {
  it("в src/ вообще нашлись исходники (иначе сторож молчит впустую)", () => {
    expect(FILES.length).toBeGreaterThan(0);
  });

  it("каждый относительный импорт в src/** заканчивается на .js", () => {
    const offenders: string[] = [];

    for (const file of FILES) {
      const relativeFile = file.slice(packageRoot.length);
      for (const specifier of moduleSpecifiers(readFileSync(file, "utf8"))) {
        if (!specifier.startsWith("./") && !specifier.startsWith("../")) continue;
        if (specifier.endsWith(".js")) continue;
        offenders.push(`${relativeFile}: "${specifier}" → нужно "${specifier}.js"`);
      }
    }

    expect(
      offenders,
      `Относительный импорт без расширения .js:\n  ${offenders.join("\n  ")}\n\nПочему так: ${WHY}`,
    ).toEqual([]);
  });

  it("bin запускает собранный dist/, а не исходники", () => {
    const bin = readFileSync(join(packageRoot, "bin/qrtap-mcp.mjs"), "utf8");
    expect(bin, "bin должен грузить dist/ — src/ в архив не попадает").toContain("../dist/index.js");
    expect(bin, "в bin не должно остаться загрузчика TypeScript").not.toContain("tsx");
  });

  it("у пакета нет зависимостей времени выполнения", () => {
    const pkg = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      files?: string[];
      scripts?: Record<string, string>;
    };

    // Ноль зависимостей — это и есть быстрый npx -y qrtap-mcp у пользователя.
    expect(Object.keys(pkg.dependencies ?? {})).toEqual([]);
    // dist обязан попадать в архив, src — нет.
    expect(pkg.files).toContain("dist");
    expect(pkg.files).not.toContain("src");
    // Без prepack можно опубликовать устаревший или отсутствующий билд.
    expect(pkg.scripts?.prepack ?? "").toContain("build");
  });
});
