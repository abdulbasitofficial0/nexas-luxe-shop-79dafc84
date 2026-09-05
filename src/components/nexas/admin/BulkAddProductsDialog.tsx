import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { collection, doc, writeBatch } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useFirebase } from "@/lib/firebase";
import { cleanProductImageUrl } from "@/lib/product-display";
import { ProductImage } from "@/components/nexas/ProductImage";

export const MAX_BULK_ROWS = 6;

interface Row {
  name: string;
  price: string;
  category: string;
  image: string;
  description: string;
}

const emptyRow = (): Row => ({ name: "", price: "", category: "", image: "", description: "" });

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Existing categories, offered as suggestions. */
  categories: string[];
}

/** Add up to six products at once and save them in a single batch. */
export function BulkAddProductsDialog({ open, onOpenChange, categories }: Props) {
  const { db } = useFirebase();
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [saving, setSaving] = useState(false);

  const update = (i: number, patch: Partial<Row>) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const addRow = () => setRows((r) => (r.length < MAX_BULK_ROWS ? [...r, emptyRow()] : r));
  const removeRow = (i: number) => setRows((r) => (r.length > 1 ? r.filter((_, idx) => idx !== i) : r));

  const close = (v: boolean) => {
    if (saving) return;
    if (!v) setRows([emptyRow()]);
    onOpenChange(v);
  };

  const saveAll = async () => {
    if (!db) {
      toast.error("Store not connected.");
      return;
    }
    const prepared = rows.map((r, i) => {
      const price = Number(String(r.price).replace(/[^0-9.]/g, ""));
      return {
        index: i + 1,
        name: r.name.trim(),
        price,
        category: r.category.trim(),
        image: cleanProductImageUrl(r.image),
        description: r.description.trim(),
      };
    });

    for (const p of prepared) {
      if (!p.name) return toast.error(`Row ${p.index}: product name is required.`);
      if (!Number.isFinite(p.price) || p.price <= 0)
        return toast.error(`Row ${p.index}: enter a valid price.`);
      if (!p.category) return toast.error(`Row ${p.index}: category is required.`);
    }

    setSaving(true);
    try {
      const batch = writeBatch(db);
      const col = collection(db, "products");
      const now = Date.now();
      prepared.forEach((p, i) => {
        batch.set(doc(col), {
          name: p.name,
          price: p.price,
          category: p.category,
          description: p.description,
          image: p.image,
          images: p.image ? [p.image] : [],
          options: [],
          createdAt: now + i,
        });
      });
      await batch.commit();
      toast.success(`${prepared.length} product(s) saved`);
      setRows([emptyRow()]);
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error("Failed to save products");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Bulk Add Products</DialogTitle>
          <DialogDescription>
            Fill in up to {MAX_BULK_ROWS} products and save them all at once.
          </DialogDescription>
        </DialogHeader>

        <datalist id="bulk-categories">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>

        <div className="space-y-4">
          {rows.map((row, i) => (
            <div key={i} className="rounded-xl border border-border/60 bg-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                  Product {i + 1}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-destructive"
                  onClick={() => removeRow(i)}
                  disabled={rows.length === 1}
                  aria-label="Remove row"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor={`b-name-${i}`}>Product Name</Label>
                  <Input
                    id={`b-name-${i}`}
                    value={row.name}
                    onChange={(e) => update(i, { name: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`b-price-${i}`}>Price (Rs)</Label>
                  <Input
                    id={`b-price-${i}`}
                    type="number"
                    min={0}
                    value={row.price}
                    onChange={(e) => update(i, { price: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`b-cat-${i}`}>Category</Label>
                  <Input
                    id={`b-cat-${i}`}
                    list="bulk-categories"
                    value={row.category}
                    onChange={(e) => update(i, { category: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`b-img-${i}`}>Image URL</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id={`b-img-${i}`}
                      placeholder="https://…"
                      value={row.image}
                      onChange={(e) => update(i, { image: e.target.value })}
                    />
                    <ProductImage
                      src={row.image}
                      alt=""
                      className="size-9 shrink-0 rounded-md border border-border/60 object-cover"
                    />
                  </div>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor={`b-desc-${i}`}>Description</Label>
                  <Textarea
                    id={`b-desc-${i}`}
                    rows={2}
                    value={row.description}
                    onChange={(e) => update(i, { description: e.target.value })}
                  />
                </div>
              </div>
            </div>
          ))}

          <Button
            type="button"
            variant="goldOutline"
            className="w-full"
            onClick={addRow}
            disabled={rows.length >= MAX_BULK_ROWS}
          >
            <Plus className="size-4" />
            {rows.length >= MAX_BULK_ROWS
              ? `Maximum ${MAX_BULK_ROWS} products`
              : `Add Another Product (${rows.length}/${MAX_BULK_ROWS})`}
          </Button>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => close(false)} disabled={saving}>
            Cancel
          </Button>
          <Button variant="gold" onClick={saveAll} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Save All Products ({rows.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
