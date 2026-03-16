#!/usr/bin/env node
/**
 * install.js — register dpd-pali in Claude Desktop config automatically
 */

import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = path.resolve(__dirname, "..", "server.js");

// Resolve config path by OS
function getConfigPath() {
  const platform = process.platform;
  if (platform === "darwin") {
    return path.join(
      os.homedir(),
      "Library/Application Support/Claude/claude_desktop_config.json"
    );
  } else if (platform === "win32") {
    return path.join(
      process.env.APPDATA || "",
      "Claude/claude_desktop_config.json"
    );
  } else {
    return path.join(os.homedir(), ".config/Claude/claude_desktop_config.json");
  }
}

const configPath = getConfigPath();

// Read existing config or start fresh
let config = { mcpServers: {} };
if (fs.existsSync(configPath)) {
  try {
    config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    config.mcpServers ??= {};
  } catch {
    console.error("❌ Failed to parse config — check JSON syntax:", configPath);
    process.exit(1);
  }
} else {
  // Create directory if it doesn't exist
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  console.log("📁 Created config directory:", path.dirname(configPath));
}

// Check if already registered
if (config.mcpServers["dpd-pali"]) {
  const existing = config.mcpServers["dpd-pali"].args?.[0];
  if (existing === SERVER_PATH) {
    console.log("✅ dpd-pali is already registered (path matches)");
    console.log("   Config:", configPath);
    process.exit(0);
  }
  console.log("⚠️  Found existing dpd-pali entry — updating path");
}

// Add / update entry
config.mcpServers["dpd-pali"] = {
  command: "node",
  args: [SERVER_PATH],
};

fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
console.log("✅ Installed successfully!");
console.log("   Server:", SERVER_PATH);
console.log("   Config:", configPath);
console.log("");
console.log("👉 Restart Claude Desktop to activate the MCP server");
