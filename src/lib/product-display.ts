import type { Product } from "./types";

/** Neutral inline SVG shown whenever a product picture is missing or fails to load. */
export const PRODUCT_PLACEHOLDER =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'>` +
      `<rect width='200' height='200' fill='#1c1c1c'/>` +
      `<rect x='50' y='58' width='100' height='84' rx='8' fill='none' stroke='#5c4a1e' stroke-width='5'/>` +
      `<circle cx='80' cy='86' r='10' fill='#5c4a1e'/>` +
      `<path d='M60 130l28-30 20 20 14-14 18 24z' fill='#5c4a1e'/>` +
      `</svg>`,
  );

/**
 * Cleans a single catalog image URL from Firebase / CSV imports.
 * Handles quotes, markdown links, brackets, stray whitespace, protocol-relative
 * URLs (`//cdn…`) and bare hostnames missing `https://`.
 */
export function cleanProductImageUrl(value?: unknown): string {
  if (value == null) return "";

  let url = String(value).trim().replace(/\s+/g, "");
  if (!url) return "";

  url = url.replace(/^["'`]+|["'`]+$/g, "").trim();
  url = url.replace(/^\[+|\]+$/g, "").trim();

  const markdownLink = url.match(
    /^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/i,
  );
  if (markdownLink?.[2]) {
    return markdownLink[2].trim();
  }

  const markdownImage = url.match(
    /^!\[[^\]]*\]\((https?:\/\/[^)]+)\)$/i,
  );
  if (markdownImage?.[1]) {
    return markdownImage[1].trim();
  }

  if (/^data:image\//i.test(url)) return url;

  const extractedUrl = url.match(/https?:\/\/[^\s)\]"']+/i);
  if (extractedUrl?.[0]) {
    return extractedUrl[0].trim();
  }

  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  // Protocol-relative → https
  if (/^\/\/[^/]+\.[a-z]{2,}/i.test(url)) return `https:${url}`;

  // Bare hostname with path, e.g. "cdn.example.com/img.jpg"
  if (/^[a-z0-9.-]+\.[a-z]{2,}(?::\d+)?\/\S+/i.test(url)) return `https://${url}`;

  // "http:/example.com" or "https//example.com" typos
  const typo = url.match(/^https?:?\/?\/?([a-z0-9.-]+\.[a-z]{2,}\/\S*)/i);
  if (typo?.[1]) return `https://${typo[1]}`;

  return "";
}

/** Main display image for a product, or the placeholder when none is usable. */
export function getProductMainImage(product: Pick<Product, "image" | "images">): string {
  return getProductImageUrls(product as Product)[0] ?? PRODUCT_PLACEHOLDER;
}

/** All usable image URLs for a product (`images[]` first, then `image`). */
export function getProductImageUrls(product: Product): string[] {
  const images: string[] = [];

  if (Array.isArray(product.images)) {
    for (const rawImage of product.images) {
      const image = cleanProductImageUrl(rawImage);
      if (image && !images.includes(image)) {
        images.push(image);
      }
    }
  }

  const mainImage = cleanProductImageUrl(product.image);
  if (mainImage && !images.includes(mainImage)) {
    images.push(mainImage);
  }

  return images;
}

/** Parse catalog price safely (handles numeric and string values). */
export function parseProductPrice(price: unknown): number | null {
  if (typeof price === "number") {
    return Number.isFinite(price) && price >= 0 ? price : null;
  }

  if (typeof price === "string") {
    const cleaned = price.replace(/[^\d.]/g, "");
    if (!cleaned) return null;

    const parsed = Number(cleaned);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }

  return null;
}

/** Format price for display, e.g. "Rs 1,500". */
export function formatProductPrice(price: unknown): string {
  const parsed = parseProductPrice(price);
  if (parsed == null) return "Price unavailable";
  return `Rs ${parsed.toLocaleString()}`;
}
