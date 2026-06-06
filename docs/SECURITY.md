# Security

## API Keys

API keys are stored locally by Obsidian in:

```text
<vault>/.obsidian/plugins/llm-wiki-parser/data.json
```

Do not commit or share this file.

This repository excludes `data.json` in `.gitignore`.

## Network Requests

The plugin sends model prompts and retrieved note excerpts to configured model providers:

- DeepSeek
- Xiaomi MiMo, if selected as primary or fallback and a key is configured

Only use the plugin with documents you are comfortable sending to the configured provider.

## Local Files

The plugin reads files you drag into the Obsidian UI. It writes generated notes into your vault folders.
