"use client";

import Image from "next/image";
import { useState } from "react";

// A TMDB poster that falls back to the title text when there's no poster, or
// when the image fails to load (TMDB's CDN erroring or a stale poster path),
// instead of showing a broken image.
export default function Poster({
  src,
  alt,
  sizes,
  className,
  fallbackClassName,
  decorative = false,
}: {
  src: string | null;
  alt: string;
  sizes: string;
  className: string;
  fallbackClassName: string;
  /** The title is already in text next to it (a card's link): hide the image
   * and the fallback text from screen readers so it isn't read twice. */
  decorative?: boolean;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (!src || failedSrc === src)
    return (
      <div className={fallbackClassName} aria-hidden={decorative || undefined}>
        {alt}
      </div>
    );
  return (
    <Image
      src={src}
      alt={decorative ? "" : alt}
      fill
      sizes={sizes}
      className={className}
      onError={() => setFailedSrc(src)}
    />
  );
}
