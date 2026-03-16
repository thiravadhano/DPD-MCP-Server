# DPD MCP Server — Digital Pali Dictionary

An MCP server for Claude that provides Pali word lookup from the [Digital Pali Dictionary (DPD)](https://digitalpalidictionary.github.io/).

## Tools

| Tool | Description |
|------|-------------|
| `lookup_pali_word` | Look up a Pali word — supports all inflected forms, compounds, and sandhi |
| `search_pali_meaning` | Search for Pali words by English meaning |
| `lookup_pali_root` | Find all words in a word family by root |

## Installation

**Requirements:** Node.js ≥ 18

```bash
# 1. Clone the repo
git clone https://github.com/thiravadhano/DPD-MCP-Server.git dpd-mcp
cd dpd-mcp

# 2. Install dependencies
npm install

# 3. Download the database and build indexes (~500 MB)
npm run setup

# 4. Register with Claude Desktop
npm run install-mcp
```

Then **restart Claude Desktop** — the server is ready to use.

## Manual config (optional)

If you prefer to edit `claude_desktop_config.json` manually, add:

```json
{
  "mcpServers": {
    "dpd-pali": {
      "command": "node",
      "args": ["/absolute/path/to/dpd-mcp/server.js"]
    }
  }
}
```

Config file locations:
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux:** `~/.config/Claude/claude_desktop_config.json`

## Manual DB download

If `npm run setup` fails to download, get the database directly from the [GitHub Release](https://github.com/thiravadhano/DPD-MCP-Server/releases/tag/claude-pali-mcp) and place it as `dpd_lite.db` in the project root, then re-run:

```bash
npm run setup
```

## License & Attribution

The dictionary data (`dpd_lite.db`) is derived from the **[Digital Pali Dictionary (DPD)](https://digitalpalidictionary.github.io/)** by Bodhirasa, licensed under **[CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/)**.

- You may use and share this MCP server freely for personal and non-commercial purposes.
- Commercial use of the dictionary data requires permission from the original author.
- Please credit the Digital Pali Dictionary when referencing data from this tool.

This MCP server wrapper is released under the MIT License.
