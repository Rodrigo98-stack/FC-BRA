import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadStore } from "@/server/store-context";
import { POLICY_LABELS, type BrandPolicies } from "@/server/services/cms";
import { CONFIG_PENDING } from "@/lib/format";

type Props = { params: Promise<{ brand: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const label = POLICY_LABELS[slug as keyof BrandPolicies];
  return label ? { title: label } : {};
}

export default async function PolicyPage({ params }: Props) {
  const { brand: brandSlug, slug } = await params;
  const { cms } = await loadStore(brandSlug);
  if (!(slug in POLICY_LABELS)) notFound();
  const key = slug as keyof BrandPolicies;
  return (
    <article className="mx-auto max-w-2xl px-5 pt-14 lg:pt-20">
      <h1 className="font-display text-5xl leading-none">{POLICY_LABELS[key]}</h1>
      <div className="mt-10 whitespace-pre-line text-[15px] leading-[1.75]">{cms.policies[key] ?? CONFIG_PENDING}</div>
    </article>
  );
}
