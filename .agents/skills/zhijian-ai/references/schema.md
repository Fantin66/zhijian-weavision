# data.json 字段说明

## 顶层结构

```json
{
  "version": "G4",           // 格式版本
  "type": "project",         // 导出类型：project（整个项目）或 canvas（单画布）
  "exportedAt": 1789052263680, // 导出时间戳
  "projectName": "商业航天行研", // 项目名
  "fileMeta": [...],         // 附件文件元数据数组
  "canvases": [...]          // 画布数组
}
```

## fileMeta（附件元数据）

每个附件的元数据，不包含文件内容（内容在 attachments/ 目录）：

```json
{
  "oldId": "f126",           // 文件 ID（在画布中引用）
  "name": "1-50次商业发射.md", // 文件名
  "mime": "text/markdown",   // MIME 类型
  "url": null,               // 链接类文件的 URL（非链接为 null）
  "kind": "text"             // 文件类型简写：text/img/doc/sheet/slide/link/media
}
```

## canvases（画布）

每个画布包含 items（元素数组）和 links（连线数组）：

```json
{
  "id": "c1",
  "name": "主画布",
  "items": [...],   // 画布上的所有元素
  "links": [...],   // 画布上的所有语义连线
  "camera": {...},   // 相机状态（忽略）
  "previews": [...]  // 预览框数组（见下方"实测边界"，可能不存在/为空数组/含悬空项）
}
```

`previews[]` 每项形如 `{ "id": "pv1", "fileId": "f11154", "x": 403.26, "y": 232.87, "w": 380, "h": 300 }`。`fileId` 指向 `fileMeta.oldId`，但**实测存在指向已删除文件（悬空）的项**，解析须容错，且 `previews` 不作为报告内容依据。

## items（元素）

三种类型，共用一个数组：

### mindNode（思维节点）

```json
{
  "id": "148",
  "type": "mindNode",
  "text": "2025年商业发射50次",  // 节点标题
  "parentId": null,               // 父节点 ID（null=根节点，构成树状层级）
  "detail": null,                 // 展开内容（Markdown，可能很长，null=无展开）
  "annotation": null,             // 批注文本（null=无批注）
  "collapsed": false,             // 是否折叠
  "x": 0, "y": 0,                // 画布坐标（可忽略）
  "color": "#2d5fd3",            // 节点颜色
  "jumpTo": null                  // 跃迁目标（{canvasId, itemId}，指向其他画布的元素）
}
```

> `attachIds` 字段实测**恒为空数组**（附件挂接实际只走 `links`，不要假设该通道可用）。

### fileCard（附件卡片）

```json
{
  "id": "149",
  "type": "fileCard",
  "text": "",                     // 通常为空（显示内容由文件名决定）
  "fileId": "f126",              // 引用 fileMeta 中的 oldId
  "previewOpen": false,           // 是否预览打开
  "annotation": null,             // 批注
  "x": 0, "y": 0
}
```

fileCard 本身的 text 通常为空。要获取可读名称，需用 fileId 去 fileMeta 中查找 name 字段。

### note（便签）

```json
{
  "id": "187",
  "type": "note",
  "text": "中游：重点关注火箭\n\n上游：对标老美找国产替代",  // 便签内容（多行文本）
  "color": "#dbeafe",
  "annotation": null,
  "x": 0, "y": 0
}
```

## links（语义连线）

元素之间的带类型、带方向的连接。注意：层级关系（parentId）不在 links 里，links 只包含跨层级的自由语义连接。

```json
{
  "id": "l1",
  "aId": "148",              // 起点：元素 ID
  "bId": "149",              // 终点：元素 ID
  "relationType": "related", // 关系类型（见下表）
  "annotation": null,        // 线上的批注（null=无批注）
  "level": "normal",         // 线权重：normal=普通 / emphasis=强调 / highlight=高亮
  "shape": "auto"            // 线型：auto/curve/polyline/straight
}
```

### 关系类型对照表

| relationType 值 | 中文 | 语义 | 报告中的表达 |
|-----------------|------|------|-------------|
| `related` | 关联 | 两者有关，方向不明确 | "A 与 B 相互关联" |
| `supports` | 支撑 | A 支持 B 的判断 | "A 支撑 B 的判断" |
| `causes` | 导致 | A 促使 B 发生 | "A 导致 B" |
| `contradicts` | 反证 | A 与 B 矛盾，需解决 | "A 反证 B（存在矛盾）" |
| `evidence` | 证据 | A 是 B 的来源或依据 | "A 作为 B 的证据" |

## 三种关系系统

data.json 包含三种独立的关系系统，报告需要全部体现：

1. **层级关系（parentId）**：mindNode 的 parentId 指向父节点，构成树状从属结构。这是隐含的树，不在 links 数组里。子节点继承父节点的主题语境。

2. **语义连线（links）**：links 数组中的每条线是跨层级的自由连接，有类型（关联/支撑/导致/反证/证据）和方向（aId→bId）。这是显式的语义关系。

3. **附件挂接（fileId）**：fileCard 的 fileId 指向 fileMeta 中的文件。data.json 中**没有显式的"归属"字段**，`attachIds` 实测恒为空——**附件挂到哪个节点，实际只由 `links` 决定**（不要靠画布坐标邻近推断，坐标仅是视觉位置）。

## 解析脚本用法

```bash
node scripts/parse-fantin.js <data.json路径> [--dir <解压根目录>]
```

`--dir` 可选；给出时额外校验 `attachments/` 与 `fileMeta` 是否一一对应（建议必带）。

脚本自动完成：
- 按 parentId 重建树（缩进表示层级，含元素类型与 id、批注、展开内容字数、jumpTo、折叠）
- 从 fileMeta 解析 fileCard 的可读名称（找不到时标"未知文件"并告警）
- **附件/便签 ↔ 节点 反向索引**（报告章节归属的唯一依据）+ 单列"未归位"清单
- 列出所有 links（aId/bId → 可读名称，含 level/shape/directional/annotation）
- 汇总 `item.annotation`（画布批注）与 `note`（便签全文）
- 输出附件清单（含 `kind||mime` 类型、mime、被几张卡片引用、同名多卡片标记）
- 末尾"数据自检"：根元素过多、fileId 悬空、连线端点悬空、previews 悬空、fileMeta 与磁盘不一致

输出直接可被 AI 理解，无需再手动解析 JSON。**不要另写简化版脚本**——多份实现会漂移，以本文件指向的 `scripts/parse-fantin.js` 为准。

---

## 实测边界与坑（跨两个真实导出文件验证）

以下为 G4 格式在真实 `.fantin`（`商业航天行研` 41 元素/37 连线/21 附件；`新项目-微焓` 26 元素/3 连线/3 附件）上实测到的边界情况，解析与写报告前必读：

| # | 现象 | 处理方式 |
| --- | --- | --- |
| 1 | **`fileCard` 的 `parentId` 为空**，全部浮在根层（航天样本 28 个根元素中 23 个是附件卡片/便签） | 章节骨架取 `parentId` 树；**附件归属取 `links` 反向索引**，不可直接按树铺章节 |
| 2 | 存在**只有附件间连线、无节点连线**的附件卡片（航天样本 6 个） | 单列「未归位附件」章节，按内容归章并注明"内容推断、非连线依据" |
| 3 | **`attachIds` 全部为空数组**（两样本均如此） | 附件挂接只走 `links`；不要假设 `attachIds` 可用 |
| 4 | 同一附件可挂**多张 `fileCard`**（航天样本 1 篇挂 2 张）；1 篇附件也可**连多个节点**（1 篇连 3 个节点） | 报告索引表需体现一对多 |
| 5 | `fileMeta` 的 **`kind` 字段可能整批缺失**（微焓样本 3/3 缺失） | 类型判定 `kind → mime → 扩展名` 三级兜底 |
| 6 | 存在**无扩展名**的附件（微焓「客户表」，`mime=image/jpeg`） | 不可按扩展名判类型，必须读 `mime` |
| 7 | `canvas.previews` 可能**不存在 / 为空数组 / 含悬空 `fileId`**（微焓 2 条中 1 条指向已删文件 `f11154`） | 容错解析；`previews` 不作为报告内容依据 |
| 8 | 连线端点可能**不在 `items` 中**（悬空连线） | 名称取值统一 `String()` 归一，避免对数字调 `.slice()` 抛错 |
| 9 | 真实样本 `relationType` 可能**全部为 `related`**（航天 37/37） | 不可读作因果/支撑方向；参考 `directional` 字段 |
| 10 | MIME 与 `kind` 可能**不一致**（微焓 BP 为 `application/pdf`，按扩展名/`kind` 都得 `doc`） | 以 `kind` 优先，`mime` 兜底 |
| 11 | 附件原文内可能带**指向作者本机的绝对路径**（`file:///D:/Pictures/...`）或**前缀错位的相对路径** | 导出后链接必然失效；报告引用改用包内真实文件名，并把问题记入报告附录 |

> 上述边界已在 `scripts/parse-fantin.js` 中实现容错，并在报告生成流程中以"数据自检"段落形式输出告警。
