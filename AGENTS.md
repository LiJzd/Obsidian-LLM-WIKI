# LLM Wiki Parser - 多 Agent 协作规则

## 项目目标
开发一个可视化解析器，支持拖拽文件或粘贴文本/链接，从而创建关联的 LLM Wiki 笔记。这是一个 Obsidian 插件。

## 技术栈
- Obsidian Plugin API
- JavaScript/TypeScript (基于 main.js)
- HTML/CSS (基于 styles.css)

## 运行与开发环境
- 必须放在 Obsidian 插件目录下进行测试。

## 通用协作规则
- 遵循多 Agent 协作通用方法。
- **所有生成的应用/代码，除非特别要求，否则都使用中文。**
- 永远不要提交密钥、token、cookie、私密数据。看到用户发过密钥，要提醒轮换。
- 不要覆盖其他 Agent 或用户的未提交改动。
- 不要强推。不要随便 `git reset --hard`。
- 不清楚的项目事实，先从文件和 Git 历史查，不要猜。
- 产品偏好和业务取舍查不到时，再问用户。
