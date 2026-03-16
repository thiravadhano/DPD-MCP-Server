#!/usr/bin/env node
/**
 * install.js — เพิ่ม dpd-pali ลงใน Claude Desktop config อัตโนมัติ
 */

import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = path.resolve(__dirname, "..", "server.js");

// หา config path ตาม OS
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

// อ่าน config ที่มีอยู่ หรือสร้างใหม่
let config = { mcpServers: {} };
if (fs.existsSync(configPath)) {
  try {
    config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    config.mcpServers ??= {};
  } catch {
    console.error("❌ อ่าน config ไม่ได้ — ตรวจสอบว่า JSON ถูกต้อง:", configPath);
    process.exit(1);
  }
} else {
  // สร้างโฟลเดอร์ถ้ายังไม่มี
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  console.log("📁 สร้างโฟลเดอร์:", path.dirname(configPath));
}

// ตรวจว่ามีอยู่แล้วหรือยัง
if (config.mcpServers["dpd-pali"]) {
  const existing = config.mcpServers["dpd-pali"].args?.[0];
  if (existing === SERVER_PATH) {
    console.log("✅ dpd-pali ติดตั้งอยู่แล้ว (path ตรงกัน)");
    console.log("   Config:", configPath);
    process.exit(0);
  }
  console.log("⚠️  พบ dpd-pali เดิม — จะอัปเดต path ใหม่");
}

// เพิ่ม / อัปเดต entry
config.mcpServers["dpd-pali"] = {
  command: "node",
  args: [SERVER_PATH],
};

fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
console.log("✅ ติดตั้งสำเร็จ!");
console.log("   Server:", SERVER_PATH);
console.log("   Config:", configPath);
console.log("");
console.log("👉 Restart Claude Desktop แล้วใช้งานได้เลยครับ");
