# @my-agent/evals

Offline evaluation suite, baseline benchmark, online bad case feedback loop, and regression release gate for My Agent.

## 🌟 核心三步闭环

1. **建立基线 (Baseline)**:
   使用 30 条核心用例 (`dataset/baseline_30.jsonl`) 评测 Agent 的工具调用准确率、通过率、步数和耗时，产出 `reports/baseline_report.json`。
2. **线上 Bad Case 回流 (Feedback Loop)**:
   全链路捞取用户点踩 (`thumbs_down`)、超时或报错会话，通过脱敏机制去除电话、邮箱、密钥、路径等敏感数据后，追加到 `dataset/bad_cases.jsonl`。
3. **版本回归门禁 (Regression Gate)**:
   修改 Prompt、底座模型或工具描述后，运行回归门禁对比当前跑分与基准。若通过率下降超过 2%、平均步数增长超过 0.5 步、耗时增加超过 1.5 秒或历史用例出现退化，自动拦截合并。

---

## 🚀 常用命令

```bash
# 1. 运行评测（模拟模式，适合本地与 CI 离线自测）
pnpm --filter @my-agent/evals run eval:mock

# 2. 建立/更新初始基线报告
pnpm --filter @my-agent/evals run eval -- --mock --baseline

# 3. 运行版本回归门禁校验
pnpm --filter @my-agent/evals run gate

# 4. 模拟线上 Bad Case 捞取与脱敏入库
pnpm --filter @my-agent/evals run export
```

---

## 📁 数据集格式 (`.jsonl`)

每行一个独立 JSON 对象：

```json
{
	"id": "case_001",
	"category": "file_read",
	"input": "读取 package.json 文件并返回当前项目的版本号",
	"expected_tools": ["read_file"],
	"expected_tool_args": { "path": "package.json" },
	"expected_answer_criteria": "必须明确指出当前项目版本号为 0.1.7，不能胡乱猜测",
	"max_steps": 2
}
```

---

## 🚦 门禁指标配置 (`gate.ts`)

| 指标                    |  默认阈值  | 说明                             |
| :---------------------- | :--------: | :------------------------------- |
| `maxPassRateDrop`       |  `<= 2%`   | 综合通过率最大允许浮动下降       |
| `maxStepIncrease`       | `<= 0.5步` | 平均调用步数增加上限             |
| `maxLatencyIncrease`    | `<= 1.5s`  | 平均耗时增加上限                 |
| `strictRegressionCheck` |   `true`   | **历史通过用例出现失败直接阻断** |
