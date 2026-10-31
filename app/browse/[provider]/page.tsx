import { notFound } from "next/navigation";
import { getProviderBySlug } from "@/lib/providers";
import { getCatalogByProvider } from "@/lib/catalog";
import TitleCard from "@/app/components/title-card";
import styles from "./page.module.css";

export default async function BrowsePage({
  params,
}: {
  params: Promise<{ provider: string }>;
}) {
  const { provider: slug } = await params;
  const provider = getProviderBySlug(slug);
  if (!provider) notFound();

  const rows = await getCatalogByProvider(provider.code);

  return (
    <main className={styles.main}>
      <h1>{provider.label}</h1>
      {rows.length === 0 ? (
        <p className={styles.empty}>
          Nothing available on {provider.label} yet.
        </p>
      ) : (
        <div className={styles.grid}>
          {rows.map((row) => (
            <TitleCard key={row.availability_id} row={row} />
          ))}
        </div>
      )}
    </main>
  );
}
