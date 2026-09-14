---
name: zhijian-ai
description: "与织见 Weavision 交互的两个方向：(1) AI 操作画布——通过 window.ZhijianAI 接口在应用内创建节点、连线、布局、形变等；(2) AI 读取 .fantin 导出文件——解压 ZIP、解析 data.json 关系网络、读取附件、生成带超链接和数据来源标注的完整报告。当用户要求 AI 操作织见画布、构建思维关系板、或发送 .fantin 文件要求生成报告时触发。"
---

# 织见 AI 完整指引

AI 与织见 Weavision 的交互有两个方向，覆盖从"操作画布"到"读取导出文件生成报告"的完整闭环。

---

## 一、AI 操作画布（window.ZhijianAI 接口）

当 AI 需要在织见应用内操作画布时，通过页面提供的 `window.ZhijianAI` 接口。

### 调用方式

```js
const snap = window.ZhijianAI.snapshot();           // 获取当前状态快照
const result = window.ZhijianAI.execute({ op: "create_node", title: "新节点" });  // 执行命令
const built = window.ZhijianAI.buildCanvas(plan);    // 从计划批量构建画布
// result = { ok: true, value: {...} } 或 { ok: false, error: "..." }
```

接口仅在页面自身 JavaScript 上下文中可用（同页调用，不跨域）。

### 操作边界

- 只通过 `execute()` / `buildCanvas()` 操作画布，不直接改 DOM / localStorage / 源代码
- 删除类操作（delete_project/canvas/item/relation）需 `confirm: true`
- 不臆造内容，不确定的标为便签
- batch 失败整体回滚

### 命令清单（37 个 op）

详细命令参考见应用设置 → AI 设置 → "导出 AI 完整指引" 按钮导出的完整文档。

主要分类：
- 项目/画布：snapshot, activate, create_project, create_canvas, delete_*
- 元素创建：create_node, create_note, create_attachment, create_stroke, build_canvas
- 元素操作：update_item, duplicate_item, delete_item
- 关系/连接：relate, update_relation, delete_relation, attach, detach, reparent_node
- 形变/展开：toggle_morph, set_morph, toggle_detail, set_detail
- 关系线样式：set_link_level, set_link_shape
- 全局/系统：set_layout, set_style, set_preferences, focus, exit_focus, undo, redo, batch

### 关系类型

写入画布时只能使用这 5 个值（**复数形式**，与 `data.json` 中 `links[].relationType` 的取值一致）：

`related`（关联·无向）、`supports`（支撑）、`causes`（导致）、`contradicts`（反证）、`evidence`（证据）

> ⚠️ 不要写成 `support` / `cause` / `counter`（单数/近义词）——应用不识别，会写入无效类型。

---

## 二、AI 读取 .fantin 生成报告

当用户发送 .fantin 文件要求生成报告时，按以下流程操作。

### 素材边界铁律

可联网查资料以辅助理解 .fantin 文件中的概念和关系，但报告的最终内容必须且只能来自 data.json 和附件原文。外部知识仅用于辅助理解，不可写入报告。每条数据、结论都标注来源。

### 工作流程

1. **解压 .fantin**（ZIP 格式）：`unzip xxx.fantin -d /tmp/fantin/`
2. **读 data.json**（画布关系结构：节点、连线、层级、批注）
3. **运行解析脚本**：`node scripts/parse-fantin.js <解压目录>/data.json --dir <解压目录>`
   输出六段 AI 友好的关系网络文本：① 项目信息 ② 层级树（骨架）③ **附件/便签 ↔ 节点 归属索引** ④ 语义连线 ⑤ 批注与便签 ⑥ 附件清单 + 数据自检告警
4. **读 attachments/ 目录下所有 .md 文件**全文
5. **二进制附件**（docx/xlsx/png）尝试转换读取，读不了用文件名标注
   - `.xlsx` → 用 openpyxl 逐 sheet 抽表（`data_only=True` 取算好的值）
   - `.png/.jpg` → 直接读图识别（多模态模型）；识别不了再用 OCR 兜底
   - `.pdf` → 尝试解析文本；解析不了用文件名标注并在报告中说明
6. **先按下方「结构须知」确定章节归属，再组织报告**，引用处加超链接和来源标注
7. **报告保存到解压目录**，超链接用相对路径 `attachments/文件名`

### 结构须知（决定报告怎么分章，写报告前必读）

| 实测事实 | 对报告的要求 |
| --- | --- |
| **附件卡片 `fileCard` 的 `parentId` 为空**，全部浮在根层（实测某项目 28 个根元素中 23 个是附件卡片/便签） | ❌ **不能直接按层级树铺章节**，否则几十张附件卡片会堆在报告顶层 |
| 附件真正挂到哪个节点，**只由 `links` 决定** | ✅ **章节骨架取 `parentId` 树（根节点→章，子节点→节）；附件归属取 `links` 反向索引**（脚本第 ③ 段的"归属索引"就是干这个的） |
| 有些附件卡片**只有附件间连线、没有指向任何节点的连线** | ✅ 单列「**未归位附件**」章节，按内容归章并注明"此为内容推断、非连线依据" |
| `attachIds` 通道**实测恒为空数组** | 不要假设可通过 `attachIds` 挂接附件 |
| 一个附件可能挂**多个 `fileCard`**（脚本标 `(同名多卡片)`）；也可能**1 篇附件对多个节点**（实测 1 篇对 3 个节点） | 报告中要能体现这种一对多关系，索引表需列出 |
| `canvas.previews` 可能不存在、可能为空数组、可能有**悬空 `fileId`** | 解析须容错；`previews` **不作为报告内容依据** |
| `fileMeta` 的 `kind` 字段**可能整批缺失**（实测某项目 3/3 缺失） | 类型判定必须 `kind → mime → 扩展名` 三级兜底，**不可只看扩展名**（存在无扩展名的 `image/jpeg` 附件） |
| 两种批注是**不同字段**：`item.annotation`（元素上的画布批注）与 `link.annotation`（连线上的批注） | 报告中必须**分开标注**，不可混为一谈（报告须分别列出"画布批注"与"连线批注"） |
| 附件原文里可能有**指向作者本机的图片路径**（`file:///D:/...`）或**前缀错位的相对路径** | 报告引用图片时改用**包内真实文件名**；并把这类问题记入报告附录的"导出保真性问题" |

### 数据来源标注格式

```
> 数据来源：[附件名](attachments/附件名.md)
> 画布批注：批注内容
> 画布便签：便签内容
```

### 关系类型对照

| relationType | 中文 | 语义 | 报告中建议表达 |
|--------------|------|------|----------------|
| related | 关联 | 两者有关，方向不明确 | "A 与 B 相互关联" |
| supports | 支撑 | A 支持 B 的判断 | "A 支撑 B 的判断" |
| causes | 导致 | A 促使 B 发生 | "A 导致 B" |
| contradicts | 反证 | A 与 B 矛盾，需解决 | "A 反证 B（存在矛盾）" |
| evidence | 证据 | A 是 B 的来源或依据 | "A 作为 B 的证据" |

三种关系系统：
- **parentId**：层级关系（父子树），不在 links 里
- **links**：语义连线（跨层级自由连接，带类型和方向）
- **fileId**：附件挂接（fileCard → fileMeta 获取文件名）

> ⚠️ `related` 为**无向**；实测样本可能**全部连线都是 `related`**——此时所有关系只能读作"相互关联"，**不可读作因果或支撑方向**。检查 `links[].directional` 字段辅助判断。

### 解析脚本

**权威版本：`scripts/parse-fantin.js`**（本 skill 目录下）。运行：

```bash
node scripts/parse-fantin.js <解压目录>/data.json --dir <解压目录>
```

`--dir` 为可选参数，给出解压根目录时额外校验 `attachments/` 与 `fileMeta` 是否一一对应（列为必做的保真检查）。

脚本能力（**不要另写简化版，避免多份脚本漂移**）：
- 按 `parentId` 重建树（缩进表示层级，标注元素类型与 id、批注、展开内容字数、跃迁、折叠）
- 从 `fileMeta` 解析 `fileCard` 的可读名称；`fileId` 找不到时标"未知文件"并告警
- **附件/便签 ↔ 节点 反向索引**（报告章节归属的唯一依据），并单列"未归位"清单
- 列出全部 `links`（含 `level`/`shape`/`directional`/`annotation`）
- 汇总 `item.annotation`（画布批注）与 `note`（便签全文）
- 附件清单（含 `kind||mime` 类型、mime、被几张卡片引用、同名多卡片标记）
- 末尾"数据自检"：根元素过多、`fileId` 悬空、连线端点悬空、`previews` 悬空、`fileMeta` 与磁盘不一致等

### 报告要求

- **全部元素都要用上**（每个节点、附件、便签、画布批注、连线批注、每条连线）
- **章节组织**：章节骨架取 `parentId` 树（根节点→章，子节点→节）；**附件归属取 `links` 反向索引**；无节点连线的附件单列「未归位附件」章节
- **报告开头建议加"关系网络总览"**：① 层级树 ② 附件↔节点归属索引表 ③ 全部语义连线逐条列出 ④ 画布批注与便签全文——便于核对"元素是否全部用上"
- 语义连线在对应章节就地标注元素间关系（含连线批注）
- 附件内容填入对应章节，引用处加超链接
- 附件自带的口径冲突（⚠️）、内部测算、待核实项、反方观点**按原样照录并标注性质**，不得静默升格为结论
- 报告末尾加附录：① 全部附件索引表 ② 必要时加"修正对照 / 导出保真性问题记录"

---

## 详细参考

- data.json 完整字段说明 → `references/schema.md`
- 解析脚本源码 → `scripts/parse-fantin.js`
