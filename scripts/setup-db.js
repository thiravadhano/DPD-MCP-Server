#!/usr/bin/env node
/**
 * setup-db.js — download dpd_lite.db and build indexes + FTS5
 * Run once before starting the server
 */

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import https from "https";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "..", "dpd_lite.db");

const DB_URL =
  "https://github.com/thiravadhano/DPD-MCP-Server/releases/download/claude-pali-mcp/dpd_lite.db";

// ── Download DB ───────────────────────────────────────────────────────
async function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const follow = (u) => {
      https.get(u, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          return follow(res.headers.location);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        const total = parseInt(res.headers["content-length"] || "0", 10);
        let received = 0;
        const file = fs.createWriteStream(dest);
        res.on("data", (chunk) => {
          received += chunk.length;
          if (total) {
            const pct = ((received / total) * 100).toFixed(0);
            process.stdout.write(`\r  Downloading... ${pct}%`);
          }
        });
        res.pipe(file);
        file.on("finish", () => { file.close(); process.stdout.write("\n"); resolve(); });
        file.on("error", reject);
      }).on("error", reject);
    };
    follow(url);
  });
}

if (!fs.existsSync(DB_PATH)) {
  console.log("📥 dpd_lite.db not found — downloading from GitHub Release...");
  try {
    await downloadFile(DB_URL, DB_PATH);
    console.log("  ✅ Download complete");
  } catch (err) {
    console.error("❌ Download failed:", err.message);
    console.error("   Download manually at:", DB_URL);
    process.exit(1);
  }
} else {
  console.log("  ⏭️  dpd_lite.db already exists — skipping download");
}

const db = new Database(DB_PATH);

console.log("⚙️  Setting up dpd_lite.db...");

db.pragma("journal_mode = WAL");

// ── Indexes ───────────────────────────────────────────────────────────
const indexes = [
  { name: "idx_lemma_1",  sql: "CREATE INDEX IF NOT EXISTS idx_lemma_1  ON dpd_headwords(lemma_1)" },
  { name: "idx_root_key", sql: "CREATE INDEX IF NOT EXISTS idx_root_key ON dpd_headwords(root_key)" },
  { name: "idx_pos",      sql: "CREATE INDEX IF NOT EXISTS idx_pos      ON dpd_headwords(pos)" },
];

for (const { name, sql } of indexes) {
  db.prepare(sql).run();
  console.log(`  ✅ index: ${name}`);
}

// ── FTS5 for meaning search ───────────────────────────────────────────
const ftsExists = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='dpd_fts'")
  .get();

if (!ftsExists) {
  db.prepare(`
    CREATE VIRTUAL TABLE dpd_fts USING fts5(
      id UNINDEXED,
      meaning_1,
      meaning_2,
      content='dpd_headwords',
      content_rowid='id'
    )
  `).run();

  db.prepare(`
    INSERT INTO dpd_fts(rowid, id, meaning_1, meaning_2)
    SELECT id, id, COALESCE(meaning_1,''), COALESCE(meaning_2,'')
    FROM dpd_headwords
  `).run();

  console.log("  ✅ FTS5 table: dpd_fts (built from dpd_headwords)");
} else {
  console.log("  ⏭️  FTS5 table already exists — skipping");
}

db.close();
console.log("\n✅ Setup complete. You can now run: npm start");
