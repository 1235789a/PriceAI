import type { Metadata } from "next";
import { StaticAllOffersTable } from "@/components/StaticAllOffersTable";

export const metadata: Metadata = {
  title: "全部报价明细 | PriceAI",
  description: "全量静态快照扁平明细表：4611 条报价，含商品、平台、商家、价格、库存、交付、风险和来源链接。",
  alternates: { canonical: "/channels/all" },
  robots: { index: false, follow: false },
};

export default async function AllChannelsPage({
  searchParams,
}: {
  searchParams: Promise<{ platform?: string | string[] }>;
}) {
  const params = await searchParams;
  const platform = typeof params.platform === "string" ? params.platform : undefined;
  return <StaticAllOffersTable initialPlatform={platform} />;
}
