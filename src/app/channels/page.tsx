import type { Metadata } from "next";
import { StaticChannelExplorer } from "@/components/StaticChannelExplorer";

export const metadata: Metadata = {
  title: "AI 订阅与渠道 | PriceAI",
  description: "基于原项目提交数据的 AI 订阅与渠道静态快照。",
  alternates: { canonical: "/channels" },
};

export default async function ChannelsPage({
  searchParams,
}: {
  searchParams: Promise<{ platform?: string | string[] }>;
}) {
  const params = await searchParams;
  const platform = typeof params.platform === "string" ? params.platform : undefined;
  return <StaticChannelExplorer initialPlatform={platform} />;
}
