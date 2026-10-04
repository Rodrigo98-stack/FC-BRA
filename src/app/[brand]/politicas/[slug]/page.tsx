import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadStore } from "@/server/store-context";
import { POLICY_LABELS, type BrandPolicies } from "@/server/services/cms";
import { CONFIG_PENDING } from "@/lib/format";
import { PolicyText } from "@/components/store/ui";
import { waLink } from "@/server/services/whatsapp";
import { formatPhone } from "@/lib/text";

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
  const text = cms.policies[key];
  const number = cms.contact.whatsapp ?? cms.whatsapp.number;
  const help = waLink(number, `Olá! Tenho uma dúvida sobre a ${POLICY_LABELS[key].toLowerCase()}.`);
  return (
    <article className="mx-auto max-w-2xl px-5 pt-14 lg:pt-20">
      <h1 className="font-display font-bodoni text-5xl leading-none">{POLICY_LABELS[key]}</h1>
      <div className="mt-10">{text ? <PolicyText text={text} /> : <p className="text-[15px]">{CONFIG_PENDING}</p>}</div>
      {text && help && (
        <aside className="mt-14 border hairline p-6">
          <p className="text-[15px] leading-relaxed">Ficou com alguma dúvida? Fale com o nosso atendimento pelo WhatsApp.</p>
          <a href={help} target="_blank" rel="noopener noreferrer" className="btn-brand mt-5">
            Falar no WhatsApp {number ? formatPhone(number) : ""}
          </a>
        </aside>
      )}
    </article>
  );
}
