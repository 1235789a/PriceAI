import type { Metadata } from "next";
import { StaticCatalogMenu } from "@/components/StaticCatalogMenu";

export const metadata: Metadata = {
  title: "价格地图 | PriceAI",
  description: "按平台、标准商品和来源项目浏览 AI 价格入口与静态资料。",
  alternates: { canonical: "/catalog" },
};

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ platform?: string | string[] }>;
}) {
  const params = await searchParams;
  const platform = typeof params.platform === "string" ? params.platform : undefined;
  return <StaticCatalogMenu initialPlatform={platform} />;
}
