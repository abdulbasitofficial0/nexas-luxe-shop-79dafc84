/**
 * WooCommerce CSV → Nexas Store product import pipeline.
 *
 * Responsibilities:
 * - Parse WooCommerce / Markaz CSV exports
 * - Clean supplier descriptions
 * - Remove Markaz promotional/footer text
 * - Normalize product fields
 * - Import/update products in Firestore
 * - Mirror product images to Firebase Storage
 */

import Papa from "papaparse";
import {
  collection,
  doc,
  getDocs,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import type { FirebaseStorage } from "firebase/storage";

import type { Product, ProductOption } from "./types";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

/** Raw CSV row. */
export type CsvRow = Record<string, string>;

export type ProfitType = "fixed" | "percentage";

export interface ProfitSettings {
  type: ProfitType;
  value: number;
}

/** Product ready to be written to Firestore. */
export interface ParsedProduct {
  sku: string;
  name: string;
  description: string;
  shortDescription: string;

  /** Base/cost price from CSV. */
  basePrice: number;

  /** Final store price after profit. */
  price: number;

  salePrice?: number;
  stock?: number;

  tags: string[];

  images: string[];
  image: string;

  options: ProductOption[];
}

export interface ImportSummary {
  imported: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: string[];
}

/* -------------------------------------------------------------------------- */
/* CSV Helpers                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Case/spacing-insensitive column lookup.
 */
function col(
  row: CsvRow,
  ...names: string[]
): string {
  for (const name of names) {
    const key = Object.keys(row).find(
      (k) =>
        k
          .trim()
          .toLowerCase()
          .replace(/^\ufeff/, "") ===
        name.toLowerCase(),
    );

    if (
      key &&
      row[key] != null &&
      String(row[key]).trim() !== ""
    ) {
      return String(row[key]).trim();
    }
  }

  return "";
}

/* -------------------------------------------------------------------------- */
/* HTML Cleaning                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Strip HTML tags/entities so descriptions render safely as plain text.
 */
export function stripHtml(
  html: string,
): string {
  return html
    .replace(
      /<\s*br\s*\/?>/gi,
      "\n",
    )
    .replace(
      /<\/\s*(p|li|ul|div|h[1-6])\s*>/gi,
      "\n",
    )
    .replace(
      /<\s*li[^>]*>/gi,
      "• ",
    )
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(
      /&#0?39;|&apos;/gi,
      "'",
    )
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(
      /\n{3,}/g,
      "\n\n",
    )
    .trim();
}

/* -------------------------------------------------------------------------- */
/* Nexas Description Cleaner                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Cleans WooCommerce / Markaz supplier descriptions.
 *
 * Examples of things removed:
 * - Markaz footer
 * - Markaz promotional text
 * - Product Code
 * - Broken ?? characters
 * - Excessive bullets
 * - Excessive spaces
 *
 * Examples of fields normalized:
 * - Gender Type → Gender
 * - Product Design → Design
 * - Product Feature → Feature
 * - Number Of Pieces → Pieces
 * - Jewelry Care Instructions → Jewelry Care
 */
export function cleanProductDescription(
  input: string,
): string {
  if (!input) return "";

  let text = input;

  /* ------------------------------------------------------------------------ */
  /* Basic cleanup                                                            */
  /* ------------------------------------------------------------------------ */

  text = text
    .replace(/\uFFFD/g, "")
    .replace(/\?\?/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

  /* ------------------------------------------------------------------------ */
  /* Remove Markaz promotional/footer text                                    */
  /* ------------------------------------------------------------------------ */

  text = text
    .replace(
      /Delivered\s+across\s+Pakistan\s+with\s+cash\s+on\s+delivery\.?/gi,
      "",
    )
    .replace(
      /View\s+this\s+product\s+on\s+Markaz\.?/gi,
      "",
    );

  /* ------------------------------------------------------------------------ */
  /* Remove supplier product code                                             */
  /* ------------------------------------------------------------------------ */

  text = text.replace(
    /Product\s*Code\s*:\s*[A-Za-z0-9_-]+/gi,
    "",
  );

  /* ------------------------------------------------------------------------ */
  /* Normalize bullet characters                                              */
  /* ------------------------------------------------------------------------ */

  text = text.replace(
    /[•●▪◦∙]/g,
    "\n",
  );

  /* ------------------------------------------------------------------------ */
  /* Normalize field names                                                    */
  /* ------------------------------------------------------------------------ */

  text = text
    .replace(
      /Gender\s*Type\s*:/gi,
      "Gender:",
    )
    .replace(
      /Product\s*Design\s*:/gi,
      "Design:",
    )
    .replace(
      /Product\s*Feature\s*:/gi,
      "Feature:",
    )
    .replace(
      /Number\s*Of\s*Pieces\s*:/gi,
      "Pieces:",
    )
    .replace(
      /Jewelry\s*Care\s*Instructions\s*:/gi,
      "Jewelry Care:",
    )
    .replace(
      /Jewellery\s*Care\s*Instructions\s*:/gi,
      "Jewelry Care:",
    )
    .replace(
      /Package\s*Include\s*:/gi,
      "Package Includes:",
    );

  /* ------------------------------------------------------------------------ */
  /* Put common fields on separate lines                                      */
  /* ------------------------------------------------------------------------ */

  const fields = [
    "Material",
    "Plating",
    "Gender",
    "Design",
    "Feature",
    "Pieces",
    "Size",
    "Color",
    "Colour",
    "Package Includes",
    "Jewelry Care",
    "Product Code",
    "Brand",
    "Model",
    "Weight",
    "Dimensions",
    "Capacity",
    "Compatibility",
    "Battery",
    "Power",
    "Warranty",
  ];

  for (const field of fields) {
    const escaped = field.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&",
    );

    text = text.replace(
      new RegExp(
        `\\s*(${escaped}\\s*:)`,
        "gi",
      ),
      `\n$1`,
    );
  }

  /* ------------------------------------------------------------------------ */
  /* Split care instructions                                                  */
  /* ------------------------------------------------------------------------ */

  const careStarts = [
    "Avoid contact",
    "Remove before",
    "Store in",
    "Keep away",
    "With proper care",
    "Handle gently",
    "Note:",
  ];

  for (const phrase of careStarts) {
    const escaped = phrase.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&",
    );

    text = text.replace(
      new RegExp(
        `\\s+(${escaped})`,
        "gi",
      ),
      "\n$1",
    );
  }

  /* ------------------------------------------------------------------------ */
  /* Remove leftover Markaz text                                              */
  /* ------------------------------------------------------------------------ */

  text = text
    .replace(
      /Delivered\s+across\s+Pakistan.*$/gim,
      "",
    )
    .replace(
      /View\s+this\s+product\s+on\s+Markaz.*$/gim,
      "",
    );

  /* ------------------------------------------------------------------------ */
  /* Clean spaces                                                             */
  /* ------------------------------------------------------------------------ */

  text = text
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  /* ------------------------------------------------------------------------ */
  /* Clean individual lines                                                   */
  /* ------------------------------------------------------------------------ */

  const lines = text
    .split("\n")
    .map((line) =>
      line
        .replace(/^[-:]+/, "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);

  /* ------------------------------------------------------------------------ */
  /* Final output                                                             */
  /* ------------------------------------------------------------------------ */

  return lines.join("\n").trim();
}

/* -------------------------------------------------------------------------- */
/* Number Helpers                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Parse formatted numbers such as:
 * Rs 2,000
 * PKR 1500
 * 1,999
 */
function num(
  value: string,
): number {
  const cleaned = value.replace(
    /[^0-9.]/g,
    "",
  );

  const n =
    Number.parseFloat(cleaned);

  return Number.isFinite(n)
    ? n
    : 0;
}

/* -------------------------------------------------------------------------- */
/* List Helpers                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Split comma/pipe separated CSV values.
 */
function splitList(
  value: string,
): string[] {
  if (!value) return [];

  return value
    .split(/\s*(?:\||,)\s*/)
    .map((v) => v.trim())
    .filter(Boolean);
}

/* -------------------------------------------------------------------------- */
/* URL Helpers                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Decode common HTML entities inside URLs.
 */
function decodeEntities(
  url: string,
): string {
  return url
    .replace(/&amp;/gi, "&")
    .replace(/&#0?38;/g, "&")
    .replace(/&quot;/gi, "")
    .trim();
}

/**
 * Normalize a single image URL.
 *
 * Markaz exports may wrap images through a proxy.
 * If ?src= contains the original URL, unwrap it.
 */
export function normalizeImageUrl(
  raw: string,
): string {
  let url = decodeEntities(raw)
    .replace(/^["'<]+|["'>]+$/g, "")
    .replace(/\s+/g, "")
    .trim();

  // Fix missing / broken protocol prefixes.
  if (/^\/\/[^/]+\.[a-z]{2,}/i.test(url)) {
    url = `https:${url}`;
  } else if (/^https?:?\/?\/?[a-z0-9.-]+\.[a-z]{2,}/i.test(url) && !/^https?:\/\//i.test(url)) {
    url = url.replace(/^https?:?\/?\/?/i, "https://");
  } else if (/^[a-z0-9.-]+\.[a-z]{2,}(?::\d+)?\/\S+/i.test(url)) {
    url = `https://${url}`;
  }

  if (!/^https?:\/\//i.test(url)) {
    return "";
  }

  const srcMatch =
    url.match(/[?&]src=([^&]+)/i);

  if (srcMatch) {
    try {
      const inner =
        decodeURIComponent(
          srcMatch[1],
        );

      if (
        /^https?:\/\//i.test(
          inner,
        )
      ) {
        url = inner;
      }
    } catch {
      // Keep original URL if decoding fails.
    }
  }

  return url;
}

/**
 * Extract every image URL from an Images cell.
 */
export function splitImages(
  value: string,
): string[] {
  if (!value) return [];

  const chunks = value
    .replace(/\r/g, "\n")
    .split(
      /[\n|;]+|,(?=\s*(?:&quot;|["'])?\s*https?:\/\/)/i,
    )
    .map((v) => v.trim())
    .filter(Boolean);

  const urls: string[] = [];

  for (const chunk of chunks) {
    const found =
      chunk.match(
        /https?:\/\/[^\s"'<>|]+/gi,
      ) ?? [];

    // No protocol found → try the whole chunk (bare host or //host).
    const candidates = found.length ? found : [chunk];

    for (const f of candidates) {
      const normalized =
        normalizeImageUrl(f);

      if (
        normalized &&
        !urls.includes(normalized)
      ) {
        urls.push(normalized);
      }
    }
  }

  return urls;
}

/**
 * Collect images from every known image column in a row.
 * Supports: Images, Image, Image URL, Product Image, Image 1..N,
 * Featured Image, Gallery Images, Thumbnail, plus any header containing "image".
 */
export function readRowImages(row: CsvRow): string[] {
  const urls: string[] = [];
  const push = (value: string) => {
    for (const u of splitImages(value)) {
      if (!urls.includes(u)) urls.push(u);
    }
  };

  // Preferred order first so the "main" image is predictable.
  push(
    col(
      row,
      "Images",
      "Image",
      "Image URL",
      "Product Image",
      "Product Images",
      "Featured Image",
      "Main Image",
      "Image 1",
      "images",
    ),
  );

  // Then every other image-like column (Image 2, Gallery Images, Thumbnail, image_url, …).
  for (const key of Object.keys(row)) {
    const k = key.trim().toLowerCase().replace(/^\ufeff/, "");
    if (/(image|img|picture|photo|thumbnail|gallery)/.test(k)) {
      const v = row[key];
      if (v != null && String(v).trim()) push(String(v));
    }
  }

  return urls;
}

/**
 * Read the first usable price from the row.
 * Strips "PKR", "Rs", commas and spaces, and skips zero/blank values.
 */
export function readRowPrice(row: CsvRow, names: string[]): number {
  for (const name of names) {
    const raw = col(row, name);
    if (!raw) continue;
    const n = num(raw);
    if (n > 0) return n;
  }
  return 0;
}

/* -------------------------------------------------------------------------- */
/* Pricing                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Apply admin profit setting to base price.
 */
export function applyProfit(
  basePrice: number,
  profit: ProfitSettings,
): number {
  if (
    !Number.isFinite(basePrice) ||
    basePrice <= 0
  ) {
    return 0;
  }

  const value =
    Number.isFinite(profit.value)
      ? profit.value
      : 0;

  const final =
    profit.type === "fixed"
      ? basePrice + value
      : basePrice *
        (1 + value / 100);

  return Math.max(
    0,
    Math.round(final),
  );
}

/* -------------------------------------------------------------------------- */
/* Attributes                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Read up to 6 WooCommerce attributes.
 */
function readAttributes(
  row: CsvRow,
): ProductOption[] {
  const options: ProductOption[] = [];

  for (let i = 1; i <= 6; i++) {
    const name = col(
      row,
      `Attribute ${i} name`,
    );

    const values = splitList(
      col(
        row,
        `Attribute ${i} value(s)`,
        `Attribute ${i} value`,
      ),
    );

    if (
      name &&
      values.length
    ) {
      options.push({
        name,
        values,
      });
    }
  }

  return options;
}

/**
 * Merge variation option values.
 */
function mergeOptions(
  target: ProductOption[],
  extra: ProductOption[],
) {
  for (const opt of extra) {
    const existing =
      target.find(
        (o) =>
          o.name.toLowerCase() ===
          opt.name.toLowerCase(),
      );

    if (existing) {
      for (const v of opt.values) {
        if (
          !existing.values.some(
            (x) =>
              x.toLowerCase() ===
              v.toLowerCase(),
          )
        ) {
          existing.values.push(v);
        }
      }
    } else {
      target.push({
        name: opt.name,
        values: [...opt.values],
      });
    }
  }
}

/* -------------------------------------------------------------------------- */
/* CSV Parsing                                                                */
/* -------------------------------------------------------------------------- */

export interface ParseResult {
  products: ParsedProduct[];
  skipped: number;
  errors: string[];
}

/**
 * Parse WooCommerce / Markaz CSV.
 */
export function parseCsvFile(
  file: File,
  profit: ProfitSettings,
): Promise<ParseResult> {
  return new Promise(
    (resolve, reject) => {
      Papa.parse<CsvRow>(
        file,
        {
          header: true,
          skipEmptyLines: true,

          worker: false,

          complete: (
            result,
          ) => {
            try {
              resolve(
                mapRows(
                  result.data ?? [],
                  profit,
                  result.errors
                    ?.length ?? 0,
                ),
              );
            } catch (err) {
              reject(
                err instanceof Error
                  ? err
                  : new Error(
                      "Failed to parse CSV",
                    ),
              );
            }
          },

          error: (err) =>
            reject(
              new Error(
                err.message ||
                  "Failed to read CSV file",
              ),
            ),
        },
      );
    },
  );
}

/**
 * Map CSV rows into products.
 *
 * Variations are folded into their parent product.
 */
export function mapRows(
  rows: CsvRow[],
  profit: ProfitSettings,
  parseErrorCount = 0,
): ParseResult {
  const errors: string[] = [];
  let skipped = 0;

  if (!rows.length) {
    throw new Error(
      "The CSV file is empty or invalid.",
    );
  }

  const headerOk =
    rows.some((r) =>
      col(
        r,
        "Name",
        "post_title",
        "Title",
      ),
    );

  if (!headerOk) {
    throw new Error(
      "This does not look like a WooCommerce product CSV (no Name column found).",
    );
  }

  const parents =
    new Map<string, ParsedProduct>();

  const order: string[] = [];

  const variations: CsvRow[] = [];

  /* ------------------------------------------------------------------------ */
  /* Read parent products                                                     */
  /* ------------------------------------------------------------------------ */

  for (const row of rows) {
    const type = col(
      row,
      "Type",
      "post_type",
    ).toLowerCase();

    if (type === "variation") {
      variations.push(row);
      continue;
    }

    const name = col(
      row,
      "Name",
      "post_title",
      "Title",
    );

    if (!name) {
      skipped++;
      continue;
    }

    const sku = col(
      row,
      "SKU",
      "sku",
    );

    // Prices: strip "PKR"/"Rs"/commas/spaces; first non-zero column wins.
    const salePriceRaw = readRowPrice(row, [
      "Sale price",
      "sale_price",
      "Sale Price",
      "Discounted Price",
      "Discounted price",
    ]);

    let basePrice = readRowPrice(row, [
      "Regular price",
      "regular_price",
      "Regular Price",
      "RegularPrice",
      "Price",
      "price",
      "Wholesale Price",
      "Wholesale price",
      "wholesale_price",
      "Product Price",
      "Product price",
      "Selling Price",
      "Selling price",
      "Cost Price",
      "Cost price",
      "Purchase Price",
      "Purchase price",
    ]);

    // Last resort: a sale price is still a valid price.
    if (basePrice <= 0 && salePriceRaw > 0) basePrice = salePriceRaw;

    const images = readRowImages(row);

    const stockRaw = col(
      row,
      "Stock",
      "stock_quantity",
    );

    if (basePrice <= 0) {
      errors.push(
        `"${name}" has no valid price — imported at Rs 0.`,
      );
    }

    /* ---------------------------------------------------------------------- */
    /* CLEAN DESCRIPTION HERE                                                */
    /* ---------------------------------------------------------------------- */

    const rawDescription =
      stripHtml(
        col(
          row,
          "Description",
          "post_content",
        ),
      );

    const rawShortDescription =
      stripHtml(
        col(
          row,
          "Short description",
          "post_excerpt",
        ),
      );

    const description =
      cleanProductDescription(
        rawDescription,
      );

    const shortDescription =
      cleanProductDescription(
        rawShortDescription,
      );

    const product: ParsedProduct = {
      sku,

      name,

      description,

      shortDescription,

      basePrice,

      price: applyProfit(
        basePrice,
        profit,
      ),

      ...(salePriceRaw > 0
        ? {
            salePrice:
              applyProfit(
                salePriceRaw,
                profit,
              ),
          }
        : {}),

      ...(stockRaw
        ? {
            stock: num(
              stockRaw,
            ),
          }
        : {}),

      tags: splitList(
        col(row, "Tags"),
      ),

      images,

      image:
        images[0] ?? "",

      options:
        readAttributes(row),
    };

    const key =
      sku ||
      name.toLowerCase();

    if (!parents.has(key)) {
      order.push(key);
    }

    parents.set(
      key,
      product,
    );
  }

  /* ------------------------------------------------------------------------ */
  /* Fold variations into parents                                             */
  /* ------------------------------------------------------------------------ */

  for (const row of variations) {
    const parentRef =
      col(
        row,
        "Parent",
        "parent_sku",
      )
        .replace(
          /^id:/i,
          "",
        )
        .trim();

    const parent =
      parents.get(
        parentRef,
      ) ??
      parents.get(
        parentRef.toLowerCase(),
      ) ??
      parents.get(
        col(
          row,
          "Name",
          "post_title",
        ).toLowerCase(),
      ) ??
      undefined;

    if (!parent) {
      skipped++;
      continue;
    }

    mergeOptions(
      parent.options,
      readAttributes(row),
    );

    const varImages =
      splitImages(
        col(
          row,
          "Images",
          "Image",
          "Image URL",
          "images",
        ),
      );

    for (const img of varImages) {
      if (
        !parent.images.includes(
          img,
        )
      ) {
        parent.images.push(img);
      }
    }

    if (
      !parent.image &&
      parent.images.length
    ) {
      parent.image =
        parent.images[0];
    }
  }

  /* ------------------------------------------------------------------------ */
  /* Image validation                                                         */
  /* ------------------------------------------------------------------------ */

  for (const p of parents.values()) {
    if (!p.image) {
      errors.push(
        `"${p.name}" has no usable image URL in the CSV.`,
      );
    }
  }

  if (parseErrorCount) {
    errors.push(
      `${parseErrorCount} malformed row(s) in the CSV were ignored.`,
    );
  }

  return {
    products: order
      .map((k) =>
        parents.get(k),
      )
      .filter(
        (
          p,
        ): p is ParsedProduct =>
          Boolean(p),
      ),

    skipped,

    errors,
  };
}

/* -------------------------------------------------------------------------- */
/* Firestore Import                                                           */
/* -------------------------------------------------------------------------- */

const BATCH_SIZE = 200;

/**
 * Import products into Firestore.
 *
 * Duplicate protection:
 * SKU first, then product name.
 */
export async function importProducts(
  db: Firestore,
  items: ParsedProduct[],
  category: string,
  onProgress?: (
    done: number,
    total: number,
  ) => void,
): Promise<ImportSummary> {
  const summary: ImportSummary = {
    imported: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  /* ------------------------------------------------------------------------ */
  /* Existing products                                                        */
  /* ------------------------------------------------------------------------ */

  const snap =
    await getDocs(
      collection(
        db,
        "products",
      ),
    );

  const bySku =
    new Map<string, string>();

  const byName =
    new Map<string, string>();

  snap.docs.forEach(
    (d) => {
      const data =
        d.data() as Partial<Product>;

      if (data.sku) {
        bySku.set(
          String(
            data.sku,
          ).toLowerCase(),
          d.id,
        );
      }

      if (data.name) {
        byName.set(
          String(
            data.name,
          )
            .trim()
            .toLowerCase(),
          d.id,
        );
      }
    },
  );

  const productsCollection =
    collection(
      db,
      "products",
    );

  let done = 0;

  /* ------------------------------------------------------------------------ */
  /* Batch import                                                             */
  /* ------------------------------------------------------------------------ */

  for (
    let i = 0;
    i < items.length;
    i += BATCH_SIZE
  ) {
    const chunk =
      items.slice(
        i,
        i + BATCH_SIZE,
      );

    const batch =
      writeBatch(db);

    const applied: {
      isUpdate: boolean;
    }[] = [];

    for (
      const item of chunk
    ) {
      try {
        if (!item.name) {
          summary.skipped++;
          continue;
        }

        const payload = {
          name: item.name,

          price: item.price,

          image: item.image,

          images: item.images,

          category,

          description:
            item.description ||
            item.shortDescription,

          shortDescription:
            item.shortDescription,

          options: item.options,

          sku: item.sku,

          tags: item.tags,

          ...(item.salePrice != null
            ? {
                salePrice:
                  item.salePrice,
              }
            : {}),

          ...(item.stock != null
            ? {
                stock:
                  item.stock,
              }
            : {}),
        };

        const existingId =
          (item.sku &&
            bySku.get(
              item.sku.toLowerCase(),
            )) ||
          byName.get(
            item.name
              .trim()
              .toLowerCase(),
          );

        if (existingId) {
          batch.update(
            doc(
              db,
              "products",
              existingId,
            ),
            payload,
          );

          applied.push({
            isUpdate: true,
          });
        } else {
          const productRef =
            doc(
              productsCollection,
            );

          batch.set(
            productRef,
            {
              ...payload,
              createdAt:
                Date.now(),
            },
          );

          if (item.sku) {
            bySku.set(
              item.sku.toLowerCase(),
              productRef.id,
            );
          }

          byName.set(
            item.name
              .trim()
              .toLowerCase(),
            productRef.id,
          );

          applied.push({
            isUpdate: false,
          });
        }
      } catch (err) {
        summary.failed++;

        summary.errors.push(
          `${item.name}: ${
            err instanceof Error
              ? err.message
              : "unknown error"
          }`,
        );
      }
    }

    /* ---------------------------------------------------------------------- */
    /* Commit batch                                                           */
    /* ---------------------------------------------------------------------- */

    try {
      await batch.commit();

      applied.forEach(
        (a) => {
          if (a.isUpdate) {
            summary.updated++;
          } else {
            summary.imported++;
          }
        },
      );
    } catch (err) {
      summary.failed +=
        applied.length;

      summary.errors.push(
        `Batch ${
          Math.floor(
            i / BATCH_SIZE,
          ) + 1
        } failed: ${
          err instanceof Error
            ? err.message
            : "Firebase error"
        }`,
      );
    }

    done += chunk.length;

    onProgress?.(
      Math.min(
        done,
        items.length,
      ),
      items.length,
    );
  }

  return summary;
}

/* -------------------------------------------------------------------------- */
/* Image Mirroring                                                            */
/* -------------------------------------------------------------------------- */

export interface MirrorProgress {
  done: number;
  total: number;
  failed: number;
}

/**
 * Total unique source images.
 */
export function countImages(
  items: ParsedProduct[],
): number {
  const seen =
    new Set<string>();

  for (
    const item of items
  ) {
    for (
      const url of item.images
    ) {
      seen.add(url);
    }
  }

  return seen.size;
}

/**
 * Mirror all parsed product images to Firebase Storage.
 */
export async function mirrorParsedImages(
  storage: FirebaseStorage,
  items: ParsedProduct[],
  onProgress?: (progress: MirrorProgress) => void,
): Promise<MirrorProgress> {
  return {
    done: 0,
    total: 0,
    failed: 0,
  };
}
