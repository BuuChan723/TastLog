const editor = document.querySelector("#editor");
const preview = document.querySelector("#preview");
const charCount = document.querySelector("#charCount");
const lineCount = document.querySelector("#lineCount");
const selectionInfo = document.querySelector("#selectionInfo");
const previewState = document.querySelector("#previewState");
const checkBadge = document.querySelector("#checkBadge");
const checkList = document.querySelector("#checkList");

const actions = {
  heading1: {
    template: "# 見出しを入力",
    transform: (text) => prefixLines(text, "# ", stripBlockPrefix),
  },
  heading2: {
    template: "## 見出しを入力",
    transform: (text) => prefixLines(text, "## ", stripBlockPrefix),
  },
  heading3: {
    template: "### 見出しを入力",
    transform: (text) => prefixLines(text, "### ", stripBlockPrefix),
  },
  heading4: {
    template: "#### 見出しを入力",
    transform: (text) => prefixLines(text, "#### ", stripBlockPrefix),
  },
  heading5: {
    template: "##### 見出しを入力",
    transform: (text) => prefixLines(text, "##### ", stripBlockPrefix),
  },
  heading6: {
    template: "###### 見出しを入力",
    transform: (text) => prefixLines(text, "###### ", stripBlockPrefix),
  },
  bullet: {
    template: "- 項目を入力",
    transform: (text) => prefixLines(text, "- ", stripListPrefix),
  },
  numbered: {
    template: "1. 手順を入力",
    transform: (text) => numberLines(text),
  },
  checklist: {
    template: "- [ ] チェック項目を入力",
    transform: (text) => prefixLines(text, "- [ ] ", stripListPrefix),
  },
  bold: {
    template: "**強調したい文字**",
    transform: (text) => wrapText(text, "**", "**"),
  },
  italic: {
    template: "*斜体にしたい文字*",
    transform: (text) => wrapText(text, "*", "*"),
  },
  boldItalic: {
    template: "***強く斜体にしたい文字***",
    transform: (text) => wrapText(text, "***", "***"),
  },
  strike: {
    template: "~~取り消したい文字~~",
    transform: (text) => wrapText(text, "~~", "~~"),
  },
  inlineCode: {
    template: "`コード`",
    transform: (text) => wrapText(text, "`", "`"),
  },
  quote: {
    template: "> 引用文を入力",
    transform: (text) => prefixLines(text, "> ", (line) => line.replace(/^\s*>\s?/, "")),
  },
  code: {
    template: "```text\nコードを入力\n```",
    transform: (text) => `\`\`\`text\n${trimOuterLineBreaks(text)}\n\`\`\``,
  },
  link: {
    template: "[リンク文字](https://example.com)",
    transform: (text) => `[${trimOuterLineBreaks(text) || "リンク文字"}](https://example.com)`,
  },
  image: {
    template: "![画像の説明](https://example.com/image.png)",
    transform: (text) => `![${trimOuterLineBreaks(text) || "画像の説明"}](https://example.com/image.png)`,
  },
  table: {
    template: "| 項目 | 内容 |\n| --- | --- |\n| 例 | 説明 |",
    transform: (text) => selectedTextToTable(text),
  },
  footnote: {
    template: "本文に脚注を入れます[^1]\n\n[^1]: 脚注の説明を入力",
    transform: (text) => `${trimOuterLineBreaks(text) || "本文"}[^1]\n\n[^1]: 脚注の説明を入力`,
  },
  rule: {
    template: "\n---\n",
    transform: () => "\n---\n",
  },
  htmlBlock: {
    template: "<div>\n内容を入力\n</div>",
    transform: (text) => `<div>\n${trimOuterLineBreaks(text) || "内容を入力"}\n</div>`,
  },
  lineBreak: {
    template: "  \n",
    transform: (text) => addHardBreaks(text),
  },
};

document.querySelectorAll(".toolbar button").forEach((button) => {
  button.addEventListener("click", () => {
    applyAction(button.dataset.action);
    const menu = button.closest("details");
    if (menu) menu.open = false;
  });
});

document.querySelectorAll(".tool-menu").forEach((menu) => {
  menu.addEventListener("toggle", () => {
    if (!menu.open) return;
    document.querySelectorAll(".tool-menu[open]").forEach((otherMenu) => {
      if (otherMenu !== menu) otherMenu.open = false;
    });
  });
});

document.addEventListener("click", (event) => {
  if (event.target.closest(".tool-menu")) return;
  document.querySelectorAll(".tool-menu[open]").forEach((menu) => {
    menu.open = false;
  });
});

document.querySelector("#saveBtn").addEventListener("click", saveMarkdown);
document.querySelector("#tidyBtn").addEventListener("click", tidyMarkdown);

editor.addEventListener("input", () => updateAll());
editor.addEventListener("select", updateSelectionInfo);
editor.addEventListener("keyup", updateSelectionInfo);
editor.addEventListener("mouseup", updateSelectionInfo);

window.addEventListener("beforeunload", () => {
  localStorage.setItem("friendlyMarkdownDraft", editor.value);
});

const savedDraft = localStorage.getItem("friendlyMarkdownDraft");
if (savedDraft !== null) {
  editor.value = savedDraft;
}

updateAll();

function applyAction(actionName) {
  const action = actions[actionName];
  if (!action) return;

  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  const selected = editor.value.slice(start, end);
  const replacement = selected ? action.transform(selected) : action.template;

  replaceEditorRange(start, end, replacement);
  editor.focus();
  editor.setSelectionRange(start, start + replacement.length);
  updateAll(`「${getButtonLabel(actionName)}」を適用しました`);
}

function replaceEditorRange(start, end, replacement) {
  const before = editor.value.slice(0, start);
  const after = editor.value.slice(end);
  editor.value = before + replacement + after;
}

function wrapText(text, before, after) {
  return `${before}${trimOuterLineBreaks(text)}${after}`;
}

function prefixLines(text, prefix, cleaner = (line) => line) {
  return text
    .split("\n")
    .map((line) => {
      if (line.trim() === "") return line;
      return prefix + cleaner(line).trimStart();
    })
    .join("\n");
}

function numberLines(text) {
  let count = 1;
  return text
    .split("\n")
    .map((line) => {
      if (line.trim() === "") return line;
      const cleanLine = stripListPrefix(line).trimStart();
      return `${count++}. ${cleanLine}`;
    })
    .join("\n");
}

function stripBlockPrefix(line) {
  return line
    .replace(/^\s{0,3}#{1,6}\s+/, "")
    .replace(/^\s*>\s?/, "");
}

function stripListPrefix(line) {
  return line
    .replace(/^\s*-\s+\[[ xX]\]\s+/, "")
    .replace(/^\s*[-*+]\s+/, "")
    .replace(/^\s*\d+\.\s+/, "");
}

function trimOuterLineBreaks(text) {
  return text.replace(/^\n+|\n+$/g, "");
}

function addHardBreaks(text) {
  const cleanText = trimOuterLineBreaks(text);
  if (!cleanText) return actions.lineBreak.template;
  if (!cleanText.includes("\n")) return `${cleanText}  \n`;

  const lines = cleanText.split("\n");
  return lines
    .map((line, index) => (index === lines.length - 1 ? line : `${line.replace(/[ \t]+$/g, "")}  `))
    .join("\n");
}

function selectedTextToTable(text) {
  const rows = trimOuterLineBreaks(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (rows.length === 0) {
    return actions.table.template;
  }

  const body = rows.map((row) => `| ${row} |  |`).join("\n");
  return `| 項目 | 内容 |\n| --- | --- |\n${body}`;
}

function getButtonLabel(actionName) {
  const button = document.querySelector(`[data-action="${actionName}"]`);
  return button ? button.textContent.trim() : "変換";
}

function saveMarkdown() {
  const blob = new Blob([editor.value], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `markdown-${date}.md`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  updateChecks("Markdownファイルの保存を開始しました");
}

function tidyMarkdown() {
  const before = editor.value;
  let next = before.replace(/\r\n?/g, "\n");
  next = next
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n");
  next = next.replace(/\n{3,}/g, "\n\n");
  next = ensureBlankAroundBlocks(next);
  next = next.trim();
  if (next) next += "\n";

  editor.value = next;
  editor.focus();
  editor.setSelectionRange(editor.value.length, editor.value.length);

  const removed = before.length - next.length;
  const detail = removed > 0 ? `余分な空白を${removed}文字分整えました` : "整える必要はありませんでした";
  updateAll(detail);
}

function ensureBlankAroundBlocks(text) {
  const lines = text.split("\n");
  const result = [];
  let inCode = false;

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    const isFence = trimmed.startsWith("```");
    const isBlock = !inCode && (isHeading(trimmed) || isHorizontalRule(trimmed));
    const previous = result[result.length - 1];

    if (isBlock && previous && previous.trim() !== "") {
      result.push("");
    }

    result.push(line);

    if (isFence) inCode = !inCode;

    const next = lines[index + 1];
    if (isBlock && next !== undefined && next.trim() !== "") {
      result.push("");
    }
  });

  return result.join("\n").replace(/\n{3,}/g, "\n\n");
}

function updateAll(message) {
  renderPreview(editor.value);
  updateCounters();
  updateSelectionInfo();
  updateChecks(message);
  localStorage.setItem("friendlyMarkdownDraft", editor.value);
  previewState.textContent = "更新済み";
}

function updateCounters() {
  const text = editor.value;
  charCount.textContent = `${text.length}文字`;
  lineCount.textContent = `${text.split("\n").length}行`;
}

function updateSelectionInfo() {
  const selectedLength = editor.selectionEnd - editor.selectionStart;
  selectionInfo.textContent = selectedLength > 0 ? `${selectedLength}文字を選択中` : "未選択";
}

function updateChecks(message) {
  const checks = inspectMarkdown(editor.value);
  checkList.innerHTML = "";

  if (typeof message === "string" && message) {
    checkList.appendChild(createCheckItem(message, "good"));
  }

  checks.forEach((check) => {
    checkList.appendChild(createCheckItem(check.text, check.level));
  });

  if (checks.every((check) => check.level === "good")) {
    checkBadge.textContent = "良好";
    checkBadge.className = "is-good";
  } else if (checks.some((check) => check.level === "danger")) {
    checkBadge.textContent = "要確認";
    checkBadge.className = "is-danger";
  } else {
    checkBadge.textContent = "注意あり";
    checkBadge.className = "is-warning";
  }
}

function createCheckItem(text, level) {
  const item = document.createElement("li");
  item.textContent = text;
  item.className = level === "danger" ? "is-danger" : level === "warning" ? "is-warning" : "is-good";
  return item;
}

function inspectMarkdown(markdown) {
  const checks = [];

  if (markdown.trim() === "") {
    return [{ text: "本文が空です", level: "warning" }];
  }

  const fenceCount = (markdown.match(/^```/gm) || []).length;
  if (fenceCount % 2 !== 0) {
    checks.push({ text: "コードブロックの終わりが見つかりません", level: "danger" });
  }

  const brokenLinks = markdown.match(/\[[^\]]+\]\(\s*\)/g);
  if (brokenLinks) {
    checks.push({ text: "URLが空のリンクがあります", level: "warning" });
  }

  const brokenImages = markdown.match(/!\[[^\]]*\]\(\s*\)/g);
  if (brokenImages) {
    checks.push({ text: "URLが空の画像があります", level: "warning" });
  }

  const footnoteRefs = [...markdown.matchAll(/\[\^([^\]]+)\]/g)].map((match) => match[1]);
  const footnoteDefs = [...markdown.matchAll(/^\[\^([^\]]+)\]:/gm)].map((match) => match[1]);
  const missingFootnotes = footnoteRefs.filter((id) => !footnoteDefs.includes(id));
  if (missingFootnotes.length > 0) {
    checks.push({ text: "説明が未入力の脚注があります", level: "warning" });
  }

  const todoCount = (markdown.match(/- \[ \]/g) || []).length;
  if (todoCount > 0) {
    checks.push({ text: `未完了のチェック項目が${todoCount}件あります`, level: "warning" });
  }

  const tableLines = markdown.split("\n").filter((line) => /^\|.+\|$/.test(line.trim()));
  if (tableLines.length === 1) {
    checks.push({ text: "表は見出し行と区切り行をセットにすると読みやすくなります", level: "warning" });
  }

  if (checks.length === 0) {
    checks.push({ text: "大きな問題は見つかりませんでした", level: "good" });
  }

  return checks;
}

function renderPreview(markdown) {
  if (markdown.trim() === "") {
    preview.innerHTML = '<div class="empty-preview">Markdownを入力するとここに表示されます</div>';
    return;
  }

  preview.innerHTML = parseMarkdown(markdown);
}

function parseMarkdown(markdown) {
  const extracted = extractFootnotes(markdown.replace(/\r\n?/g, "\n"));
  const lines = extracted.lines;
  const html = [];
  let paragraph = [];
  let list = null;
  let blockquote = [];
  let inCode = false;
  let codeLines = [];

  const closeParagraph = () => {
    if (paragraph.length > 0) {
      html.push(`<p>${renderParagraph(paragraph)}</p>`);
      paragraph = [];
    }
  };

  const closeList = () => {
    if (!list) return;
    const tag = list.type === "ol" ? "ol" : "ul";
    const className = list.type === "task" ? ' class="task-list"' : "";
    html.push(`<${tag}${className}>${list.items.join("")}</${tag}>`);
    list = null;
  };

  const closeBlockquote = () => {
    if (blockquote.length === 0) return;
    html.push(`<blockquote>${parseMarkdown(blockquote.join("\n"))}</blockquote>`);
    blockquote = [];
  };

  const closeOpenBlocks = () => {
    closeParagraph();
    closeList();
    closeBlockquote();
  };

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      closeOpenBlocks();
      if (inCode) {
        html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        codeLines = [];
        inCode = false;
      } else {
        inCode = true;
      }
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    if (trimmed === "") {
      closeOpenBlocks();
      continue;
    }

    const table = readTableFromLineBuffer(lines, index);
    if (table) {
      closeOpenBlocks();
      html.push(table.html);
      index += table.consumed - 1;
      continue;
    }

    const setextHeading = readSetextHeading(lines, index);
    if (setextHeading) {
      closeOpenBlocks();
      html.push(`<h${setextHeading.level}>${renderInline(setextHeading.text)}</h${setextHeading.level}>`);
      index += 1;
      continue;
    }

    if (/^#{1,6}\s+/.test(trimmed)) {
      closeOpenBlocks();
      const level = Math.min(trimmed.match(/^#+/)[0].length, 6);
      const content = trimmed.replace(/^#{1,6}\s+/, "");
      html.push(`<h${level}>${renderInline(content)}</h${level}>`);
      continue;
    }

    if (isHorizontalRule(trimmed)) {
      closeOpenBlocks();
      html.push("<hr>");
      continue;
    }

    const htmlBlock = readHtmlBlock(lines, index);
    if (htmlBlock) {
      closeOpenBlocks();
      html.push(sanitizeBasicHtml(htmlBlock.source));
      index += htmlBlock.consumed - 1;
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      closeParagraph();
      closeList();
      blockquote.push(trimmed.replace(/^>\s?/, ""));
      continue;
    }

    const taskMatch = trimmed.match(/^-\s+\[([ xX])\]\s+(.*)$/);
    if (taskMatch) {
      closeParagraph();
      closeBlockquote();
      if (!list || list.type !== "task") {
        closeList();
        list = { type: "task", items: [] };
      }
      const checked = taskMatch[1].toLowerCase() === "x" ? " checked" : "";
      list.items.push(`<li><label><input type="checkbox" disabled${checked}>${renderInline(taskMatch[2])}</label></li>`);
      continue;
    }

    const bulletMatch = trimmed.match(/^[-*+]\s+(.*)$/);
    if (bulletMatch) {
      closeParagraph();
      closeBlockquote();
      if (!list || list.type !== "ul") {
        closeList();
        list = { type: "ul", items: [] };
      }
      list.items.push(`<li>${renderInline(bulletMatch[1])}</li>`);
      continue;
    }

    const orderedMatch = trimmed.match(/^\d+\.\s+(.*)$/);
    if (orderedMatch) {
      closeParagraph();
      closeBlockquote();
      if (!list || list.type !== "ol") {
        closeList();
        list = { type: "ol", items: [] };
      }
      list.items.push(`<li>${renderInline(orderedMatch[1])}</li>`);
      continue;
    }

    closeList();
    closeBlockquote();
    paragraph.push(line);
  }

  if (inCode) {
    html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
  }

  closeOpenBlocks();
  if (extracted.footnotes.length > 0) {
    html.push(renderFootnotes(extracted.footnotes));
  }
  return html.join("\n");
}

function extractFootnotes(markdown) {
  const footnotes = [];
  const lines = [];

  markdown.split("\n").forEach((line) => {
    const match = line.match(/^\[\^([^\]]+)\]:\s*(.*)$/);
    if (match) {
      footnotes.push({ id: match[1], text: match[2] });
      return;
    }
    lines.push(line);
  });

  return { lines, footnotes };
}

function renderFootnotes(footnotes) {
  const items = footnotes
    .map((footnote) => `<li id="fn-${escapeAttribute(footnote.id)}">${renderInline(footnote.text)}</li>`)
    .join("");
  return `<section class="footnotes" aria-label="脚注"><ol>${items}</ol></section>`;
}

function renderParagraph(lines) {
  let html = "";

  lines.forEach((line) => {
    const hasHardBreak = /(?: {2,}|\\)$/.test(line);
    const cleanLine = hasHardBreak ? line.replace(/(?: {2,}|\\)$/g, "") : line;

    if (html && !html.endsWith("<br>")) {
      html += " ";
    }

    html += renderInline(cleanLine);

    if (hasHardBreak) {
      html += "<br>";
    }
  });

  return html;
}

function readSetextHeading(lines, start) {
  const current = lines[start];
  const next = lines[start + 1];
  if (!current || !next || current.trim() === "") return null;
  if (isTableRow(current) || /^[-*+]\s+/.test(current.trim()) || /^\d+\.\s+/.test(current.trim())) return null;

  const marker = next.trim();
  if (/^={2,}$/.test(marker)) {
    return { level: 1, text: current.trim() };
  }
  if (/^-{2,}$/.test(marker)) {
    return { level: 2, text: current.trim() };
  }
  return null;
}

function isHorizontalRule(line) {
  return /^(?:-{3,}|\*{3,}|_{3,})$/.test(line.replace(/\s+/g, ""));
}

function readHtmlBlock(lines, start) {
  const first = lines[start].trim();
  const tagMatch = first.match(/^<([a-z][a-z0-9-]*)(?:\s[^>]*)?>$/i);
  const singleLine = first.match(/^<([a-z][a-z0-9-]*)(?:\s[^>]*)?\/?>.*<\/\1>$/i) || first.match(/^<(br|hr)(?:\s[^>]*)?\/?>$/i);
  const allowedBlockTags = ["div", "section", "article", "aside", "details", "summary", "p"];

  if (singleLine) {
    return { source: first, consumed: 1 };
  }

  if (!tagMatch || !allowedBlockTags.includes(tagMatch[1].toLowerCase())) {
    return null;
  }

  const tagName = tagMatch[1].toLowerCase();
  const source = [lines[start]];
  for (let index = start + 1; index < lines.length; index++) {
    source.push(lines[index]);
    if (new RegExp(`</${tagName}>`, "i").test(lines[index])) {
      return { source: source.join("\n"), consumed: source.length };
    }
  }

  return null;
}

function readTableFromLineBuffer(lines, start) {
  const header = lines[start];
  const separator = lines[start + 1];
  if (!isTableRow(header) || !separator || !isTableSeparator(separator)) {
    return null;
  }

  const rows = [header, separator];
  for (let index = start + 2; index < lines.length; index++) {
    if (!isTableRow(lines[index])) break;
    rows.push(lines[index]);
  }

  const headers = splitTableRow(rows[0]);
  const bodyRows = rows.slice(2).map(splitTableRow);
  const headHtml = headers.map((cell) => `<th>${renderInline(cell)}</th>`).join("");
  const bodyHtml = bodyRows
    .map((cells) => `<tr>${cells.map((cell) => `<td>${renderInline(cell)}</td>`).join("")}</tr>`)
    .join("");

  return {
    html: `<table><thead><tr>${headHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`,
    consumed: rows.length,
  };
}

function isTableRow(line) {
  return typeof line === "string" && /^\|.+\|$/.test(line.trim());
}

function isTableSeparator(line) {
  return /^\|\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line.trim());
}

function splitTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function renderInline(text) {
  const placeholders = [];
  let output = escapeHtml(text);

  output = output.replace(/`([^`]+)`/g, (_, code) => {
    const token = `@@CODE${placeholders.length}@@`;
    placeholders.push(`<code>${code}</code>`);
    return token;
  });

  output = output.replace(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+|data:image\/[^)\s]+|[^)\s]+\.(?:png|jpe?g|gif|webp|svg))\)/gi, '<img src="$2" alt="$1">');
  output = output.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|mailto:[^)\s]+|#[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  output = output.replace(/&lt;(https?:\/\/[^&\s]+)&gt;/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  output = output.replace(/\[\^([^\]]+)\]/g, '<sup><a href="#fn-$1">[$1]</a></sup>');
  output = output.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  output = output.replace(/\*\*\*([^*]+)\*\*\*/g, "<strong><em>$1</em></strong>");
  output = output.replace(/___([^_]+)___/g, "<strong><em>$1</em></strong>");
  output = output.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  output = output.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  output = output.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
  output = output.replace(/(^|[^_])_([^_\n]+)_(?!_)/g, "$1<em>$2</em>");

  placeholders.forEach((value, index) => {
    output = output.replace(`@@CODE${index}@@`, value);
  });

  return output;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
  return String(value).replace(/[^\w-]/g, "-");
}

function sanitizeBasicHtml(source) {
  const allowedTags = new Set([
    "a",
    "abbr",
    "article",
    "aside",
    "b",
    "br",
    "code",
    "details",
    "div",
    "em",
    "kbd",
    "mark",
    "p",
    "section",
    "small",
    "span",
    "strong",
    "sub",
    "summary",
    "sup",
    "u",
  ]);

  return source
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<\/?([a-z][a-z0-9-]*)([^>]*)>/gi, (match, tagName, attrs) => {
      const tag = tagName.toLowerCase();
      if (!allowedTags.has(tag)) return escapeHtml(match);
      const safeAttrs = sanitizeHtmlAttributes(attrs, tag);
      return match.startsWith("</") ? `</${tag}>` : `<${tag}${safeAttrs}>`;
    });
}

function sanitizeHtmlAttributes(attrs, tagName) {
  if (!attrs || tagName !== "a") return "";
  const hrefMatch = attrs.match(/\shref=(["'])(.*?)\1/i);
  if (!hrefMatch) return "";

  const href = hrefMatch[2].trim();
  if (!/^(https?:\/\/|mailto:|#)/i.test(href)) return "";
  return ` href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer"`;
}

function isHeading(line) {
  return /^#{1,6}\s+/.test(line);
}
