# Getting Started

## 1. Configure API Keys

Open:

```text
Settings -> Community plugins -> LLM Wiki Parser
```

Set:

- `DeepSeek API Key`: primary key.
- `Xiaomi MiMo API Key`: optional fallback key.
- `Use Xiaomi fallback`: keep enabled if you want automatic retry when DeepSeek fails.

Default provider settings:

```text
DeepSeek endpoint: https://api.deepseek.com/chat/completions
DeepSeek model: deepseek-chat
Xiaomi endpoint: https://api.mimo-v2.com/v1/chat/completions
Xiaomi model: mimo-v2.5-pro
```

You can change models in settings if your account uses different model names.

## 2. Digest Materials

Open the `LLM Wiki Parser` view.

Use the `消化材料` section to:

- Drag in files.
- Paste article text.
- Paste URLs.
- Read clipboard content.

Supported file types:

```text
docx, pptx, xlsx, md, txt, html, csv, json, yaml, xml
```

The plugin will:

1. Extract text.
2. Fetch URL page text when enabled.
3. Ask the model to classify and digest the material.
4. Create a source archive in `Sources/`.
5. Create or update a topic note in `Knowledge/<category>/`.

## 3. Chat With Your Knowledge Base

Open the `LLM Wiki Chat` view.

The chat page has:

- A conversation history sidebar.
- A ChatGPT-like message area.
- A bottom composer.
- Citation links to matched Obsidian notes.

Press `Enter` to send and `Shift+Enter` for a new line.

The plugin searches `Knowledge/` and `Sources/`, then asks the model to answer using only retrieved context. If the vault does not contain enough evidence, the answer should say so.

## 4. Folder Layout

The plugin creates this structure:

```text
Knowledge/
  RAG/
  Agent/
  模型/
  ...
Sources/
QA/
System/
  Taxonomy.md
```

`Knowledge/` is your main reading surface. `Sources/` keeps the original inputs for traceability.

## 5. Recommended Workflow

1. Drop raw documents into the parser.
2. Review the generated or updated topic note.
3. Ask follow-up questions in `LLM Wiki Chat`.
4. Keep refining by adding more sources.

For messy or long documents, split them into smaller chunks before digesting.
