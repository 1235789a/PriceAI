"use client";

import { ChevronDown, ExternalLink, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { BrandIcon } from "@/components/BrandIcon";
import { SiteHeader } from "@/components/SiteHeader";
import meta from "@/data/priceai-static/meta.json";
import chatgpt1 from "@/data/priceai-static/chatgpt-1.json";
import chatgpt2 from "@/data/priceai-static/chatgpt-2.json";
import chatgpt3 from "@/data/priceai-static/chatgpt-3.json";
import chatgpt4 from "@/data/priceai-static/chatgpt-4.json";
import claude from "@/data/priceai-static/claude.json";
import email from "@/data/priceai-static/email.json";
import gemini from "@/data/priceai-static/gemini.json";
import grok from "@/data/priceai-static/grok.json";
import other from "@/data/priceai-static/other.json";
import sms from "@/data/priceai-static/sms.json";

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
};
type StaticPart = { products: StaticProduct[]; rows: { offer: StaticOffer; product: StaticProduct }[] };
const staticParts: StaticPart[] = [chatgpt1, chatgpt2, chatgpt3, chatgpt4, claude, email, gemini, grok, other, sms] as unknown as StaticPart[];
const snapshot = {
  ...meta,
  products: [...new Map(staticParts.flatMap((part) => part.products).map((product) => [product.id, product])).values()],
  rows: staticParts.flatMap((part) => part.rows),
};
type Snapshot = { products: StaticProduct[]; rows: { offer: StaticOffer; product: StaticProduct }[]; total: number; fetchedAt: string; sourceUrl: string; snapshotVersion: string };
type SnapshotRow = Snapshot["rows"][number];
type SnapshotOffer = SnapshotRow["offer"];
type Platform = "全部" | "ChatGPT" | "Claude" | "Gemini" | "Grok" | "邮箱" | "接码" | "其他";

const platformMenu: Platform[] = ["全部", "ChatGPT", "Claude", "Gemini", "Grok", "邮箱", "接码", "其他"];

function isAvailable(status: string): boolean {
  return status === "in_stock" || status === "low_stock";
}

function statusLabel(status: string): string {
  if (status === "in_stock") return "有货";
  if (status === "low_stock") return "低库存";
  return "缺货";
}

function statusTone(status: string): string {
  if (status === "in_stock") return "bg-[#e8f6ed] text-[#28764b]";
  if (status === "low_stock") return "bg-[#fff4de] text-[#9a681d]";
  return "bg-[#fdebec] text-[#b34646]";
}

function formatPrice(value: number | null | undefined, currency = "CNY"): string {
  if (value === null || value === undefined) return "暂无价格";
  const prefix = currency === "CNY" ? "¥" : `${currency} `;
  return `${prefix}${value.toFixed(value % 1 === 0 ? 0 : 2)}`;
}

function formatUpdated(value: string | null | undefined): string {
  if (!value) return "未记录";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "未记录" : `${date.getMonth() + 1}/${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:00`;
}

function offerUpdatedAt(offer: SnapshotOffer): string {
  return offer.capturedAt || offer.sourceUpdatedAt || offer.lastSeenAt || "";
}

function offerStore(offer: SnapshotOffer): string {
  return offer.sourceStoreName || offer.sourceName || "未记录渠道";
}

function offerTitle(offer: SnapshotOffer): string {
  return offer.sourceTitle || "未记录商品名称";
}

export function StaticChannelExplorer({ initialPlatform = "全部" }: { initialPlatform?: string }) {
  const [platform, setPlatform] = useState<Platform>(() => platformMenu.includes(initialPlatform as Platform) ? initialPlatform as Platform : "全部");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const rows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const groups = new Map<string, { product: Snapshot["products"][number]; offers: SnapshotOffer[] }>();
    (snapshot.rows as SnapshotRow[]).forEach(({ product, offer }) => {
      if (platform !== "全部" && product.platform !== platform) return;
      if (normalized && !`${product.displayName} ${product.platform} ${product.productType} ${product.spec} ${product.aliases.join(" ")} ${offerStore(offer)} ${offer.sourceName} ${offerTitle(offer)}`.toLowerCase().includes(normalized)) return;
      const current = groups.get(product.id);
      if (current) current.offers.push(offer);
      else groups.set(product.id, { product, offers: [offer] });
    });

    return [...groups.values()]
      .map(({ product, offers }) => {
        const available = offers.filter((offer) => isAvailable(offer.status));
        const sortByPrice = (a: SnapshotOffer, b: SnapshotOffer) => (a.price ?? Number.POSITIVE_INFINITY) - (b.price ?? Number.POSITIVE_INFINITY);
        const lowestOffer = [...offers].sort(sortByPrice)[0];
        const lowestAvailableOffer = [...available].sort(sortByPrice)[0] || null;
        const updatedAt = offers.map(offerUpdatedAt).sort().at(-1) || "";
        return { product, offers, availableCount: available.length, outOfStockCount: offers.length - available.length, lowestOffer, lowestAvailableOffer, updatedAt };
      })
      .sort((a, b) => (b.availableCount - a.availableCount) || ((a.lowestAvailableOffer?.price ?? a.lowestOffer?.price ?? Infinity) - (b.lowestAvailableOffer?.price ?? b.lowestOffer?.price ?? Infinity)));
  }, [platform, query]);

  function changePlatform(next: Platform) {
    setPlatform(next);
    setExpanded(null);
    const params = new URLSearchParams(window.location.search);
    if (next === "全部") params.delete("platform");
    else params.set("platform", next);
    window.history.replaceState(null, "", `${window.location.pathname}${params.toString() ? `?${params}` : ""}`);
  }

  return (
    <div className="min-h-screen bg-[#f8faf9] text-[#202829]">
      <div className="sticky top-0 z-40 border-b border-[#dfe7e4] bg-[#f8faf9]/95 shadow-[0_10px_28px_rgba(35,58,48,0.05)] backdrop-blur-xl">
        <SiteHeader activeSection="catalog" />
        <div className="mx-auto max-w-[1500px] px-5 pb-3 sm:px-8">
          <div className="flex gap-2 overflow-x-auto py-1">
            {platformMenu.map((item) => (
              <button key={item} type="button" onClick={() => changePlatform(item)} className={`shrink-0 rounded-full px-5 py-2 text-sm transition ${platform === item ? "bg-[#dfe8ea] font-semibold text-[#34464a]" : "bg-white text-[#687779] ring-1 ring-[#dfe7e4] hover:bg-[#edf5f0]"}`}>
                {item}
              </button>
            ))}
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-[1500px] px-5 py-7 sm:px-8 md:py-11">
        <section className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[#70827c]">Static snapshot · 原项目公开数据</p>
            <h1 className="font-serif text-3xl font-semibold tracking-tight text-[#18342b] md:text-5xl">{platform === "全部" ? "AI 订阅与渠道" : platform}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-[#60706a]">按原项目的标准商品菜单展示静态渠道快照。当前快照包含 {snapshot.total.toLocaleString()} 条报价、{snapshot.products.length} 个标准商品；不执行页面实时采集。</p>
          </div>
          <label className="flex h-12 w-full max-w-[380px] items-center gap-3 rounded-2xl bg-white px-4 shadow-[0_16px_42px_rgba(35,58,48,0.07)] ring-1 ring-[#dfe7e4]">
            <Search size={18} className="text-[#698078]" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索商品、店铺或渠道" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#a0aca6]" />
          </label>
        </section>

        <section className="mt-8 overflow-hidden rounded-3xl bg-white shadow-[0_18px_60px_rgba(35,58,48,0.06)] ring-1 ring-[#dfe7e4]">
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[1160px] text-left text-sm">
              <thead className="bg-[#f1f4f4] text-xs font-semibold text-[#526265]"><tr><th className="px-5 py-5">标准商品</th><th className="px-5 py-5">平台</th><th className="px-5 py-5">类型</th><th className="px-5 py-5">最低价</th><th className="px-5 py-5">库存</th><th className="px-5 py-5">渠道</th><th className="px-5 py-5">最低渠道</th><th className="px-5 py-5">最近更新</th><th className="px-5 py-5">操作</th></tr></thead>
              <tbody className="divide-y divide-[#edf1ee]">
                {rows.map((row) => {
                  const lowest = row.lowestAvailableOffer || row.lowestOffer;
                  const isExpanded = expanded === row.product.id;
                  return <tr key={row.product.id} className="align-middle hover:bg-[#fbfdfb]"><td className="px-5 py-5"><div className="flex items-center gap-3"><BrandIcon platform={row.product.platform} className="h-10 w-10 rounded-full bg-[#f2f4f4] p-2" /><div><p className="font-semibold text-[#202b2d]">{row.product.displayName}</p><p className="mt-1 text-xs text-[#75847d]">{row.product.spec || row.product.productType}</p></div></div></td><td className="px-5 py-5 text-[#46585d]">{row.product.platform}</td><td className="px-5 py-5 text-[#687779]">{row.product.productType}</td><td className="px-5 py-5"><p className="text-xl font-semibold text-[#202b2d]">{row.lowestAvailableOffer ? formatPrice(lowest.price, lowest.currency) : "暂无价格"}</p><span className={`mt-1 inline-flex rounded-full px-2 py-1 text-xs font-semibold ${statusTone(lowest.status)}`}>{statusLabel(lowest.status)}</span></td><td className="px-5 py-5"><div className="flex gap-2 text-xs"><span className="rounded-full bg-[#e8f6ed] px-3 py-2 text-[#28764b]">有货 {row.availableCount}</span><span className="rounded-full bg-[#fdebec] px-3 py-2 text-[#b34646]">缺货 {row.outOfStockCount}</span></div></td><td className="px-5 py-5 text-lg text-[#374b50]">{row.offers.length}</td><td className="max-w-[220px] px-5 py-5"><p className="truncate font-medium text-[#29383b]">{offerStore(lowest)}</p><p className="mt-1 truncate text-xs text-[#7a8982]">{offerTitle(lowest)}</p></td><td className="whitespace-nowrap px-5 py-5 text-[#526265]">{formatUpdated(row.updatedAt)}</td><td className="px-5 py-5"><button type="button" onClick={() => setExpanded(isExpanded ? null : row.product.id)} className="inline-flex items-center gap-2 rounded-full bg-[#293538] px-4 py-3 font-semibold text-white transition hover:bg-[#1d2729]">查看 <ChevronDown size={15} className={isExpanded ? "rotate-180" : ""} /></button></td></tr>;
                })}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 p-4 md:hidden">
            {rows.map((row) => { const lowest = row.lowestAvailableOffer || row.lowestOffer; const isExpanded = expanded === row.product.id; return <article key={row.product.id} className="rounded-2xl bg-[#fbfdfb] p-4 ring-1 ring-[#e2eae5]"><div className="flex items-start gap-3"><BrandIcon platform={row.product.platform} className="h-10 w-10 rounded-full bg-[#f2f4f4] p-2" /><div className="min-w-0 flex-1"><p className="font-semibold text-[#202b2d]">{row.product.displayName}</p><p className="mt-1 text-xs text-[#75847d]">{row.product.platform} · {row.product.productType}</p></div><button type="button" onClick={() => setExpanded(isExpanded ? null : row.product.id)} className="rounded-full bg-[#293538] p-2 text-white"><ChevronDown size={15} className={isExpanded ? "rotate-180" : ""} /></button></div><div className="mt-4 grid grid-cols-2 gap-2 text-xs"><div className="rounded-xl bg-white p-3"><p className="text-[#82908b]">最低价</p><p className="mt-1 text-lg font-semibold">{row.lowestAvailableOffer ? formatPrice(lowest.price, lowest.currency) : "暂无价格"}</p></div><div className="rounded-xl bg-white p-3"><p className="text-[#82908b]">渠道 / 库存</p><p className="mt-1 font-semibold">{row.offers.length} / 有货 {row.availableCount}</p></div></div>{isExpanded ? <OfferList offers={row.offers} /> : null}</article>; })}
          </div>
        </section>

        {expanded ? <section className="mt-4 hidden rounded-3xl bg-white p-5 ring-1 ring-[#dfe7e4] md:block"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#71817a]">Channel details</p><h2 className="mt-1 text-xl font-semibold text-[#18342b]">{rows.find((row) => row.product.id === expanded)?.product.displayName}</h2><OfferList offers={rows.find((row) => row.product.id === expanded)?.offers || []} /></section> : null}

        <footer className="mt-8 rounded-2xl bg-[#eef5f0] px-5 py-4 text-xs leading-6 text-[#60706a]">数据来自原项目公开接口的静态快照，抓取时间：{new Date(snapshot.fetchedAt).toLocaleString("zh-CN")}。这不是实时库存或任何渠道背书；价格、资质、交付和售后请回原始页面核验。涉及账号、验证或其他高风险商品时，请遵守服务条款和当地法律。</footer>
      </main>
    </div>
  );
}

function OfferList({ offers }: { offers: SnapshotOffer[] }) {
  return <div className="mt-4 divide-y divide-[#edf1ee] rounded-2xl bg-[#fbfdfb] ring-1 ring-[#e2eae5]">{offers.map((offer) => <div key={offer.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 text-sm"><div className="min-w-0"><p className="font-semibold text-[#263638]">{offerStore(offer)}</p><p className="mt-1 text-xs text-[#71817a]">{offerTitle(offer)}</p><p className="mt-1 text-[11px] text-[#98a49f]">库存：{offer.stockCount ?? "未记录"} · 更新：{formatUpdated(offerUpdatedAt(offer))}</p></div><div className="flex items-center gap-3"><span className="font-semibold text-[#263638]">{formatPrice(offer.price, offer.currency)}</span><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone(offer.status)}`}>{statusLabel(offer.status)}</span>{offer.url ? <a href={offer.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full bg-[#eaf5ed] px-3 py-2 text-xs font-semibold text-[#28764b]">来源 <ExternalLink size={12} /></a> : null}</div></div>)}</div>;
}
