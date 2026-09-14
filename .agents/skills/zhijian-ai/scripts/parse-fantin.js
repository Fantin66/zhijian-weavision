#!/usr/bin/env node
/**
 * parse-fantin.js — 解析 .fantin 导出文件中的 data.json，输出 AI 友好的关系网络文本。
 *
 * 用法：
 *   node parse-fantin.js <data.json路径> [--dir <解压根目录>]
 *
 *   --dir  给出解压根目录时，额外校验 attachments/ 与 fileMeta 是否一一对应
 *
 * 输出六部分：
 *   1) 项目信息   2) 层级树（骨架）   3) 附件↔节点反向索引（定章节用）
 *   4) 语义连线   5) 批注/便签       6) 附件清单 + 数据自检告警
 *
 * 设计要点：
 *   - 三种关系系统全部体现：parentId 树 / links 语义线 / fileId 附件挂接
 *   - 附件卡片通常 parentId 为空（浮在根层），因此必须用 links 反向索引把它们归到章节
 *   - 类型标注用 kind || mime || 扩展名 三级兜底（实测存在无 kind、无扩展名的附件）
 *   - 所有名称取值经 String() 归一，避免端点缺失时对数字调 .slice() 抛错
 */

const fs = require("fs");
const path = require("path");

const argv = process.argv.slice(2);
const dataPath = argv.find((a) => !a.startsWith("--"));
const dirIdx = argv.indexOf("--dir");
const baseDir = dirIdx >= 0 ? argv[dirIdx + 1] : null;

if (!dataPath) {
  console.error("用法：node parse-fantin.js <data.json路径> [--dir <解压根目录>]");
  process.exit(1);
}

const d = JSON.parse(fs.readFileSync(dataPath, "utf8"));
const fileMeta = d.fileMeta || [];
const canvases = d.canvases || [];

const warnings = [];
const warn = (msg) => warnings.push(msg);

// ---------- 工具 ----------
const s = (v) => (v === null || v === undefined ? "" : String(v));
const clip = (v, n) => {
  const t = s(v).replace(/\s*\n\s*/g, " / ");
  return t.length > n ? t.slice(0, n) + "…" : t;
};
const fmById = (oldId) => fileMeta.find((f) => f.oldId === oldId);

/** 附件类型简写：kind → mime → 扩展名，三级兜底 */
function kindOf(f) {
  if (!f) return "未知";
  if (f.kind) return f.kind;
  if (f.mime) {
    const m = f.mime;
    if (m.includes("markdown")) return "text";
    if (m.startsWith("text/")) return "text";
    if (m.startsWith("image/")) return "img";
    if (m.includes("pdf")) return "doc";
    if (m.includes("word") || m.includes("officedocument.wordprocessing")) return "doc";
    if (m.includes("sheet") || m.includes("excel") || m.includes("csv")) return "sheet";
    if (m.includes("presentation") || m.includes("powerpoint")) return "slide";
    return m;
  }
  const ext = path.extname(f.name || "").toLowerCase();
  if ([".md", ".txt", ".json"].includes(ext)) return "text";
  if ([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"].includes(ext)) return "img";
  if ([".docx", ".doc", ".pdf"].includes(ext)) return "doc";
  if ([".xlsx", ".xls", ".csv"].includes(ext)) return "sheet";
  if ([".pptx", ".ppt"].includes(ext)) return "slide";
  return "unknown（无 kind / 无扩展名）";
}

/** item id → 可读名称 */
function buildNameMap(items) {
  const map = {};
  for (const it of items) {
    if (it.type === "fileCard" && it.fileId !== undefined) {
      const f = fmById(it.fileId);
      map[it.id] = "[附件] " + (f ? f.name : "未知文件(" + s(it.fileId) + ")");
      if (!f) warn(`fileCard id=${it.id} 的 fileId=${s(it.fileId)} 在 fileMeta 中不存在`);
    } else if (it.type === "note") {
      map[it.id] = "[便签] " + clip(it.text, 40);
    } else {
      map[it.id] = s(it.text) || "(空)";
    }
  }
  return map;
}

const TYPE_LABEL = { mindNode: "节点", fileCard: "附件卡片", note: "便签" };

// ---------- 头部 ----------
const ts = d.exportedAt ? new Date(Number(d.exportedAt)).toISOString() : "(无)";
console.log("=== 项目信息 ===");
console.log("项目名：" + s(d.projectName || "(未命名)"));
console.log("格式版本：" + s(d.version) + "　导出类型：" + s(d.type));
console.log("导出时间：" + ts);
console.log("画布数：" + canvases.length + "　附件数：" + fileMeta.length);
console.log("");

// ---------- 逐画布 ----------
for (const c of canvases) {
  const items = c.items || [];
  const links = c.links || [];
  const byId = {};
  items.forEach((i) => (byId[i.id] = i));
  const nameMap = buildNameMap(items);

  console.log("=== 画布：" + s(c.name) + " ===");
  const types = {};
  items.forEach((i) => (types[i.type] = (types[i.type] || 0) + 1));
  const typeStr = Object.entries(types)
    .map(([k, v]) => (TYPE_LABEL[k] || k) + "×" + v)
    .join("　");
  console.log("元素数：" + items.length + "　连线数：" + links.length + "　组成：" + typeStr);
  console.log("");

  // --- 1. 层级树（骨架） ---
  console.log("--- 1. 层级结构（parentId 树，报告章节骨架） ---");
  const roots = items.filter((i) => !i.parentId || !byId[i.parentId]);
  const printTree = (item, depth) => {
    let line = "  ".repeat(depth) + (nameMap[item.id] || "(空)");
    line += "　[" + (TYPE_LABEL[item.type] || item.type) + " #" + s(item.id) + "]";
    if (item.annotation) line += " //批注：" + clip(item.annotation, 80);
    if (item.detail) line += " [展开内容 " + s(item.detail).length + " 字]";
    if (item.jumpTo) line += " [跃迁→画布" + s(item.jumpTo.canvasId) + "]";
    if (item.collapsed) line += " [折叠]";
    console.log(line);
    items.filter((i) => i.parentId === item.id).forEach((ch) => printTree(ch, depth + 1));
  };
  roots.forEach((r) => printTree(r, 0));
  const nRoot = roots.length;
  if (nRoot > 6) {
    warn(`画布「${s(c.name)}」有 ${nRoot} 个根元素，其中附件卡片默认 parentId 为空会浮在根层——章节归属必须靠第 3 节的反向索引，不能直接按树铺章节`);
  }
  console.log("");

  // --- 2. 附件/便签 → 节点 反向索引（定章节） ---
  console.log("--- 2. 附件/便签 ↔ 节点 归属索引（经 links 反推，报告章节归属依据） ---");
  const attached = new Map(); // mindNodeItemId -> Set of fileCard/note item ids
  const unattached = new Set();
  items.forEach((i) => {
    if (i.type === "fileCard" || i.type === "note") unattached.add(i.id);
  });
  for (const l of links) {
    const a = byId[l.aId];
    const b = byId[l.bId];
    if (!a || !b) continue;
    const push = (host, leaf) => {
      if (!host || !leaf) return;
      if (host.type === "mindNode") {
        if (!attached.has(host.id)) attached.set(host.id, new Set());
        attached.get(host.id).add(leaf.id);
        unattached.delete(leaf.id);
      }
    };
    push(a, b);
    push(b, a);
    // 附件↔附件 也算有关联，但当轮不解决归属
  }
  // 便签若 attachIds 挂到节点（实测为空，保留通道）
  items.forEach((i) => {
    (i.attachIds || []).forEach((aid) => {
      if (byId[aid] && i.type === "mindNode") {
        if (!attached.has(i.id)) attached.set(i.id, new Set());
        attached.get(i.id).add(aid);
        unattached.delete(aid);
      }
    });
  });
  if (attached.size === 0) {
    console.log("(无：本画布没有从节点指向附件/便签的连线，附件全部未归位——报告中应单列「未归位附件」章节)");
  } else {
    for (const [nid, set] of attached) {
      const host = byId[nid];
      const parentChain = [];
      let cur = host;
      while (cur && cur.parentId && byId[cur.parentId]) {
        cur = byId[cur.parentId];
        parentChain.unshift(s(cur.text) || "(空)");
      }
      console.log(
        "节点「" + (s(host.text) || "(空)") + "」" +
          (parentChain.length ? "（路径：" + parentChain.join(" › ") + "）" : "（根节点）") +
          " ← " + [...set].map((x) => nameMap[x] || s(x)).join("；")
      );
    }
  }
  if (unattached.size) {
    console.log("");
    console.log("未归位（未被任何节点连线引用）：" + [...unattached].map((x) => nameMap[x] || s(x)).join("；"));
  }
  console.log("");

  // --- 3. 语义连线 ---
  console.log("--- 3. 语义连线（links，跨层级自由连接） ---");
  if (!links.length) {
    console.log("(无)");
  } else {
    for (const l of links) {
      const a = nameMap[l.aId];
      const b = nameMap[l.bId];
      if (a === undefined || b === undefined) {
        warn(`连线 ${s(l.id)} 端点悬空：aId=${s(l.aId)}${a === undefined ? "(不在本画布)" : ""} bId=${s(l.bId)}${b === undefined ? "(不在本画布)" : ""}`);
      }
      const lvl = l.level && l.level !== "normal" ? " {" + l.level + "}" : "";
      const shp = l.shape && l.shape !== "auto" ? " (" + l.shape + ")" : "";
      const dir = l.directional === false ? " [无向]" : "";
      console.log(
        clip(a !== undefined ? a : l.aId, 44) + " --[" + s(l.relationType) + "]" + lvl + shp + "--" + dir + "> " +
          clip(b !== undefined ? b : l.bId, 44) +
          (l.annotation ? " //" + clip(l.annotation, 100) : "")
      );
    }
  }
  console.log("");

  // --- 4. 批注 ---
  const anns = items.filter((i) => i.annotation);
  console.log("--- 4. 批注（item.annotation） ---");
  if (!anns.length) console.log("(无)");
  anns.forEach((i) => console.log("[" + (TYPE_LABEL[i.type] || i.type) + "] " + (nameMap[i.id] || s(i.id)) + "：" + s(i.annotation)));
  console.log("");

  // --- 5. 便签 ---
  const notes = items.filter((i) => i.type === "note");
  console.log("--- 5. 便签（note，全文） ---");
  if (!notes.length) console.log("(无)");
  notes.forEach((n, k) => console.log("[" + (k + 1) + "] " + s(n.text)));
  console.log("");

  // --- previews 自检 ---
  (c.previews || []).forEach((pv) => {
    if (!fmById(pv.fileId)) warn(`画布「${s(c.name)}」previews 中 ${s(pv.id)} 的 fileId=${s(pv.fileId)} 在 fileMeta 中不存在（悬空预览）`);
  });
}

// ---------- 6. 附件清单 ----------
console.log("=== 6. 附件清单 ===");
if (!fileMeta.length) {
  console.log("(无)");
}
// 统计每个附件被几个 fileCard 引用
const cardCount = {};
canvases.forEach((c) =>
  (c.items || []).forEach((i) => {
    if (i.type === "fileCard") cardCount[i.fileId] = (cardCount[i.fileId] || 0) + 1;
  })
);
fileMeta.forEach((f, i) => {
  const refs = cardCount[f.oldId] || 0;
  let line = i + 1 + ". " + s(f.name) + "　[" + kindOf(f) + "]";
  line += "　mime=" + s(f.mime || "(无)") + "　引用卡片数=" + refs;
  if (refs === 0) {
    line += "　⚠ 无 fileCard 引用";
    warn(`附件「${s(f.name)}」在 fileMeta 中但没有对应 fileCard`);
  }
  if (refs > 1) line += "　(同名多卡片)";
  console.log(line);
});

// ---------- 磁盘校验 ----------
if (baseDir) {
  console.log("");
  console.log("=== 磁盘附件校验（" + baseDir + "/attachments/）===");
  const adir = path.join(baseDir, "attachments");
  if (!fs.existsSync(adir)) {
    console.log("⚠ 目录不存在");
  } else {
    const disk = fs.readdirSync(adir);
    console.log("磁盘文件数：" + disk.length + "　fileMeta 数：" + fileMeta.length);
    const names = new Set(fileMeta.map((f) => f.name));
    const dset = new Set(disk);
    fileMeta.forEach((f) => {
      if (!dset.has(f.name)) {
        console.log("  ⚠ fileMeta 声明但磁盘缺失：" + s(f.name));
        warn(`附件「${s(f.name)}」在 fileMeta 中但 attachments/ 下不存在，报告中无法建立有效超链接`);
      }
    });
    disk.forEach((x) => {
      if (!names.has(x)) console.log("  ~ 磁盘多出（未在 fileMeta 声明）：" + x);
    });
    if (disk.length === fileMeta.length) console.log("  ✓ 数量一致");
  }
}

// ---------- 自检汇总 ----------
console.log("");
console.log("=== 数据自检 ===");
if (!warnings.length) {
  console.log("✓ 未发现结构异常");
} else {
  const unique = [...new Set(warnings)];
  unique.forEach((w) => console.log("⚠ " + w));
}
