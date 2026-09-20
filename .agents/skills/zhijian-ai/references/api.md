# ZhijianAI API 2.0

`execute(command)` 和 `buildCanvas(plan)` 返回 Promise；必须 await。`snapshot()` 和 `capabilities()` 同步只读。成功写入返回 `{ok:true,value,persisted:true}`；失败返回 `{ok:false,error,rolledBack,persisted}`，失败中的 persisted 仅描述回滚后状态保存是否成功。capabilities 返回运行时 layouts/styles/relations/limits，优先采用这些值。

## 命令清单

### 项目/画布
| op | 关键参数 | 说明 |
|----|----------|------|
| snapshot | — | 当前完整状态快照 |
| activate | projectId?, canvasId? | 切到指定项目/画布 |
| create_project | name | 新建项目 |
| rename_project | projectId?, name | 重命名项目 |
| delete_project | projectId?, confirm:true | 删除（需确认） |
| create_canvas | projectId?, name | 新建画布 |
| rename_canvas | projectId?, canvasId, name | 重命名画布 |
| delete_canvas | projectId?, canvasId, confirm:true | 删除画布（需确认） |

### 元素创建
| op | 关键参数 | 说明 |
|----|----------|------|
| create_node | title, parentId?, color?, x?, y?, detail? | 新建思维节点 |
| create_note | text/markdown, x?, y?, color?, fontFamily?, fontSize?, bold?, underline? | 新建便签 |
| create_attachment | name, kind?, summary?, x?, y?, attachTo? | 新建来源信息卡；source.fileId 或顶层 fileId 可关联真实附件 |
| create_stroke | points:[{x,y}], color?, size? | 画笔线条 |
| create_connector | a:{x,y,free?}, b:{x,y,free?}, color?, width? | 连接器 |
| build_canvas | plan:{...} | 从计划批量构建画布（见下） |
| import_files | paths:["绝对路径",…], folderId? | 按路径把本地文件读成真实附件（仅桌面版；单次≤60 个、单个≤300MB） |

### 元素操作
| op | 关键参数 | 说明 |
|----|----------|------|
| update_item | itemId, patch:{text?,color?,detail?,annotation?,x?,y?,w?,h?,collapsed?,fontFamily?,fontSize?,bold?,underline?,jumpTo?,previewOpen?} | 更新属性 |
| duplicate_item | itemId | 复制 |
| delete_item | itemId, confirm:true | 删除（节点会级联删除整棵子树） |
| clear_canvas | projectId?, canvasId?, confirm:true | 清空画布上的元素与连线；项目资料库保留 |

delete_item / delete_relation 返回值含 `removedIds`（实际被删除的全部 id）与 `cascadedCount`。删除导图节点会连带删掉子树、其连线与连接器，必须按 removedIds 核对，不要以为只删了一个元素。

### 关系/连接
| op | 关键参数 | 说明 |
|----|----------|------|
| relate | from, to, type?, annotation? | 创建/更新关系线 |
| update_relation | linkId, type?, annotation?, level?, shape? | 更新关系线 |
| delete_relation | linkId, confirm:true | 删除关系线（返回 removedIds） |
| attach | nodeId, itemId | 便签/附件关联到节点 |
| detach | nodeId, itemId | 解除关联 |
| reparent_node | nodeId, parentId? | 移动节点（防循环） |

### 形变/展开
| op | 关键参数 | 说明 |
|----|----------|------|
| toggle_morph | itemId | 切换附件形变预览 |
| set_morph | itemId, open?:bool | 设定附件展开/收起 |
| toggle_detail | itemId | 切换节点详情展开 |
| set_detail | itemId, expand?:bool | 设定详情展开/收起 |

### 关系线样式
| op | 关键参数 | 说明 |
|----|----------|------|
| set_link_level | linkId, level:"normal"\|"emphasis"\|"highlight" | 线权重 |
| set_link_shape | linkId, shape:"auto"\|"curve"\|"polyline"\|"straight" | 线型 |

### 全局/系统
| op | 关键参数 | 说明 |
|----|----------|------|
| set_layout | layout:"right"\|"org"\|"u"\|"fishbone"\|"timeline"\|"brace" | 切换布局+自动排版 |
| set_style | style, fontPreset? | 切换视觉样式+字体 |
| set_preferences | dark?, bgPattern?, bgColorName?, stylePreset?, fontPreset? | 外观偏好 |
| focus | itemId | 聚焦模式（高亮关联） |
| exit_focus | — | 退出聚焦 |
| undo | — | 撤销 |
| redo | — | 重做 |
| batch | commands:[{op,...}] | 批量（≤60 条，失败回滚） |
| resolve_jumps | projectId?, canvasId? | 把按画布名写的跃迁解析为 canvasId，返回 pending 清单 |
| material_library | — | 材料库根目录、占用与项目子目录（仅桌面版） |

## 元素定位与画布切换

除 build_canvas 内部外，凡是以 itemId / linkId 定位的命令（update_item、delete_item、relate、attach、toggle_detail、set_link_level 等）都会在**全部项目与画布**中按 id 查找；命中在非活动画布时自动切换过去。因此不必先手工 activate 再改元素。build_canvas 期间不自动切换，避免后续节点写进错误画布。

`activate` 用于明确指定操作目标；省略 canvasId 时落到该项目第一张画布。

## 跨画布跃迁

计划里可以按画布名写跃迁，不必预先知道 canvasId：

```json
{ "key":"n9", "title":"火箭层", "jumpToCanvasName":"火箭层专题" }
```

`build_canvas` 结束时自动解析已有画布；目标画布尚未创建时保留 jumpToCanvasName，等全部画布建完再执行一次 `resolve_jumps`。返回值 `resolved` 为成功数，`pending` 列出仍未匹配的 `{canvasId,itemId,canvasName}`。画布重名不会被猜测解析，必须在 pending 里显式处理。

## buildCanvas 计划格式

~~~json
{
  "title": "画布标题",
  "layout": "right",
  "replace": false,
  "rootTitle": "主题",
  "nodes": [{ "key":"n1", "title":"节点", "parentKey":null, "color":"#2d5fd3", "order":0, "detail":"详情", "annotation":"批注", "collapsed":false, "jumpToCanvasName":"目标画布名" }],
  "notes": [{ "key":"note1", "text":"便签内容", "x":0, "y":0, "color":"#fef3c7", "attachTo":"n1" }],
  "attachments": [{ "key":"att1", "fileId":"f12", "name":"材料", "x":0, "y":0, "previewOpen":false, "attachTo":"n1" }],
  "relations": [{ "from":"n1", "to":"n2", "type":"causes", "annotation":"导致", "level":"emphasis", "shape":"curve" }]
}
~~~

- nodes 的 parentKey 解析顺序：计划内 key → 本画布已有节点的真实 id → 报错。父级必须在目标画布上。
- attachments 只想放一个已有附件时直接写顶层 `fileId`（来自 snapshot 的 project.files）；只写 name/summary 则创建不含原文件的来源信息卡。
- relations 两端必须都在目标画布上，否则整批回滚。
- 返回值含 `aliases`、`resolvedJumps`、`pendingJumps`。

## 关系类型（type）
related（关联·无向）、supports（支撑）、causes（导致）、contradicts（反证）、evidence（证据）

## 关系线权重（level）
normal（常规）、emphasis（强调）、highlight（高亮）

## 关系线线型（shape）
auto、curve（曲线）、polyline（折线）、straight（直线）

## 布局类型（layout）
right（逻辑图）、org（组织架构）、u（U型）、fishbone（鱼骨图）、timeline（时间轴）、brace（总分）


所有写命令支持 requestId。batch ≤60，不支持嵌套。build_canvas 若指定 canvasId，必须存在；未指定则新建。替换另需 confirmReplace:true。布局别名 right/left/u/brace/radial/both 实际归一为 logic，不代表提供这些独立排版。create_attachment 的 source 支持 fileId，或 name/kind/summary/locator/excerpt。

## 材料库与真实附件

桌面版有材料库：导入的每一份材料都会同步落盘到 `<材料库根目录>/<项目名>/<文件名>`，用户可在资源管理器中直接找到。根目录默认在系统「文档」下的 `织见材料库`，可在设置→数据中更改。

- `import_files` 是按路径导入的唯一入口：传绝对路径数组，应用负责读取、建附件记录、写入本地数据库并镜像到材料库。返回值 `files` 里的 id 可直接用于 `create_attachment` 的 `fileId`。个别路径读不到只计入 `errors`，不影响其余文件。
- `snapshot()` 的 `materialLibrary` 是当前根目录；`projects[].files[]` 里 `localPath` 是导入前的来源路径，`libraryPath` 是材料库副本路径，`sourceOnly:true` 表示只有来源信息、没有原文件（此时两者都为 null）。
- `material_library` 返回根目录、总占用与各项目子目录，用来回答「材料存在哪儿」。
- 材料库是磁盘镜像，不是数据源；画布数据仍在应用本地数据库中。删除项目只解除引用，不会删除材料库里已存在的文件。
- 只写 name 而不给 fileId 的 create_attachment 仍然是**来源信息卡**，不要声称原文件已存在于材料库。

## 能力查询

`capabilities()` 返回 `ops`（可用命令名数组）与 `importByPath`（是否支持按路径导入）。先查这个再决定走哪条路径，不要靠版本号猜。
