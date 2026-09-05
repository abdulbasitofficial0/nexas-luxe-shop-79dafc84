import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { collection, doc, setDoc } from "firebase/firestore";
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

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  categories: string[];
}

export function BulkAddProductsDialog({ open, onOpenChange, categories }: Props) {
  const { db } = useFirebase();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState("");
  const [image, setImage] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setName("");
    setPrice("");
    setCategory("");
    setImage("");
    setDescription("");
  };

  const close = (v: boolean) => {
    if (saving) return;
    if (!v) resetForm();
    onOpenChange(v);
  };

  const saveProduct = async () => {
    if (!db) {
      toast.error("Store not connected.");
      return;
    }

    const trimmedName = name.trim();
    const trimmedCategory = category.trim();
    const cleanedPrice = Number(String(price).replace(/[^0-9.]/g, ""));
    const cleanedImg = cleanProductImageUrl(image);

    if (!trimmedName) return toast.error("Product name is required.");
    if (!Number.isFinite(cleanedPrice) || cleanedPrice <= 0)
      return toast.error("Enter a valid price.");
    if (!trimmedCategory) return toast.error("Category is required.");

    setSaving(true);
    try {
      const col = collection(db, "products");
      const newDocRef = doc(col);
      
      await setDoc(newDocRef, {
        name: trimmedName,
        price: cleanedPrice,
        category: trimmedCategory,
        description: description.trim(),
        image: cleanedImg,
        images: cleanedImg ? [cleanedImg] : [],
        options: [],
        createdAt: Date.now(),
      });

      toast.success("Product saved successfully");
      resetForm();
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error("Failed to save product");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Add Product</DialogTitle>
          <DialogDescription>
            Fill in the product details to add a new item to your store.
          </DialogDescription>
        </DialogHeader>

        <datalist id="bulk-categories">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>

        <div className="space-y-4 rounded-xl border border-border/60 bg-card p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="prod-name">Product Name</Label>
              <Input
                id="prod-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="prod-price">Price (Rs)</Label>
              <Input
                id="prod-price"
                type="number"
                min={0}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="prod-cat">Category</Label>
              <Input
                id="prod-cat"
                list="bulk-categories"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="prod-img">Image URL</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="prod-img"
                  placeholder="https://…"
                  value={image}
                  onChange={(e) => setImage(e.target.value)}
                />
                <ProductImage
                  src={image}
                  alt=""
                  className="size-9 shrink-0 rounded-md border border-border/60 object-cover"
                />
              </div>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="prod-desc">Description</Label>
              <Textarea
                id="prod-desc"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => close(false)} disabled={saving}>
            Cancel
          </Button>
          <Button variant="gold" onClick={saveProduct} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Save Product
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
