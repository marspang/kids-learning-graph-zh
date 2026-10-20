# 中学前的知识地图

> 中学之前，孩子该学会的一切 —— Everything a child should learn before middle school

**Marble Skill Taxonomy (v1) 的中文本地化衍生数据集** —— 一张描述"孩子在小学阶段到底要学会什么"的开放知识图谱。

- 约 **1600 个微主题**（micro-topic），每条含中文名称、说明、掌握证据、家长向评估问句；
- 约 **3200 条前置依赖**（"要学 X 先得会 Y"），每条带中文理由与 hard/soft 强度；
- **领域摘要**（clusters）与**教学研究**（teaching-research：教学法、学习活动、评估与常见错误）；
- 对齐 7 套课程框架（美国 CCSS / NGSS、英国国家课程等），仅保留**标准代码与链接**；
- 适用年龄：**4–15 岁**，主战场为 **5–12 岁**（小学段）。

> 本项目是 [withmarbleapp/os-taxonomy](https://github.com/withmarbleapp/os-taxonomy) 的衍生翻译作品，
> 与 Marble 官方无隶属关系。授权与必须保留的署名见 [ATTRIBUTION.md](./ATTRIBUTION.md)。

## 目录结构

```text
.
├── LICENSE                  # ODbL 1.0（数据层）
├── LICENSE-CONTENT          # CC BY-SA 4.0（文本层）
├── ATTRIBUTION.md           # 署名与上游课标声明（必读）
├── data/
│   ├── source/              # 上游原始 JSON（含 UPSTREAM.json 版本锁定信息）
│   ├── zh/                  # 中文数据集（本仓库的核心产出）
│   │   ├── topics.zh.json
│   │   ├── dependencies.zh.json
│   │   ├── clusters.zh.json
│   │   ├── teaching-research.zh.json   # 需 --include-research 才生成
│   │   └── meta.json        # 生成信息 + 上游版本
│   └── dist/
│       └── graphdata.json   # 含 3D 坐标，供前端直接渲染
└── scripts/
    ├── fetch.mjs            # 下载上游数据并按 sha256 校验
    ├── translate.mjs        # 分批翻译（可断点续跑）
    ├── glossary.tsv         # 术语表（保证全库译法一致）
    ├── build-graph.mjs      # 力导向算 3D 坐标 + 打包
    └── validate.mjs         # 完整性 / 覆盖率校验
```

## 快速开始

```bash
npm install

# 1) 拉取上游数据（自动校验 sha256 并锁定版本）
npm run fetch

# 2) 翻译（任意 OpenAI 兼容接口：DeepSeek / 火山方舟 / OpenAI / Moonshot / Qwen 等）
export LLM_API_KEY=sk-xxxx
export LLM_BASE_URL=https://api.deepseek.com/v1   # 火山方舟示例：https://ark.cn-beijing.volces.com/api/v3
export LLM_MODEL=deepseek-chat
npm run translate                 # 全量；核心三件套
npm run pilot                     # 只翻 120 条，先看效果

# 3) 生成 3D 图谱数据包
npm run build

# 4) 校验
npm run validate
```

### 常用参数

| 变量 / 参数 | 说明 | 默认 |
| --- | --- | --- |
| `LLM_BASE_URL` | OpenAI 兼容接口地址 | `https://api.deepseek.com/v1` |
| `LLM_MODEL` | 模型名 | `deepseek-chat` |
| `BATCH_SIZE` | 每批片段数 | 24 |
| `CONCURRENCY` | 并发请求数 | 4 |
| `--limit=N` | 只处理前 N 个未译片段（试跑用） | 不限 |
| `--include-research` | 同时翻译 `teaching-research.json`（约 2100 万字符，费用高） | 关闭 |
| `--retranslate` | 忽略缓存，全部重翻 | 关闭 |
| `LAYOUT_SEED` | 布局随机种子（可复现） | 20260720 |

翻译进度写入 `data/zh/.cache.jsonl`（已 gitignore），**中断后重跑会自动续传**。

## 数据契约

- 结构、`id`、依赖关系、标准代码**完全沿用上游**，中文版仅在文本字段上做替换，因此任何针对上游写的代码都能直接复用。
- 学科字段额外提供 `subjectZh`（确定性映射，不经过模型），`subject` 保持英文以兼容按学科分组。
- `data/dist/graphdata.json` 字段：`groups`/`gcol`（学科名与配色）、`H`（年龄轴高度）、`ageMin`/`ageMax`、`nodes[{i,x,y,z,g,a,c,dm,t,q}]`、`links[[前置下标, 主题下标]]`。**y 轴即年龄**，x/z 由依赖关系力导向布局决定。

## 合规提示

可商用、可修改、**无需开源你的产品源码**；但如果**修改了数据库本身**（例如本项目所做的翻译），修改后的数据库必须继续以 **ODbL 1.0** 开放，并保留 [ATTRIBUTION.md](./ATTRIBUTION.md) 中的完整署名。第三方课标原文**不建议**直接并入产品。
