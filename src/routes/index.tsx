import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Loader2, PackageSearch, ShieldCheck, Truck, Wallet } from "lucide-react";
import { Hero } from "@/components/nexas/Hero";
import { ProductCard } from "@/components/nexas/ProductCard";
import { Reviews } from "@/components/nexas/Reviews";
import { ContactSection } from "@/components/nexas/ContactSection";
import { Button } from "@/components/ui/button";
import { useProducts } from "@/lib/store";

export const Route = createFileRoute("/")({
  component: Index,
});

const features = [
  { icon: Truck, title: "Fast Delivery", text: "Nationwide shipping across Pakistan." },
  { icon: Wallet, title: "Flexible Payment", text: "EasyPaisa, JazzCash & Cash on Delivery." },
  { icon: ShieldCheck, title: "Secure Orders", text: "Your details are always protected." },
];

function Index() {
  const { products, loading } = useProducts();

  const categories = useMemo(() => {
    const map = new Map<string, number>();
    products.forEach((p) => map.set(p.category, (map.get(p.category) ?? 0) + 1));
    return Array.from(map.entries()).map(([name, count]) => ({ name, count }));
  }, [products]);

  const featured = products.slice(0, 8);

  return (
    <>
      <Hero />

{/* Trust Section */}
<section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
  <div className="rounded-2xl border border-border/60 bg-card p-8 text-center">
    <h2 className="mb-4 text-3xl font-bold">
      Why Shop With NexasStore?
    </h2>

    <p className="mb-8 text-muted-foreground">
      Your trusted destination for quality products at affordable prices.
    </p>

    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-xl border p-4">
        🚚
        <h3 className="mt-2 font-semibold">Fast Delivery</h3>
        <p className="text-sm text-muted-foreground">
          Delivery all over Pakistan.
        </p>
      </div>

      <div className="rounded-xl border p-4">
        💵
        <h3 className="mt-2 font-semibold">Cash on Delivery</h3>
        <p className="text-sm text-muted-foreground">
          Pay when you receive your order.
        </p>
      </div>

      <div className="rounded-xl border p-4">
        🔄
        <h3 className="mt-2 font-semibold">7 Day Return Policy</h3>
        <p className="text-sm text-muted-foreground">
          Easy returns within 7 days.
        </p>
      </div>

      <div className="rounded-xl border p-4">
        🔒
        <h3 className="mt-2 font-semibold">Secure Shopping</h3>
        <p className="text-sm text-muted-foreground">
          Safe and protected checkout.
        </p>
      </div>
    </div>

    <div className="mt-8 rounded-lg bg-yellow-100 p-4 font-semibold text-black">
      🔥 Limited Stock Available – Order Now Before It Sells Out!
    </div>
  </div>
</section>
      
      {/* Feature strip */}
      <section className="border-y border-border/60 bg-card/40">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-10 sm:grid-cols-3 sm:px-6">
          {features.map((f) => (
            <div key={f.title} className="flex items-center gap-4">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-gold-gradient shadow-gold">
                <f.icon className="size-5 text-primary-foreground" />
              </span>
              <div>
                <p className="font-semibold">{f.title}</p>
                <p className="text-sm text-muted-foreground">{f.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Categories */}
      {categories.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <div className="mb-8 flex items-end justify-between">
            <h2 className="font-display text-3xl font-bold">
              Shop by <span className="text-gold-gradient">Category</span>
            </h2>
          </div>
          <div className="flex flex-wrap gap-3">
            {categories.map((c) => (
              <Link
                key={c.name}
                to="/products"
                search={{ category: c.name, search: undefined }}
                className="rounded-full border border-border/60 bg-card px-5 py-2.5 text-sm font-medium transition-colors hover:border-primary hover:text-primary"
              >
                {c.name} <span className="text-muted-foreground">({c.count})</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Featured products */}
      <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6">
        <div className="mb-8 flex items-end justify-between">
          <h2 className="font-display text-3xl font-bold">
            Featured <span className="text-gold-gradient">Products</span>
          </h2>
          <Button asChild variant="link" className="text-primary">
            <Link to="/products">View all</Link>
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="size-8 animate-spin text-primary" />
          </div>
        ) : featured.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border/60 py-20 text-center">
            <PackageSearch className="size-10 text-muted-foreground" />
            <p className="font-medium">No products yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Products added from the admin dashboard will appear here in real time.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
            {featured.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </section>

      <Reviews />

      <ContactSection />
    </>
  );
}
