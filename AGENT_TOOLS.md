# Agent tools

已注册 9 个工具，每个 defineTool + ctx.tools.register 独立 try/catch。成功打印工具名，失败打印工具名及原始异常；无整组重试。

| 工具 | 用途 |
|---|---|
| molecular_load | 本地 PDB/mmCIF 路径或四字符 PDB ID；返回结构 ID |
| molecular_get_state | 读取结构、选区、样式、标记、图层、测量、命令和连接状态；可选扁平 structureId/representation/color |
| molecular_select | 精确残基、链或原子选择 |
| molecular_focus | 聚焦精确目标并显示环境 |
| molecular_highlight | 高亮目标 |
| molecular_style | 重设结构样式，或在指定残基上叠加彩色图层；molecular_control 的 setDisplay/createLayer 的结构化替代 |
| molecular_control | action + args（JSON 字符串），共用已确认的画布命令通道 |
| molecular_surface | 由聊天创建全局或局部势图，可使用 APBS OpenDX |
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

### 聊天指令与顶点势图

molecular_surface 接受 molecular、gaussian、van-der-waals、solvent-accessible 四种表面。传 color=electrostatic 以负红、零白、正蓝着色。传 dxPath 可采样同一坐标系、未压缩的规则轴对齐 APBS OpenDX 势图（默认 ±5 kT/e）。没有 DX 时使用侧链屏蔽库仑近似并标注 reduced preview units。局部着色可以传 residues=[{authAsymId:"A",authSeqId:190}] 和 radius=6，其余表面维持灰色。

molecular_highlight 可以用 persistent=true、residues、colorValue 和 name 创建持久球棍图层。molecular_control 的 removeLayer 或 setVisibility 可管理返回的图层 ID。

### 原有表示法和原子着色主题

- `representation: 'solvent-accessible'` 渲染溶剂可及表面（按探针半径外扩的高斯表面），配合 `probeRadius`（默认 1.4 Å）与 `smoothness`。`molecular-surface` 仍是溶剂排除表面。
- `color: 'electrostatic'` 用屏蔽库仑势着色，正蓝负红。可配 `dielectric`（默认 80）、`ionicStrength`（默认 0.15 M）、`potentialRange`（默认 15 kcal/mol/e，即满色阶对应的值）。
- 电荷优先取自 PDBQT 的 Gasteiger 电荷；普通 PDB/mmCIF 没有电荷，退回内置残基模型（骨架 Amber 电荷、带电侧链形式电荷），只保证正负区域位置正确。
- 电势是原子中心处的值，表面网格继承最近原子的颜色，不是表面本身求解出的电势；不是 Poisson–Boltzmann 解，也不是结合能。
- 局部版本用图层实现，不影响结构其余部分：

```json
{"action":"createLayer","args":"{\"structureId\":\"1\",\"chainId\":\"A\",\"start\":41,\"end\":60,\"representation\":\"solvent-accessible\",\"color\":\"electrostatic\",\"probeRadius\":1.4,\"dielectric\":80}"}
```

整结构版本：

```json
{"action":"setDisplay","args":"{\"structureId\":\"1\",\"representations\":[\"cartoon\",\"solvent-accessible\"],\"color\":\"electrostatic\",\"opacity\":0.9}"}
```

输入框引用通过原生 inputTriggers + conversation.input 插入，发送前保持草稿；独立 Agent.inject 不用于“加入对话”，因为它只把内容放入 next-step inbox。
