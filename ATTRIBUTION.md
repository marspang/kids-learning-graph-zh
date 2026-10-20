# 署名与来源声明（ATTRIBUTION）

本仓库是 **[Marble Skill Taxonomy (v1)](https://github.com/withmarbleapp/os-taxonomy)** 的**中文本地化衍生数据库**。
使用、复制、修改或分发本仓库的任何数据，均必须保留以下署名。

## 1. 原始数据集署名（必须保留）

> Marble Skill Taxonomy (v1) · © Generative Spark, Inc. (Marble) · <https://withmarble.com/> ·
> licensed under ODbL 1.0 (database) and CC BY-SA 4.0 (content).

## 2. 授权层次

| 层次 | 覆盖内容 | 许可 |
| --- | --- | --- |
| 数据库 | 集合结构、ID、topic↔topic 与 topic↔standard 关系 | **ODbL 1.0** |
| Marble 原创文本 | `name` / `description` / `evidence` / `assessmentPrompt` / `reason` / `clusters` 摘要 / `teaching-research` 内容 | **CC BY-SA 4.0** |
| 本仓库的中文译文 | 上述文本的中文翻译 | 作为衍生数据库整体按 **ODbL 1.0** 开放（文本层继承 CC BY-SA 4.0） |

**义务摘要**：可商用、可修改；必须署名；**衍生"数据库"必须以 ODbL 1.0 同样开放**（"产出作品"如应用、模型、课程产品无需开源）。

## 3. 上游课标声明（`data/source/curriculum-standards.json`）

该文件由第三方课程框架抽取而来，**Marble 无权再授权**。
本仓库**仅保留标准代码与 topic↔standard 链接，不分发受限课标原文**。若你在产品中引用下列来源，需自行遵守其条款并保留相应声明：

- **`uk-nc-2013`**（英国国家课程 KS1–2）— © Crown copyright，[Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/)。
  声明：_"Contains public sector information licensed under the Open Government Licence v3.0."_
- **`ccss-ela` / `ccss-math`**（美国 Common Core）— CCSS Public License（**用途受限**，仅限支持 CCSS 计划）。
  声明：_"© Copyright 2010 National Governors Association Center for Best Practices and Council of Chief State School Officers."_
- **`ngss-k5` / `ngss-ms`**（Next Generation Science Standards）— 版权归 National Academies Press，商用受限。
  声明：_"NGSS is a registered trademark of WestEd. Neither WestEd nor the lead states and partners that developed the Next Generation Science Standards were involved in the production of this product, and do not endorse it."_
- **`c3-social-studies`**（C3 Framework）— © National Council for the Social Studies，需授权方可分发原文。
- **`ib-pyp-pspe`**（IB PYP PSPE）— © International Baccalaureate Organization，需 IB 明确授权。

原始出处详见上游 [PROVENANCE.md](https://github.com/withmarbleapp/os-taxonomy/blob/main/PROVENANCE.md)。

## 4. 本仓库声明

- 本仓库与 Marble / Generative Spark, Inc. **无隶属或背书关系**，仅为其开放数据的衍生翻译。
- 翻译由机器完成并可能含偏差，**不构成教学建议**；原始语义以上游英文数据为准。
- 上游版本锁定信息见 `data/source/UPSTREAM.json`（commit 与每个文件的 sha256）。
