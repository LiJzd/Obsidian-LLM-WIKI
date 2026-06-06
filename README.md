# LLM Wiki Parser

LLM Wiki Parser is an Obsidian plugin that turns dragged or pasted materials into a categorized LLM knowledge base, then lets you chat with that knowledge base using DeepSeek with optional Xiaomi MiMo fallback.

## Features

- Digest notes, links, and documents into `Knowledge/<category>/<topic>.md`.
- Preserve original materials in `Sources/`.
- ChatGPT-like knowledge-base chat with conversation history.
- Local retrieval over `Knowledge/` and `Sources/` before model answering.
- DeepSeek Chat Completions as the primary provider.
- Xiaomi MiMo as an optional fallback provider.
- Supports `docx`, `pptx`, `xlsx`, `md`, `txt`, `html`, `csv`, `json`, `yaml`, and `xml`.
- Creates `System/Taxonomy.md` with a fixed LLM taxonomy.

## Install Manually

1. Download or clone this repository.
2. Copy `main.js`, `manifest.json`, and `styles.css` into:

   ```text
   <your-vault>/.obsidian/plugins/llm-wiki-parser/
   ```

3. Restart Obsidian or reload the app.
4. Open `Settings -> Community plugins`.
5. Disable Restricted Mode if needed.
6. Enable `LLM Wiki Parser`.

## Quick Start

1. Open `Settings -> Community plugins -> LLM Wiki Parser`.
2. Add your DeepSeek API key.
3. Optionally add a Xiaomi MiMo API key as fallback.
4. Open the `LLM Wiki Parser` view to digest materials.
5. Open the `LLM Wiki Chat` view to ask questions with conversation history.

See [Getting Started](docs/GETTING_STARTED.md) for the full guide.

## Default Folders

- `Knowledge/`: categorized topic notes.
- `Sources/`: original source archives.
- `QA/`: manually saved question-answer logs.
- `System/Taxonomy.md`: category definitions.

## Security

API keys are stored in the local Obsidian plugin `data.json` file inside your vault. Do not commit that file. This repository's `.gitignore` excludes it.

See [Security](docs/SECURITY.md).
