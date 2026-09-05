import { useEffect, useState, type ImgHTMLAttributes } from "react";
import { PRODUCT_PLACEHOLDER, cleanProductImageUrl } from "@/lib/product-display";

interface Props extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "onError"> {
  /** Raw image URL (may be dirty, empty, or broken). */
  src?: string | null;
}

/**
 * Product picture that always renders something: cleans the URL and swaps in a
 * neutral placeholder if the URL is missing or fails to load.
 */
export function ProductImage({ src, alt = "", ...rest }: Props) {
  const clean = cleanProductImageUrl(src) || PRODUCT_PLACEHOLDER;
  const [current, setCurrent] = useState(clean);

  useEffect(() => {
    setCurrent(clean);
  }, [clean]);

  return (
    <img
      {...rest}
      src={current}
      alt={alt}
      onError={() => {
        if (current !== PRODUCT_PLACEHOLDER) setCurrent(PRODUCT_PLACEHOLDER);
      }}
    />
  );
}
