#!/usr/bin/env node
/**
 * DPD MCP Server — Digital Pali Dictionary
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

// ── Check DB ─────────────────────────────────────────────────────────
if (!fs.existsSync(DB_PATH)) {
  console.error("❌ dpd_lite.db not found at:", DB_PATH);
  console.error("   Run: npm run setup");
  process.exit(1);
}

const db = new Database(DB_PATH, { readonly: true });
db.pragma("query_only = true");
db.pragma("cache_size = -32000"); // 32 MB cache
db.pragma("mmap_size = 268435456"); // 256 MB memory-mapped I/O

// Check if FTS5 is available (requires npm run setup)
const hasFts = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='dpd_fts'")
  .get();

// ── Helpers ──────────────────────────────────────────────────────────

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
    if (r.meaning_1)   output += `- Meaning: ${r.meaning_1}\n`;
    if (r.meaning_lit) output += `- Literal: ${r.meaning_lit}\n`;
    if (r.grammar)     output += `- Grammar: ${r.grammar}\n`;
    if (r.root_key)    output += `- Root: ${r.root_key}\n`;
    if (r.construction) output += `- Construction: ${r.construction}\n`;
    if (r.sanskrit)    output += `- Sanskrit: ${r.sanskrit}\n`;
    if (r.sutta_1)     output += `- Source: ${r.sutta_1}\n`;
    if (r.example_1)   output += `- Example: ${r.example_1.slice(0, 150)}...\n`;
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
        "Look up a Pali word in the Digital Pali Dictionary (DPD). Supports all inflected forms, compounds, and sandhi. Use when unsure of a word's meaning, part of speech, or root.",
      inputSchema: {
        type: "object",
        properties: {
          word: {
            type: "string",
            description:
              "Pali word in Roman script, e.g. saṅghādisesaṃ, pācittiyaṃ, bhikkhu",
          },
        },
        required: ["word"],
      },
    },
    {
      name: "search_pali_meaning",
      description:
        "Search for Pali words by English meaning. Use when you want to find what Pali word means X.",
      inputSchema: {
        type: "object",
        properties: {
          meaning: {
            type: "string",
            description:
              "English meaning, e.g. 'defeat', 'confession', 'wrong-doing'",
          },
          limit: {
            type: "integer",
            description: "Maximum number of results (default 5)",
            default: 5,
          },
        },
        required: ["meaning"],
      },
    },
    {
      name: "lookup_pali_root",
      description:
        "Find all Pali words derived from the same root. Use when analyzing a word family.",
      inputSchema: {
        type: "object",
        properties: {
          root: {
            type: "string",
            description: "Pali root, e.g. √gam, √kar, √bhū",
          },
        },
        required: ["root"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // ── Tool 1: lookup by word form ──────────────────────────────────
  if (name === "lookup_pali_word") {
    const word = (args.word || "").trim();
    if (!word) {
      return { content: [{ type: "text", text: "Please provide a Pali word." }] };
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
      // fallback: search lemma_1 directly
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
            text: `'${word}' not found in DPD — it may be a compound, sandhi form, or alternate spelling.`,
          },
        ],
      };
    }

    return { content: [{ type: "text", text: buildWordOutput(word, results) }] };
  }

  // ── Tool 2: search by English meaning ───────────────────────────
  if (name === "search_pali_meaning") {
    const meaning = (args.meaning || "").trim();
    const limit = args.limit || 5;

    let rows;
    if (hasFts) {
      // FTS5: much faster than LIKE
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
      // fallback if setup has not been run yet
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
        content: [{ type: "text", text: `No words found with meaning '${meaning}'.` }],
      };
    }

    let output = `### Pali words meaning '${meaning}'\n\n`;
    for (const r of rows) {
      output += `**${r.lemma_1}** (${r.pos}) — ${r.meaning_1}\n`;
      if (r.grammar) output += `  Grammar: ${r.grammar}\n`;
    }
    return { content: [{ type: "text", text: output }] };
  }

  // ── Tool 3: lookup by root ───────────────────────────────────────
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
        content: [{ type: "text", text: `No words found with root '${root}'.` }],
      };
    }

    let output = `### Words from root ${rootKey}\n\n`;
    for (const r of rows) {
      output += `**${r.lemma_1}** (${r.pos}) — ${r.meaning_1}\n`;
    }
    return { content: [{ type: "text", text: output }] };
  }

  return { content: [{ type: "text", text: `Unknown tool: ${name}` }] };
});

// ── Start ─────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
