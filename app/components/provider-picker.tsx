import Link from "next/link";
import type { CSSProperties } from "react";
import { PROVIDERS } from "@/lib/providers";
import styles from "./provider-picker.module.css";

export default function ProviderPicker() {
  return (
    <div className={styles.grid}>
      {PROVIDERS.map((provider) => (
        <Link
          key={provider.code}
          href={`/browse/${provider.slug}`}
          className={styles.tile}
          style={{ "--provider-color": provider.color } as CSSProperties}
        >
          {provider.label}
        </Link>
      ))}
    </div>
  );
}
