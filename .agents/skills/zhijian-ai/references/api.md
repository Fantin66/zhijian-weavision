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
| create_attachment | name, kind?, summary?, x?, y?, attachTo? | 新建来源信息卡；source.fileId 可关联真实附件 |
| create_stroke | points:[{x,y}], color?, size? | 画笔线条 |
| create_connector | a:{x,y,free?}, b:{x,y,free?}, color?, width? | 连接器 |
| build_canvas | plan:{...} | 从计划批量构建画布（见下） |

### 元素操作
| op | 关键参数 | 说明 |
|----|----------|------|
| update_item | itemId, patch:{text?,color?,detail?,annotation?,x?,y?,w?,h?,collapsed?,fontFamily?,fontSize?,bold?,underline?,jumpTo?,previewOpen?} | 更新属性 |
| duplicate_item | itemId | 复制 |
| delete_item | itemId, confirm:true | 删除（含关系线） |

### 关系/连接
| op | 关键参数 | 说明 |
|----|----------|------|
| relate | from, to, type?, annotation? | 创建/更新关系线 |
| update_relation | linkId, type?, annotation?, level?, shape? | 更新关系线 |
| delete_relation | linkId, confirm:true | 删除关系线 |
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

## buildCanvas 计划格式

~~~json
{
  "title": "画布标题",
  "layout": "right",
  "replace": false,
  "rootTitle": "主题",
  "nodes": [{ "key":"n1", "title":"节点", "parentKey":null, "color":"#2d5fd3", "order":0, "detail":"详情", "annotation":"批注", "collapsed":false, "jumpTo":"canvasId" }],
  "notes": [{ "key":"note1", "text":"便签内容", "x":0, "y":0, "color":"#fef3c7", "attachTo":"n1" }],
  "attachments": [{ "key":"att1", "name":"材料", "summary":"摘要", "x":0, "y":0, "previewOpen":false, "attachTo":"n1" }],
  "relations": [{ "from":"n1", "to":"n2", "type":"causes", "annotation":"导致", "level":"emphasis", "shape":"curve" }]
}
~~~

## 关系类型（type）
related（关联·无向）、supports（支撑）、causes（导致）、contradicts（反证）、evidence（证据）

## 关系线权重（level）
normal（常规）、emphasis（强调）、highlight（高亮）

## 关系线线型（shape）
auto、curve（曲线）、polyline（折线）、straight（直线）

## 布局类型（layout）
right（逻辑图）、org（组织架构）、u（U型）、fishbone（鱼骨图）、timeline（时间轴）、brace（总分）


所有写命令支持 requestId。batch ≤60，不支持嵌套。build_canvas 若指定 canvasId，必须存在；未指定则新建。替换另需 confirmReplace:true。布局别名 right/left/u/brace/radial/both 实际归一为 logic，不代表提供这些独立排版。create_attachment 的 source 支持 fileId，或 name/kind/summary/locator/excerpt。
