const {
  ItemView,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  normalizePath,
  requestUrl,
} = require("obsidian");

let zlib = null;
try {
  zlib = require("zlib");
} catch {
  zlib = null;
}

const VIEW_TYPE = "llm-wiki-parser-view";
const CHAT_VIEW_TYPE = "llm-wiki-chat-view";

const CATEGORIES = [
  "模型",
  "训练",
  "RAG",
  "Agent",
  "提示词",
  "评测",
  "安全对齐",
  "工程部署",
  "产品案例",
  "论文资料",
];

const DEFAULT_SETTINGS = {
  provider: "deepseek",
  apiKey: "",
  model: "deepseek-chat",
  endpoint: "https://api.deepseek.com/chat/completions",
  useXiaomiFallback: true,
  xiaomiApiKey: "",
  xiaomiModel: "mimo-v2.5-pro",
  xiaomiEndpoint: "https://api.xiaomimimo.com/v1/chat/completions",
  knowledgeFolder: "Knowledge",
  sourceFolder: "Sources",
  qaFolder: "QA",
  systemFolder: "System",
  fetchLinks: true,
  maxInputChars: 24000,
  maxSearchResults: 8,
  chatSessions: [],
  activeChatId: "",
};

const TEXT_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "csv",
  "json",
  "html",
  "htm",
  "xml",
  "yaml",
  "yml",
  "js",
  "ts",
  "py",
  "css",
]);

const SUPPORTED_FILE_LABELS = ["txt", "md", "docx", "pptx", "xlsx", "html", "csv", "json", "yaml", "xml"];

function providerDisplayName(provider) {
  return provider === "xiaomi" ? "Xiaomi MiMo" : "DeepSeek";
}

function today() {
  return window.moment ? window.moment().format("YYYY-MM-DD") : new Date().toISOString().slice(0, 10);
}

function timestamp() {
  return window.moment ? window.moment().format("YYYY-MM-DD HH:mm:ss") : new Date().toISOString();
}

function slugify(value, fallback = "Untitled") {
  const text = String(value || fallback)
    .replace(/[\\/:*?"<>|#^[\]]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (text || fallback).slice(0, 90);
}

function yamlString(value) {
  return JSON.stringify(value ?? "", null, 0);
}

function frontmatter(data) {
  const lines = ["---"];
  Object.entries(data).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    } else if (value === null || value === undefined || value === "") {
      lines.push(`${key}:`);
    } else if (typeof value === "number" || typeof value === "boolean") {
      lines.push(`${key}: ${value}`);
    } else {
      lines.push(`${key}: ${yamlString(value)}`);
    }
  });
  lines.push("---");
  return lines.join("\n");
}

function stripFrontmatter(text) {
  return String(text || "").replace(/^---\n[\s\S]*?\n---\n?/, "");
}

function stripMarkdown(text) {
  return stripFrontmatter(text)
    .replace(/\[\[([^\]|#]+)(?:[^\]]*)\]\]/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[`*_>#-]/g, " ");
}

function extractUrls(text) {
  const urls = new Set();
  for (const match of String(text || "").matchAll(/https?:\/\/[^\s<>"')\]]+/gi)) {
    urls.add(match[0].replace(/[.,;:!?]+$/g, ""));
  }
  return Array.from(urls).slice(0, 20);
}

function htmlToText(raw) {
  const withoutScripts = String(raw || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  const titleMatch = withoutScripts.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const text = withoutScripts
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  return {
    title: titleMatch ? titleMatch[1].replace(/\s+/g, " ").trim() : "",
    text,
  };
}

function decodeXmlEntities(text) {
  return String(text || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function inflateRawDeflate(data) {
  if (zlib?.inflateRawSync) {
    return zlib.inflateRawSync(Buffer.from(data));
  }
  if (typeof DecompressionStream === "undefined") {
    throw new Error("当前 Obsidian 环境不支持 DOCX 解压。请把 DOCX 另存为 Markdown 或文本。");
  }
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Response(stream).arrayBuffer();
}

function findZipEntry(bytes, filename) {
  const nameBytes = new TextEncoder().encode(filename);
  const centralEntry = findZipEntryInCentralDirectory(bytes, nameBytes);
  if (centralEntry) return centralEntry;
  for (let i = 0; i < bytes.length - 46; i += 1) {
    if (bytes[i] !== 0x50 || bytes[i + 1] !== 0x4b || bytes[i + 2] !== 0x03 || bytes[i + 3] !== 0x04) continue;
    const method = bytes[i + 8] | (bytes[i + 9] << 8);
    const compressedSize = bytes[i + 18] | (bytes[i + 19] << 8) | (bytes[i + 20] << 16) | (bytes[i + 21] << 24);
    const uncompressedSize = bytes[i + 22] | (bytes[i + 23] << 8) | (bytes[i + 24] << 16) | (bytes[i + 25] << 24);
    const nameLength = bytes[i + 26] | (bytes[i + 27] << 8);
    const extraLength = bytes[i + 28] | (bytes[i + 29] << 8);
    const nameStart = i + 30;
    const name = bytes.slice(nameStart, nameStart + nameLength);
    const matches = zipNameMatches(name, nameBytes);
    const dataStart = nameStart + nameLength + extraLength;
    if (matches) {
      return {
        method,
        compressedSize,
        uncompressedSize,
        data: bytes.slice(dataStart, dataStart + compressedSize),
      };
    }
    i = dataStart + Math.max(0, compressedSize) - 1;
  }
  return null;
}

function findZipEntryInCentralDirectory(bytes, nameBytes) {
  for (let i = bytes.length - 22; i >= 0; i -= 1) {
    if (bytes[i] !== 0x50 || bytes[i + 1] !== 0x4b || bytes[i + 2] !== 0x05 || bytes[i + 3] !== 0x06) continue;
    let cursor = readUInt32(bytes, i + 16);
    while (cursor < bytes.length - 46) {
      if (bytes[cursor] !== 0x50 || bytes[cursor + 1] !== 0x4b || bytes[cursor + 2] !== 0x01 || bytes[cursor + 3] !== 0x02) break;
      const method = readUInt16(bytes, cursor + 10);
      const compressedSize = readUInt32(bytes, cursor + 20);
      const uncompressedSize = readUInt32(bytes, cursor + 24);
      const nameLength = readUInt16(bytes, cursor + 28);
      const extraLength = readUInt16(bytes, cursor + 30);
      const commentLength = readUInt16(bytes, cursor + 32);
      const localOffset = readUInt32(bytes, cursor + 42);
      const name = bytes.slice(cursor + 46, cursor + 46 + nameLength);
      const matches = zipNameMatches(name, nameBytes);
      if (matches) {
        const localNameLength = readUInt16(bytes, localOffset + 26);
        const localExtraLength = readUInt16(bytes, localOffset + 28);
        const dataStart = localOffset + 30 + localNameLength + localExtraLength;
        return {
          method,
          compressedSize,
          uncompressedSize,
          data: bytes.slice(dataStart, dataStart + compressedSize),
        };
      }
      cursor += 46 + nameLength + extraLength + commentLength;
    }
    return null;
  }
  return null;
}

function listZipEntries(bytes) {
  const entries = [];
  for (let i = bytes.length - 22; i >= 0; i -= 1) {
    if (bytes[i] !== 0x50 || bytes[i + 1] !== 0x4b || bytes[i + 2] !== 0x05 || bytes[i + 3] !== 0x06) continue;
    let cursor = readUInt32(bytes, i + 16);
    while (cursor < bytes.length - 46) {
      if (bytes[cursor] !== 0x50 || bytes[cursor + 1] !== 0x4b || bytes[cursor + 2] !== 0x01 || bytes[cursor + 3] !== 0x02) break;
      const method = readUInt16(bytes, cursor + 10);
      const compressedSize = readUInt32(bytes, cursor + 20);
      const uncompressedSize = readUInt32(bytes, cursor + 24);
      const nameLength = readUInt16(bytes, cursor + 28);
      const extraLength = readUInt16(bytes, cursor + 30);
      const commentLength = readUInt16(bytes, cursor + 32);
      const localOffset = readUInt32(bytes, cursor + 42);
      const nameBytes = bytes.slice(cursor + 46, cursor + 46 + nameLength);
      const name = new TextDecoder("utf-8").decode(nameBytes).replace(/\\/g, "/");
      const localNameLength = readUInt16(bytes, localOffset + 26);
      const localExtraLength = readUInt16(bytes, localOffset + 28);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      entries.push({
        name,
        method,
        compressedSize,
        uncompressedSize,
        data: bytes.slice(dataStart, dataStart + compressedSize),
      });
      cursor += 46 + nameLength + extraLength + commentLength;
    }
    return entries;
  }
  return entries;
}

function readUInt16(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function zipNameMatches(actual, expected) {
  return actual.length === expected.length && actual.every((value, index) => {
    const normalized = value === 0x5c ? 0x2f : value;
    return normalized === expected[index];
  });
}

async function inflateZipEntry(entry) {
  if (entry.method === 0) return entry.data;
  if (entry.method === 8) return new Uint8Array(await inflateRawDeflate(entry.data));
  throw new Error(`暂不支持的 Office 文件压缩方式: ${entry.method}`);
}

function extractTextNodesFromXml(xml) {
  const values = [];
  for (const textNode of String(xml || "").matchAll(/<(?:a|w|t):t\b[^>]*>([\s\S]*?)<\/(?:a|w|t):t>/g)) {
    values.push(decodeXmlEntities(textNode[1]));
  }
  for (const textNode of String(xml || "").matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) {
    values.push(decodeXmlEntities(textNode[1]));
  }
  return values.map((item) => item.trim()).filter(Boolean);
}

function readUInt32(bytes, offset) {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

async function extractDocxText(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const entry = findZipEntry(bytes, "word/document.xml");
  if (!entry) throw new Error("DOCX 中没有找到 word/document.xml。");
  let xmlBytes;
  if (entry.method === 0) {
    xmlBytes = entry.data;
  } else if (entry.method === 8) {
    xmlBytes = new Uint8Array(await inflateRawDeflate(entry.data));
  } else {
    throw new Error(`暂不支持的 DOCX 压缩方式: ${entry.method}`);
  }
  if (entry.uncompressedSize && xmlBytes.length < Math.min(entry.uncompressedSize, 32)) {
    throw new Error("DOCX 解压结果异常。");
  }
  const xml = new TextDecoder("utf-8").decode(xmlBytes);
  const paragraphs = [];
  for (const paragraph of xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)) {
    const parts = [];
    for (const textNode of paragraph[0].matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)) {
      parts.push(decodeXmlEntities(textNode[1]));
    }
    const text = parts.join("").trim();
    if (text) paragraphs.push(text);
  }
  return paragraphs.join("\n\n").trim();
}

async function extractPptxText(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const entries = listZipEntries(bytes)
    .filter((entry) => /^ppt\/slides\/slide\d+\.xml$/i.test(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  if (!entries.length) throw new Error("PPTX 中没有找到幻灯片文本。");
  const slides = [];
  for (const [index, entry] of entries.entries()) {
    const xml = new TextDecoder("utf-8").decode(await inflateZipEntry(entry));
    const text = extractTextNodesFromXml(xml).join("\n").trim();
    if (text) slides.push(`Slide ${index + 1}\n${text}`);
  }
  return slides.join("\n\n").trim();
}

async function extractXlsxText(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const entries = listZipEntries(bytes);
  const shared = [];
  const sharedEntry = entries.find((entry) => entry.name === "xl/sharedStrings.xml");
  if (sharedEntry) {
    const xml = new TextDecoder("utf-8").decode(await inflateZipEntry(sharedEntry));
    shared.push(...extractTextNodesFromXml(xml));
  }
  const sheetEntries = entries
    .filter((entry) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  if (!sheetEntries.length && !shared.length) throw new Error("XLSX 中没有找到可提取文本。");
  const sheets = [];
  for (const [index, entry] of sheetEntries.entries()) {
    const xml = new TextDecoder("utf-8").decode(await inflateZipEntry(entry));
    const cells = [];
    for (const cell of xml.matchAll(/<c\b([^>]*)>[\s\S]*?<v>([\s\S]*?)<\/v>[\s\S]*?<\/c>/g)) {
      const isShared = /t="s"/.test(cell[1]);
      const value = decodeXmlEntities(cell[2]);
      cells.push(isShared ? shared[Number(value)] || value : value);
    }
    const inline = extractTextNodesFromXml(xml);
    cells.push(...inline);
    if (cells.length) sheets.push(`Sheet ${index + 1}\n${cells.filter(Boolean).join(" | ")}`);
  }
  return (sheets.join("\n\n") || shared.join("\n")).trim();
}

function parseAliases(content) {
  const match = String(content || "").match(/^aliases:\s*(.+)$/m);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[1]);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return match[1].split(",").map((item) => item.replace(/[\[\]"]/g, "").trim()).filter(Boolean);
  }
}

function words(text) {
  const clean = stripMarkdown(text).toLowerCase();
  const tokens = clean.match(/[\u4e00-\u9fa5]{2,}|[a-z0-9][a-z0-9-]{1,}/gi) || [];
  const stop = new Set(["the", "and", "for", "with", "this", "that", "from", "into", "your", "you", "are", "was"]);
  return tokens.filter((token) => !stop.has(token.toLowerCase())).slice(0, 300);
}

function clip(text, max) {
  const value = String(text || "");
  return value.length > max ? `${value.slice(0, max)}\n\n[内容已截断]` : value;
}

function linkForFile(file) {
  return `[[${file.basename}]]`;
}

function coerceDigest(raw, fallbackTitle, sourceType, text) {
  const result = raw && typeof raw === "object" ? raw : {};
  const category = CATEGORIES.includes(result.category) ? result.category : guessCategory(text);
  return {
    title: slugify(result.title || fallbackTitle || "未命名主题"),
    source_type: String(result.source_type || sourceType || "text"),
    category,
    topic: slugify(result.topic || result.title || fallbackTitle || "未命名主题"),
    aliases: Array.isArray(result.aliases) ? result.aliases.map(String).slice(0, 12) : [],
    summary: String(result.summary || stripMarkdown(text).slice(0, 280)),
    definition: String(result.definition || ""),
    key_points: toStringArray(result.key_points, 8),
    methods: toStringArray(result.methods, 8),
    terms: toStringArray(result.terms, 12),
    related_topics: toStringArray(result.related_topics, 12).map((item) => slugify(item)),
    open_questions: toStringArray(result.open_questions || result.questions, 10),
    evidence: toStringArray(result.evidence, 10),
    links: Array.isArray(result.links) ? result.links.map(String).slice(0, 20) : extractUrls(text),
  };
}

function toStringArray(value, limit) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, limit);
}

function guessCategory(text) {
  const value = String(text || "").toLowerCase();
  const rules = [
    ["RAG", ["rag", "retrieval", "检索", "向量", "embedding", "知识库"]],
    ["Agent", ["agent", "tool", "工具调用", "智能体", "workflow"]],
    ["模型", ["model", "模型", "deepseek", "gpt", "llama", "qwen", "claude"]],
    ["训练", ["training", "fine-tuning", "finetune", "训练", "微调", "sft", "rlhf"]],
    ["提示词", ["prompt", "提示词", "system prompt", "cot"]],
    ["评测", ["eval", "benchmark", "评测", "测试", "指标"]],
    ["安全对齐", ["safety", "alignment", "安全", "对齐", "越狱"]],
    ["工程部署", ["deploy", "部署", "api", "latency", "缓存", "架构"]],
    ["产品案例", ["product", "产品", "案例", "用户", "增长"]],
  ];
  const hit = rules.find(([, keys]) => keys.some((key) => value.includes(key)));
  return hit ? hit[0] : "论文资料";
}

function topicTemplate(digest, sourceLink) {
  const topic = slugify(digest.topic);
  return [
    frontmatter({
      type: "topic",
      category: digest.category,
      aliases: digest.aliases,
      status: "active",
      created: today(),
      updated: today(),
      sources: [sourceLink],
      tags: ["llm-wiki"],
    }),
    "",
    `# ${topic}`,
    "",
    "## 定义",
    "",
    digest.definition || digest.summary || "",
    "",
    "## 核心观点",
    "",
    listBlock(digest.key_points),
    "",
    "## 实践方法",
    "",
    listBlock(digest.methods),
    "",
    "## 关键术语",
    "",
    listBlock(digest.terms),
    "",
    "## 关联主题",
    "",
    listBlock(digest.related_topics.map((item) => `[[${item}]]`)),
    "",
    "## 证据来源",
    "",
    `- ${sourceLink}`,
    ...digest.evidence.map((item) => `- ${item}`),
    "",
    "## 待研究问题",
    "",
    listBlock(digest.open_questions),
    "",
  ].join("\n");
}

function sourceTemplate(title, kind, ref, digest, original, topicLink) {
  return [
    frontmatter({
      type: "source",
      status: "archived",
      source_type: digest.source_type || kind,
      url: extractUrls(ref || original)[0] || "",
      created: today(),
      digested_into: topicLink,
      tags: ["llm-wiki-source"],
    }),
    "",
    `# ${slugify(title)}`,
    "",
    "## 摘要",
    "",
    digest.summary || "",
    "",
    "## 提取结果",
    "",
    "```json",
    JSON.stringify(digest, null, 2),
    "```",
    "",
    "## 原文",
    "",
    original,
    "",
  ].join("\n");
}

function listBlock(items) {
  const values = (items || []).filter(Boolean);
  return values.length ? values.map((item) => `- ${item}`).join("\n") : "-";
}

function extractJson(text) {
  const raw = String(text || "").trim();
  try {
    return JSON.parse(raw);
  } catch {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) return JSON.parse(fenced[1]);
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(raw.slice(start, end + 1));
    throw new Error("模型没有返回可解析的 JSON。");
  }
}

function stripCodeFence(text) {
  const raw = String(text || "").trim();
  const match = raw.match(/^```(?:markdown|md)?\s*([\s\S]*?)```$/i);
  return match ? match[1].trim() : raw;
}

class LlmWikiParserPlugin extends Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.registerView(VIEW_TYPE, (leaf) => new LlmWikiParserView(leaf, this));
    this.registerView(CHAT_VIEW_TYPE, (leaf) => new LlmWikiChatView(leaf, this));
    this.addRibbonIcon("network", "LLM Wiki Parser", () => this.activateView());
    this.addRibbonIcon("message-square", "LLM Wiki Chat", () => this.activateChatView());
    this.addCommand({
      id: "open-llm-wiki-parser",
      name: "Open LLM Wiki Parser",
      callback: () => this.activateView(),
    });
    this.addCommand({
      id: "open-llm-wiki-chat",
      name: "Open LLM Wiki Chat",
      callback: () => this.activateChatView(),
    });
    this.addCommand({
      id: "digest-clipboard",
      name: "Digest clipboard into LLM Wiki",
      callback: async () => {
        const text = await navigator.clipboard.readText();
        const result = await this.digestText("Clipboard", text, "clipboard", "clipboard");
        new Notice(`已消化到 ${result.topicFile.path}`);
      },
    });
    this.addSettingTab(new LlmWikiParserSettingTab(this.app, this));
    this.ensureCoreFolders().catch((error) => {
      console.error("LLM Wiki Parser failed to initialize folders.", error);
      new Notice(`LLM Wiki Parser 初始化目录失败: ${error.message || error}`, 8000);
    });
  }

  async activateView() {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE);
    if (leaves.length) {
      this.app.workspace.revealLeaf(leaves[0]);
      return;
    }
    const leaf = this.app.workspace.getRightLeaf(false);
    await leaf.setViewState({ type: VIEW_TYPE, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  async activateChatView() {
    const leaves = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE);
    if (leaves.length) {
      this.app.workspace.revealLeaf(leaves[0]);
      return;
    }
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: CHAT_VIEW_TYPE, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  getChatSessions() {
    if (!Array.isArray(this.settings.chatSessions)) this.settings.chatSessions = [];
    return this.settings.chatSessions;
  }

  async createChatSession(title = "新对话") {
    const session = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      title,
      created: timestamp(),
      updated: timestamp(),
      messages: [],
    };
    this.getChatSessions().unshift(session);
    this.settings.activeChatId = session.id;
    await this.saveSettings();
    return session;
  }

  async getActiveChatSession() {
    const sessions = this.getChatSessions();
    let session = sessions.find((item) => item.id === this.settings.activeChatId);
    if (!session) session = sessions[0];
    if (!session) session = await this.createChatSession();
    this.settings.activeChatId = session.id;
    if (!Array.isArray(session.messages)) session.messages = [];
    return session;
  }

  async setActiveChatSession(id) {
    this.settings.activeChatId = id;
    await this.saveSettings();
  }

  async deleteChatSession(id) {
    const sessions = this.getChatSessions();
    const index = sessions.findIndex((item) => item.id === id);
    if (index >= 0) sessions.splice(index, 1);
    if (this.settings.activeChatId === id) {
      this.settings.activeChatId = sessions[0]?.id || "";
    }
    await this.saveSettings();
  }

  async clearChatSession(id) {
    const session = this.getChatSessions().find((item) => item.id === id);
    if (!session) return;
    session.messages = [];
    session.updated = timestamp();
    await this.saveSettings();
  }

  async ensureFolder(folder) {
    const normalized = normalizePath(folder);
    if (this.app.vault.getAbstractFileByPath(normalized)) return;
    try {
      await this.app.vault.createFolder(normalized);
    } catch (error) {
      if (String(error?.message || error).toLowerCase().includes("already exists")) return;
      if (this.app.vault.getAbstractFileByPath(normalized)) return;
      throw error;
    }
  }

  async ensureCoreFolders() {
    await this.ensureFolder(this.settings.knowledgeFolder);
    await this.ensureFolder(this.settings.sourceFolder);
    await this.ensureFolder(this.settings.qaFolder);
    await this.ensureFolder(this.settings.systemFolder);
    for (const category of CATEGORIES) {
      await this.ensureFolder(`${this.settings.knowledgeFolder}/${category}`);
    }
    await this.ensureTaxonomyNote();
  }

  async ensureTaxonomyNote() {
    const path = normalizePath(`${this.settings.systemFolder}/Taxonomy.md`);
    if (this.app.vault.getAbstractFileByPath(path)) return;
    const content = [
      frontmatter({ type: "system", status: "active", created: today(), updated: today(), tags: ["llm-wiki"] }),
      "",
      "# Taxonomy",
      "",
      ...CATEGORIES.map((category) => `- [[${category}]]`),
      "",
      "## 分类说明",
      "",
      "- 模型: 模型发布、能力、上下文、参数与对比。",
      "- 训练: 预训练、微调、偏好优化、数据与训练方法。",
      "- RAG: 检索增强、向量库、重排、知识库工程。",
      "- Agent: 工具调用、规划、工作流、多智能体。",
      "- 提示词: Prompt 模式、系统提示词、上下文组织。",
      "- 评测: Benchmark、自动评估、人工评审、指标。",
      "- 安全对齐: 安全、对齐、越狱、防护、合规。",
      "- 工程部署: API、延迟、成本、缓存、部署架构。",
      "- 产品案例: 产品设计、商业案例、用户场景。",
      "- 论文资料: 论文、报告、资料型内容或暂无法归类内容。",
      "",
    ].join("\n");
    await this.app.vault.create(path, content);
  }

  async uniquePath(path) {
    const normalized = normalizePath(path);
    if (!this.app.vault.getAbstractFileByPath(normalized)) return normalized;
    const dot = normalized.lastIndexOf(".");
    const base = dot >= 0 ? normalized.slice(0, dot) : normalized;
    const ext = dot >= 0 ? normalized.slice(dot) : "";
    for (let i = 2; i < 1000; i += 1) {
      const candidate = `${base} ${i}${ext}`;
      if (!this.app.vault.getAbstractFileByPath(candidate)) return candidate;
    }
    throw new Error(`无法创建唯一文件名: ${path}`);
  }

  async readDroppedFile(file) {
    const ext = file.name.split(".").pop().toLowerCase();
    if (ext === "docx") {
      return await extractDocxText(file);
    }
    if (ext === "pptx") {
      return await extractPptxText(file);
    }
    if (ext === "xlsx") {
      return await extractXlsxText(file);
    }
    if (TEXT_EXTENSIONS.has(ext) || file.type.startsWith("text/")) {
      return await file.text();
    }
    if (ext === "pdf") {
      throw new Error("DeepSeek 模式不支持直接上传 PDF。请先把 PDF 转成文本或 Markdown 再拖入。");
    }
    throw new Error(`暂不支持 ${ext || "未知"} 文件，请使用文本或 Markdown。`);
  }

  async fetchLink(url) {
    const response = await requestUrl({
      url,
      method: "GET",
      headers: { "User-Agent": "LLM Wiki Parser Obsidian Plugin" },
      throw: false,
    });
    if (response.status < 200 || response.status >= 400) {
      throw new Error(`抓取链接失败 (${response.status}): ${url}`);
    }
    const body = response.text || "";
    const contentType = response.headers["content-type"] || response.headers["Content-Type"] || "";
    if (contentType.includes("text/html") || /<html[\s>]/i.test(body)) {
      const parsed = htmlToText(body);
      return { title: parsed.title || url, text: `${url}\n\n${parsed.text}` };
    }
    return { title: url, text: `${url}\n\n${body}` };
  }

  async callChatProvider(provider, messages, jsonMode = true) {
    const config = provider === "xiaomi"
      ? {
        name: "Xiaomi MiMo",
        apiKey: this.settings.xiaomiApiKey,
        model: this.settings.xiaomiModel,
        endpoint: this.settings.xiaomiEndpoint,
        headers: {
          Authorization: `Bearer ${this.settings.xiaomiApiKey}`,
          "api-key": this.settings.xiaomiApiKey,
          "Content-Type": "application/json",
        },
      }
      : {
        name: "DeepSeek",
        apiKey: this.settings.apiKey,
        model: this.settings.model,
        endpoint: this.settings.endpoint,
        headers: {
          Authorization: `Bearer ${this.settings.apiKey}`,
          "Content-Type": "application/json",
        },
      };

    if (!config.apiKey) {
      throw new Error(`请先在插件设置里填写 ${config.name} API Key。`);
    }
    const body = {
      model: config.model,
      messages,
      temperature: 0.1,
    };
    if (jsonMode) body.response_format = { type: "json_object" };
    const response = await requestUrl({
      url: config.endpoint,
      method: "POST",
      headers: config.headers,
      body: JSON.stringify(body),
      throw: false,
    });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`${config.name} 请求失败 (${response.status}): ${response.text?.slice(0, 500) || "empty response"}`);
    }
    const data = response.json || JSON.parse(response.text);
    return data?.choices?.[0]?.message?.content || "";
  }

  async callLlm(messages, jsonMode = true) {
    const primary = this.settings.provider === "xiaomi" ? "xiaomi" : "deepseek";
    const fallback = primary === "deepseek" ? "xiaomi" : "deepseek";
    const hasPrimaryKey = primary === "deepseek" ? this.settings.apiKey : this.settings.xiaomiApiKey;
    const hasFallbackKey = fallback === "deepseek" ? this.settings.apiKey : this.settings.xiaomiApiKey;

    if (!hasPrimaryKey) {
      if (this.settings.useXiaomiFallback && hasFallbackKey) {
        return await this.callChatProvider(fallback, messages, jsonMode);
      }
      throw new Error("请先在插件设置里填写当前主模型 API Key，或配置备用模型 API Key。");
    }

    try {
      return await this.callChatProvider(primary, messages, jsonMode);
    } catch (error) {
      if (this.settings.useXiaomiFallback && hasFallbackKey) {
        console.warn(`${primary} failed; retrying with ${fallback}.`, error);
        try {
          return await this.callChatProvider(fallback, messages, jsonMode);
        } catch (fallbackError) {
          throw new Error(`${error.message}\nFallback also failed: ${fallbackError.message}`);
        }
      }
      throw error;
    }
  }

  async testProvider(provider) {
    const output = await this.callChatProvider(provider, [
      { role: "system", content: "Return JSON only." },
      { role: "user", content: "Return {\"ok\":true,\"provider\":\"test\"}." },
    ], true);
    return extractJson(output);
  }

  hasAnyModelKey() {
    return !!(this.settings.apiKey || this.settings.xiaomiApiKey);
  }

  async digestWithModel(title, sourceType, text) {
    const content = clip(text, Number(this.settings.maxInputChars) || DEFAULT_SETTINGS.maxInputChars);
    if (!this.hasAnyModelKey()) {
      return coerceDigest(null, title, sourceType, content);
    }
    const prompt = [
      `固定分类只能从这里选择: ${CATEGORIES.join(", ")}`,
      "请把材料消化成 Obsidian 知识库主题更新计划。",
      "只返回 JSON，不要 Markdown。",
      "JSON 字段: title, source_type, category, topic, aliases, summary, definition, key_points, methods, terms, related_topics, open_questions, evidence, links。",
      "category 必须是固定分类之一。topic 是应归入或创建的主题笔记名。",
      "",
      `标题: ${title}`,
      `来源类型: ${sourceType}`,
      "",
      content,
    ].join("\n");
    const output = await this.callLlm([
      { role: "system", content: "你是严谨的中文知识库编辑，擅长把材料归类、去重、整理成可复习的主题笔记。" },
      { role: "user", content: prompt },
    ]);
    return coerceDigest(extractJson(output), title, sourceType, content);
  }

  async mergeTopicWithModel(existingContent, digest, sourceLink) {
    if (!this.hasAnyModelKey()) {
      return this.appendTopic(existingContent, digest, sourceLink);
    }
    const prompt = [
      "请把旧主题笔记和新增材料合并为一篇完整 Obsidian Markdown 主题笔记。",
      "必须保持这些章节: 定义、核心观点、实践方法、关键术语、关联主题、证据来源、待研究问题。",
      "去重、整合相近观点，不要只在末尾堆砌。",
      "保留 YAML frontmatter，更新 updated，sources 中加入新来源。",
      "证据来源章节必须包含新来源链接。",
      "",
      "旧主题笔记:",
      existingContent,
      "",
      "新增消化结果:",
      JSON.stringify(digest, null, 2),
      "",
      `新来源链接: ${sourceLink}`,
    ].join("\n");
    const output = await this.callLlm([
      { role: "system", content: "你是 Obsidian 知识库编辑，只输出最终 Markdown 文件内容。" },
      { role: "user", content: prompt },
    ], false);
    return stripCodeFence(output) || this.appendTopic(existingContent, digest, sourceLink);
  }

  appendTopic(existingContent, digest, sourceLink) {
    const addition = [
      "",
      `<!-- LLM Wiki update ${timestamp()} -->`,
      "",
      "## 核心观点",
      "",
      listBlock(digest.key_points),
      "",
      "## 实践方法",
      "",
      listBlock(digest.methods),
      "",
      "## 关键术语",
      "",
      listBlock(digest.terms),
      "",
      "## 关联主题",
      "",
      listBlock(digest.related_topics.map((item) => `[[${item}]]`)),
      "",
      "## 证据来源",
      "",
      `- ${sourceLink}`,
      ...digest.evidence.map((item) => `- ${item}`),
      "",
      "## 待研究问题",
      "",
      listBlock(digest.open_questions),
      "",
    ].join("\n");
    return String(existingContent || "").trimEnd() + "\n" + addition;
  }

  async gatherInput(title, text, sourceType) {
    let combined = String(text || "").trim();
    let sourceTitle = title;
    const urls = extractUrls(combined);
    if (this.settings.fetchLinks && urls.length) {
      const fetched = [];
      for (const url of urls.slice(0, 5)) {
        try {
          const page = await this.fetchLink(url);
          fetched.push(`\n\n---\nFetched link: ${url}\nTitle: ${page.title}\n\n${page.text}`);
          if (!sourceTitle || sourceTitle === "Pasted Text") sourceTitle = page.title;
        } catch (error) {
          fetched.push(`\n\n---\nFetched link failed: ${url}\n${error.message}`);
        }
      }
      combined += fetched.join("");
    }
    if (!combined) throw new Error("没有可消化的内容。");
    return { title: sourceTitle || title || "Pasted Text", text: combined, sourceType };
  }

  async digestText(title, text, sourceType = "paste", ref = "") {
    await this.ensureCoreFolders();
    const input = await this.gatherInput(title, text, sourceType);
    const digest = await this.digestWithModel(input.title, input.sourceType, input.text);
    const topicFile = await this.findOrCreateTopic(digest);
    const topicLink = linkForFile(topicFile);
    const sourcePath = await this.uniquePath(`${this.settings.sourceFolder}/${today()} - ${slugify(input.title)}.md`);
    const sourceContent = sourceTemplate(input.title, input.sourceType, ref || input.title, digest, clip(input.text, this.settings.maxInputChars), topicLink);
    const sourceFile = await this.app.vault.create(sourcePath, sourceContent);
    const sourceLink = linkForFile(sourceFile);

    const existingTopic = await this.app.vault.read(topicFile);
    const mergedTopic = topicFile.stat?.size > 0
      ? await this.mergeTopicWithModel(existingTopic, digest, sourceLink)
      : topicTemplate(digest, sourceLink);
    await this.app.vault.modify(topicFile, mergedTopic);

    return { topicFile, sourceFile, digest };
  }

  async digestFile(file) {
    const text = await this.readDroppedFile(file);
    const title = file.name.replace(/\.[^.]+$/, "");
    const ext = file.name.split(".").pop().toLowerCase();
    return await this.digestText(title, text, ext, file.name);
  }

  async findOrCreateTopic(digest) {
    const candidates = await this.findTopicCandidates(digest, 1);
    if (candidates.length && candidates[0].score >= 15) return candidates[0].file;
    const path = await this.uniquePath(`${this.settings.knowledgeFolder}/${digest.category}/${slugify(digest.topic)}.md`);
    return await this.app.vault.create(path, "");
  }

  async findTopicCandidates(digest, limit = 5) {
    const topicWords = words([digest.topic, digest.summary, ...(digest.aliases || [])].join(" "));
    const files = this.app.vault.getMarkdownFiles()
      .filter((file) => file.path.startsWith(`${this.settings.knowledgeFolder}/`));
    const scored = [];
    for (const file of files) {
      const content = await this.app.vault.cachedRead(file);
      let score = 0;
      const lowerPath = file.path.toLowerCase();
      const lowerBase = file.basename.toLowerCase();
      if (lowerBase === String(digest.topic).toLowerCase()) score += 30;
      if (lowerBase.includes(String(digest.topic).toLowerCase())) score += 15;
      if (lowerPath.includes(`/${digest.category.toLowerCase()}/`)) score += 5;
      for (const alias of parseAliases(content)) {
        if (alias.toLowerCase() === String(digest.topic).toLowerCase()) score += 20;
      }
      const haystack = stripMarkdown(content).toLowerCase();
      for (const token of topicWords.slice(0, 30)) {
        if (haystack.includes(token.toLowerCase())) score += 1;
      }
      if (score > 0) scored.push({ file, score, content });
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  async searchKnowledge(question) {
    const queryWords = words(question);
    const files = this.app.vault.getMarkdownFiles()
      .filter((file) => file.path.startsWith(`${this.settings.knowledgeFolder}/`) || file.path.startsWith(`${this.settings.sourceFolder}/`));
    const results = [];
    for (const file of files) {
      const content = await this.app.vault.cachedRead(file);
      const text = stripMarkdown(content);
      let score = 0;
      const base = `${file.basename} ${file.path}`.toLowerCase();
      for (const token of queryWords) {
        const lower = token.toLowerCase();
        if (base.includes(lower)) score += 8;
        if (text.toLowerCase().includes(lower)) score += 2;
      }
      if (file.path.startsWith(`${this.settings.knowledgeFolder}/`)) score += 3;
      if (Date.now() - file.stat.mtime < 1000 * 60 * 60 * 24 * 14) score += 1;
      if (score > 0) {
        results.push({
          file,
          score,
          excerpt: this.bestExcerpt(text, queryWords),
        });
      }
    }
    return results.sort((a, b) => b.score - a.score).slice(0, this.settings.maxSearchResults);
  }

  bestExcerpt(text, queryWords) {
    const clean = String(text || "").replace(/\s+/g, " ").trim();
    const lower = clean.toLowerCase();
    let index = 0;
    for (const token of queryWords) {
      const hit = lower.indexOf(token.toLowerCase());
      if (hit >= 0) {
        index = Math.max(0, hit - 260);
        break;
      }
    }
    return clean.slice(index, index + 900);
  }

  async answerQuestion(question) {
    const results = await this.searchKnowledge(question);
    if (!results.length) {
      return {
        answer: "库里没有检索到足够相关的主题或来源，因此不能给出有依据的回答。",
        results,
      };
    }
    if (!this.hasAnyModelKey()) {
      return {
        answer: [
          "未填写可用 API Key，先返回本地检索结果：",
          "",
          ...results.map((item) => `- ${linkForFile(item.file)}: ${item.excerpt.slice(0, 180)}`),
        ].join("\n"),
        results,
      };
    }
    const context = results.map((item, index) => [
      `文档 ${index + 1}: ${linkForFile(item.file)}`,
      `路径: ${item.file.path}`,
      item.excerpt,
    ].join("\n")).join("\n\n---\n\n");
    const prompt = [
      "请只根据给定 Obsidian 检索结果回答问题。",
      "关键结论必须带 Obsidian 链接引用，例如 [[主题名]]。",
      "如果证据不足，明确说库里没有足够依据，不要编造。",
      "回答最后列出“参考笔记”。",
      "",
      `问题: ${question}`,
      "",
      "检索结果:",
      context,
    ].join("\n");
    const answer = await this.callLlm([
      { role: "system", content: "你是严谨的知识库问答助手，必须基于引用回答。" },
      { role: "user", content: prompt },
    ], false);
    return { answer: answer.trim(), results };
  }

  async answerChatQuestion(session, question) {
    const results = await this.searchKnowledge(question);
    const userMessage = {
      role: "user",
      content: question,
      time: timestamp(),
    };
    session.messages.push(userMessage);
    if (session.title === "新对话" || !session.title) {
      session.title = slugify(question, "新对话").slice(0, 32);
    }

    let answer;
    if (!results.length) {
      answer = "库里没有检索到足够相关的主题或来源，因此不能给出有依据的回答。";
    } else if (!this.hasAnyModelKey()) {
      answer = [
        "未填写可用 API Key，先返回本地检索结果：",
        "",
        ...results.map((item) => `- ${linkForFile(item.file)}: ${item.excerpt.slice(0, 220)}`),
      ].join("\n");
    } else {
      const context = results.map((item, index) => [
        `文档 ${index + 1}: ${linkForFile(item.file)}`,
        `路径: ${item.file.path}`,
        item.excerpt,
      ].join("\n")).join("\n\n---\n\n");
      const history = session.messages
        .slice(-8)
        .map((message) => `${message.role === "user" ? "用户" : "助手"}: ${message.content}`)
        .join("\n\n");
      const prompt = [
        "请以 ChatGPT 风格自然回答，但必须只根据给定 Obsidian 检索结果和本轮对话上下文。",
        "关键结论必须带 Obsidian 链接引用，例如 [[主题名]]。",
        "如果证据不足，明确说库里没有足够依据，不要编造。",
        "回答最后用简短列表给出“参考笔记”。",
        "",
        "对话上下文:",
        history,
        "",
        `当前问题: ${question}`,
        "",
        "检索结果:",
        context,
      ].join("\n");
      answer = (await this.callLlm([
        { role: "system", content: "你是严谨、简洁、有引用意识的 Obsidian 知识库对话助手。" },
        { role: "user", content: prompt },
      ], false)).trim();
    }

    const assistantMessage = {
      role: "assistant",
      content: answer,
      time: timestamp(),
      sources: results.map((item) => ({
        path: item.file.path,
        basename: item.file.basename,
        score: item.score,
      })),
    };
    session.messages.push(assistantMessage);
    session.updated = timestamp();
    this.settings.activeChatId = session.id;
    await this.saveSettings();
    return { answer, results, session };
  }

  async saveQa(question, answer, results) {
    await this.ensureFolder(this.settings.qaFolder);
    const path = normalizePath(`${this.settings.qaFolder}/${today()}.md`);
    const existing = this.app.vault.getAbstractFileByPath(path);
    const block = [
      "",
      `## ${timestamp()}`,
      "",
      "### 问题",
      "",
      question,
      "",
      "### 回答",
      "",
      answer,
      "",
      "### 检索文档",
      "",
      ...(results || []).map((item) => `- ${linkForFile(item.file)} (${item.file.path})`),
      "",
    ].join("\n");
    if (existing instanceof TFile) {
      await this.app.vault.append(existing, block);
      return existing;
    }
    const content = [
      frontmatter({ type: "qa-log", created: today(), tags: ["llm-wiki-qa"] }),
      "",
      `# QA ${today()}`,
      block,
    ].join("\n");
    return await this.app.vault.create(path, content);
  }
}

class LlmWikiParserView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.logItems = [];
    this.lastQa = null;
  }

  getViewType() {
    return VIEW_TYPE;
  }

  getDisplayText() {
    return "LLM Wiki Parser";
  }

  getIcon() {
    return "network";
  }

  async onOpen() {
    this.render();
  }

  setStatus(text) {
    if (this.statusEl) this.statusEl.setText(text);
  }

  addLog(text, file) {
    this.logItems.unshift({ text, file, time: timestamp() });
    this.logItems = this.logItems.slice(0, 10);
    this.renderLog();
  }

  async runJob(label, fn) {
    try {
      this.setStatus(`${label}中...`);
      this.setButtons(true);
      await fn();
      this.setStatus("就绪");
      new Notice(`${label}完成`);
    } catch (error) {
      console.error(error);
      this.setStatus("失败");
      new Notice(error.message || String(error), 9000);
    } finally {
      this.setButtons(false);
    }
  }

  setButtons(disabled) {
    this.containerEl.querySelectorAll("button").forEach((button) => {
      if (disabled) button.setAttribute("disabled", "true");
      else button.removeAttribute("disabled");
    });
  }

  render() {
    const root = this.containerEl.children[1];
    root.empty();
    root.addClass("llm-wiki-parser");

    const header = root.createDiv({ cls: "llm-wiki-parser__header" });
    const titleWrap = header.createDiv();
    titleWrap.createEl("h2", { cls: "llm-wiki-parser__title", text: "LLM Wiki Parser" });
    titleWrap.createDiv({ cls: "llm-wiki-parser__subtitle", text: "消化材料、归类主题、检索问答" });
    this.statusEl = header.createDiv({ cls: "llm-wiki-parser__status-badge", text: "就绪" });

    const meta = root.createDiv({ cls: "llm-wiki-parser__meta-grid" });
    const primaryProvider = this.plugin.settings.provider === "xiaomi" ? "xiaomi" : "deepseek";
    const fallbackProvider = primaryProvider === "deepseek" ? "xiaomi" : "deepseek";
    const primaryModel = primaryProvider === "xiaomi"
      ? this.plugin.settings.xiaomiModel || DEFAULT_SETTINGS.xiaomiModel
      : this.plugin.settings.model || DEFAULT_SETTINGS.model;
    const fallbackReady = fallbackProvider === "xiaomi" ? this.plugin.settings.xiaomiApiKey : this.plugin.settings.apiKey;
    const fallbackModel = fallbackProvider === "xiaomi"
      ? this.plugin.settings.xiaomiModel || DEFAULT_SETTINGS.xiaomiModel
      : this.plugin.settings.model || DEFAULT_SETTINGS.model;
    this.createMetric(meta, "主模型", `${providerDisplayName(primaryProvider)} / ${primaryModel}`);
    this.createMetric(meta, "备用", fallbackReady ? `${providerDisplayName(fallbackProvider)} / ${fallbackModel}` : "未配置");
    this.createMetric(meta, "入库", `${this.plugin.settings.knowledgeFolder} + ${this.plugin.settings.sourceFolder}`);
    this.createMetric(meta, "格式", SUPPORTED_FILE_LABELS.join(" · "));

    this.renderDigestSection(root);
    this.renderQaSection(root);

    this.logEl = root.createDiv({ cls: "llm-wiki-parser__log" });
    this.renderLog();
  }

  renderDigestSection(root) {
    const section = root.createDiv({ cls: "llm-wiki-parser__section" });
    const sectionHeader = section.createDiv({ cls: "llm-wiki-parser__section-header" });
    sectionHeader.createEl("h3", { text: "消化材料" });
    sectionHeader.createDiv({ cls: "llm-wiki-parser__section-note", text: "保留来源档案，并合并到分类主题笔记" });

    const dropzone = section.createDiv({ cls: "llm-wiki-parser__dropzone" });
    dropzone.createDiv({ cls: "llm-wiki-parser__drop-icon", text: "↓" });
    dropzone.createDiv({ cls: "llm-wiki-parser__drop-title", text: "拖入文件或粘贴材料" });
    dropzone.createDiv({ cls: "llm-wiki-parser__drop-help", text: "支持 docx / md / txt / html / csv / json / yaml / xml；链接会自动抓取正文。" });
    const chips = dropzone.createDiv({ cls: "llm-wiki-parser__chips" });
    SUPPORTED_FILE_LABELS.forEach((label) => chips.createSpan({ cls: "llm-wiki-parser__chip", text: label }));

    dropzone.ondragover = (event) => {
      event.preventDefault();
      dropzone.addClass("is-dragging");
    };
    dropzone.ondragleave = () => dropzone.removeClass("is-dragging");
    dropzone.ondrop = async (event) => {
      event.preventDefault();
      dropzone.removeClass("is-dragging");
      const data = event.dataTransfer;
      await this.runJob("消化拖拽内容", async () => {
        const files = Array.from(data.files || []);
        if (files.length) {
          for (const file of files) {
            const result = await this.plugin.digestFile(file);
            this.addLog(`消化文件 ${file.name}`, result.topicFile);
          }
          return;
        }
        const uri = data.getData("text/uri-list");
        const text = data.getData("text/plain") || uri;
        if (!text) throw new Error("没有识别到可消化内容。");
        const result = await this.plugin.digestText(uri || "Dropped Text", text, uri ? "link" : "drop", uri || "drop");
        this.addLog("消化拖拽文本", result.topicFile);
      });
    };

    this.digestInput = section.createEl("textarea", {
      cls: "llm-wiki-parser__textarea",
      attr: { placeholder: "把文章、笔记、链接粘贴到这里，然后点“消化并入库”。" },
    });

    const controls = section.createDiv({ cls: "llm-wiki-parser__controls" });
    controls.createEl("button", { cls: "mod-cta", text: "消化并入库" }).onclick = () => this.digestTextarea();
    controls.createEl("button", { text: "读取剪贴板" }).onclick = () => this.digestClipboard();
    controls.createEl("button", { text: "清空输入" }).onclick = () => {
      this.digestInput.value = "";
    };
  }

  renderQaSection(root) {
    const section = root.createDiv({ cls: "llm-wiki-parser__section" });
    const sectionHeader = section.createDiv({ cls: "llm-wiki-parser__section-header" });
    sectionHeader.createEl("h3", { text: "知识库对话" });
    sectionHeader.createDiv({ cls: "llm-wiki-parser__section-note", text: "独立 Chat 页面，带历史会话和引用文档" });
    section.createDiv({
      cls: "llm-wiki-parser__empty",
      text: "对话页面已经独立出来，可以像 ChatGPT 一样连续提问，并保留历史。",
    });
    const controls = section.createDiv({ cls: "llm-wiki-parser__controls" });
    controls.createEl("button", { cls: "mod-cta", text: "打开对话页" }).onclick = () => this.plugin.activateChatView();
  }

  createMetric(parent, label, value) {
    const item = parent.createDiv({ cls: "llm-wiki-parser__metric" });
    item.createDiv({ cls: "llm-wiki-parser__metric-label", text: label });
    item.createDiv({ cls: "llm-wiki-parser__metric-value", text: value });
    return item;
  }

  async digestTextarea() {
    const text = this.digestInput.value.trim();
    if (!text) {
      new Notice("先粘贴一段材料。");
      return;
    }
    await this.runJob("消化材料", async () => {
      const result = await this.plugin.digestText("Pasted Text", text, "paste", "parser-ui");
      this.digestInput.value = "";
      this.addLog(`入库到 ${result.digest.category}/${result.digest.topic}`, result.topicFile);
    });
  }

  async digestClipboard() {
    await this.runJob("读取剪贴板并消化", async () => {
      const text = await navigator.clipboard.readText();
      this.digestInput.value = text;
      const result = await this.plugin.digestText("Clipboard", text, "clipboard", "clipboard");
      this.addLog("剪贴板已入库", result.topicFile);
    });
  }

  async answerQuestion() {
    const question = this.questionInput.value.trim();
    if (!question) {
      new Notice("先输入一个问题。");
      return;
    }
    await this.runJob("检索问答", async () => {
      const qa = await this.plugin.answerQuestion(question);
      this.lastQa = { question, ...qa };
      this.answerEl.empty();
      this.answerEl.createEl("h4", { text: "回答" });
      this.answerEl.createEl("div", { text: qa.answer });
      this.answerEl.createEl("h4", { text: "检索文档" });
      const list = this.answerEl.createEl("ul");
      qa.results.forEach((item) => {
        const li = list.createEl("li");
        const link = li.createEl("a", { text: item.file.path });
        link.onclick = async () => this.app.workspace.getLeaf(false).openFile(item.file);
      });
    });
  }

  async saveLastQa() {
    if (!this.lastQa) {
      new Notice("还没有可保存的问答。");
      return;
    }
    await this.runJob("保存问答", async () => {
      const file = await this.plugin.saveQa(this.lastQa.question, this.lastQa.answer, this.lastQa.results);
      this.addLog("问答已保存", file);
    });
  }

  renderLog() {
    if (!this.logEl) return;
    this.logEl.empty();
    this.logEl.createDiv({ cls: "llm-wiki-parser__pill", text: "最近操作" });
    for (const item of this.logItems) {
      const row = this.logEl.createDiv({ cls: "llm-wiki-parser__log-item" });
      row.createDiv({ text: `${item.time} · ${item.text}` });
      if (item.file) {
        const link = row.createEl("a", { text: item.file.path });
        link.onclick = async () => this.app.workspace.getLeaf(false).openFile(item.file);
      }
    }
  }
}

class LlmWikiChatView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.isSending = false;
  }

  getViewType() {
    return CHAT_VIEW_TYPE;
  }

  getDisplayText() {
    return "LLM Wiki Chat";
  }

  getIcon() {
    return "message-square";
  }

  async onOpen() {
    await this.render();
  }

  async render() {
    this.session = await this.plugin.getActiveChatSession();
    const root = this.containerEl.children[1];
    root.empty();
    root.addClass("llm-wiki-chat");

    this.sidebarEl = root.createDiv({ cls: "llm-wiki-chat__sidebar" });
    this.mainEl = root.createDiv({ cls: "llm-wiki-chat__main" });
    this.renderSidebar();
    this.renderMain();
  }

  renderSidebar() {
    this.sidebarEl.empty();
    const header = this.sidebarEl.createDiv({ cls: "llm-wiki-chat__sidebar-header" });
    header.createEl("div", { cls: "llm-wiki-chat__brand", text: "Conversations" });
    header.createEl("button", { text: "新对话" }).onclick = async () => {
      await this.plugin.createChatSession();
      await this.render();
    };

    const list = this.sidebarEl.createDiv({ cls: "llm-wiki-chat__session-list" });
    const sessions = this.plugin.getChatSessions();
    for (const session of sessions) {
      const item = list.createDiv({
        cls: `llm-wiki-chat__session ${session.id === this.plugin.settings.activeChatId ? "is-active" : ""}`,
      });
      const title = item.createDiv({ cls: "llm-wiki-chat__session-title", text: session.title || "新对话" });
      title.onclick = async () => {
        await this.plugin.setActiveChatSession(session.id);
        await this.render();
      };
      item.createDiv({ cls: "llm-wiki-chat__session-time", text: session.updated || session.created || "" });
    }
  }

  renderMain() {
    this.mainEl.empty();
    const top = this.mainEl.createDiv({ cls: "llm-wiki-chat__topbar" });
    const titleWrap = top.createDiv();
    titleWrap.createEl("h2", { text: this.session.title || "新对话" });
    titleWrap.createDiv({ cls: "llm-wiki-chat__subtle", text: "检索 Knowledge + Sources，并保留对话历史" });
    const actions = top.createDiv({ cls: "llm-wiki-chat__actions" });
    actions.createEl("button", { text: "清空本对话" }).onclick = async () => {
      await this.plugin.clearChatSession(this.session.id);
      await this.render();
    };
    actions.createEl("button", { text: "删除" }).onclick = async () => {
      await this.plugin.deleteChatSession(this.session.id);
      await this.render();
    };

    this.messagesEl = this.mainEl.createDiv({ cls: "llm-wiki-chat__messages" });
    this.renderMessages();

    const composer = this.mainEl.createDiv({ cls: "llm-wiki-chat__composer" });
    this.inputEl = composer.createEl("textarea", {
      cls: "llm-wiki-chat__input",
      attr: { placeholder: "问你的知识库一个问题..." },
    });
    this.inputEl.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        this.sendMessage();
      }
    });
    const send = composer.createEl("button", { cls: "mod-cta llm-wiki-chat__send", text: "发送" });
    send.onclick = () => this.sendMessage();
  }

  renderMessages() {
    this.messagesEl.empty();
    const messages = this.session.messages || [];
    if (!messages.length) {
      const empty = this.messagesEl.createDiv({ cls: "llm-wiki-chat__welcome" });
      empty.createEl("h3", { text: "开始一次知识库对话" });
      empty.createDiv({ text: "我会先检索你的 Knowledge 和 Sources，再基于引用回答。" });
      return;
    }
    for (const message of messages) {
      const row = this.messagesEl.createDiv({ cls: `llm-wiki-chat__message-row is-${message.role}` });
      const bubble = row.createDiv({ cls: "llm-wiki-chat__bubble" });
      bubble.createDiv({ cls: "llm-wiki-chat__message-meta", text: `${message.role === "user" ? "你" : "LLM Wiki"} · ${message.time || ""}` });
      bubble.createDiv({ cls: "llm-wiki-chat__message-content", text: message.content || "" });
      if (message.sources?.length) {
        const sources = bubble.createDiv({ cls: "llm-wiki-chat__sources" });
        sources.createDiv({ cls: "llm-wiki-chat__sources-title", text: "引用文档" });
        for (const source of message.sources.slice(0, 6)) {
          const link = sources.createEl("a", { text: source.path });
          link.onclick = async () => {
            const file = this.app.vault.getAbstractFileByPath(source.path);
            if (file instanceof TFile) await this.app.workspace.getLeaf(false).openFile(file);
          };
        }
      }
    }
    window.setTimeout(() => {
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }, 20);
  }

  async sendMessage() {
    if (this.isSending) return;
    const question = this.inputEl.value.trim();
    if (!question) {
      new Notice("先输入问题。");
      return;
    }
    this.inputEl.value = "";
    this.isSending = true;
    this.session.messages.push({ role: "user", content: question, time: timestamp() });
    this.session.messages.push({ role: "assistant", content: "正在检索知识库...", time: timestamp(), pending: true });
    this.renderMessages();
    this.session.messages.pop();
    this.session.messages.pop();
    try {
      await this.plugin.answerChatQuestion(this.session, question);
      await this.render();
    } catch (error) {
      console.error(error);
      this.session.messages.push({ role: "user", content: question, time: timestamp() });
      this.session.messages.push({ role: "assistant", content: error.message || String(error), time: timestamp() });
      await this.plugin.saveSettings();
      this.renderMessages();
      new Notice(error.message || String(error), 8000);
    } finally {
      this.isSending = false;
    }
  }
}

class LlmWikiParserSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "LLM Wiki Parser" });

    new Setting(containerEl)
      .setName("Primary provider")
      .setDesc("选择默认调用的模型。另一个模型在开启 fallback 后可作为备用。")
      .addDropdown((dropdown) => dropdown
        .addOption("deepseek", "DeepSeek")
        .addOption("xiaomi", "Xiaomi MiMo")
        .setValue(this.plugin.settings.provider || DEFAULT_SETTINGS.provider)
        .onChange(async (value) => {
          this.plugin.settings.provider = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("DeepSeek API Key")
      .setDesc("保存在当前 vault 的插件数据中。")
      .addText((text) => {
        text.inputEl.type = "password";
        text.setPlaceholder("sk-...")
          .setValue(this.plugin.settings.apiKey)
          .onChange(async (value) => {
            this.plugin.settings.apiKey = value.trim();
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Use Xiaomi fallback")
      .setDesc("DeepSeek 报错、限流或额度不足时，自动改用 Xiaomi MiMo。")
      .addToggle((toggle) => toggle.setValue(this.plugin.settings.useXiaomiFallback).onChange(async (value) => {
        this.plugin.settings.useXiaomiFallback = value;
        await this.plugin.saveSettings();
      }));

    new Setting(containerEl)
      .setName("Xiaomi MiMo API Key")
      .setDesc("小米 MiMo 备用密钥。会同时发送 Authorization Bearer 和 api-key 请求头。")
      .addText((text) => {
        text.inputEl.type = "password";
        text.setPlaceholder("mimo / sk-...")
          .setValue(this.plugin.settings.xiaomiApiKey || "")
          .onChange(async (value) => {
            this.plugin.settings.xiaomiApiKey = value.trim();
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Xiaomi MiMo model")
      .setDesc("默认使用 mimo-v2.5-pro；也可改成 mimo-v2.5、mimo-v2-pro 等可用模型。")
      .addText((text) => text.setValue(this.plugin.settings.xiaomiModel || DEFAULT_SETTINGS.xiaomiModel).onChange(async (value) => {
        this.plugin.settings.xiaomiModel = value.trim() || DEFAULT_SETTINGS.xiaomiModel;
        await this.plugin.saveSettings();
      }));

    new Setting(containerEl)
      .setName("Xiaomi MiMo endpoint")
      .addText((text) => text.setValue(this.plugin.settings.xiaomiEndpoint || DEFAULT_SETTINGS.xiaomiEndpoint).onChange(async (value) => {
        this.plugin.settings.xiaomiEndpoint = value.trim() || DEFAULT_SETTINGS.xiaomiEndpoint;
        await this.plugin.saveSettings();
      }));

    new Setting(containerEl)
      .setName("Test providers")
      .setDesc("发送一次极短测试请求，确认密钥、endpoint 和模型名可用。")
      .addButton((button) => button
        .setButtonText("测试 DeepSeek")
        .onClick(async () => {
          button.setDisabled(true);
          try {
            await this.plugin.testProvider("deepseek");
            new Notice("DeepSeek 测试通过。");
          } catch (error) {
            new Notice(`DeepSeek 测试失败：${error.message || error}`, 9000);
          } finally {
            button.setDisabled(false);
          }
        }))
      .addButton((button) => button
        .setButtonText("测试 Xiaomi")
        .onClick(async () => {
          button.setDisabled(true);
          try {
            await this.plugin.testProvider("xiaomi");
            new Notice("Xiaomi MiMo 测试通过。");
          } catch (error) {
            new Notice(`Xiaomi MiMo 测试失败：${error.message || error}`, 9000);
          } finally {
            button.setDisabled(false);
          }
        }));

    new Setting(containerEl)
      .setName("Model")
      .addText((text) => text.setValue(this.plugin.settings.model).onChange(async (value) => {
        this.plugin.settings.model = value.trim() || DEFAULT_SETTINGS.model;
        await this.plugin.saveSettings();
      }));

    new Setting(containerEl)
      .setName("Endpoint")
      .addText((text) => text.setValue(this.plugin.settings.endpoint).onChange(async (value) => {
        this.plugin.settings.endpoint = value.trim() || DEFAULT_SETTINGS.endpoint;
        await this.plugin.saveSettings();
      }));

    new Setting(containerEl)
      .setName("Knowledge folder")
      .addText((text) => text.setValue(this.plugin.settings.knowledgeFolder).onChange(async (value) => {
        this.plugin.settings.knowledgeFolder = value.trim() || DEFAULT_SETTINGS.knowledgeFolder;
        await this.plugin.saveSettings();
      }));

    new Setting(containerEl)
      .setName("Source folder")
      .addText((text) => text.setValue(this.plugin.settings.sourceFolder).onChange(async (value) => {
        this.plugin.settings.sourceFolder = value.trim() || DEFAULT_SETTINGS.sourceFolder;
        await this.plugin.saveSettings();
      }));

    new Setting(containerEl)
      .setName("QA folder")
      .addText((text) => text.setValue(this.plugin.settings.qaFolder).onChange(async (value) => {
        this.plugin.settings.qaFolder = value.trim() || DEFAULT_SETTINGS.qaFolder;
        await this.plugin.saveSettings();
      }));

    new Setting(containerEl)
      .setName("Fetch links")
      .setDesc("解析输入中的 URL，并把网页正文一起消化。")
      .addToggle((toggle) => toggle.setValue(this.plugin.settings.fetchLinks).onChange(async (value) => {
        this.plugin.settings.fetchLinks = value;
        await this.plugin.saveSettings();
      }));

    new Setting(containerEl)
      .setName("Max input characters")
      .addText((text) => text.setValue(String(this.plugin.settings.maxInputChars)).onChange(async (value) => {
        const parsed = Number(value);
        this.plugin.settings.maxInputChars = Number.isFinite(parsed) && parsed > 1000 ? parsed : DEFAULT_SETTINGS.maxInputChars;
        await this.plugin.saveSettings();
      }));

    new Setting(containerEl)
      .setName("Max search results")
      .addText((text) => text.setValue(String(this.plugin.settings.maxSearchResults)).onChange(async (value) => {
        const parsed = Number(value);
        this.plugin.settings.maxSearchResults = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SETTINGS.maxSearchResults;
        await this.plugin.saveSettings();
      }));
  }
}

module.exports = LlmWikiParserPlugin;
