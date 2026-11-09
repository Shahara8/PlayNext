import { getProviderByCode } from "@/lib/providers";
import type { SearchResultProvider } from "@/lib/search";
import styles from "./provider-badges.module.css";

export default function ProviderBadges({
  providers,
}: {
  providers: SearchResultProvider[];
}) {
  return (
    <div className={styles.badges}>
      {providers.map((p, i) => {
        const meta = getProviderByCode(p.provider);
        return (
          <span key={`${p.provider}-${i}`} className={`chip ${styles.badge}`}>
            <span
              className={styles.dot}
              style={{ background: meta?.color ?? "var(--text-muted)" }}
            />
            {meta?.label ?? p.provider}
          </span>
        );
      })}
    </div>
  );
}
