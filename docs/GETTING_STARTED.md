# Getting Started

## 1. Configure API Keys

Open:

```text
Settings -> Community plugins -> LLM Wiki Parser
```

Set:

- `Primary provider`: choose `DeepSeek` or `Xiaomi MiMo`.
- `DeepSeek API Key`: required when DeepSeek is primary or fallback.
- `Xiaomi MiMo API Key`: required when Xiaomi MiMo is primary or fallback.
- `Use Xiaomi fallback`: keep enabled if you want automatic retry with the other configured provider.
- `Test providers`: verifies the selected key, endpoint, and model with a short request.

Default provider settings:

```text
DeepSeek endpoint: https://api.deepseek.com/chat/completions
DeepSeek model: deepseek-chat
Xiaomi endpoint: https://api.xiaomimimo.com/v1/chat/completions
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
3. Ask the model to split the material into reusable `knowledge_units`.
4. Route each unit into a top-level category, subcategory, and topic.
5. Create one source archive in `Sources/`.
6. Create or update one or more topic notes in `Knowledge/<category>/<subcategory>/`.
7. Update each subcategory `_index.md` note.

The model is prompted to extract:

- Definition
- Core conclusions
- Practical methods
- Applicable boundaries
- Decision rules
- Examples
- Key terms
- Related topics
- Open questions

If the model output does not contain usable knowledge units, the plugin saves the source as `needs_review` and does not create empty Knowledge notes.

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
    检索策略/
      _index.md
      查询改写.md
    重排序/
      _index.md
  Agent/
    工具调用/
      _index.md
  模型/
  ...
Sources/
QA/
System/
  Taxonomy.md
  Legacy/
```

`Knowledge/` is your main reading surface. `Sources/` keeps the original inputs for traceability.
Old single-level or broken topic notes are archived under `System/Legacy/<date>/` before new digestion writes fresh structured notes.

## 5. Recommended Workflow

1. Drop raw documents into the parser.
2. Review the generated or updated topic note.
3. Ask follow-up questions in `LLM Wiki Chat`.
4. Keep refining by adding more sources.

For messy or long documents, split them into smaller chunks before digesting.
