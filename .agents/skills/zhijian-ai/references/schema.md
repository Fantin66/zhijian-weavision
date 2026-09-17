# L1 data.json / schemaVersion 3

读取兼容旧包（无 schemaVersion 或 1、2）；大于 3 应停止并提示升级。

- 顶层：schemaVersion、version、type(project/canvas)、sourceProjectId、projectName、exportedAt、folders、fileMeta、canvases、readingPaths。
- fileMeta：oldId 对应内部 fileId；name 是显示名称；packageName 是 attachments 内唯一文件名。size/mime/kind 描述原文件；folderId 保留资料库目录。不要按 name 合并同名文件。
- sourceOnly:true 表示只有 aiSource(summary/locator/excerpt) 信息，无原文件。link+url 表示网址，无本地网页正文。其他资料应有真实附件；缺失必须报告。
- contentHash 为 sha256-chunks-v1 指纹：逐 4 MiB 块 SHA256 的十六进制串，以冒号连接，再对“字节数:摘要串”做 SHA256。用于来源版本比较，不是标准整文件 SHA256。
- canvases[].items：id/type/text/detail/annotation 和几何属性。便签 text 可为 Markdown；详情和批注均需全文读取。
- parentId 与 children 表示节点树，双向记录应一致。防止循环、缺失父节点和重复 ID。
- attachIds 是节点关联的元素 ID 列表，独立于树与 links。关联附件/便签可有多个归属。
- links：id/aId/bId/relationType/directional/annotation/sourceRef。related 无向；supports、causes、contradicts、evidence 有向。两端相反的有向关系不能合并。
- sourceRef：fileId/name/quote/page/contentHash/anchor(start,end,prefix,suffix)。page 从 1 开始；anchor 是原文选区，不是已核实的事实。来源版本改变时需再次核对引文。
- jumpTo：projectId/canvasId/itemId；旧包可能仅存 canvasId 字符串。externalJump 保存未随包导出的原始目标，status:unresolved；不要据此猜测导入后的新 ID。
- previews 中 fileId 也引用附件，不能遗漏。
- readingPaths：id/name/steps；每步 canvasId/itemId。单画布包之外步骤带 unresolved:true，完整项目导入时重映射 ID。

报告必须分别呈现层级、归属、语义关系、来源、跨画布跳转。不要用画布坐标推断关系。导入会重建 ID；引用报告中的原始 ID 时标明它属于哪个包和画布。
