# Installed defineTool schema rules

只读分析对象：DSH 安装目录下 `node_modules/@deepseek-ai/dsh-tools/lib/index.js`（当时包版本 0.2.0-rc.2）。没有修改该文件。

关键源码：runSchemaCompiler 约 586 行；属性 required 检查 603–604；节点词汇和 type 编译 655–752；object 的 additionalProperties 检查 699；parameterSchemaSpecToJsonSchema 801；defineTool 838。这套作者 DSL 与最终 raw JSON Schema 不是相同形状。

| 写法 | defineTool 作者参数 DSL 结果与原因 |
|---|---|
| parameters: {structureId:{type:'string',description:'...'},...} | 合法。parameters 本身就是属性表，工具包装器生成根 object。当前 molecular_get_state 的三个扁平可选参数合法。 |
| parameters: {required:[]} | 非法。required 被当作名为 required 的参数，其值数组不是 value schema object。 |
| 属性 required:false | 非法。属性 required 出现时只能严格等于 true；可选属性应省略 required。 |
| 属性 required:true | 合法。编译器收集该属性名，生成 raw required 数组。 |
| 嵌套 object + required:['x'] | 非法。属性位置的 required 数组先违反 required===true；即使在输出根节点也不是作者 object 节点支持的词汇。 |
| 嵌套 object + properties.x.required:true | 合法，前提 object 显式 additionalProperties:true/false；编译器自动生成内部 required 数组。嵌套对象本身并不被禁止。 |
| object 未写 additionalProperties | 非法，必须显式布尔值；不支持 additionalProperties 的 schema 对象。 |

value 节点支持 string/number/integer/boolean/null/array/object/json 或 oneOf；type 与 oneOf 不可同时声明。array 使用 items（值 schema），items 和 oneOf 分支不是属性，不能带 required。scalar 支持类型一致的 enum/const；注释词汇 description/title/default/examples。未知词汇、循环对象，以及 raw 子集校验不通过的组合被拒绝。minimum/pattern/anyOf/$ref 等不在当前支持子集中。json 编译为不限制 JSON 值的注释节点。

最终生成的 raw JSON Schema **支持** object.required 字符串数组，包括合法的空数组；但不能把 raw required 数组直接传进作者 DSL。原问题混淆了两个层次。

回归：tests/schema.test.mjs 实际导入本机已安装的 parameterSchemaSpecToJsonSchema，逐条确认三种历史拒绝模式、当前 flat 可选写法、正确 nested 写法和缺失 additionalProperties。tests/host.test.mjs 实际 defineTool 编译 7 工具，故意使第 2 个工具注册失败后其余继续注册，并验证 load 返回值通过本机 ToolRuntime 输出校验器。
