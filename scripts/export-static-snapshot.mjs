#!/usr/bin/env node
// scripts/export-static-snapshot.mjs
//
// 一次性从 priceai.cc 自身公开 API（/api/offers，无鉴权、无验证码）提取全平台报价快照，
// 写入 data/raw/{version}/（原始响应 + raw_hash，不覆盖）、data/normalized/（统一结构）、
// data/static-snapshot/（前端构建时 import）、data/reports/（完整性 + 排除清单）。
//
// 合规：仅在构建前运行一次；前端运行时不调用本脚本，也不请求原站。
// 重试：3 次，指数退避；超时 30s；空字段保留为 null/unknown，不伪造。

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const API_BASE = process.env.PRICEAI_API_BASE || "https://priceai.cc";
const API_PATH = "/api/offers";
// 公开 HTTP 层强制 limit ≤ 200、offset ≤ 5000（见 {"code":"limit_too_large","maxLimit":200,"maxOffset":5000}）。
// src/lib/data.ts 的 PUBLIC_OFFER_LIMIT=1200 是进程内上限，HTTP 层更严格，这里取 200。
const PAGE_SIZE = 200;
const MAX_OFFSET = 5000;
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1500;
const REQUEST_TIMEOUT_MS = 30_000;
const PAGE_DELAY_MS = 400;
const USER_AGENT = "PriceAI-Static-Snapshot/1.0 (+build-time export; contact: repo owner)";

// 平台 → 静态快照文件名。邮箱/接码/API-CDK/其他 全部并入 other.json（菜单的“其他”）。
const PLATFORMS = [
  { key: "ChatGPT", file: "chatgpt.json" },
  { key: "Claude", file: "claude.json" },
  { key: "Gemini", file: "gemini.json" },
  { key: "Grok", file: "grok.json" },
  { key: "邮箱", file: "other.json" },
  { key: "接码", file: "other.json" },
  { key: "API/CDK", file: "other.json" },
  { key: "其他", file: "other.json" },
];

const RAW_DIR = join(ROOT, "data", "raw");
const NORMALIZED_DIR = join(ROOT, "data", "normalized");
const STATIC_SNAPSHOT_DIR = join(ROOT, "data", "static-snapshot");
const REPORTS_DIR = join(ROOT, "data", "reports");

// ---------- helpers ----------

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function writeJson(path, value) {
  ensureDir(dirname(path));
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n", "utf8");
}

async function fetchWithRetry(url) {
  let lastError = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        headers: { "user-agent": USER_AGENT, accept: "application/json" },
        signal: controller.signal,
        redirect: "follow",
      });
      clearTimeout(timer);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      const json = await response.json();
      return json;
    } catch (error) {
      clearTimeout(timer);
      lastError = error;
      if (attempt < MAX_RETRIES) {
        const backoff = RETRY_BASE_MS * 2 ** (attempt - 1);
        await sleep(backoff);
        continue;
      }
    }
  }
  throw lastError || new Error("fetch failed");
}

// ---------- risk / delivery / warranty derivation ----------

const HIGH_RISK_TITLE_SIGNALS = [
  "共享", "拼车", "母号", "子号", "车位", "邀请", "自动拉", "直拉",
  "接码", "收码", "验证码", "kyc", "实名",
  "无质保", "无售后", "跑路",
];
const HIGH_RISK_FILTER_TAGS = new Set([
  "phone_required", "gemini_phone_required", "verification_required",
  "kyc_required", "shared_access", "group_buy", "pro_max_short_term",
]);
const MEDIUM_RISK_TITLE_SIGNALS = [
  "成品号", "日抛", "首登", "直登", "账密", "未接码", "已接码",
  "土区", "代充", "代开", "邀请", "拼车",
];
const OFFICIAL_TITLE_SIGNALS = ["正价", "官方", "正规", "真实付费", "官方充值"];

function deriveRiskLevel(offer) {
  const title = String(offer.sourceTitle || "").toLowerCase();
  const tags = Array.isArray(offer.filterTags) ? offer.filterTags : [];
  if (tags.some((t) => HIGH_RISK_FILTER_TAGS.has(t))) return "high";
  if (HIGH_RISK_TITLE_SIGNALS.some((s) => title.includes(s.toLowerCase()))) return "high";
  if (OFFICIAL_TITLE_SIGNALS.some((s) => title.includes(s.toLowerCase()))) return "low";
  if (MEDIUM_RISK_TITLE_SIGNALS.some((s) => title.includes(s.toLowerCase()))) return "medium";
  // 卡网第三方渠道默认 medium
  return "medium";
}

function deriveDeliveryType(offer) {
  const tags = new Set(Array.isArray(offer.filterTags) ? offer.filterTags : []);
  if (tags.has("delivery_recharge")) return "recharge";
  if (tags.has("delivery_cdk")) return "cdk";
  if (tags.has("delivery_link")) return "link";
  if (tags.has("delivery_account")) return "account";
  const title = String(offer.sourceTitle || "").toLowerCase();
  if (/(卡密|cdk|兑换码|激活码)/.test(title)) return "cdk";
  if (/(直充|代充|充值|续费|代开|开通)/.test(title)) return "recharge";
  if (/(成品号|账号|账户|账密|首登|直登|日抛)/.test(title)) return "account";
  if (/(链接|自助|提链|扫码)/.test(title)) return "link";
  return "unknown";
}

function deriveAccountOwnership(offer) {
  const title = String(offer.sourceTitle || "").toLowerCase();
  if (/(共享|拼车|母号|子号|车位|邀请|自动拉|直拉|团队号)/.test(title)) return "shared";
  if (/(正价|官方|正规|真实付费|官方充值)/.test(title)) return "official";
  const tags = new Set(Array.isArray(offer.filterTags) ? offer.filterTags : []);
  if (tags.has("delivery_account")) return "third_party";
  return "unknown";
}

function deriveWarranty(offer) {
  const title = String(offer.sourceTitle || "");
  const m1 = title.match(/质保\s*(\d+)\s*天/);
  if (m1) return `质保${m1[1]}天`;
  if (/无质保|无售后/.test(title)) return "无质保";
  if (/质保首登/.test(title)) return "质保首登";
  if (/质保/.test(title)) return "质保";
  return "unknown";
}

function deriveConfidence(offer, riskLevel) {
  let score = 0.9;
  if (!offer.sourceUpdatedAt) score -= 0.1;
  if (offer.stockCount === null || offer.stockCount === undefined) score -= 0.05;
  if (riskLevel === "high") score -= 0.25;
  else if (riskLevel === "medium") score -= 0.1;
  if (!offer.url) score -= 0.1;
  return Math.max(0.3, Math.round(score * 100) / 100);
}

// 接码 / KYC / 共享账号：标记为不适合公开展示
function decidePublic(offer, riskLevel) {
  if (riskLevel !== "high") return { isPublic: true, excludeReason: null };
  const title = String(offer.sourceTitle || "").toLowerCase();
  const tags = new Set(Array.isArray(offer.filterTags) ? offer.filterTags : []);
  // 接码 / 验证码 / KYC 类目整体排除公开（仍记录在 excluded.json）
  if (tags.has("phone_required") || tags.has("gemini_phone_required") ||
      tags.has("verification_required") || tags.has("kyc_required") ||
      /(接码|收码|短信验证|验证码服务|kyc|实名认证)/.test(title)) {
    return { isPublic: false, excludeReason: "verification_or_kyc_service" };
  }
  // 共享账号 / 拼车：保留展示但显著标记 high（不排除，因为原站也展示）
  return { isPublic: true, excludeReason: null };
}

// ---------- normalization ----------

function normalizeOffer(row, collectedAt) {
  const offer = row.offer || {};
  const product = row.product || {};
  const riskLevel = deriveRiskLevel(offer);
  const { isPublic, excludeReason } = decidePublic(offer, riskLevel);
  const stockStatus = String(offer.status || "unknown");
  return {
    id: String(offer.id || ""),
    platform: String(product.platform || "其他"),
    product_id: String(product.id || "other-product"),
    product_name: String(product.displayName || product.slug || product.id || "其他商品"),
    product_type: String(product.productType || "其他"),
    product_spec: String(product.spec || ""),
    merchant_name: offer.sourceStoreName ? String(offer.sourceStoreName) : (offer.sourceName ? String(offer.sourceName) : null),
    source_name: String(offer.sourceName || ""),
    source_id: String(offer.sourceId || ""),
    title: String(offer.sourceTitle || ""),
    price: offer.price === null || offer.price === undefined ? null : Number(offer.price),
    currency: String(offer.currency || "CNY"),
    stock_status: stockStatus,
    stock_count: offer.stockCount === null || offer.stockCount === undefined ? "unknown" : Number(offer.stockCount),
    warranty: deriveWarranty(offer),
    delivery_type: deriveDeliveryType(offer),
    account_ownership: deriveAccountOwnership(offer),
    purchase_url: offer.url ? String(offer.url) : null,
    source_url: offer.url ? String(offer.url) : null,
    source_updated_at: offer.sourceUpdatedAt ? String(offer.sourceUpdatedAt) : null,
    collected_at: collectedAt,
    risk_level: riskLevel,
    confidence_score: deriveConfidence(offer, riskLevel),
    is_public: isPublic,
    exclude_reason: excludeReason,
    // 原始字段对照（便于追溯，不修改）
    _raw: {
      id: offer.id || null,
      sourceTitle: offer.sourceTitle || null,
      price: offer.price ?? null,
      currency: offer.currency || null,
      status: offer.status || null,
      url: offer.url || null,
      stockCount: offer.stockCount ?? null,
      capturedAt: offer.capturedAt || null,
      sourceUpdatedAt: offer.sourceUpdatedAt || null,
      lastSeenAt: offer.lastSeenAt || null,
      verifiedAt: offer.verifiedAt || null,
      expiresAt: offer.expiresAt || null,
      filterTags: Array.isArray(offer.filterTags) ? offer.filterTags : [],
      tags: Array.isArray(offer.tags) ? offer.tags : [],
    },
  };
}

function buildProductsAndAliases(rows) {
  const productMap = new Map();
  const aliasMap = new Map(); // alias(lower) -> product_id
  for (const row of rows) {
    const p = row.product;
    if (!p || !p.id) continue;
    if (!productMap.has(p.id)) {
      productMap.set(p.id, {
        id: String(p.id),
        slug: String(p.slug || p.id),
        display_name: String(p.displayName || p.slug || p.id),
        platform: String(p.platform || "其他"),
        product_type: String(p.productType || "其他"),
        spec: String(p.spec || ""),
        summary: String(p.summary || ""),
        aliases: Array.isArray(p.aliases) ? p.aliases.map(String) : [],
        offer_count: 0,
      });
    }
    productMap.get(p.id).offer_count += 1;
    const aliases = Array.isArray(p.aliases) ? p.aliases : [];
    for (const alias of aliases) {
      const key = String(alias).trim().toLowerCase();
      if (key && !aliasMap.has(key)) aliasMap.set(key, String(p.id));
    }
    aliasMap.set(String(p.displayName || "").trim().toLowerCase(), String(p.id));
  }
  return { products: [...productMap.values()], aliases: aliasMap };
}

function buildMerchantsAndAliases(normalizedOffers) {
  const merchantMap = new Map();
  const aliasMap = new Map();
  for (const o of normalizedOffers) {
    const name = o.merchant_name || o.source_name;
    if (!name) continue;
    const key = o.source_id || name;
    if (!merchantMap.has(key)) {
      merchantMap.set(key, {
        id: String(o.source_id || key),
        name: String(name),
        source_name: String(o.source_name || ""),
        platform: String(o.platform || "其他"),
        offer_count: 0,
      });
    }
    merchantMap.get(key).offer_count += 1;
    const aliasKey = String(name).trim().toLowerCase();
    if (aliasKey && !aliasMap.has(aliasKey)) aliasMap.set(aliasKey, String(o.source_id || key));
  }
  return { merchants: [...merchantMap.values()], aliases: aliasMap };
}

// ---------- main ----------

async function main() {
  const startedAt = nowIso();
  const snapshotVersion = `priceai-static-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Date.now().toString(36)}`;
  const collectedAt = nowIso();
  const rawVersionDir = join(RAW_DIR, snapshotVersion);
  ensureDir(rawVersionDir);
  ensureDir(NORMALIZED_DIR);
  ensureDir(STATIC_SNAPSHOT_DIR);
  ensureDir(REPORTS_DIR);

  console.log(`▶ 快照版本：${snapshotVersion}`);
  console.log(`▶ API：${API_BASE}${API_PATH}`);

  const failures = [];
  const platformStats = [];
  const allRows = []; // {offer, product} 全平台合并
  const staticBuckets = new Map(); // file -> { products: Map, rows: [] }
  for (const f of ["chatgpt.json", "claude.json", "gemini.json", "grok.json", "other.json"]) {
    staticBuckets.set(f, { products: new Map(), rows: [] });
  }

  let grandTotalDeclared = 0;
  let grandTotalFetched = 0;

  for (const platform of PLATFORMS) {
    // 同名 file 的平台只声明一次 total（合并抓取，避免重复）
    if (platform.key !== PLATFORMS.find((p) => p.file === platform.file).key) {
      // 仍独立抓取，但计入同一 bucket；继续
    }
    let page = 1;
    let offset = 0;
    let declaredTotal = null;
    let fetchedCount = 0;
    console.log(`\n→ ${platform.key}`);

    while (true) {
      const url = new URL(API_BASE + API_PATH);
      url.searchParams.set("platform", platform.key);
      url.searchParams.set("limit", String(PAGE_SIZE));
      url.searchParams.set("offset", String(offset));
      const urlStr = url.toString();

      let json;
      try {
        json = await fetchWithRetry(urlStr);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.error(`  ✗ page ${page} 失败：${reason}`);
        failures.push({ platform: platform.key, page, offset, url: urlStr, reason });
        break;
      }

      const rawString = JSON.stringify(json);
      const rawHash = sha256(rawString);
      const rows = Array.isArray(json.rows) ? json.rows : [];
      if (declaredTotal === null) declaredTotal = Number(json.total || 0);
      const pageReturned = rows.length;

      // 保存原始响应
      const rawFile = join(rawVersionDir, `${platform.key}-page-${page}.json`);
      writeJson(rawFile, {
        platform: platform.key,
        page,
        offset,
        limit: PAGE_SIZE,
        url: urlStr,
        fetchedAt: nowIso(),
        raw_hash: rawHash,
        declared_total: declaredTotal,
        returned_count: pageReturned,
        response: json,
      });

      // 归并
      for (const row of rows) {
        allRows.push(row);
        const bucket = staticBuckets.get(platform.file);
        const p = row.product;
        if (p && p.id && !bucket.products.has(p.id)) {
          bucket.products.set(p.id, {
            id: String(p.id),
            slug: String(p.slug || p.id),
            displayName: String(p.displayName || p.slug || p.id),
            platform: String(p.platform || "其他"),
            productType: String(p.productType || "其他"),
            spec: String(p.spec || ""),
            summary: String(p.summary || ""),
            aliases: Array.isArray(p.aliases) ? p.aliases.map(String) : [],
          });
        }
        bucket.rows.push(row);
      }

      fetchedCount += pageReturned;
      console.log(`  page ${page}: ${pageReturned} 条 (declared total=${declaredTotal})`);

      if (pageReturned < PAGE_SIZE) break;
      if (offset + pageReturned >= declaredTotal) break;
      offset += PAGE_SIZE;
      page += 1;
      await sleep(PAGE_DELAY_MS);
    }

    grandTotalDeclared += declaredTotal || 0;
    grandTotalFetched += fetchedCount;
    platformStats.push({
      platform: platform.key,
      snapshot_file: platform.file,
      declared_total: declaredTotal || 0,
      fetched_count: fetchedCount,
      success: fetchedCount >= (declaredTotal || 0),
    });
  }

  // 失败记录
  writeJson(join(rawVersionDir, "failures.json"), {
    snapshotVersion,
    generatedAt: nowIso(),
    count: failures.length,
    failures,
  });

  // ---------- 标准化 ----------
  console.log("\n▶ 标准化...");
  const normalizedOffers = allRows.map((row) => normalizeOffer(row, collectedAt));

  // 去重：以 offer.id 为主键；缺失时用 (source_id, url, title)
  const seenIds = new Set();
  const seenCompound = new Set();
  const deduped = [];
  let duplicateById = 0;
  let duplicateByCompound = 0;
  for (const o of normalizedOffers) {
    if (o.id) {
      if (seenIds.has(o.id)) { duplicateById += 1; continue; }
      seenIds.add(o.id);
    }
    const compound = `${o.source_id}|${o.purchase_url || ""}|${o.title}`;
    if (!o.id && seenCompound.has(compound)) { duplicateByCompound += 1; continue; }
    seenCompound.add(compound);
    deduped.push(o);
  }

  const { products, aliases: productAliasMap } = buildProductsAndAliases(allRows);
  const { merchants, aliases: merchantAliasMap } = buildMerchantsAndAliases(deduped);

  // review queue：低置信度
  const reviewQueue = deduped
    .filter((o) => o.confidence_score < 0.5 || o.risk_level === "high" || o.product_id === "other-product")
    .map((o) => ({
      id: o.id,
      reason: [
        o.confidence_score < 0.5 ? "low_confidence" : null,
        o.risk_level === "high" ? "high_risk" : null,
        o.product_id === "other-product" ? "unclassified_product" : null,
      ].filter(Boolean),
      title: o.title,
      merchant: o.merchant_name,
      confidence_score: o.confidence_score,
      risk_level: o.risk_level,
    }));

  writeJson(join(NORMALIZED_DIR, "offers.json"), {
    snapshotVersion, generatedAt: nowIso(), count: deduped.length, offers: deduped,
  });
  writeJson(join(NORMALIZED_DIR, "products.json"), {
    snapshotVersion, generatedAt: nowIso(), count: products.length, products,
  });
  writeJson(join(NORMALIZED_DIR, "product-aliases.json"), {
    snapshotVersion, generatedAt: nowIso(),
    count: productAliasMap.size,
    aliases: [...productAliasMap.entries()].map(([alias, productId]) => ({ alias, product_id: productId })),
  });
  writeJson(join(NORMALIZED_DIR, "merchants.json"), {
    snapshotVersion, generatedAt: nowIso(), count: merchants.length, merchants,
  });
  writeJson(join(NORMALIZED_DIR, "merchant-aliases.json"), {
    snapshotVersion, generatedAt: nowIso(),
    count: merchantAliasMap.size,
    aliases: [...merchantAliasMap.entries()].map(([alias, merchantId]) => ({ alias, merchant_id: merchantId })),
  });
  writeJson(join(NORMALIZED_DIR, "normalization-report.json"), {
    snapshotVersion,
    generatedAt: nowIso(),
    total_rows: allRows.length,
    normalized_count: normalizedOffers.length,
    deduped_count: deduped.length,
    duplicates_removed_by_id: duplicateById,
    duplicates_removed_by_compound: duplicateByCompound,
    products_count: products.length,
    merchants_count: merchants.length,
    review_queue_count: reviewQueue.length,
  });
  writeJson(join(NORMALIZED_DIR, "review-queue.json"), {
    snapshotVersion, generatedAt: nowIso(), count: reviewQueue.length, items: reviewQueue,
  });

  // ---------- 静态快照（前端 import） ----------
  console.log("\n▶ 写静态快照...");
  let publicTotal = 0;
  for (const [file, bucket] of staticBuckets) {
    // 仅保留 is_public=true 的报价进公开快照；排除项不入快照
    const publicRows = bucket.rows
      .map((row) => ({ row, normalized: deduped.find((o) => o.id === String(row.offer?.id || "")) }))
      .filter((entry) => entry.normalized && entry.normalized.is_public);

    const compactRows = publicRows.map(({ row, normalized }) => ({
      offer: {
        id: normalized.id,
        sourceId: normalized.source_id,
        sourceName: normalized.source_name,
        sourceStoreName: normalized.merchant_name,
        sourceTitle: normalized.title,
        price: normalized.price,
        currency: normalized.currency,
        status: normalized.stock_status,
        url: normalized.purchase_url,
        stockCount: normalized.stock_count === "unknown" ? null : normalized.stock_count,
        capturedAt: normalized.collected_at,
        sourceUpdatedAt: normalized.source_updated_at,
        lastSeenAt: normalized._raw.lastSeenAt || null,
        // 静态化派生字段（前端展示用）
        warranty: normalized.warranty,
        delivery_type: normalized.delivery_type,
        account_ownership: normalized.account_ownership,
        risk_level: normalized.risk_level,
        confidence_score: normalized.confidence_score,
      },
      product: bucket.products.get(normalized.product_id)
        ? {
            id: bucket.products.get(normalized.product_id).id,
            slug: bucket.products.get(normalized.product_id).slug,
            displayName: bucket.products.get(normalized.product_id).displayName,
            platform: bucket.products.get(normalized.product_id).platform,
            productType: bucket.products.get(normalized.product_id).productType,
            spec: bucket.products.get(normalized.product_id).spec,
            summary: bucket.products.get(normalized.product_id).summary,
            aliases: bucket.products.get(normalized.product_id).aliases,
          }
        : row.product,
    }));

    writeJson(join(STATIC_SNAPSHOT_DIR, file), {
      snapshotVersion,
      platform: file === "other.json" ? "其他" : file.replace(".json", ""),
      products: [...bucket.products.values()],
      rows: compactRows,
    });
    publicTotal += compactRows.length;
    console.log(`  ${file}: ${compactRows.length} 条公开报价 / ${bucket.products.size} 商品`);
  }

  const metadata = {
    snapshotVersion,
    sourceUrl: `${API_BASE}${API_PATH}`,
    fetchedAt: collectedAt,
    generatedAt: nowIso(),
    total: publicTotal,
    products: products.length,
    merchants: merchants.length,
    declaredTotal: grandTotalDeclared,
    excludedRows: normalizedOffers.length - deduped.filter((o) => o.is_public).length,
    platforms: platformStats,
    source: "priceai.cc public API (build-time snapshot)",
    exclusionNote: "高风险接码/KYC 类目不进入公开快照；账号/共享/拼车等保留展示但显著标记风险等级。",
  };
  writeJson(join(STATIC_SNAPSHOT_DIR, "metadata.json"), metadata);

  // ---------- 完整性报告 ----------
  console.log("\n▶ 完整性报告...");
  const excluded = deduped.filter((o) => !o.is_public);
  writeJson(join(REPORTS_DIR, "excluded.json"), {
    snapshotVersion, generatedAt: nowIso(), count: excluded.length, items: excluded.map((o) => ({
      id: o.id, title: o.title, merchant: o.merchant_name, reason: o.exclude_reason, risk_level: o.risk_level,
    })),
  });

  const hasPrice = deduped.filter((o) => o.price !== null).length;
  const hasStock = deduped.filter((o) => o.stock_count !== "unknown").length;
  const hasUpdatedAt = deduped.filter((o) => o.source_updated_at !== null).length;
  const hasPurchaseUrl = deduped.filter((o) => o.purchase_url !== null).length;

  const perPlatform = {};
  for (const o of deduped) {
    if (!perPlatform[o.platform]) perPlatform[o.platform] = {
      total: 0, has_price: 0, has_stock: 0, has_updated_at: 0, has_purchase_url: 0,
      in_stock: 0, out_of_stock: 0, unknown_stock: 0, risk_low: 0, risk_medium: 0, risk_high: 0, excluded: 0,
    };
    const p = perPlatform[o.platform];
    p.total += 1;
    if (o.price !== null) p.has_price += 1;
    if (o.stock_count !== "unknown") p.has_stock += 1;
    if (o.source_updated_at !== null) p.has_updated_at += 1;
    if (o.purchase_url !== null) p.has_purchase_url += 1;
    if (o.stock_status === "in_stock" || o.stock_status === "low_stock") p.in_stock += 1;
    else if (o.stock_status === "out_of_stock") p.out_of_stock += 1;
    else p.unknown_stock += 1;
    if (o.risk_level === "low") p.risk_low += 1;
    else if (o.risk_level === "medium") p.risk_medium += 1;
    else p.risk_high += 1;
    if (!o.is_public) p.excluded += 1;
  }

  const perProduct = {};
  for (const o of deduped) {
    if (!perProduct[o.product_id]) perProduct[o.product_id] = {
      product_name: o.product_name, platform: o.platform, total: 0, min_price: null, has_stock: 0,
    };
    const p = perProduct[o.product_id];
    p.total += 1;
    if (o.price !== null && (p.min_price === null || o.price < p.min_price)) p.min_price = o.price;
    if (o.stock_status === "in_stock" || o.stock_status === "low_stock") p.has_stock += 1;
  }

  const missingFields = {
    price: deduped.length - hasPrice,
    stock_count: deduped.length - hasStock,
    source_updated_at: deduped.length - hasUpdatedAt,
    purchase_url: deduped.length - hasPurchaseUrl,
  };

  const completeness = {
    snapshotVersion,
    generatedAt: nowIso(),
    fetchedAt: collectedAt,
    source_url: `${API_BASE}${API_PATH}`,
    declared_total: grandTotalDeclared,
    fetched_total: grandTotalFetched,
    success_count: grandTotalFetched,
    failure_count: failures.length,
    before_dedup: normalizedOffers.length,
    after_dedup: deduped.length,
    public_count: deduped.filter((o) => o.is_public).length,
    excluded_count: excluded.length,
    platform_count: Object.keys(perPlatform).length,
    product_count: products.length,
    merchant_count: merchants.length,
    has_price_count: hasPrice,
    has_stock_count: hasStock,
    has_updated_at_count: hasUpdatedAt,
    has_purchase_url_count: hasPurchaseUrl,
    missing_fields: missingFields,
    per_platform: perPlatform,
    per_product: perProduct,
    failures,
    excluded_sample: excluded.slice(0, 50),
    completeness_note:
      grandTotalFetched >= grandTotalDeclared
        ? "全部平台抓取数量与接口声明一致。"
        : `接口声明 ${grandTotalDeclared}，实际抓取 ${grandTotalFetched}，差异来自失败请求（见 failures）。`,
  };
  writeJson(join(REPORTS_DIR, "completeness-report.json"), completeness);

  // markdown 报告
  const md = renderCompletenessMd(completeness);
  writeFileSync(join(REPORTS_DIR, "completeness-report.md"), md, "utf8");

  console.log(`\n✓ 完成。版本 ${snapshotVersion}`);
  console.log(`  声明 ${grandTotalDeclared} / 抓取 ${grandTotalFetched} / 去重后 ${deduped.length} / 公开 ${publicTotal} / 排除 ${excluded.length}`);
  console.log(`  失败 ${failures.length}`);
  if (failures.length) {
    console.log("  失败明细见 data/raw/" + snapshotVersion + "/failures.json");
  }
}

function renderCompletenessMd(c) {
  const lines = [];
  lines.push("# 静态快照完整性报告");
  lines.push("");
  lines.push(`- 快照版本：\`${c.snapshotVersion}\``);
  lines.push(`- 抓取时间：${c.fetchedAt}`);
  lines.push(`- 数据来源：${c.source_url}`);
  lines.push(`- 生成时间：${c.generatedAt}`);
  lines.push("");
  lines.push("## 总量");
  lines.push("");
  lines.push("| 指标 | 数值 |");
  lines.push("| --- | --- |");
  lines.push(`| 接口声明总量 | ${c.declared_total} |`);
  lines.push(`| 实际抓取总量 | ${c.fetched_total} |`);
  lines.push(`| 抓取成功数量 | ${c.success_count} |`);
  lines.push(`| 抓取失败数量 | ${c.failure_count} |`);
  lines.push(`| 去重前数量 | ${c.before_dedup} |`);
  lines.push(`| 去重后数量 | ${c.after_dedup} |`);
  lines.push(`| 公开展示数量 | ${c.public_count} |`);
  lines.push(`| 被排除数量 | ${c.excluded_count} |`);
  lines.push(`| 平台数量 | ${c.platform_count} |`);
  lines.push(`| 标准商品数量 | ${c.product_count} |`);
  lines.push(`| 商家数量 | ${c.merchant_count} |`);
  lines.push(`| 有价格数量 | ${c.has_price_count} |`);
  lines.push(`| 有库存数量 | ${c.has_stock_count} |`);
  lines.push(`| 有更新时间数量 | ${c.has_updated_at_count} |`);
  lines.push(`| 有购买链接数量 | ${c.has_purchase_url_count} |`);
  lines.push("");
  lines.push("> " + c.completeness_note);
  lines.push("");
  lines.push("## 缺失字段统计");
  lines.push("");
  lines.push("| 字段 | 缺失数量 |");
  lines.push("| --- | --- |");
  for (const [k, v] of Object.entries(c.missing_fields)) lines.push(`| ${k} | ${v} |`);
  lines.push("");
  lines.push("## 每个平台明细");
  lines.push("");
  lines.push("| 平台 | 总量 | 有价格 | 有库存 | 有更新时间 | 有购买链接 | 有货 | 缺货 | 未知库存 | 风险低 | 风险中 | 风险高 | 排除 |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const [platform, p] of Object.entries(c.per_platform)) {
    lines.push(`| ${platform} | ${p.total} | ${p.has_price} | ${p.has_stock} | ${p.has_updated_at} | ${p.has_purchase_url} | ${p.in_stock} | ${p.out_of_stock} | ${p.unknown_stock} | ${p.risk_low} | ${p.risk_medium} | ${p.risk_high} | ${p.excluded} |`);
  }
  lines.push("");
  lines.push("## 每个标准商品明细（前 40）");
  lines.push("");
  lines.push("| 商品 | 平台 | 报价数 | 最低价 | 有货数 |");
  lines.push("| --- | --- | --- | --- | --- |");
  const products = Object.entries(c.per_product).slice(0, 40);
  for (const [id, p] of products) {
    lines.push(`| ${p.product_name} | ${p.platform} | ${p.total} | ${p.min_price ?? "—"} | ${p.has_stock} |`);
  }
  lines.push("");
  if (c.failures.length) {
    lines.push("## 失败 URL 列表");
    lines.push("");
    for (const f of c.failures) lines.push(`- \`${f.url}\` — ${f.reason}`);
    lines.push("");
  }
  lines.push("## 排除数据列表（前 50）");
  lines.push("");
  if (!c.excluded_sample.length) {
    lines.push("（无排除项）");
  } else {
    lines.push("| ID | 标题 | 商家 | 原因 | 风险 |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const e of c.excluded_sample) lines.push(`| ${e.id} | ${String(e.title).slice(0, 60)} | ${e.merchant || "—"} | ${e.reason} | ${e.risk_level} |`);
  }
  lines.push("");
  lines.push("> 完整排除清单见 `data/reports/excluded.json`。");
  lines.push("");
  return lines.join("\n");
}

main().catch((error) => {
  console.error("✗ 快照导出失败：", error);
  process.exit(1);
});
