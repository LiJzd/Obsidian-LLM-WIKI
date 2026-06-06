# LLM Wiki Parser

LLM Wiki Parser is an Obsidian plugin that turns dragged or pasted materials into a categorized LLM knowledge base, then lets you chat with that knowledge base using DeepSeek or Xiaomi MiMo.

## Features

- Digest notes, links, and documents into `Knowledge/<category>/<subcategory>/<topic>.md`.
- Builds stable subcategories inside each top-level taxonomy category.
- Converts source material into reusable definitions, methods, boundaries, decision rules, examples, terms, and open questions.
- Preserve original materials in `Sources/`.
- ChatGPT-like knowledge-base chat with conversation history.
- Local retrieval over `Knowledge/` and `Sources/` before model answering.
- DeepSeek Chat Completions or Xiaomi MiMo as the primary provider.
- Optional automatic fallback to the other configured provider.
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
2. Choose `Primary provider`: `DeepSeek` or `Xiaomi MiMo`.
3. Add the API key for your primary provider.
4. Optionally add the other provider key as fallback.
5. Use `Test providers` in settings to verify the key, endpoint, and model.
6. Open the `LLM Wiki Parser` view to digest materials.
7. Open the `LLM Wiki Chat` view to ask questions with conversation history.

See [Getting Started](docs/GETTING_STARTED.md) for the full guide.

## Default Folders

- `Knowledge/`: categorized topic notes, organized as `<category>/<subcategory>/<topic>.md`.
- `Sources/`: original source archives.
- `QA/`: manually saved question-answer logs.
- `System/Taxonomy.md`: category definitions.

## Security

API keys are stored in the local Obsidian plugin `data.json` file inside your vault. Do not commit that file. This repository's `.gitignore` excludes it.

See [Security](docs/SECURITY.md).
