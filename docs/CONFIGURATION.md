# Configuration

## Model Providers

### DeepSeek

DeepSeek is the primary provider.

Required:

- `DeepSeek API Key`

Defaults:

```text
Model: deepseek-chat
Endpoint: https://api.deepseek.com/chat/completions
```

### Xiaomi MiMo

Xiaomi MiMo is used only as fallback when enabled.

Required:

- `Xiaomi MiMo API Key`

Defaults:

```text
Model: mimo-v2.5-pro
Endpoint: https://api.mimo-v2.com/v1/chat/completions
```

The plugin sends both:

```text
Authorization: Bearer <key>
api-key: <key>
```

## Folders

You can change:

- `Knowledge folder`
- `Source folder`
- `QA folder`
- `System folder`

Changing folders does not migrate old notes automatically.

## Retrieval

The first version uses local full-text search over:

- `Knowledge/`
- `Sources/`

It does not build an embedding index.
