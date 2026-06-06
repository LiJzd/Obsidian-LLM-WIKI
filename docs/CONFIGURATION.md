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

## Retrieval

The first version uses local full-text search over:

- `Knowledge/`
- `Sources/`

It does not build an embedding index.
