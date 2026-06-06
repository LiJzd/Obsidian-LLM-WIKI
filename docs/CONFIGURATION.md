# Configuration

## Model Providers

### DeepSeek

DeepSeek can be the primary provider or the fallback provider.

Required:

- `DeepSeek API Key`

Defaults:

```text
Model: deepseek-chat
Endpoint: https://api.deepseek.com/chat/completions
```

### Xiaomi MiMo

Xiaomi MiMo can be the primary provider or the fallback provider.

Required:

- `Xiaomi MiMo API Key`

Defaults:

```text
Model: mimo-v2.5-pro
Endpoint: https://api.xiaomimimo.com/v1/chat/completions
```

The plugin sends both:

```text
Authorization: Bearer <key>
api-key: <key>
```

### Primary provider and fallback

Use `Primary provider` to choose which provider is called first.

When `Use Xiaomi fallback` is enabled, the plugin retries with the other configured provider if the primary provider fails or has no key. For example:

- Primary `DeepSeek` retries with `Xiaomi MiMo`.
- Primary `Xiaomi MiMo` retries with `DeepSeek`.

Use `Test providers` after changing keys, endpoints, or model names.

## Folders

You can change:

- `Knowledge folder`
- `Source folder`
- `QA folder`
- `System folder`

Changing folders does not migrate old notes automatically.

Topic notes are written to:

```text
Knowledge/<category>/<subcategory>/<topic>.md
```

Each subcategory also gets:

```text
Knowledge/<category>/<subcategory>/_index.md
```

The subcategory should be a reusable method or concept area, not the title of a single article.

`Sources/` keeps one archive per input. A single source can point to multiple topics through `digested_into: []`.

If the model does not return valid `knowledge_units`, the source is saved with:

```text
status: needs_review
```

No Knowledge note is created in that case.

Before a new digest run, old single-level topic notes under `Knowledge/<category>/<topic>.md` are archived to:

```text
System/Legacy/<date>/<category>/<topic>.md
```

## Graph Cleanup

Use `Apply clean graph view` in plugin settings to update Obsidian's graph configuration.

The preset:

- Shows only notes under `Knowledge/`.
- Hides `_index.md`.
- Hides unresolved nodes.
- Hides orphan nodes.
- Keeps `Sources/` and `System/` out of the graph.

The plugin also avoids creating noisy graph nodes by only turning related topics into `[[links]]` when the target topic already exists or is created in the same digest batch. Other related topics stay as plain text candidates.

## Reset Generated Wiki

Use `Reset generated wiki` in plugin settings to remove generated artifacts during testing:

- `Knowledge/`
- `Sources/`
- `System/`
- old parser folders such as `03_Relations/`
- root-level empty notes created by accidental graph clicks

The reset does not delete plugin settings, API keys, or `QA/`.

## Retrieval

The first version uses local full-text search over:

- `Knowledge/`
- `Sources/`

It does not build an embedding index.
