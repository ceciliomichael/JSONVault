const fs = require("node:fs");
const path = require("node:path");

const replacements = {
  "bg-[#121212]": "bg-zinc-50 dark:bg-[#121212]",
  "bg-[#161616]": "bg-white dark:bg-[#161616]",
  "bg-[#1c1c1c]": "bg-white dark:bg-[#1c1c1c]",
  "bg-[#1a1a1a]": "bg-zinc-50 dark:bg-[#1a1a1a]",
  "bg-zinc-900/50": "bg-zinc-100 dark:bg-zinc-900/50",
  "bg-zinc-900/30": "bg-zinc-50 dark:bg-zinc-900/30",
  "bg-zinc-800/50": "bg-zinc-100 dark:bg-zinc-800/50",
  "bg-zinc-800": "bg-zinc-200 dark:bg-zinc-800",
  "bg-[#09090b]": "bg-zinc-100 dark:bg-[#09090b]",
  "text-zinc-100": "text-zinc-900 dark:text-zinc-100",
  "text-zinc-200": "text-zinc-800 dark:text-zinc-200",
  "text-zinc-300": "text-zinc-700 dark:text-zinc-300",
  "text-zinc-400": "text-zinc-500 dark:text-zinc-400",
  "border-white/5": "border-zinc-200 dark:border-white/5",
  "border-white/10": "border-zinc-200 dark:border-white/10",
  "hover:bg-zinc-900/50": "hover:bg-zinc-100 dark:hover:bg-zinc-900/50",
  "hover:bg-zinc-800": "hover:bg-zinc-100 dark:hover:bg-zinc-800",
  "hover:bg-zinc-700": "hover:bg-zinc-200 dark:hover:bg-zinc-700",
  "hover:bg-white/5": "hover:bg-zinc-100 dark:hover:bg-white/5",
  "hover:text-zinc-100": "hover:text-zinc-900 dark:hover:text-zinc-100",
  "hover:text-zinc-200": "hover:text-zinc-800 dark:hover:text-zinc-200",
  "bg-white text-black": "bg-zinc-900 text-white dark:bg-white dark:text-black",
  "hover:bg-zinc-200": "hover:bg-zinc-800 dark:hover:bg-zinc-200",
};

function walkDir(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat?.isDirectory()) {
      results = results.concat(walkDir(file));
    } else if (file.endsWith(".tsx") || file.endsWith(".ts")) {
      results.push(file);
    }
  });
  return results;
}

const files = walkDir(path.join(__dirname, "src"));

files.forEach((file) => {
  const content = fs.readFileSync(file, "utf8");
  let newContent = content;

  for (const [key, value] of Object.entries(replacements)) {
    // Escape string for regex
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Ensure we match entire class words
    const regex = new RegExp(
      `(?<=["'\\\`\\s])${escapedKey}(?=["'\\\`\\s])`,
      "g",
    );
    newContent = newContent.replace(regex, value);
  }

  if (content !== newContent) {
    fs.writeFileSync(file, newContent, "utf8");
    console.log(`Updated ${file}`);
  }
});
