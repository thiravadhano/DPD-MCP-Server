#!/usr/bin/env node
/**
 * DPD MCP Server — Digital Pali Dictionary
 * แปลงจาก Python เป็น Node.js
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "dpd_lite.db");

// ── ตรวจสอบ DB ──────────────────────────────────────────────────────
if (!fs.existsSync(DB_PATH)) {
  console.error("❌ dpd.db not found at:", DB_PATH);
  console.error("   Run: node scripts/setup-db.js");
  process.exit(1);
}

const db = new Database(DB_PATH, { readonly: true });
db.pragma("query_only = true");
db.pragma("cache_size = -32000"); // 32 MB cache
db.pragma("mmap_size = 268435456"); // 256 MB memory-mapped I/O

// ตรวจสอบว่า FTS5 พร้อมใช้งาน (ต้องรัน setup-db.js ก่อน)
const hasFts = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='dpd_fts'")
  .get();

// ── Helper functions ─────────────────────────────────────────────────

function headwordIdsFromLookup(word) {
  const row = db
    .prepare("SELECT headwords FROM lookup WHERE lookup_key = ?")
    .get(word.toLowerCase().trim());
  if (!row?.headwords) return [];
  try {
    return JSON.parse(row.headwords);
  } catch {
    return [];
  }
}

function formatHeadword(row) {
  return {
    lemma: row.lemma_1,
    pos: row.pos,
    grammar: row.grammar,
    meaning_1: row.meaning_1,
    meaning_lit: row.meaning_lit,
    meaning_2: row.meaning_2,
    sanskrit: row.sanskrit,
    root_key: row.root_key,
    construction: row.construction,
    compound_type: row.compound_type,
    example_1: row.example_1,
    sutta_1: row.sutta_1,
    notes: row.notes,
  };
}

function buildWordOutput(word, results) {
  let output = `### DPD: '${word}'\n\n`;
  for (const r of results) {
    output += `**${r.lemma}** (${r.pos})\n`;
    if (r.meaning_1)   output += `- ความหมาย: ${r.meaning_1}\n`;
    if (r.meaning_lit) output += `- ตามตัวอักษร: ${r.meaning_lit}\n`;
    if (r.grammar)     output += `- ไวยากรณ์: ${r.grammar}\n`;
    if (r.root_key)    output += `- ราก: ${r.root_key}\n`;
    if (r.construction) output += `- โครงสร้าง: ${r.construction}\n`;
    if (r.sanskrit)    output += `- สันสกฤต: ${r.sanskrit}\n`;
    if (r.sutta_1)     output += `- แหล่งอ้างอิง: ${r.sutta_1}\n`;
    if (r.example_1)   output += `- ตัวอย่าง: ${r.example_1.slice(0, 150)}...\n`;
    output += "\n";
  }
  return output;
}

// ── MCP Server ────────────────────────────────────────────────────────

const server = new Server(
  { name: "dpd-pali", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "lookup_pali_word",
      description:
        "ค้นหาคำบาลีจาก Digital Pali Dictionary (DPD) รองรับทุกรูปวิภัตติ สมาส และสนธิ ใช้เมื่อไม่แน่ใจความหมาย part of speech หรือ root ของคำ",
      inputSchema: {
        type: "object",
        properties: {
          word: {
            type: "string",
            description:
              "คำบาลีในรูปแบบ Roman script เช่น saṅghādisesaṃ, pācittiyaṃ, bhikkhu",
          },
        },
        required: ["word"],
      },
    },
    {
      name: "search_pali_meaning",
      description:
        "ค้นหาคำบาลีจากความหมายภาษาอังกฤษ ใช้เมื่อต้องการหาว่าคำบาลีที่แปลว่า X คืออะไร",
      inputSchema: {
        type: "object",
        properties: {
          meaning: {
            type: "string",
            description:
              "ความหมายภาษาอังกฤษ เช่น 'defeat', 'confession', 'wrong-doing'",
          },
          limit: {
            type: "integer",
            description: "จำนวนผลลัพธ์สูงสุด (default 5)",
            default: 5,
          },
        },
        required: ["meaning"],
      },
    },
    {
      name: "lookup_pali_root",
      description:
        "ค้นหาคำบาลีทั้งหมดที่มาจากรากศัพท์เดียวกัน ใช้เมื่อต้องการวิเคราะห์ word family",
      inputSchema: {
        type: "object",
        properties: {
          root: {
            type: "string",
            description: "รากศัพท์บาลี เช่น √gam, √kar, √bhū",
          },
        },
        required: ["root"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // ── Tool 1: lookup จากรูปคำ ──────────────────────────────────────
  if (name === "lookup_pali_word") {
    const word = (args.word || "").trim();
    if (!word) {
      return { content: [{ type: "text", text: "กรุณาระบุคำบาลี" }] };
    }

    const ids = headwordIdsFromLookup(word);
    let results = [];

    if (ids.length > 0) {
      const placeholders = ids.map(() => "?").join(",");
      const rows = db
        .prepare(`SELECT * FROM dpd_headwords WHERE id IN (${placeholders})`)
        .all(...ids);
      results = rows.map(formatHeadword);
    } else {
      // fallback: ค้นจาก lemma_1 ตรงๆ
      const rows = db
        .prepare("SELECT * FROM dpd_headwords WHERE lemma_1 LIKE ? LIMIT 5")
        .all(`${word}%`);
      results = rows.map(formatHeadword);
    }

    if (results.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `ไม่พบคำว่า '${word}' ใน DPD — อาจเป็นคำประสม สนธิ หรือสะกดต่างกัน`,
          },
        ],
      };
    }

    return { content: [{ type: "text", text: buildWordOutput(word, results) }] };
  }

  // ── Tool 2: ค้นจากความหมายอังกฤษ ───────────────────────────────
  if (name === "search_pali_meaning") {
    const meaning = (args.meaning || "").trim();
    const limit = args.limit || 5;

    let rows;
    if (hasFts) {
      // FTS5: เร็วกว่า LIKE มาก
      rows = db
        .prepare(
          `SELECT h.lemma_1, h.pos, h.meaning_1, h.grammar
           FROM dpd_fts f
           JOIN dpd_headwords h ON h.id = f.id
           WHERE dpd_fts MATCH ?
           LIMIT ?`
        )
        .all(`"${meaning.replace(/"/g, '""')}"`, limit);
    } else {
      // fallback ถ้ายังไม่ได้รัน setup-db.js
      rows = db
        .prepare(
          `SELECT lemma_1, pos, meaning_1, grammar FROM dpd_headwords
           WHERE meaning_1 LIKE ? OR meaning_2 LIKE ?
           LIMIT ?`
        )
        .all(`%${meaning}%`, `%${meaning}%`, limit);
    }

    if (rows.length === 0) {
      return {
        content: [{ type: "text", text: `ไม่พบคำที่มีความหมายว่า '${meaning}'` }],
      };
    }

    let output = `### คำบาลีที่มีความหมายว่า '${meaning}'\n\n`;
    for (const r of rows) {
      output += `**${r.lemma_1}** (${r.pos}) — ${r.meaning_1}\n`;
      if (r.grammar) output += `  ไวยากรณ์: ${r.grammar}\n`;
    }
    return { content: [{ type: "text", text: output }] };
  }

  // ── Tool 3: ค้นจากรากศัพท์ ──────────────────────────────────────
  if (name === "lookup_pali_root") {
    const root = (args.root || "").trim().replace(/^√/, "");
    const rootKey = `√${root}`;

    const rows = db
      .prepare(
        `SELECT lemma_1, pos, meaning_1, construction
         FROM dpd_headwords
         WHERE root_key = ? OR root_key LIKE ?
         ORDER BY lemma_1
         LIMIT 20`
      )
      .all(rootKey, `${rootKey} %`);

    if (rows.length === 0) {
      return {
        content: [{ type: "text", text: `ไม่พบคำที่มีรากศัพท์ '${root}'` }],
      };
    }

    let output = `### คำที่มาจากราก ${rootKey}\n\n`;
    for (const r of rows) {
      output += `**${r.lemma_1}** (${r.pos}) — ${r.meaning_1}\n`;
    }
    return { content: [{ type: "text", text: output }] };
  }

  return { content: [{ type: "text", text: `ไม่รู้จัก tool: ${name}` }] };
});

// ── Start ─────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
