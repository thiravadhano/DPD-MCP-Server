# DPD MCP Server — Digital Pali Dictionary

MCP Server สำหรับ Claude ที่ให้ค้นหาคำศัพท์บาลีจาก [Digital Pali Dictionary (DPD)](https://digitalpalidictionary.github.io/)

## Tools

| Tool | ใช้เมื่อ |
|------|---------|
| `lookup_pali_word` | ค้นหาจากคำบาลี รองรับทุกรูปวิภัตติ |
| `search_pali_meaning` | ค้นหาจากความหมายอังกฤษ |
| `lookup_pali_root` | ค้นหา word family จากรากศัพท์ |

## Installation

**Requirements:** Node.js ≥ 18

```bash
# 1. Clone repo
git clone https://github.com/YOUR_USERNAME/dpd-mcp.git
cd dpd-mcp

# 2. Install (จะ download dpd.db อัตโนมัติ ~300 MB)
npm install
```

## Add to Claude Desktop

เปิดไฟล์ `~/Library/Application Support/Claude/claude_desktop_config.json` แล้วเพิ่ม:

```json
{
  "mcpServers": {
    "dpd-pali": {
      "command": "node",
      "args": ["/FULL/PATH/TO/dpd-mcp/src/server.js"]
    }
  }
}
```

แล้ว restart Claude Desktop ครับ

## Manual DB download

ถ้า auto-download ไม่ทำงาน ให้ download dpd.db มาวางที่ `data/dpd.db` ด้วยตนเองครับ:

```bash
mkdir -p data
node scripts/download-db.js
```
