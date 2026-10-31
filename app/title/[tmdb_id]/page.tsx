import { notFound } from "next/navigation";
import Image from "next/image";
import { getCatalogByTmdbId } from "@/lib/catalog";
import { posterUrl } from "@/lib/tmdb-image";
import { PROVIDERS } from "@/lib/providers";
import styles from "./page.module.css";

export default async function TitleDetailPage({
  params,
}: {
  params: Promise<{ tmdb_id: string }>;
}) {
  const { tmdb_id } = await params;
  const tmdbId = Number(tmdb_id);
  if (!Number.isInteger(tmdbId)) notFound();

  const rows = await getCatalogByTmdbId(tmdbId);
  if (rows.length === 0) notFound();

  const title = rows[0];
  const poster = posterUrl(title.poster_path, "w500");
  const year = title.release_date ? title.release_date.slice(0, 4) : null;
  const typeLabel = title.media_type === "tv" ? "TV Series" : "Movie";

  return (
    <main className={styles.main}>
      <div className={styles.layout}>
        <div className={styles.posterWrap}>
          {poster ? (
            <Image
              src={poster}
              alt={title.title}
              fill
              sizes="(max-width: 700px) 60vw, 300px"
              className={styles.poster}
            />
          ) : (
            <div className={styles.posterFallback}>{title.title}</div>
          )}
        </div>

        <div className={styles.info}>
          <h1>{title.title}</h1>
          <div className={styles.meta}>
            {year && <span>{year}</span>}
            <span>{typeLabel}</span>
            {title.vote_average != null && (
              <span>★ {title.vote_average.toFixed(1)}</span>
            )}
          </div>

          {title.genres && title.genres.length > 0 && (
            <div className={styles.genres}>
              {title.genres.map((g) => (
                <span key={g.id} className={styles.genre}>
                  {g.name}
                </span>
              ))}
            </div>
          )}

          {title.overview && (
            <p className={styles.overview}>{title.overview}</p>
          )}

          <section className={styles.providers}>
            <h2>Where to watch</h2>
            <ul className={styles.providerList}>
              {rows.map((row) => {
                const providerMeta = PROVIDERS.find(
                  (p) => p.code === row.provider,
                );
                return (
                  <li key={row.availability_id} className={styles.providerItem}>
                    <span
                      className={styles.providerDot}
                      style={{
                        background:
                          providerMeta?.color ?? "var(--foreground-muted)",
                      }}
                    />
                    <span className={styles.providerName}>
                      {providerMeta?.label ?? row.provider}
                    </span>
                    <span className={styles.availabilityType}>
                      {row.availability_type}
                    </span>
                    {row.watch_url && (
                      <a
                        href={row.watch_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.watchLink}
                      >
                        Watch →
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>
    </main>
  );
}
