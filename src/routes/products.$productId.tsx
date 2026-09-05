import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { toast } from "sonner";
import { ArrowLeft, Loader2, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { OrderModal } from "@/components/nexas/OrderModal";
import { useFirebase } from "@/lib/firebase";
import { useCart } from "@/lib/cart-context";
import { useOptionalEventEngine } from "@/lib/event-context";
import { EventPrice } from "@/components/nexas/event/EventPrice";
import { useProducts } from "@/lib/store";
import { ReviewsSection } from "@/components/nexas/reviews/ReviewsSection";

import { ProductCard } from "@/components/nexas/ProductCard";
import { DELIVERY_CHARGE, DELIVERY_TIME, type Product } from "@/lib/types";
import { ChatModal } from "@/components/nexas/ChatModal";
import { getProductImageUrls } from "@/lib/product-display";

export const Route = createFileRoute("/products/$productId")({
  component: ProductDetails,
});

const FALLBACK =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='600' height='600'><rect width='100%25' height='100%25' fill='%23222'/><text x='50%25' y='50%25' fill='%23888' font-size='24' text-anchor='middle' dominant-baseline='middle'>No Image</text></svg>";

function ProductDetails() {
  const { productId } = useParams({ from: "/products/$productId" });
  const { db, ready } = useFirebase();
  const { addItem } = useCart();
  const engine = useOptionalEventEngine();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
 const [qty, setQty] = useState(1);
const [orderOpen, setOrderOpen] = useState(false);
const [chatOpen, setChatOpen] = useState(false);
const [activeImg, setActiveImg] = useState(0);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [optionError, setOptionError] = useState(false);



  useEffect(() => {
    if (!db) {
      if (ready) setLoading(false);
      return;
    }
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const snap = await getDoc(doc(db, "products", productId));
        if (active) {
          setProduct(snap.exists() ? ({ id: snap.id, ...(snap.data() as Omit<Product, "id">) }) : null);
          setActiveImg(0);
          setSelected({});
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [db, ready, productId]);

  const images = useMemo(() => {
    if (!product) return [];
    return getProductImageUrls(product);
  }, [product]);

  const options = product?.options ?? [];

 const ensureOptions = () => {
  const missing = options.some((o) => !selected[o.name]);
  setOptionError(missing);
  if (missing) toast.error("Please select all product options.");
  return !missing;
};

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center">
        <h1 className="font-display text-2xl font-bold">Product not found</h1>
        <p className="mt-2 text-muted-foreground">This product may have been removed.</p>
        <Button asChild variant="gold" className="mt-6">
          <Link to="/products">Back to shop</Link>
        </Button>
      </div>
    );
  }

  const mainSrc = images[activeImg] ?? images[0] ?? product.image;

  // Live event pricing overrides the base price for cart & direct orders.
  const eventPricing = engine?.priceFor(product) ?? null;
  const effectiveProduct: Product = eventPricing
    ? { ...product, price: eventPricing.final }
    : product;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <Button asChild variant="ghost" size="sm" className="mb-6 text-muted-foreground">
        <Link to="/products">
          <ArrowLeft className="size-4" /> Back to shop
        </Link>
      </Button>

      <div className="grid gap-10 lg:grid-cols-2">
        {/* Gallery */}
        <div className="space-y-3">
          <div className="overflow-hidden rounded-2xl border border-border/60 bg-secondary/40">
            <img
              src={mainSrc}
              alt={product.name}
              className="aspect-square w-full object-cover transition-opacity duration-300"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = FALLBACK;
              }}
            />
          </div>
          {images.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {images.map((img, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setActiveImg(i)}
                  className={`size-16 overflow-hidden rounded-lg border transition-all ${
                    i === activeImg
                      ? "border-primary ring-2 ring-primary/40"
                      : "border-border/60 opacity-70 hover:opacity-100"
                  }`}
                  aria-label={`View image ${i + 1}`}
                >
                  <img
                    src={img}
                    alt={`${product.name} ${i + 1}`}
                    className="size-full object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = FALLBACK;
                    }}
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col">
          <span className="w-fit rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            {product.category}
          </span>
          <h1 className="mt-4 font-display text-3xl font-bold sm:text-4xl">{product.name}</h1>
          <div className="mt-4">
            <EventPrice product={product} size="lg" />
          </div>
          <p className="mt-6 leading-relaxed text-muted-foreground">{product.description}</p>

          {/* Dynamic option selectors */}
          {options.length > 0 && (
            <div className="mt-6 space-y-4">
              {options.map((opt) => (
                <div key={opt.name}>
                  <Label className="mb-2 block font-medium">{opt.name}</Label>
                  <div className="flex flex-wrap gap-2">
                    {opt.values.map((value) => {
                      const active = selected[opt.name] === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => {
                            setSelected((s) => ({ ...s, [opt.name]: value }));
                            setOptionError(false);
                          }}
                          className={`rounded-lg border px-4 py-1.5 text-sm transition-all ${
                            active
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border/60 hover:border-primary/50"
                          }`}
                        >
                          {value}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              {optionError && (
                <p className="text-xs text-destructive">Please select all product options.</p>
              )}
            </div>
          )}

          <div className="mt-8 flex items-center gap-4">
            <div className="flex items-center rounded-lg border border-border/60">
              <button
                className="px-4 py-2 text-lg hover:text-primary"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
              >
                −
              </button>
              <span className="w-10 text-center font-medium">{qty}</span>
              <button
                className="px-4 py-2 text-lg hover:text-primary"
                onClick={() => setQty((q) => q + 1)}
              >
                +
              </button>
            </div>
          </div>

          <div className="mt-6 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
            <p>🚚 Delivery Charges: Rs. {DELIVERY_CHARGE} Nationwide</p>
            <p className="mt-1 text-muted-foreground">📦 Estimated Delivery Time: {DELIVERY_TIME}</p>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Button
              variant="goldOutline"
              size="lg"
              onClick={() => {
                if (!ensureOptions()) return;
                addItem(effectiveProduct, qty);
                toast.success(`${product.name} added to cart`);
              }}
            >
              <ShoppingCart className="size-4" /> Add to Cart
            </Button>
            <Button
              variant="gold"
              size="lg"
              onClick={() => {
                if (!ensureOptions()) return;
                setOrderOpen(true);
              }}
            >
              Place Order
            </Button>
            <Button
  variant="gold"
  size="lg"
  className="shadow-lg"
  onClick={() => setChatOpen(true)}
>
 💬 Chat with Seller
</Button>
          </div>
        </div>
      </div>

      <ReviewsSection productId={product.id} />

      <RelatedProducts category={product.category} excludeId={product.id} />

      <OrderModal
  product={effectiveProduct}
  open={orderOpen}
  onOpenChange={setOrderOpen}
  initialOptions={selected}
/>

<ChatModal
  open={chatOpen}
  onOpenChange={setChatOpen}
  product={product}
/>
    </div>
  );
}

function RelatedProducts({ category, excludeId }: { category: string; excludeId: string }) {
  const { products } = useProducts();
  const related = products.filter((p) => p.category === category && p.id !== excludeId).slice(0, 4);
  if (related.length === 0) return null;
  return (
    <section className="mt-16">
      <h2 className="font-display text-2xl font-bold sm:text-3xl">
        Related <span className="text-gold-gradient">Products</span>
      </h2>
      <div className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
        {related.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </section>
  );
}
