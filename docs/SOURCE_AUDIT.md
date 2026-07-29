# 源站静态化审计报告 · PriceAI Channels

> 审计对象：`https://priceai.cc/channels?platform=ChatGPT` 及其背后的动态数据接口
> 审计目的：在合法、公开、无需登录、已获授权的范围内，将原项目改造成完全静态化的独立前端
> 审计时间：2026-07-29
> 数据来源性质：本项目即原项目仓库（AGPL-3.0，公开仓库 `physics-dimension/PriceAI`），数据接口为原项目自身提供的公开 JSON API

## 1. 项目框架与依赖

| 项 | 结论 |
| --- | --- |
| 框架 | Next.js 16.2.4（App Router，React 19.2.4，TypeScript 5） |
| 运行时 | Node.js ≥ 20（脚本端实测 24.15.0） |
| 数据库 | Supabase（Postgres + RPC），可选；未配置时回退到 `src/lib/sample-data.ts` 种子数据 |
| UI | Tailwind CSS v4、lucide-react |
| 关键脚本 | `scripts/collect-prices.mjs`（动态采集）、`scripts/collect-official-prices.mjs` |
| 静态化入口 | `src/app/channels/page.tsx` → `src/components/StaticChannelExplorer.tsx`（已存在半成品，仅 `meta.json`，缺数据文件） |

## 2. 页面路由

| 路由 | 类型 | 说明 |
| --- | --- | --- |
| `/channels` | Server Component | 入口，读取 `?platform=` 后渲染 `StaticChannelExplorer` |
| `/channels?platform=ChatGPT\|Claude\|Gemini\|Grok` | 同上 | 平台筛选 |
| `/products/[id]` | Server Component | 商品详情（动态） |
| `/api/offers` | Route Handler（`force-dynamic`） | 公开报价列表接口，支持分页/筛选 |
| `/api/products/[id]/offers` | Route Handler | 单商品报价分页接口 |
| `/api/explorer` | Route Handler | 标准商品汇总（聚合） |

静态化范围：仅 `/channels` 路由树。`/products/[id]` 详情通过列表页内联展开实现，避免运行时 API。

## 3. 数据来源

| 来源 | 可抓取性 | 说明 |
| --- | --- | --- |
| `https://priceai.cc/api/offers`（公开 JSON） | ✅ 可抓取 | 无需登录、无验证码、无地区限制；返回 `{rows, total, limited, generatedAt}` |
| `https://priceai.cc/api/products/[id]/offers` | ✅ 可抓取 | 单商品分页，但 `/api/offers` 已含商品归并，无需单独调用 |
| `https://priceai.cc/api/explorer` | ✅ 可抓取 | 仅汇总，`/api/offers` 已含明细，不重复抓取 |
| Supabase 直连 | ❌ 不可抓取 | 需要服务端密钥，前端不持有；不接触 |
| `src/lib/sample-data.ts` | ✅ 仓库内 | 种子数据，仅降级时使用，不作为快照来源 |
| `data/official-prices/latest.json` | ✅ 仓库内 | App Store 官方地区价（独立项目，不在 channels 范围） |
| 卡网页面（`pay.ldxp.cn` 等） | ❌ 不抓取 | 第三方店铺页面，需各自采集器；本次只取原项目已聚合的公开 API |
| 账号/接码/KYC/共享账号源 | ❌ 排除 | 高风险，不直接抓取；如出现在公开 API 中则按风险标记或排除 |

**授权说明**：本项目即原项目仓库本身，`/api/offers` 是原项目自行暴露的公开接口（`src/app/api/offers/route.ts` 无鉴权），在仓库 owner 授权范围内提取静态快照。脚本仅在构建前一次性请求，不在用户访问页面时请求原站。

## 4. API 接口结构

### 4.1 `/api/offers`

请求参数（全部公开、GET）：

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `platform` | string | `ChatGPT`/`Claude`/`Gemini`/`Grok`/`邮箱`/`接码`/`其他`/`API/CDK`，缺省=全部 |
| `q` | string | 关键词 |
| `type` | string | 商品类型 |
| `stock` | string | `available`/`out_of_stock` |
| `sort` | string | `updated`/`channels`/`price` |
| `min`/`max` | number | 价格区间 |
| `limit` | int | 每页数量，**上限 1200**（`PUBLIC_OFFER_LIMIT`） |
| `offset` | int | 分页偏移 |

响应：

```jsonc
{
  "rows": [{ "offer": {...}, "product": {...} }],
  "total": 5493,
  "limited": true,
  "generatedAt": "ISO8601",
  "degraded": false,
  "message": null
}
```

分页方式：`limit` + `offset`（无 cursor、无 next page 字段；需客户端按 `total` 自行翻页）。

### 4.2 隐藏分页 / 懒加载

- `/channels` 页面本身：服务端渲染 + 客户端 `StaticChannelExplorer`，无懒加载。
- `/products/[id]` 详情：客户端分页请求 `/api/products/[id]/offers`（80/页）。静态化后改为列表内联展开，全部渠道一次性载入本地 JSON。
- 后台 RPC：`list_public_offers_page`、`list_public_product_summaries`、`get_public_product_summary`、`list_public_product_offers_page`（Postgres 函数，需 Supabase，不接触）。

无验证码、无登录、无反爬网关（实测 `curl` 直连即可）。

## 5. 字段映射

### 5.1 报价（`offer`）字段

| 原始字段 | 类型 | 静态化字段 | 缺失处理 |
| --- | --- | --- | --- |
| `id` | string | `id` | 必有 |
| `sourceId` | string | `source_id` | 必有 |
| `sourceName` | string | `source_name` | 必有 |
| `sourceStoreName` | string? | `merchant_name` | null |
| `sourceTitle` | string | `title` | 必有 |
| `price` | number? | `price` | null |
| `currency` | string | `currency` | 默认 CNY |
| `status` | string | `stock_status` | `unknown` |
| `url` | string? | `purchase_url` / `source_url` | null |
| `stockCount` | number? | `stock_count` | `unknown` |
| `capturedAt` | ISO? | `collected_at` | now |
| `sourceUpdatedAt` | ISO? | `source_updated_at` | null |
| `lastSeenAt` / `verifiedAt` / `expiresAt` | ISO? | 内部用 | null |
| `filterTags` | string[] | 派生 `risk_level` / `delivery_type` | [] |
| `tags` | string[] | 保留 | [] |
| `minOrderQuantity` / `bulkPricingTiers` | - | 不纳入公开快照（与比价无关） | - |
| `sourceIncludedAt` / `sourceShopCreatedAt` / `collectorKind` | - | 不纳入公开快照 | - |

### 5.2 标准商品（`product`）字段

`id` / `slug` / `displayName` / `platform` / `productType` / `spec` / `summary` / `aliases`。

### 5.3 缺失字段（原 API 不提供，静态化时派生或置空）

| 字段 | 处理 |
| --- | --- |
| `warranty`（质保） | 从 `title` 正则提取（`质保\d+天` / `无质保` / `质保首登`），否则 `unknown` |
| `delivery_type`（交付方式） | 从 `filterTags` + `title` 派生：`recharge`/`account`/`cdk`/`link`/`unknown` |
| `account_ownership`（账号归属） | 从 `title` + `filterTags` 派生：`official`/`third_party`/`shared`/`unknown` |
| `risk_level` | 从 `filterTags` + `title` 派生：`low`/`medium`/`high` |
| `confidence_score` | 基于 `sourceUpdatedAt` / `stockCount` / `risk_level` 计算 0–1 |
| `is_public` | 公开 API 返回的均为 `true`；高风险且不适合公开展示的置 `false` 并入排除清单 |

## 6. 接口总量与每页数量

| 平台 | 接口声明 `total` | 每页上限 | 预计请求页数 |
| --- | --- | --- | --- |
| ChatGPT | 2207 | 1200 | 2 |
| Claude | 322 | 1200 | 1 |
| Gemini | 649 | 1200 | 1 |
| Grok | 288 | 1200 | 1 |
| 邮箱 | 489 | 1200 | 1 |
| 接码 | 518 | 1200 | 1 |
| 其他 | 1020 | 1200 | 1 |
| **合计（去重前）** | **5493** | - | **9** |

> 注：`/api/offers?platform=...` 按平台过滤后相加 = 5493，与不传 platform 的 `total=5493` 一致，说明平台间无交叉重复（每个 offer 只归属一个 `product.platform`）。

## 7. 重复与缺失

### 7.1 重复

- **跨平台重复**：无（见上）。
- **同平台内重复**：以 `offer.id` 为唯一键去重；同一 `purchase_url` 可能被多个 source 复用，按 `(source_id, url, title)` 二次去重。
- **标准商品归并**：同一 `product.id` 下的多条 offer 是正常的（同商品多渠道），不算重复。

### 7.2 缺失字段（统计见 `reports/completeness-report.json`）

预期高频缺失：
- `sourceUpdatedAt`：部分 offer 仅有 `capturedAt`。
- `stockCount`：约 30–40% 缺失（卡网不总是返回库存数）。
- `warranty`：原 API 无此字段，从标题派生，缺失率高。
- `purchase_url`：极少缺失，但存在 `url=null` 的占位 offer。

## 8. 当前数据总量与预计静态快照总量

| 指标 | 数值 |
| --- | --- |
| 原接口声明总量 | 5493 |
| 预计抓取成功量 | 5493（公开接口稳定） |
| 预计去重后量 | ~5493（去重主要影响同 URL 跨 source） |
| 标准商品数（`canonicalCatalog`） | 33（`src/lib/catalog.ts`） |
| 实际出现商品数 | 待抓取后统计（预计 20–33） |
| 商家数（去重 `sourceStoreName`） | 待统计 |
| 预计静态快照 JSON 体积 | ~3–6 MB（分平台压缩） |

## 9. 排除清单策略

以下内容**不直接公开展示**，写入 `data/reports/excluded.json` 并标注原因：

| 类别 | 判定信号 | 处理 |
| --- | --- | --- |
| 共享账号 / 拼车 | `title` 含 `共享`/`拼车`/`母号`/`子号`/`车位`/`邀请`/`自动拉` 且无官方信号 | `is_public=false`，风险 `high` |
| 接码 / KYC | `filterTags` 含 `phone_required`/`verification`/`kyc`；`title` 含 `接码`/`验证码`/`KYC` | `is_public=false`，风险 `high` |
| 未验证账号 | `filterTags` 含 `account_unverified` | `is_public=true` 但风险 `high`，前台显著标记 |
| 来源不明 | `sourceStoreName` 为空且 `sourceId` 不在白名单 | `is_public=true`，风险 `medium`，前台标记 |
| 账号转售（成品号/日抛/首登） | `filterTags` 含 `delivery_account` 或 `title` 含 `成品号`/`日抛`/`首登`/`直登`/`账密` | `is_public=true`，风险 `medium`，前台标记「账号类商品，注意服务条款」 |

> 原站 `/api/offers` 已在服务端做过一轮过滤（`meta.json` 旧值 `excludedRows=4118`），因此公开 API 返回的 5493 条本身已是「可公开展示」集合；本静态化在此基础上**额外**做风险标注，不再次大范围删除，避免信息缺失。

## 10. 抓取脚本与产物

- 脚本：`scripts/export-static-snapshot.mjs`
- 命令：`node scripts/export-static-snapshot.mjs`
- 产物目录：

```
data/raw/{snapshotVersion}/        # 原始响应 + raw_hash，不覆盖
  metadata.json
  {platform}-page-{n}.json
  failures.json
data/normalized/                   # 标准化后的统一结构
  offers.json
  products.json
  product-aliases.json
  merchants.json
  merchant-aliases.json
  normalization-report.json
  review-queue.json
data/static-snapshot/              # 前端构建时直接 import 的快照
  metadata.json
  chatgpt.json
  claude.json
  gemini.json
  grok.json
  other.json
data/reports/
  completeness-report.json
  completeness-report.md
  excluded.json
```

## 11. 合规与安全

- ✅ 只请求原项目自身公开 API，无验证码 / 登录 / 权限 / 地区 / 风控绕过。
- ✅ 构建前一次性提取，前端运行时**不**请求原站。
- ✅ 不抓取私人数据、支付信息、账号密码。
- ✅ 不复制原站代码，只提取必要数据字段并重新设计前端。
- ✅ 高风险内容标记或排除，不包装成正规渠道。
- ✅ 缺失字段记为「未获取」，不伪造。
- ⚠️ 卡网第三方店铺页面（`pay.ldxp.cn` 等）不在本次抓取范围；`purchase_url` 仅作为外链保留，由用户自行访问核验。
