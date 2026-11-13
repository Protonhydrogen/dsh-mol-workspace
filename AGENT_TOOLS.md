# Agent tools

已注册 8 个工具，每个 defineTool + ctx.tools.register 独立 try/catch。成功打印工具名，失败打印工具名及原始异常；无整组重试。

| 工具 | 用途 |
|---|---|
| molecular_load | 本地 PDB/mmCIF 路径或四字符 PDB ID；返回结构 ID |
| molecular_get_state | 读取结构、选区、样式、标记、图层、测量、命令和连接状态；可选扁平 structureId/representation/color |
| molecular_select | 精确残基、链或原子选择 |
| molecular_focus | 聚焦精确目标并显示环境 |
| molecular_highlight | 高亮目标 |
| molecular_style | 重设结构样式，或在指定残基上叠加彩色图层；molecular_control 的 setDisplay/createLayer 的结构化替代 |
| molecular_control | action + args（JSON 字符串），共用已确认的画布命令通道 |
| molecular_get_command | 查询排队命令最终状态和结果 |

调用前先 get_state 获得真实 structureId、auth/label 编号。不要把 pending/running 当作成功。

当前会话的 Mol* Viewer 关闭时，load 与视觉命令会自动请求打开并等待连接（最长 12 秒）。根插件的唤醒监听独立于侧栏组件；不同活动会话不会被强行导航。超时仍返回真实 VIEWER_NOT_CONNECTED 错误，不能把请求打开当成执行成功。

```json
{"action":"getInteractions","args":"{\"structureId\":\"1\",\"chainId\":\"A\",\"start\":19}"}
```

getInteractions 返回化学/几何规则推断的接触类型、真实原子端点、距离及推断方法；不是结合能。原子查询：

```json
{"action":"select","args":"{\"structureId\":\"1\",\"chainId\":\"A\",\"start\":19,\"atomName\":\"O\"}"}
```

常用 action：getStructureInfo/getResidues/getSequence/neighbors，select/focus/highlight/clearSelection，setDisplay/setVisibility，createTag/removeTag/createLayer/removeLayer，createMeasurement/styleMeasurement/removeMeasurement/clearMeasurements，camera/trajectory/align，previewImage/exportImage/exportStructure，hideSelection/undo/removeStructure。

测距参数示例：

```json
{"action":"createMeasurement","args":"{\"type\":\"distance\",\"points\":[{\"structureId\":\"1\",\"chainId\":\"A\",\"start\":19,\"atomName\":\"N\"},{\"structureId\":\"1\",\"chainId\":\"A\",\"start\":19,\"atomName\":\"CA\"}]}"}
```

setDisplay 支持 structureId 或 layerId、representation、color、opacity、colorValue 等。trajectory 支持 frame/step/play/pause/video；视频区间 startFrame/endFrame 为零起始，含两端。使用 wait=false 返回命令 ID，再轮询，成功后检查实际输出路径。

输入框引用通过原生 inputTriggers + conversation.input 插入，发送前保持草稿；独立 Agent.inject 不用于“加入对话”，因为它只把内容放入 next-step inbox。
