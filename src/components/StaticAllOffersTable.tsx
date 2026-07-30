"use client";

import { Download, ExternalLink, Filter, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { BrandIcon } from "@/components/BrandIcon";
import { SiteHeader } from "@/components/SiteHeader";
import allOffersData from "@data/static-snapshot/all-offers.json";
import meta from "@data/static-snapshot/metadata.json";

type Offer = {
  id: string;
  platform: string;
  product_id: string;
  product_name: string;
  product_type: string;
  product_spec: string;
  merchant_name: string;
  source_name: string;
  source_id: string;
  title: string;
  price: number | null;
  currency: string;
  stock_status: string;
  stock_count: number | string;
  warranty: string;
  delivery_type: string;
  account_ownership: string;
  risk_level: string;
  purchase_url: string | null;
  source_url: string;
  source_updated_at: string | null;
  collected_at: string;
  confidence_score: number;
  is_public: boolean;
};

type Snapshot = {
  snapshotVersion: string;
  sourceUrl: string;
  fetchedAt: string;
  generatedAt: string;
  count: number;
  offers: Offer[];
};

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

const snapshot = allOffersData as unknown as Snapshot;
const metadata = meta as unknown as Metadata;
const offers = snapshot.offers;

type Platform = "全部" | "ChatGPT" | "Claude" | "Gemini" | "Grok" | "邮箱" | "接码" | "其他";
const platformMenu: Platform[] = ["全部", "ChatGPT", "Claude", "Gemini", "Grok", "邮箱", "接码", "其他"];

type SortKey = "default" | "price_asc" | "price_desc" | "updated_desc" | "updated_asc" | "merchant";
type StockFilter = "all" | "in_stock" | "out_of_stock";
type RiskFilter = "all" | "low" | "medium" | "high";
type DeliveryFilter = "all" | "recharge" | "account" | "cdk" | "link";
type OwnershipFilter = "all" | "official" | "third_party" | "shared" | "unknown";

const PAGE_SIZE_OPTIONS = [50, 100, 200, 500];

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
  if (status === "in_stock") return "bg-[#e6f0e9] text-[#2d7a5f]";
  if (status === "low_stock") return "bg-[#fff4de] text-[#9a681d]";
  if (status === "out_of_stock") return "bg-[#fdebec] text-[#b34646]";
  return "bg-[#f0e2d2] text-[#7a6a5c]";
}
function riskLabel(level: string): string {
  if (level === "low") return "低";
  if (level === "medium") return "中";
  if (level === "high") return "高";
  return "未知";
}
function riskTone(level: string): string {
  if (level === "low") return "bg-[#e6f0e9] text-[#2d7a5f]";
  if (level === "medium") return "bg-[#fff4de] text-[#9a681d]";
  if (level === "high") return "bg-[#fdebec] text-[#b34646]";
  return "bg-[#f0e2d2] text-[#7a6a5c]";
}
function formatPrice(value: number | null, currency = "CNY"): string {
  if (value === null) return "—";
  const prefix = currency === "CNY" ? "¥" : `${currency} `;
  return `${prefix}${value.toFixed(value % 1 === 0 ? 0 : 2)}`;
}
function formatUpdated(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "—";
  return date.toISOString().replace("T", " ").slice(0, 16) + " UTC";
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
function escapeCsv(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function downloadCsv(rows: Offer[]) {
  const headers = [
    "id", "platform", "product_name", "product_type", "product_spec",
    "title", "merchant_name", "source_name", "price", "currency",
    "stock_status", "stock_count", "warranty", "delivery_type",
    "account_ownership", "purchase_url", "source_updated_at", "collected_at",
  ];
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push([
      r.id, r.platform, r.product_name, r.product_type, r.product_spec,
      r.title, r.merchant_name, r.source_name, r.price ?? "", r.currency,
      r.stock_status, r.stock_count === "unknown" ? "" : String(r.stock_count),
      r.warranty === "unknown" ? "" : r.warranty, r.delivery_type,
      r.account_ownership, r.purchase_url ?? "", r.source_updated_at ?? "",
      r.collected_at,
    ].map(escapeCsv).join(","));
  }
  const blob = new Blob([`\uFEFF${lines.join("\n")}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `priceai-all-offers-${snapshot.snapshotVersion}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function StaticAllOffersTable({ initialPlatform = "全部" }: { initialPlatform?: string }) {
  const [platform, setPlatform] = useState<Platform>(() =>
    platformMenu.includes(initialPlatform as Platform) ? (initialPlatform as Platform) : "全部",
  );
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("default");
  const [stock, setStock] = useState<StockFilter>("all");
  const [risk, setRisk] = useState<RiskFilter>("all");
  const [delivery, setDelivery] = useState<DeliveryFilter>("all");
  const [ownership, setOwnership] = useState<OwnershipFilter>("all");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(100);
  const [showFilters, setShowFilters] = useState(false);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const list = offers.filter((o) => {
      if (platform !== "全部" && o.platform !== platform) return false;
      if (normalized) {
        const hay = `${o.product_name} ${o.platform} ${o.product_type} ${o.product_spec} ${o.merchant_name} ${o.source_name} ${o.title}`.toLowerCase();
        if (!hay.includes(normalized)) return false;
      }
      if (stock === "in_stock" && !isAvailable(o.stock_status)) return false;
      if (stock === "out_of_stock" && isAvailable(o.stock_status)) return false;
      if (risk !== "all" && o.risk_level !== risk) return false;
      if (delivery !== "all" && o.delivery_type !== delivery) return false;
      if (ownership !== "all" && o.account_ownership !== ownership) return false;
      return true;
    });

    list.sort((a, b) => {
      if (sort === "price_asc") return (a.price ?? Number.POSITIVE_INFINITY) - (b.price ?? Number.POSITIVE_INFINITY);
      if (sort === "price_desc") return (b.price ?? -Infinity) - (a.price ?? -Infinity);
      if (sort === "updated_desc") return (b.source_updated_at || "").localeCompare(a.source_updated_at || "");
      if (sort === "updated_asc") return (a.source_updated_at || "").localeCompare(b.source_updated_at || "");
      if (sort === "merchant") return a.merchant_name.localeCompare(b.merchant_name, "zh-CN");
      if (a.platform !== b.platform) return a.platform.localeCompare(b.platform, "zh-CN");
      if (a.product_name !== b.product_name) return a.product_name.localeCompare(b.product_name, "zh-CN");
      return (a.price ?? Number.POSITIVE_INFINITY) - (b.price ?? Number.POSITIVE_INFINITY);
    });
    return list;
  }, [platform, query, sort, stock, risk, delivery, ownership]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const start = currentPage * pageSize;
  const pageRows = filtered.slice(start, start + pageSize);

  function changePlatform(next: Platform) {
    setPlatform(next);
    setPage(0);
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (next === "全部") params.delete("platform");
      else params.set("platform", next);
      window.history.replaceState(null, "", `${window.location.pathname}${params.toString() ? `?${params}` : ""}`);
    }
  }
  function resetPage<T>(fn: (v: T) => void) {
    return (v: T) => { fn(v); setPage(0); };
  }
  const activeFilters = [stock !== "all", risk !== "all", delivery !== "all", ownership !== "all"].filter(Boolean).length;

  return (
    <div className="min-h-screen bg-[#fdf6ee] text-[#2a1f17]">
      <div className="sticky top-0 z-40 border-b border-[#ecd9c2] bg-[#fdf6ee]/95 shadow-[0_10px_28px_rgba(122,47,18,0.06)] backdrop-blur-xl">
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
                    ? "bg-[#f0e2d2] font-semibold text-[#5a3a26]"
                    : "bg-white text-[#7a6a5c] ring-1 ring-[#ecd9c2] hover:bg-[#f9ecdc]"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-[1500px] px-5 py-7 sm:px-8 md:py-11">
        <section className="mb-6 rounded-2xl border border-[#e3c9a8] bg-[#fbeede] px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#b5471f] px-3 py-1 text-xs font-bold text-white">
              静态数据快照 · 全量明细
            </span>
            <span className="text-xs text-[#8a6a52]">含全部 {snapshot.count.toLocaleString()} 条报价（含高风险类目，未排除） · 构建前一次性提取 · 前端运行时不请求原站</span>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-3 lg:grid-cols-6">
            <div><dt className="text-[#9a8a72]">快照版本</dt><dd className="mt-0.5 font-mono font-semibold text-[#8f3614]">{snapshot.snapshotVersion}</dd></div>
            <div><dt className="text-[#9a8a72]">抓取时间</dt><dd className="mt-0.5 font-semibold text-[#8f3614]">{formatUpdated(snapshot.fetchedAt)}</dd></div>
            <div><dt className="text-[#9a8a72]">报价总数</dt><dd className="mt-0.5 font-semibold text-[#8f3614]">{snapshot.count.toLocaleString()} 条</dd></div>
            <div><dt className="text-[#9a8a72]">标准商品</dt><dd className="mt-0.5 font-semibold text-[#8f3614]">{metadata.products} 个</dd></div>
            <div><dt className="text-[#9a8a72]">商家</dt><dd className="mt-0.5 font-semibold text-[#8f3614]">{metadata.merchants} 个</dd></div>
            <div><dt className="text-[#9a8a72]">数据来源</dt><dd className="mt-0.5 font-semibold text-[#8f3614]">原项目公开 API</dd></div>
          </dl>
        </section>

        <section className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[#8a7a6a]">Static snapshot · 全量扁平明细</p>
            <h1 className="font-serif text-3xl font-semibold tracking-tight text-[#7a2f12] md:text-5xl">
              {platform === "全部" ? "全部报价明细" : platform}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-[#7a6a5c]">
              当前筛选结果 <span className="font-semibold text-[#7a2f12]">{filtered.length.toLocaleString()}</span> / {offers.length.toLocaleString()} 条。一行一条报价，可搜索、排序、筛选、分页，并导出 CSV。
            </p>
          </div>
          <div className="flex w-full max-w-[640px] flex-col gap-2">
            <label className="flex h-12 w-full items-center gap-3 rounded-2xl bg-white px-4 shadow-[0_16px_42px_rgba(122,47,18,0.08)] ring-1 ring-[#ecd9c2]">
              <Search size={18} className="text-[#9a8a78]" />
              <input
                value={query}
                onChange={(e) => resetPage(setQuery)(e.target.value)}
                placeholder="搜索商品、商家、原始标题"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#b8a890]"
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowFilters((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold ring-1 transition ${
                  activeFilters || showFilters
                    ? "bg-[#3a2418] text-white ring-[#3a2418]"
                    : "bg-white text-[#6a5a4c] ring-[#ecd9c2] hover:bg-[#f9ecdc]"
                }`}
              >
                <Filter size={13} aria-hidden="true" /> 筛选{activeFilters ? ` · ${activeFilters}` : ""}
              </button>
              <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="rounded-full bg-white px-3.5 py-2 text-xs font-semibold text-[#6a5a4c] ring-1 ring-[#ecd9c2] outline-none">
                <option value="default">默认排序（平台→商品→价格）</option>
                <option value="price_asc">价格升序</option>
                <option value="price_desc">价格降序</option>
                <option value="updated_desc">最近更新</option>
                <option value="updated_asc">最早更新</option>
                <option value="merchant">商家名称</option>
              </select>
              <button
                type="button"
                onClick={() => downloadCsv(filtered)}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#b5471f] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#8f3614]"
              >
                <Download size={13} aria-hidden="true" /> 导出 CSV（{filtered.length.toLocaleString()}）
              </button>
            </div>
            {showFilters ? (
              <div className="grid grid-cols-2 gap-2 rounded-2xl bg-white p-3 ring-1 ring-[#ecd9c2] sm:grid-cols-4">
                <FilterSelect label="库存" value={stock} onChange={resetPage((v) => setStock(v as StockFilter))} options={[["all", "全部"], ["in_stock", "有货"], ["out_of_stock", "缺货"]]} />
                <FilterSelect label="风险" value={risk} onChange={resetPage((v) => setRisk(v as RiskFilter))} options={[["all", "全部"], ["low", "低"], ["medium", "中"], ["high", "高"]]} />
                <FilterSelect label="交付" value={delivery} onChange={resetPage((v) => setDelivery(v as DeliveryFilter))} options={[["all", "全部"], ["recharge", "充值/代充"], ["account", "账号"], ["cdk", "卡密/CDK"], ["link", "链接/自助"]]} />
                <FilterSelect label="归属" value={ownership} onChange={resetPage((v) => setOwnership(v as OwnershipFilter))} options={[["all", "全部"], ["official", "官方"], ["third_party", "第三方"], ["shared", "共享/拼车"], ["unknown", "未知"]]} />
              </div>
            ) : null}
          </div>
        </section>

        <section className="mt-8 overflow-hidden rounded-3xl bg-white shadow-[0_18px_60px_rgba(122,47,18,0.07)] ring-1 ring-[#ecd9c2]">
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[1500px] text-left text-sm">
              <thead className="bg-[#f7eadb] text-xs font-semibold text-[#6a5a4c]">
                <tr>
                  <th className="px-3 py-4">#</th>
                  <th className="px-3 py-4">标准商品</th>
                  <th className="px-3 py-4">平台</th>
                  <th className="px-3 py-4">类型</th>
                  <th className="px-3 py-4">规格</th>
                  <th className="px-3 py-4 max-w-[300px]">原始标题</th>
                  <th className="px-3 py-4">商家</th>
                  <th className="px-3 py-4">数据来源</th>
                  <th className="px-3 py-4">价格</th>
                  <th className="px-3 py-4">库存</th>
                  <th className="px-3 py-4">数量</th>
                  <th className="px-3 py-4">交付</th>
                  <th className="px-3 py-4">归属</th>
                  <th className="px-3 py-4">风险</th>
                  <th className="px-3 py-4">更新时间</th>
                  <th className="px-3 py-4">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0e2d2]">
                {pageRows.map((o, idx) => (
                  <tr key={o.id} className="align-middle hover:bg-[#fffaf3]">
                    <td className="px-3 py-3 text-xs text-[#aa9a86]">{start + idx + 1}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <BrandIcon platform={o.platform} productId={o.product_id} className="h-7 w-7 shrink-0 rounded-full bg-[#f7eadb] p-1.5" />
                        <span className="font-semibold text-[#2a1f17]">{o.product_name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-[#6a5a4c]">{o.platform}</td>
                    <td className="px-3 py-3 text-[#7a6a5c]">{o.product_type}</td>
                    <td className="px-3 py-3 text-[#7a6a5c]">{o.product_spec || "—"}</td>
                    <td className="px-3 py-3 max-w-[300px]"><p className="line-clamp-2 text-xs text-[#6a5a4c]">{o.title || "—"}</p></td>
                    <td className="px-3 py-3 text-[#3a2418]">{o.merchant_name || "—"}</td>
                    <td className="px-3 py-3 text-xs text-[#8a7a6a]">{o.source_name || "—"}</td>
                    <td className="px-3 py-3 whitespace-nowrap font-semibold text-[#2a1f17]">{formatPrice(o.price, o.currency)}</td>
                    <td className="px-3 py-3"><span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${statusTone(o.stock_status)}`}>{statusLabel(o.stock_status)}</span></td>
                    <td className="px-3 py-3 text-xs text-[#6a5a4c]">{o.stock_count === "unknown" || o.stock_count === null ? "—" : String(o.stock_count)}</td>
                    <td className="px-3 py-3 text-xs text-[#6a5a4c]">{deliveryLabel(o.delivery_type)}</td>
                    <td className="px-3 py-3 text-xs text-[#6a5a4c]">{ownershipLabel(o.account_ownership)}</td>
                    <td className="px-3 py-3"><span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${riskTone(o.risk_level)}`}>{riskLabel(o.risk_level)}</span></td>
                    <td className="px-3 py-3 whitespace-nowrap text-xs text-[#6a5a4c]">{formatUpdated(o.source_updated_at)}</td>
                    <td className="px-3 py-3">
                      {o.purchase_url ? (
                        <a href={o.purchase_url} target="_blank" rel="noreferrer nofollow" className="inline-flex items-center gap-1 rounded-full bg-[#fde6d4] px-2.5 py-1.5 text-xs font-semibold text-[#b5471f] hover:bg-[#f7d0b3]">
                          来源 <ExternalLink size={11} />
                        </a>
                      ) : <span className="text-xs text-[#aa9a86]">—</span>}
                    </td>
                  </tr>
                ))}
                {pageRows.length === 0 ? (
                  <tr><td colSpan={16} className="px-3 py-10 text-center text-sm text-[#8a7a6a]">没有符合当前筛选条件的报价。</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="space-y-2 p-3 md:hidden">
            {pageRows.map((o) => (
              <article key={o.id} className="rounded-2xl bg-[#fffaf3] p-3 ring-1 ring-[#ecd9c2]">
                <div className="flex items-start gap-2">
                  <BrandIcon platform={o.platform} productId={o.product_id} className="h-7 w-7 shrink-0 rounded-full bg-[#f7eadb] p-1.5" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[#2a1f17]">{o.product_name}</p>
                    <p className="mt-0.5 text-xs text-[#8a7a6a]">{o.platform} · {o.product_type} · {o.product_spec || "—"}</p>
                  </div>
                  <span className="font-semibold text-[#2a1f17]">{formatPrice(o.price, o.currency)}</span>
                </div>
                <p className="mt-2 text-xs text-[#6a5a4c] line-clamp-2">{o.title || "—"}</p>
                <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
                  <span className={`rounded-full px-2 py-0.5 font-semibold ${statusTone(o.stock_status)}`}>{statusLabel(o.stock_status)}</span>
                  <span className={`rounded-full px-2 py-0.5 font-semibold ${riskTone(o.risk_level)}`}>风险{riskLabel(o.risk_level)}</span>
                  <span className="rounded-full bg-[#f0e2d2] px-2 py-0.5 text-[#6a5a4c]">{deliveryLabel(o.delivery_type)}</span>
                  <span className="rounded-full bg-[#f0e2d2] px-2 py-0.5 text-[#6a5a4c]">{o.merchant_name || "—"}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-[10px] text-[#8a7a6a]">
                  <span>{formatUpdated(o.source_updated_at)}</span>
                  {o.purchase_url ? (
                    <a href={o.purchase_url} target="_blank" rel="noreferrer nofollow" className="inline-flex items-center gap-1 font-semibold text-[#b5471f]">来源 <ExternalLink size={10} /></a>
                  ) : null}
                </div>
              </article>
            ))}
            {pageRows.length === 0 ? <p className="px-5 py-10 text-center text-sm text-[#8a7a6a]">没有符合当前筛选条件的报价。</p> : null}
          </div>
        </section>

        {filtered.length > 0 ? (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-xs text-[#6a5a4c]">
            <div className="flex items-center gap-3">
              <span>第 {currentPage + 1} / {pageCount} 页 · 共 {filtered.length.toLocaleString()} 条</span>
              <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }} className="rounded-full bg-white px-3 py-1.5 font-semibold ring-1 ring-[#ecd9c2] outline-none">
                {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>每页 {n}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <button type="button" disabled={currentPage === 0} onClick={() => setPage(0)} className="rounded-full bg-white px-3 py-1.5 font-semibold ring-1 ring-[#ecd9c2] disabled:opacity-40">首页</button>
              <button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} className="rounded-full bg-white px-3 py-1.5 font-semibold ring-1 ring-[#ecd9c2] disabled:opacity-40">上一页</button>
              <button type="button" disabled={currentPage >= pageCount - 1} onClick={() => setPage(currentPage + 1)} className="rounded-full bg-white px-3 py-1.5 font-semibold ring-1 ring-[#ecd9c2] disabled:opacity-40">下一页</button>
              <button type="button" disabled={currentPage >= pageCount - 1} onClick={() => setPage(pageCount - 1)} className="rounded-full bg-white px-3 py-1.5 font-semibold ring-1 ring-[#ecd9c2] disabled:opacity-40">末页</button>
            </div>
          </div>
        ) : null}

        <footer className="mt-8 rounded-2xl bg-[#fbeede] px-5 py-4 text-xs leading-6 text-[#7a6a5c]">
          本页面为公开数据整理与比较工具，不代表任何商家或渠道背书。价格、库存、资质、交付和售后政策请以原始页面为准。
          <br />
          本快照含账号、共享、接码、KYC 等类别商品，仅作数据整理展示，不构成购买建议；请遵守服务条款和当地法律。
          <br />
          静态快照抓取时间：{formatUpdated(snapshot.fetchedAt)}；数据来源：原项目公开 API（{snapshot.sourceUrl}）。
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
    <label className="flex flex-col gap-1 text-[11px] font-semibold text-[#8a7a6a]">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded-lg bg-[#fdf6ee] px-2.5 py-1.5 text-xs font-semibold text-[#5a3a26] ring-1 ring-[#ecd9c2] outline-none">
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
    </label>
  );
}
