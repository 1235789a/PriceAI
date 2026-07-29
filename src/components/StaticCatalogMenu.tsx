"use client";

import { ArrowUpRight, CheckCircle2, Database, ExternalLink, Search, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { BrandIcon } from "@/components/BrandIcon";
import { SiteHeader } from "@/components/SiteHeader";
import catalogRows from "@/data/static-link-catalog.json";

type CatalogRow = (typeof catalogRows)[number];

const platformMenu = [
  ["全部", "全部入口"],
  ["ChatGPT", "ChatGPT / OpenAI"],
  ["Claude", "Claude / Anthropic"],
  ["Gemini", "Gemini / Google"],
  ["Grok", "Grok / xAI"],
  ["DeepSeek", "DeepSeek"],
  ["Qwen", "Qwen / Alibaba"],
  ["Kimi", "Kimi / Moonshot"],
  ["GLM", "GLM / Zhipu"],
  ["API", "API 服务商"],
  ["编程工具", "AI 编程订阅"],
  ["第三方渠道", "第三方渠道"],
] as const;

function familyMatches(row: CatalogRow, platform: string): boolean {
  if (platform === "全部") return true;
  const haystack = `${row.产品家族} ${row.产品或平台} ${row.提供商} ${row.链接}`.toLowerCase();
  const patterns: Record<string, RegExp> = {
    ChatGPT: /chatgpt|openai/,
    Claude: /claude|anthropic/,
    Gemini: /gemini|google ai|aistudio/,
    Grok: /grok|xai/,
    DeepSeek: /deepseek/,
    Qwen: /qwen|alibaba|aliyun|通义/,
    Kimi: /kimi|moonshot|月之暗面/,
    GLM: /glm|zhipu|智谱/,
    API: /api|openrouter|groq|cerebras|mistral|cohere|服务商/,
    编程工具: /编程|coding|cursor|windsurf|trae|copilot|codeium|kiro/,
    第三方渠道: /第三方渠道/,
  };
  return Boolean(patterns[platform]?.test(haystack));
}

function productLabel(row: CatalogRow): string {
  return row.产品或平台 || row.提供商 || "未命名入口";
}

function iconPlatform(row: CatalogRow): string {
  const family = row.产品家族;
  if (family.includes("ChatGPT")) return "ChatGPT";
  if (family.includes("Claude")) return "Claude";
  if (family.includes("Gemini")) return "Gemini";
  if (family.includes("Grok")) return "Grok";
  if (family.includes("Google")) return "Google";
  return "";
}

function evidenceTone(evidence: string): string {
  if (evidence.includes("官方")) return "text-[#2f7a4b] bg-[#eef8f0]";
  if (evidence.includes("授权")) return "text-[#7a5a22] bg-[#fff7e8]";
  return "text-[#5a6061] bg-[#f1f3f3]";
}

export function StaticCatalogMenu({ initialPlatform = "全部" }: { initialPlatform?: string }) {
  const [platform, setPlatform] = useState(() =>
    platformMenu.some(([id]) => id === initialPlatform) ? initialPlatform : "全部",
  );
  const [query, setQuery] = useState("");
  const [selectedProduct, setSelectedProduct] = useState("");
  const [showAll, setShowAll] = useState(false);

  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (catalogRows as CatalogRow[]).filter((row) => {
      if (!familyMatches(row, platform)) return false;
      if (selectedProduct && productLabel(row) !== selectedProduct) return false;
      if (!normalized) return true;
      return `${row.品类} ${row.产品家族} ${row.产品或平台} ${row.提供商} ${row.链接} ${row.备注}`
        .toLowerCase()
        .includes(normalized);
    });
  }, [platform, query, selectedProduct]);

  const productMenu = useMemo(() => {
    const groups = new Map<string, { count: number; category: string; family: string }>();
    (catalogRows as CatalogRow[]).filter((row) => familyMatches(row, platform)).forEach((row) => {
      const label = productLabel(row);
      const current = groups.get(label);
      groups.set(label, {
        count: (current?.count || 0) + 1,
        category: row.品类,
        family: row.产品家族,
      });
    });
    return [...groups.entries()]
      .map(([label, value]) => ({ label, ...value }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "zh-CN"));
  }, [platform]);

  const visibleRows = showAll ? filteredRows : filteredRows.slice(0, 80);
  const activePlatformLabel = platformMenu.find(([id]) => id === platform)?.[1] || "全部入口";

  function changePlatform(next: string) {
    setPlatform(next);
    setSelectedProduct("");
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
            {platformMenu.map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => changePlatform(id)}
                className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-sm transition ${
                  platform === id
                    ? "bg-[#213f35] font-semibold text-white shadow-[0_8px_24px_rgba(33,63,53,0.18)]"
                    : "bg-white text-[#5a6762] ring-1 ring-[#dfe7e4] hover:bg-[#edf5f0]"
                }`}
              >
                {id !== "全部" ? <BrandIcon platform={iconPlatform({ 产品家族: label } as CatalogRow)} className="h-4 w-4" /> : null}
                {id}
              </button>
            ))}
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-[1500px] px-5 py-7 sm:px-8 md:py-11">
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#2f7a4b]">
              <span>Static catalog</span>
              <span className="h-1 w-1 rounded-full bg-[#9ab5a5]" />
              <span>AI Price Atlas</span>
            </div>
            <h1 className="max-w-4xl font-serif text-3xl font-semibold tracking-tight text-[#18342b] md:text-5xl">
              {activePlatformLabel}价格与渠道导航
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-[#60706a] md:text-base">
              先选择平台，再选择标准商品，最后查看来源链接。所有记录来自公开静态项目或已授权来源，不把静态资料伪装成实时库存。
            </p>
          </div>
          <label className="flex h-12 items-center gap-3 rounded-2xl bg-white px-4 shadow-[0_16px_42px_rgba(35,58,48,0.07)] ring-1 ring-[#dfe7e4]">
            <Search size={18} className="shrink-0 text-[#698078]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索产品、平台或域名"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#a0aca6]"
            />
          </label>
        </section>

        <section className="mt-7 grid gap-3 sm:grid-cols-3">
          <Metric label="标准入口" value={String(filteredRows.length)} icon={<Database size={16} />} />
          <Metric label="来源项目" value="15" icon={<ShieldCheck size={16} />} />
          <Metric label="数据版本" value="2026-07-29" icon={<CheckCircle2 size={16} />} />
        </section>

        <section className="mt-8 rounded-3xl bg-white p-5 shadow-[0_18px_60px_rgba(35,58,48,0.06)] ring-1 ring-[#dfe7e4] md:p-7">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#6f8078]">Standard products</p>
              <h2 className="mt-1 text-xl font-semibold text-[#18342b]">标准商品菜单</h2>
            </div>
            <button
              type="button"
              onClick={() => setSelectedProduct("")}
              className="inline-flex items-center gap-2 rounded-full bg-[#edf5f0] px-3.5 py-2 text-xs font-semibold text-[#2f7a4b]"
            >
              <SlidersHorizontal size={14} />
              {selectedProduct ? "清除商品筛选" : "全部标准商品"}
            </button>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {productMenu.slice(0, 24).map((item) => (
              <button
                type="button"
                key={item.label}
                onClick={() => setSelectedProduct(selectedProduct === item.label ? "" : item.label)}
                className={`group rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 ${
                  selectedProduct === item.label
                    ? "border-[#2f7a4b] bg-[#eff8f1] shadow-[0_10px_28px_rgba(47,122,75,0.12)]"
                    : "border-[#e6ece8] bg-[#fbfdfb] hover:border-[#b9d1c0] hover:bg-[#f5faf6]"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="line-clamp-2 text-sm font-semibold leading-6 text-[#244037]">{item.label}</span>
                  <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[0.68rem] font-bold text-[#2f7a4b] ring-1 ring-[#dce9df]">{item.count}</span>
                </div>
                <p className="mt-2 line-clamp-1 text-xs text-[#71817a]">{item.family || item.category}</p>
                <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#2f7a4b] opacity-0 transition group-hover:opacity-100">
                  查看入口 <ArrowUpRight size={13} />
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="mt-8" id="catalog-results">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#6f8078]">Source links</p>
              <h2 className="mt-1 text-xl font-semibold text-[#18342b]">来源入口</h2>
            </div>
            <p className="text-xs text-[#75847d]">显示 {visibleRows.length} / {filteredRows.length} 条</p>
          </div>
          <div className="hidden overflow-hidden rounded-3xl bg-white shadow-[0_18px_60px_rgba(35,58,48,0.05)] ring-1 ring-[#dfe7e4] md:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#edf5f0] text-xs font-semibold text-[#496258]">
                <tr>
                  <th className="px-5 py-4">标准商品 / 平台</th>
                  <th className="px-5 py-4">类型</th>
                  <th className="px-5 py-4">证据</th>
                  <th className="px-5 py-4">数据日期</th>
                  <th className="px-5 py-4 text-right">入口</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf1ee]">
                {visibleRows.map((row, index) => (
                  <tr key={`${row.链接}-${index}`} className="group hover:bg-[#fbfdfb]">
                    <td className="max-w-[360px] px-5 py-4">
                      <div className="flex items-start gap-3">
                        <BrandIcon platform={iconPlatform(row)} className="mt-0.5 h-5 w-5" />
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-[#244037]">{productLabel(row)}</p>
                          <p className="mt-1 truncate text-xs text-[#7a8982]">{row.产品家族 || row.品类}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-xs text-[#61726a]">{row.链接类型}</td>
                    <td className="px-5 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${evidenceTone(row.证据级别)}`}>{row.证据级别}</span></td>
                    <td className="px-5 py-4 text-xs text-[#61726a]">{row.数据日期 || "未标注"}</td>
                    <td className="px-5 py-4 text-right"><CatalogLink row={row} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-3 md:hidden">
            {visibleRows.map((row, index) => (
              <article key={`${row.链接}-mobile-${index}`} className="rounded-2xl bg-white p-4 shadow-[0_12px_36px_rgba(35,58,48,0.05)] ring-1 ring-[#dfe7e4]">
                <div className="flex items-start gap-3">
                  <BrandIcon platform={iconPlatform(row)} className="mt-0.5 h-5 w-5" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[#244037]">{productLabel(row)}</p>
                    <p className="mt-1 text-xs text-[#71817a]">{row.产品家族 || row.品类} · {row.链接类型}</p>
                  </div>
                  <CatalogLink row={row} />
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-[#65766e]">
                  <span className={`rounded-full px-2 py-1 font-semibold ${evidenceTone(row.证据级别)}`}>{row.证据级别}</span>
                  <span className="rounded-full bg-[#f1f3f3] px-2 py-1">{row.数据日期 || "日期未标注"}</span>
                </div>
              </article>
            ))}
          </div>
          {filteredRows.length > 80 ? (
            <button type="button" onClick={() => setShowAll((value) => !value)} className="mx-auto mt-6 flex h-11 items-center justify-center rounded-full bg-[#213f35] px-5 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(33,63,53,0.16)]">
              {showAll ? "收起入口" : `继续查看其余 ${filteredRows.length - 80} 条`}
            </button>
          ) : null}
        </section>

        <footer className="mt-12 rounded-2xl bg-[#eef5f0] px-5 py-4 text-xs leading-6 text-[#60706a]">
          本页面只做公开信息整理、分类和导航，不直接出售账号或订阅。静态链接、价格线索和第三方信息可能变化，实际服务、资质、库存和售后以原始页面为准。
          <Link href="/about" className="ml-1 font-semibold text-[#2f7a4b] underline underline-offset-2">查看数据说明</Link>
        </footer>
      </main>
    </div>
  );
}

function CatalogLink({ row }: { row: CatalogRow }) {
  return (
    <a href={row.链接} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full bg-[#edf5f0] px-3 py-2 text-xs font-semibold text-[#2f7a4b] transition hover:bg-[#dceee1]">
      打开 <ExternalLink size={13} />
    </a>
  );
}

function Metric({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-4 shadow-[0_12px_35px_rgba(35,58,48,0.05)] ring-1 ring-[#dfe7e4]">
      <span className="flex items-center gap-2 text-xs font-semibold text-[#6d7c74]">{icon}{label}</span>
      <span className="text-lg font-semibold text-[#244037]">{value}</span>
    </div>
  );
}
