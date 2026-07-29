"use client";

import {
  AlertTriangle, ChevronDown, ExternalLink, Filter, Search, ShieldCheck, ShieldAlert, ShieldQuestion,
} from "lucide-react";
import { useMemo, useState } from "react";
import { BrandIcon } from "@/components/BrandIcon";
import { SiteHeader } from "@/components/SiteHeader";
import meta from "@data/static-snapshot/metadata.json";
import chatgpt from "@data/static-snapshot/chatgpt.json";
import claude from "@data/static-snapshot/claude.json";
import gemini from "@data/static-snapshot/gemini.json";
import grok from "@data/static-snapshot/grok.json";
import other from "@data/static-snapshot/other.json";

type StaticProduct = {
  id: string;
  slug: string;
  displayName: string;
  platform: string;
  productType: string;
  spec: string;
  summary: string;
  aliases: string[];
};
type StaticOffer = {
  id: string;
  sourceId: string;
  sourceName: string;
  sourceStoreName: string;
  sourceTitle: string;
  price: number | null;
  currency: string;
  status: string;
  url: string | null;
  stockCount: number | null;
  capturedAt: string | null;
  sourceUpdatedAt: string | null;
  lastSeenAt: string | null;
  warranty: string;
  delivery_type: string;
  account_ownership: string;
  risk_level: string;
  confidence_score: number;
};
type StaticPart = { products: StaticProduct[]; rows: { offer: StaticOffer; product: StaticProduct }[] };
type Metadata = {
  snapshotVersion: string;
  sourceUrl: string;
  fetchedAt: string;
  generatedAt: string;
  total: number;
  products: number;
  merchants: number;
  declaredTotal: number;
  excludedRows: number;
  source: string;
  exclusionNote: string;
};

const parts: StaticPart[] = [
  chatgpt as unknown as StaticPart,
  claude as unknown as StaticPart,
  gemini as unknown as StaticPart,
  grok as unknown as StaticPart,
  other as unknown as StaticPart,
];
const metadata = meta as unknown as Metadata;

const allProducts = [...new Map(parts.flatMap((p) => p.products).map((p) => [p.id, p])).values()];
const allRows = parts.flatMap((p) => p.rows);

type Platform = "全部" | "ChatGPT" | "Claude" | "Gemini" | "Grok" | "其他";
const platformMenu: Platform[] = ["全部", "ChatGPT", "Claude", "Gemini", "Grok", "其他"];

type SortKey = "default" | "price_asc" | "price_desc" | "updated_desc" | "channels_desc";
type StockFilter = "all" | "in_stock" | "out_of_stock";
type RiskFilter = "all" | "low" | "medium" | "high";
type OwnershipFilter = "all" | "official" | "third_party" | "shared" | "unknown";
type DeliveryFilter = "all" | "recharge" | "account" | "cdk" | "link";
type BillingFilter = "all" | "monthly" | "annual";

function isAvailable(status: string): boolean {
  return status === "in_stock" || status === "low_stock";
}

function statusLabel(status: string): string {
  if (status === "in_stock") return "有货";
  if (status === "low_stock") return "低库存";
  if (status === "out_of_stock") return "缺货";
  return "未知";
}

function statusTone(status: string): string {
  if (status === "in_stock") return "bg-[#e8f6ed] text-[#28764b]";
  if (status === "low_stock") return "bg-[#fff4de] text-[#9a681d]";
  if (status === "out_of_stock") return "bg-[#fdebec] text-[#b34646]";
  return "bg-[#eef1f0] text-[#6b7773]";
}

function riskLabel(level: string): string {
  if (level === "low") return "低风险";
  if (level === "medium") return "中风险";
  if (level === "high") return "高风险";
  return "未知";
}

function riskTone(level: string): string {
  if (level === "low") return "bg-[#e8f6ed] text-[#28764b]";
  if (level === "medium") return "bg-[#fff4de] text-[#9a681d]";
  if (level === "high") return "bg-[#fdebec] text-[#b34646]";
  return "bg-[#eef1f0] text-[#6b7773]";
}

function RiskIcon({ level, className = "h-3.5 w-3.5" }: { level: string; className?: string }) {
  if (level === "low") return <ShieldCheck className={className} aria-hidden="true" />;
  if (level === "high") return <ShieldAlert className={className} aria-hidden="true" />;
  return <ShieldQuestion className={className} aria-hidden="true" />;
}

function formatPrice(value: number | null | undefined, currency = "CNY"): string {
  if (value === null || value === undefined) return "暂无价格";
  const prefix = currency === "CNY" ? "¥" : `${currency} `;
  return `${prefix}${value.toFixed(value % 1 === 0 ? 0 : 2)}`;
}

function formatUpdated(value: string | null | undefined): string {
  if (!value) return "未记录";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "未记录";
  const now = Date.now();
  const diffMs = now - date.getTime();
  if (diffMs < 60_000) return "刚刚";
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)} 分钟前`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)} 小时前`;
  return `${date.getMonth() + 1}/${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:00`;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "未记录";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "未记录";
  return date.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

function offerUpdatedAt(offer: StaticOffer): string {
  return offer.sourceUpdatedAt || offer.capturedAt || offer.lastSeenAt || "";
}

function offerStore(offer: StaticOffer): string {
  return offer.sourceStoreName || offer.sourceName || "未记录渠道";
}

function offerTitle(offer: StaticOffer): string {
  return offer.sourceTitle || "未记录商品名称";
}

function deliveryLabel(t: string): string {
  if (t === "recharge") return "充值/代充";
  if (t === "account") return "账号交付";
  if (t === "cdk") return "卡密/CDK";
  if (t === "link") return "链接/自助";
  return "未知";
}

function ownershipLabel(o: string): string {
  if (o === "official") return "官方";
  if (o === "third_party") return "第三方";
  if (o === "shared") return "共享/拼车";
  return "未知";
}

function detectBilling(offer: StaticOffer): BillingFilter {
  const t = offer.sourceTitle.toLowerCase();
  if (/(年卡|12个月|一年|12 月|annual)/.test(t)) return "annual";
  if (/(月卡|一个月|月付|monthly|1个月)/.test(t)) return "monthly";
  return "monthly"; // 默认按月付
}

type Grouped = {
  product: StaticProduct;
  offers: StaticOffer[];
  availableCount: number;
  outOfStockCount: number;
  lowestOffer: StaticOffer;
  lowestAvailableOffer: StaticOffer | null;
  updatedAt: string;
  minRiskLevel: string;
};

function riskRank(level: string): number {
  if (level === "high") return 3;
  if (level === "medium") return 2;
  if (level === "low") return 1;
  return 0;
}

export function StaticChannelExplorer({ initialPlatform = "全部" }: { initialPlatform?: string }) {
  const [platform, setPlatform] = useState<Platform>(() =>
    platformMenu.includes(initialPlatform as Platform) ? (initialPlatform as Platform) : "全部",
  );
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("default");
  const [stock, setStock] = useState<StockFilter>("all");
  const [risk, setRisk] = useState<RiskFilter>("all");
  const [ownership, setOwnership] = useState<OwnershipFilter>("all");
  const [delivery, setDelivery] = useState<DeliveryFilter>("all");
  const [billing, setBilling] = useState<BillingFilter>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const rows = useMemo<Grouped[]>(() => {
    const normalized = query.trim().toLowerCase();
    const groups = new Map<string, { product: StaticProduct; offers: StaticOffer[] }>();

    for (const { product, offer } of allRows) {
      if (platform !== "全部") {
        // “其他”菜单对应 other.json 里所有平台（邮箱/接码/API-CDK/其他）
        if (platform === "其他") {
          if (!["邮箱", "接码", "API/CDK", "其他"].includes(product.platform)) continue;
        } else if (product.platform !== platform) continue;
      }
      if (normalized) {
        const hay = `${product.displayName} ${product.platform} ${product.productType} ${product.spec} ${product.aliases.join(" ")} ${offerStore(offer)} ${offer.sourceName} ${offerTitle(offer)}`.toLowerCase();
        if (!hay.includes(normalized)) continue;
      }
      if (stock === "in_stock" && !isAvailable(offer.status)) continue;
      if (stock === "out_of_stock" && isAvailable(offer.status)) continue;
      if (risk !== "all" && offer.risk_level !== risk) continue;
      if (ownership !== "all" && offer.account_ownership !== ownership) continue;
      if (delivery !== "all" && offer.delivery_type !== delivery) continue;
      if (billing !== "all" && detectBilling(offer) !== billing) continue;

      const current = groups.get(product.id);
      if (current) current.offers.push(offer);
      else groups.set(product.id, { product, offers: [offer] });
    }

    const sortByPrice = (a: StaticOffer, b: StaticOffer) =>
      (a.price ?? Number.POSITIVE_INFINITY) - (b.price ?? Number.POSITIVE_INFINITY);

    const grouped = [...groups.values()].map(({ product, offers }) => {
      const available = offers.filter((o) => isAvailable(o.status));
      const lowestOffer = [...offers].sort(sortByPrice)[0];
      const lowestAvailableOffer = [...available].sort(sortByPrice)[0] || null;
      const updatedAt = offers.map(offerUpdatedAt).sort().at(-1) || "";
      const minRiskLevel = offers.reduce((acc, o) => (riskRank(o.risk_level) > riskRank(acc) ? o.risk_level : acc), "low");
      return {
        product,
        offers,
        availableCount: available.length,
        outOfStockCount: offers.length - available.length,
        lowestOffer,
        lowestAvailableOffer,
        updatedAt,
        minRiskLevel,
      };
    });

    grouped.sort((a, b) => {
      if (sort === "price_asc") {
        return (a.lowestAvailableOffer?.price ?? a.lowestOffer.price ?? Infinity) - (b.lowestAvailableOffer?.price ?? b.lowestOffer.price ?? Infinity);
      }
      if (sort === "price_desc") {
        return (b.lowestAvailableOffer?.price ?? b.lowestOffer.price ?? -Infinity) - (a.lowestAvailableOffer?.price ?? a.lowestOffer.price ?? -Infinity);
      }
      if (sort === "updated_desc") {
        return (b.updatedAt || "").localeCompare(a.updatedAt || "");
      }
      if (sort === "channels_desc") {
        return b.offers.length - a.offers.length;
      }
      // default: 有货优先 → 最低价升序
      const sa = Number(a.availableCount > 0);
      const sb = Number(b.availableCount > 0);
      if (sb !== sa) return sb - sa;
      return (a.lowestAvailableOffer?.price ?? a.lowestOffer.price ?? Infinity) - (b.lowestAvailableOffer?.price ?? b.lowestOffer.price ?? Infinity);
    });

    return grouped;
  }, [platform, query, sort, stock, risk, ownership, delivery, billing]);

  function changePlatform(next: Platform) {
    setPlatform(next);
    setExpanded(null);
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (next === "全部") params.delete("platform");
      else params.set("platform", next);
      window.history.replaceState(null, "", `${window.location.pathname}${params.toString() ? `?${params}` : ""}`);
    }
  }

  const activeFilters = [stock !== "all", risk !== "all", ownership !== "all", delivery !== "all", billing !== "all"].filter(Boolean).length;

  return (
    <div className="min-h-screen bg-[#f8faf9] text-[#202829]">
      <div className="sticky top-0 z-40 border-b border-[#dfe7e4] bg-[#f8faf9]/95 shadow-[0_10px_28px_rgba(35,58,48,0.05)] backdrop-blur-xl">
        <SiteHeader />
        <div className="mx-auto max-w-[1500px] px-5 pb-3 sm:px-8">
          <div className="flex flex-wrap items-center gap-2 py-1">
            {platformMenu.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => changePlatform(item)}
                className={`shrink-0 rounded-full px-5 py-2 text-sm transition ${
                  platform === item
                    ? "bg-[#dfe8ea] font-semibold text-[#34464a]"
                    : "bg-white text-[#687779] ring-1 ring-[#dfe7e4] hover:bg-[#edf5f0]"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-[1500px] px-5 py-7 sm:px-8 md:py-11">
        {/* 静态数据快照 banner */}
        <section className="mb-6 rounded-2xl border border-[#cfe0d6] bg-[#eef7f1] px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#28764b] px-3 py-1 text-xs font-bold text-white">
              <ShieldCheck size={13} aria-hidden="true" /> 静态数据快照
            </span>
            <span className="text-xs text-[#4a5c52]">非实时数据 · 构建前一次性提取 · 前端运行时不请求原站</span>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-3 lg:grid-cols-6">
            <div><dt className="text-[#7a8a7e]">快照版本</dt><dd className="mt-0.5 font-mono font-semibold text-[#1f3a2d]">{metadata.snapshotVersion}</dd></div>
            <div><dt className="text-[#7a8a7e]">抓取时间</dt><dd className="mt-0.5 font-semibold text-[#1f3a2d]">{formatDateTime(metadata.fetchedAt)}</dd></div>
            <div><dt className="text-[#7a8a7e]">公开数据总量</dt><dd className="mt-0.5 font-semibold text-[#1f3a2d]">{metadata.total.toLocaleString()} 条</dd></div>
            <div><dt className="text-[#7a8a7e]">标准商品</dt><dd className="mt-0.5 font-semibold text-[#1f3a2d]">{metadata.products} 个</dd></div>
            <div><dt className="text-[#7a8a7e]">商家</dt><dd className="mt-0.5 font-semibold text-[#1f3a2d]">{metadata.merchants} 个</dd></div>
            <div><dt className="text-[#7a8a7e]">数据来源</dt><dd className="mt-0.5 font-semibold text-[#1f3a2d]">原项目公开 API</dd></div>
          </dl>
          <p className="mt-2 text-[11px] leading-5 text-[#6b7a6f]">
            声明总量 {metadata.declaredTotal.toLocaleString()} 条；已排除高风险 {metadata.excludedRows.toLocaleString()} 条（{metadata.exclusionNote}）
          </p>
        </section>

        <section className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[#70827c]">Static snapshot · 原项目公开数据</p>
            <h1 className="font-serif text-3xl font-semibold tracking-tight text-[#18342b] md:text-5xl">
              {platform === "全部" ? "AI 订阅与渠道" : platform}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-[#60706a]">
              当前快照展示 {allRows.length.toLocaleString()} 条公开报价、{allProducts.length} 个标准商品。不执行页面实时采集。
            </p>
          </div>
          <div className="flex w-full max-w-[640px] flex-col gap-2">
            <label className="flex h-12 w-full items-center gap-3 rounded-2xl bg-white px-4 shadow-[0_16px_42px_rgba(35,58,48,0.07)] ring-1 ring-[#dfe7e4]">
              <Search size={18} className="text-[#698078]" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索标准商品、店铺或渠道"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#a0aca6]"
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowFilters((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold ring-1 transition ${
                  activeFilters || showFilters
                    ? "bg-[#2d3435] text-white ring-[#2d3435]"
                    : "bg-white text-[#526265] ring-[#dfe7e4] hover:bg-[#edf5f0]"
                }`}
              >
                <Filter size={13} aria-hidden="true" /> 筛选{activeFilters ? ` · ${activeFilters}` : ""}
              </button>
              <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="rounded-full bg-white px-3.5 py-2 text-xs font-semibold text-[#526265] ring-1 ring-[#dfe7e4] outline-none">
                <option value="default">默认排序（有货优先）</option>
                <option value="price_asc">价格升序</option>
                <option value="price_desc">价格降序</option>
                <option value="updated_desc">最近更新</option>
                <option value="channels_desc">渠道数量</option>
              </select>
            </div>
            {showFilters ? (
              <div className="grid grid-cols-2 gap-2 rounded-2xl bg-white p-3 ring-1 ring-[#dfe7e4] sm:grid-cols-3 lg:grid-cols-5">
                <FilterSelect label="库存" value={stock} onChange={(v) => setStock(v as StockFilter)} options={[["all", "全部"], ["in_stock", "有货"], ["out_of_stock", "缺货"]]} />
                <FilterSelect label="风险" value={risk} onChange={(v) => setRisk(v as RiskFilter)} options={[["all", "全部"], ["low", "低"], ["medium", "中"], ["high", "高"]]} />
                <FilterSelect label="归属" value={ownership} onChange={(v) => setOwnership(v as OwnershipFilter)} options={[["all", "全部"], ["official", "官方"], ["third_party", "第三方"], ["shared", "共享/拼车"], ["unknown", "未知"]]} />
                <FilterSelect label="交付" value={delivery} onChange={(v) => setDelivery(v as DeliveryFilter)} options={[["all", "全部"], ["recharge", "充值/代充"], ["account", "账号"], ["cdk", "卡密/CDK"], ["link", "链接/自助"]]} />
                <FilterSelect label="周期" value={billing} onChange={(v) => setBilling(v as BillingFilter)} options={[["all", "全部"], ["monthly", "月付"], ["annual", "年付"]]} />
              </div>
            ) : null}
          </div>
        </section>

        <section className="mt-8 overflow-hidden rounded-3xl bg-white shadow-[0_18px_60px_rgba(35,58,48,0.06)] ring-1 ring-[#dfe7e4]">
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[1200px] text-left text-sm">
              <thead className="bg-[#f1f4f4] text-xs font-semibold text-[#526265]">
                <tr>
                  <th className="px-5 py-5">标准商品</th>
                  <th className="px-5 py-5">平台</th>
                  <th className="px-5 py-5">类型</th>
                  <th className="px-5 py-5">最低价</th>
                  <th className="px-5 py-5">库存</th>
                  <th className="px-5 py-5">渠道数量</th>
                  <th className="px-5 py-5">最低渠道</th>
                  <th className="px-5 py-5">最近更新</th>
                  <th className="px-5 py-5">风险等级</th>
                  <th className="px-5 py-5">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf1ee]">
                {rows.map((row) => {
                  const lowest = row.lowestAvailableOffer || row.lowestOffer;
                  const isExpanded = expanded === row.product.id;
                  return (
                    <tr key={row.product.id} className="align-middle hover:bg-[#fbfdfb]">
                      <td className="px-5 py-5">
                        <div className="flex items-center gap-3">
                          <BrandIcon platform={row.product.platform} productId={row.product.id} className="h-10 w-10 rounded-full bg-[#f2f4f4] p-2" />
                          <div>
                            <p className="font-semibold text-[#202b2d]">{row.product.displayName}</p>
                            <p className="mt-1 text-xs text-[#75847d]">{row.product.spec || row.product.productType}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-5 text-[#46585d]">{row.product.platform}</td>
                      <td className="px-5 py-5 text-[#687779]">{row.product.productType}</td>
                      <td className="px-5 py-5">
                        <p className="text-xl font-semibold text-[#202b2d]">{row.lowestAvailableOffer ? formatPrice(lowest.price, lowest.currency) : "暂无价格"}</p>
                        <span className={`mt-1 inline-flex rounded-full px-2 py-1 text-xs font-semibold ${statusTone(lowest.status)}`}>{statusLabel(lowest.status)}</span>
                      </td>
                      <td className="px-5 py-5">
                        <div className="flex gap-2 text-xs">
                          <span className="rounded-full bg-[#e8f6ed] px-3 py-2 text-[#28764b]">有货 {row.availableCount}</span>
                          <span className="rounded-full bg-[#fdebec] px-3 py-2 text-[#b34646]">缺货 {row.outOfStockCount}</span>
                        </div>
                      </td>
                      <td className="px-5 py-5 text-lg text-[#374b50]">{row.offers.length}</td>
                      <td className="max-w-[220px] px-5 py-5">
                        <p className="truncate font-medium text-[#29383b]">{offerStore(lowest)}</p>
                        <p className="mt-1 truncate text-xs text-[#7a8982]">{offerTitle(lowest)}</p>
                      </td>
                      <td className="whitespace-nowrap px-5 py-5 text-[#526265]">{formatUpdated(row.updatedAt)}</td>
                      <td className="px-5 py-5">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${riskTone(row.minRiskLevel)}`}>
                          <RiskIcon level={row.minRiskLevel} /> {riskLabel(row.minRiskLevel)}
                        </span>
                      </td>
                      <td className="px-5 py-5">
                        <button
                          type="button"
                          onClick={() => setExpanded(isExpanded ? null : row.product.id)}
                          className="inline-flex items-center gap-2 rounded-full bg-[#293538] px-4 py-3 font-semibold text-white transition hover:bg-[#1d2729]"
                        >
                          查看 <ChevronDown size={15} className={isExpanded ? "rotate-180" : ""} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 ? (
                  <tr><td colSpan={10} className="px-5 py-10 text-center text-sm text-[#7a8982]">没有符合当前筛选条件的报价。</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 p-4 md:hidden">
            {rows.map((row) => {
              const lowest = row.lowestAvailableOffer || row.lowestOffer;
              const isExpanded = expanded === row.product.id;
              return (
                <article key={row.product.id} className="rounded-2xl bg-[#fbfdfb] p-4 ring-1 ring-[#e2eae5]">
                  <div className="flex items-start gap-3">
                    <BrandIcon platform={row.product.platform} productId={row.product.id} className="h-10 w-10 rounded-full bg-[#f2f4f4] p-2" />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-[#202b2d]">{row.product.displayName}</p>
                      <p className="mt-1 text-xs text-[#75847d]">{row.product.platform} · {row.product.productType}</p>
                    </div>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold ${riskTone(row.minRiskLevel)}`}>
                      <RiskIcon level={row.minRiskLevel} className="h-3 w-3" /> {riskLabel(row.minRiskLevel)}
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-xl bg-white p-3">
                      <p className="text-[#82908b]">最低价</p>
                      <p className="mt-1 text-lg font-semibold">{row.lowestAvailableOffer ? formatPrice(lowest.price, lowest.currency) : "暂无价格"}</p>
                    </div>
                    <div className="rounded-xl bg-white p-3">
                      <p className="text-[#82908b]">渠道 / 库存</p>
                      <p className="mt-1 font-semibold">{row.offers.length} / 有货 {row.availableCount}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setExpanded(isExpanded ? null : row.product.id)}
                    className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#293538] px-4 py-2.5 text-sm font-semibold text-white"
                  >
                    {isExpanded ? "收起渠道" : `展开 ${row.offers.length} 个渠道`} <ChevronDown size={14} className={isExpanded ? "rotate-180" : ""} />
                  </button>
                  {isExpanded ? <OfferList offers={row.offers} /> : null}
                </article>
              );
            })}
            {rows.length === 0 ? <p className="px-5 py-10 text-center text-sm text-[#7a8982]">没有符合当前筛选条件的报价。</p> : null}
          </div>
        </section>

        {expanded ? (
          <section className="mt-4 hidden rounded-3xl bg-white p-5 ring-1 ring-[#dfe7e4] md:block">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#71817a]">渠道详情</p>
            <h2 className="mt-1 text-xl font-semibold text-[#18342b]">
              {rows.find((r) => r.product.id === expanded)?.product.displayName}
            </h2>
            <OfferList offers={rows.find((r) => r.product.id === expanded)?.offers || []} />
          </section>
        ) : null}

        <footer className="mt-8 rounded-2xl bg-[#eef5f0] px-5 py-4 text-xs leading-6 text-[#60706a]">
          本页面为公开数据整理与比较工具，不代表任何商家或渠道背书。价格、库存、资质、交付和售后政策请以原始页面为准。
          <br />
          静态快照抓取时间：{formatDateTime(metadata.fetchedAt)}；数据来源：原项目公开 API（{metadata.sourceUrl}）。
          涉及账号、共享、接码、KYC 等高风险内容已标记风险等级，请遵守服务条款和当地法律。
        </footer>
      </main>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <label className="flex flex-col gap-1 text-[11px] font-semibold text-[#7a8982]">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded-lg bg-[#f8faf9] px-2.5 py-1.5 text-xs font-semibold text-[#34464a] ring-1 ring-[#dfe7e4] outline-none">
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
    </label>
  );
}

function OfferList({ offers }: { offers: StaticOffer[] }) {
  const sorted = [...offers].sort((a, b) => {
    const sa = isAvailable(a.status) ? 0 : 1;
    const sb = isAvailable(b.status) ? 0 : 1;
    if (sa !== sb) return sa - sb;
    return (a.price ?? Number.POSITIVE_INFINITY) - (b.price ?? Number.POSITIVE_INFINITY);
  });

  return (
    <div className="mt-4 divide-y divide-[#edf1ee] rounded-2xl bg-[#fbfdfb] ring-1 ring-[#e2eae5]">
      {sorted.map((offer) => (
        <div key={offer.id} className="px-4 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-[#263638]">{offerStore(offer)}</p>
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${riskTone(offer.risk_level)}`}>
                  <RiskIcon level={offer.risk_level} className="h-3 w-3" /> {riskLabel(offer.risk_level)}
                </span>
                {offer.risk_level === "high" ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#fff4de] px-2 py-0.5 text-[10px] font-semibold text-[#9a681d]">
                    <AlertTriangle size={11} aria-hidden="true" /> 高风险商品，注意服务条款
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-xs text-[#71817a]">{offerTitle(offer)}</p>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-[#6b7773] sm:grid-cols-3 lg:grid-cols-4">
                <Detail label="原始标题" value={offer.sourceTitle} />
                <Detail label="数据来源" value={offer.sourceName} />
                <Detail label="商家名称" value={offer.sourceStoreName || "—"} />
                <Detail label="平台" value={offer.sourceName} />
                <Detail label="价格" value={formatPrice(offer.price, offer.currency)} />
                <Detail label="币种" value={offer.currency} />
                <Detail label="库存状态" value={statusLabel(offer.status)} />
                <Detail label="库存数量" value={offer.stockCount === null ? "未记录" : String(offer.stockCount)} />
                <Detail label="质保信息" value={offer.warranty === "unknown" ? "未获取" : offer.warranty} />
                <Detail label="交付方式" value={deliveryLabel(offer.delivery_type)} />
                <Detail label="账号归属" value={ownershipLabel(offer.account_ownership)} />
                <Detail label="数据可信度" value={`${Math.round(offer.confidence_score * 100)}%`} />
                <Detail label="抓取时间" value={formatDateTime(offer.capturedAt)} />
                <Detail label="最后更新时间" value={formatDateTime(offer.sourceUpdatedAt)} />
              </dl>
            </div>
            <div className="flex flex-col items-end gap-2">
              <span className="font-semibold text-[#263638]">{formatPrice(offer.price, offer.currency)}</span>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone(offer.status)}`}>{statusLabel(offer.status)}</span>
              {offer.url ? (
                <a
                  href={offer.url}
                  target="_blank"
                  rel="noreferrer nofollow"
                  className="inline-flex items-center gap-1 rounded-full bg-[#eaf5ed] px-3 py-2 text-xs font-semibold text-[#28764b] hover:bg-[#d8eede]"
                >
                  原始来源 <ExternalLink size={12} />
                </a>
              ) : null}
            </div>
          </div>
          <p className="mt-2 text-[10px] leading-4 text-[#9aa69f]">
            免责声明：本数据为静态快照，价格、库存、资质、交付和售后以原始页面为准。本工具不构成购买建议，不背书任何渠道。
          </p>
        </div>
      ))}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[#9aa69f]">{label}</dt>
      <dd className="mt-0.5 font-medium text-[#3a4849] break-words">{value}</dd>
    </div>
  );
}
