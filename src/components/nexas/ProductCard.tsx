import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Eye, Heart, ShoppingCart, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { OrderModal } from "./OrderModal";
import { useCart } from "@/lib/cart-context";
import { useOptionalEventEngine } from "@/lib/event-context";
import { EventDiscountBadge, EventPrice } from "./event/EventPrice";
import { useFirebase } from "@/lib/firebase";
import { addToWishlist, removeFromWishlist, useWishlist } from "@/lib/auth";
import { cn } from "@/lib/utils";
import type { Product } from "@/lib/types";
import { ProductImage } from "./ProductImage";

/** Stable display rating derived from the product id (no ratings in the data model yet). */
function displayRating(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 1000;
  return (4.2 + (h % 8) / 10).toFixed(1);
}

export function ProductCard({ product }: { product: Product }) {
  const { addItem } = useCart();
  const engine = useOptionalEventEngine();
  const { db, user } = useFirebase();
  const { items } = useWishlist();
  const [orderOpen, setOrderOpen] = useState(false);
  const [quickView, setQuickView] = useState(false);

  const inWishlist = items.some((i) => i.id === product.id);
  const rating = displayRating(product.id);

  // During a live event the discounted price is what gets carted/ordered.
  const pricing = engine?.priceFor(product) ?? null;
  const effectiveProduct: Product = pricing ? { ...product, price: pricing.final } : product;

  const toggleWishlist = async () => {
    if (!user || !db) {
      toast.error("Please login to save items to your wishlist.");
      return;
    }
    try {
      if (inWishlist) {
        await removeFromWishlist(db, user.uid, product.id);
        toast.success("Removed from wishlist");
      } else {
        await addToWishlist(db, user.uid, {
          id: product.id,
          name: product.name,
          price: product.price,
          image: product.image,
        });
        toast.success("Added to wishlist");
      }
    } catch {
      toast.error("Failed to update wishlist");
    }
  };

  const addToCart = () => {
    addItem(effectiveProduct);
    toast.success(`${product.name} added to cart`);
  };

  return (
    <>
      <motion.article
        initial={{ opacity: 0, y: 18 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/80 shadow-elegant backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:border-primary/50"
      >
        <div className="relative aspect-square overflow-hidden bg-secondary/40">
          <Link
            to="/products/$productId"
            params={{ productId: product.id }}
            className="block size-full"
            aria-label={product.name}
          >
            <ProductImage
              src={product.image || product.images?.[0]}
              alt={product.name}
              loading="lazy"
              decoding="async"
              className="size-full object-cover transition-transform duration-500 group-hover:scale-110"
            />
          </Link>

          <EventDiscountBadge product={product} />

          <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-background/75 px-2 py-0.5 text-[10px] font-medium text-primary backdrop-blur">
            {product.category}
          </span>

          <motion.button
            type="button"
            whileTap={{ scale: 0.8 }}
            onClick={toggleWishlist}
            aria-label={inWishlist ? "Remove from wishlist" : "Add to wishlist"}
            className={cn(
              "absolute bottom-2 right-2 z-10 grid size-8 place-items-center rounded-full border border-border/60 bg-background/70 backdrop-blur transition-colors",
              inWishlist ? "text-primary" : "text-muted-foreground hover:text-primary",
            )}
          >
            <Heart className={cn("size-4", inWishlist && "fill-current")} />
          </motion.button>

          <button
            type="button"
            onClick={() => setQuickView(true)}
            aria-label="Quick view"
            className="absolute bottom-2 left-2 z-10 hidden size-8 place-items-center rounded-full border border-border/60 bg-background/70 text-muted-foreground backdrop-blur transition-colors hover:text-primary group-hover:grid"
          >
            <Eye className="size-4" />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-1.5 p-2.5 sm:p-3">
          <Link to="/products/$productId" params={{ productId: product.id }} className="min-w-0">
            <h3 className="line-clamp-1 text-sm font-semibold leading-tight transition-colors hover:text-primary sm:text-base">
              {product.name}
            </h3>
          </Link>

          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Star className="size-3 fill-primary text-primary" />
            <span className="font-medium text-foreground">{rating}</span>
            <span className="truncate">· {product.category}</span>
          </div>

          <div className="mt-auto pt-0.5">
            <EventPrice product={product} />
          </div>

          <div className="mt-1.5 flex gap-1.5">
            <Button
              variant="goldOutline"
              size="sm"
              className="h-8 flex-1 px-2 text-xs"
              onClick={addToCart}
            >
              <ShoppingCart className="size-3.5" />
              Add
            </Button>
            <Button
              variant="gold"
              size="sm"
              className="h-8 flex-1 px-2 text-xs"
              onClick={() => setOrderOpen(true)}
            >
              Buy
            </Button>
          </div>
        </div>
      </motion.article>

      <Dialog open={quickView} onOpenChange={setQuickView}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display">{product.name}</DialogTitle>
            <DialogDescription>{product.category}</DialogDescription>
          </DialogHeader>
          <ProductImage
            src={product.image || product.images?.[0]}
            alt={product.name}
            className="aspect-square w-full rounded-xl object-cover"
          />
          <EventPrice product={product} size="lg" />
          <p className="line-clamp-4 text-sm text-muted-foreground">{product.description}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="goldOutline" className="flex-1" onClick={addToCart}>
              <ShoppingCart className="size-4" /> Add to Cart
            </Button>
            <Button asChild variant="gold" className="flex-1">
              <Link to="/products/$productId" params={{ productId: product.id }}>
                View Details
              </Link>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <OrderModal product={effectiveProduct} open={orderOpen} onOpenChange={setOrderOpen} />
    </>
  );
}
