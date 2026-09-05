import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { signOut } from "firebase/auth";
import { toast } from "sonner";
import { CheckCircle2, ImagePlus, Loader2, LogOut, Pencil, Plus, ShieldAlert, Sparkles, Star, Trash2, Upload, Wallet, XCircle } from "lucide-react";
import { ImportProductsDialog } from "@/components/nexas/admin/ImportProductsDialog";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useFirebase } from "@/lib/firebase";
import { useUI } from "@/lib/ui-context";
import {
  addProduct,
  approveReview,
  deleteProduct,
  deleteReview,
  updateOrderStatus,
  updatePaymentVerified,
  updateProduct,
  useOrders,
  useProducts,
  useReviews,
  type ProductInput,
} from "@/lib/store";
import { ORDER_STATUSES, type Order, type OrderStatus, type Product } from "@/lib/types";
import { profitExists, saveProfit } from "@/lib/profits";
import { uploadProductFile, validateImageFile } from "@/lib/product-upload";
import { ChatsPanel } from "@/components/nexas/admin/ChatsPanel";
import { useChatThreads, unreadTotal } from "@/lib/chat";
import { usePresenceHeartbeat, ADMIN_PRESENCE_ID } from "@/lib/presence";
import { reviewImages } from "@/lib/reviews";

import { updateDoc, doc, deleteDoc } from "firebase/firestore";

export const Route = createFileRoute("/admin/")({
  component: Admin,
});

function Admin() {
  const { auth, user, ready } = useFirebase();
  const { openAdminLogin } = useUI();
  // Live unread badge + admin online presence for the chat system.
  const { threads: chatThreads } = useChatThreads();
  const unreadChats = unreadTotal(chatThreads, "admin");
  usePresenceHeartbeat(user ? ADMIN_PRESENCE_ID : null, "Nexas Support");

  if (!ready) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <ShieldAlert className="mx-auto size-12 text-primary" />
        <h1 className="mt-4 font-display text-2xl font-bold">Admin Access Required</h1>
        <p className="mt-2 text-muted-foreground">
          You must be signed in as an administrator to view this page.
        </p>
        <Button variant="gold" className="mt-6" onClick={openAdminLogin}>
          Admin Login
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">
            Admin <span className="text-gold-gradient">Dashboard</span>
          </h1>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="gold">
          <Link to="/admin/profit">
            <Wallet className="size-4" /> Profit Dashboard
          </Link>
        </Button>
        <Button asChild variant="gold">
          <Link to="/admin/events">
            <Sparkles className="size-4" /> Smart Event Engine
          </Link>
        </Button>

        <Button
          variant="goldOutline"
          onClick={async () => {
            if (auth) await signOut(auth);
            toast.success("Logged out");
          }}
        >
          <LogOut className="size-4" /> Logout
        </Button>
        </div>
      </div>

      <Tabs defaultValue="orders" className="mt-8">
       <TabsList>
  <TabsTrigger value="orders">Orders</TabsTrigger>
  <TabsTrigger value="products">Products</TabsTrigger>
  <TabsTrigger value="reviews">Reviews</TabsTrigger>
 <TabsTrigger value="chats" className="relative">
    Messages
    {unreadChats > 0 && (
      <span className="ml-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
        {unreadChats}
      </span>
    )}
  </TabsTrigger>
</TabsList>
        <TabsContent value="orders" className="mt-6">
          <OrdersPanel />
        </TabsContent>
        <TabsContent value="products" className="mt-6">
          <ProductsPanel />
        </TabsContent>
        <TabsContent value="reviews" className="mt-6">
          <ReviewsPanel />
        </TabsContent>
        <TabsContent value="chats" className="mt-6">
  <ChatsPanel />
</TabsContent>
      
      </Tabs>
    
    </div>
  );
}

const statusVariant: Record<OrderStatus, string> = {
  Pending: "bg-yellow-500/15 text-yellow-500 border-yellow-500/30",

  Processing: "bg-blue-500/15 text-blue-400 border-blue-500/30",

  "Out for Delivery":
    "bg-purple-500/15 text-purple-400 border-purple-500/30",

  "2nd Delivery Attempt":
    "bg-orange-500/15 text-orange-400 border-orange-500/30",

  Completed:
    "bg-green-500/15 text-green-400 border-green-500/30",

  Cancelled:
    "bg-red-500/15 text-red-400 border-red-500/30",
};

function OrdersPanel() {
  const { db, user } = useFirebase();
  const { orders, loading } = useOrders();
  const [term, setTerm] = useState("");
  const [filter, setFilter] = useState<"All" | OrderStatus>("All");
  /** Order awaiting a profit entry after being marked Completed. */
  const [profitOrder, setProfitOrder] = useState<Order | null>(null);


  const filtered = useMemo(() => {
    const t = term.toLowerCase().trim();
    return orders.filter((o) => {
      const matchStatus = filter === "All" || o.orderStatus === filter;
      const matchTerm =
        !t ||
        o.customerName.toLowerCase().includes(t) ||
        o.phoneNumber.toLowerCase().includes(t) ||
        o.productName.toLowerCase().includes(t) ||
        o.address.toLowerCase().includes(t);
      return matchStatus && matchTerm;
    });
  }, [orders, term, filter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search by customer, phone, product..."
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          className="max-w-sm"
        />
        <Select value={filter} onValueChange={(v) => setFilter(v as "All" | OrderStatus)}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All Statuses</SelectItem>
            {ORDER_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="ml-auto text-sm text-muted-foreground">{filtered.length} order(s)</span>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground">No orders found.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((o) => (
            <div key={o.id} className="rounded-xl border border-border/60 bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{o.productName}</p>
                  <p className="text-sm text-muted-foreground">
                    Rs {o.productPrice.toLocaleString()} × {o.quantity}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <Badge variant="outline" className={statusVariant[o.orderStatus]}>
                    {o.orderStatus}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={
                      o.paymentVerified
                        ? "border-green-500/30 bg-green-500/15 text-green-400"
                        : "border-red-500/30 bg-red-500/15 text-red-400"
                    }
                  >
                    {o.paymentVerified ? "Payment Verified" : "Not Verified"}
                  </Badge>
                </div>
              </div>
              <div className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                <p><span className="text-muted-foreground">Customer:</span> {o.customerName}</p>
                <p><span className="text-muted-foreground">Phone:</span> {o.phoneNumber}</p>
                <p>
  <span className="text-muted-foreground">Tracking ID:</span> {o.trackingId}
</p>
                <p className="sm:col-span-2"><span className="text-muted-foreground">Address:</span> {o.address}</p>
                <p><span className="text-muted-foreground">Payment:</span> {o.paymentMethod}</p>
                <p><span className="text-muted-foreground">Transaction ID:</span> {o.transactionId || "—"}</p>
                <p><span className="text-muted-foreground">Subtotal:</span> Rs {(o.subtotal ?? o.productPrice * o.quantity).toLocaleString()}</p>
                <p><span className="text-muted-foreground">COD Fee:</span> Rs {(o.codFee ?? 0).toLocaleString()}</p>
                <p className="font-medium"><span className="text-muted-foreground font-normal">Total:</span> <span className="text-primary">Rs {(o.totalAmount ?? o.productPrice * o.quantity).toLocaleString()}</span></p>
                <p><span className="text-muted-foreground">Date:</span> {o.createdAt ? new Date(o.createdAt).toLocaleString() : "—"}</p>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">Update status:</span>
                <Select
                  value={o.orderStatus}
                  onValueChange={async (v) => {
                    if (!db) return;
                    try {
                      await updateOrderStatus(db, o.id, v as OrderStatus);
                      toast.success("Order status updated");
                      // Ask for the profit once, the first time an order is completed.
                      if (v === "Completed" && !(await profitExists(db, o.id))) {
                        setProfitOrder(o);
                      }
                    } catch {
                      toast.error("Failed to update status");
                    }
                  }}

                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ORDER_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant={o.paymentVerified ? "outline" : "gold"}
                  onClick={async () => {
                    if (!db) return;
                    try {
                      await updatePaymentVerified(db, o.id, !o.paymentVerified);
                      toast.success(
                        o.paymentVerified ? "Marked as not verified" : "Payment verified",
                      );
                    } catch {
                      toast.error("Failed to update payment status");
                    }
                  }}
                >
                  {o.paymentVerified ? (
                    <>
                      <XCircle className="size-4" /> Mark Not Verified
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="size-4" /> Mark Verified
                    </>
                  )}
                </Button>
                <Button
  size="sm"
  variant="destructive"
  onClick={async () => {
    if (!db) return;

    const confirmDelete = confirm("Delete this order permanently?");
    if (!confirmDelete) return;

    await deleteDoc(doc(db, "orders", o.id));

    toast.success("Order deleted");
  }}
>
  <Trash2 className="size-4" />
  Delete Order
</Button>
                {o.orderStatus === "Completed" && (
                  <Button size="sm" variant="goldOutline" onClick={() => setProfitOrder(o)}>
                    <Wallet className="size-4" /> Record Profit
                  </Button>
                )}
                            </div>
            
            </div>
          ))}
        </div>
      )}

      <ProfitPromptDialog
        order={profitOrder}
        onClose={() => setProfitOrder(null)}
        completedBy={user?.email ?? "admin"}
      />
    </div>
    
  );
}

/** Popup asking the admin how much profit a completed order produced. */
function ProfitPromptDialog({
  order,
  onClose,
  completedBy,
}: {
  order: Order | null;
  onClose: () => void;
  completedBy: string;
}) {
  const { db } = useFirebase();
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);

  if (order && orderId !== order.id) {
    setOrderId(order.id);
    setAmount("");
  }

  const save = async () => {
    if (!db || !order) return;
    const profitAmount = Number(amount);
    if (!Number.isFinite(profitAmount) || profitAmount < 0 || amount.trim() === "") {
      toast.error("Enter a valid profit amount.");
      return;
    }
    setSaving(true);
    try {
      await saveProfit(db, {
        orderId: order.id,
        productId: order.productId,
        productName: order.productName,
        productImage: order.productImage,
        customerName: order.customerName,
        quantity: order.quantity,
        salePrice: order.totalAmount ?? order.productPrice * order.quantity,
        profitAmount,
        completedBy,
      });
      toast.success("Profit saved");
      onClose();
    } catch (err) {
      toast.error(
        err instanceof Error && err.message.includes("already")
          ? "Profit already recorded for this order."
          : "Failed to save profit",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!order} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            How much profit did you receive from this order?
          </DialogTitle>
        </DialogHeader>
        {order && (
          <div className="space-y-4">
            <div className="rounded-lg border border-border/60 bg-secondary/30 p-3 text-sm">
              <p className="font-medium">{order.productName}</p>
              <p className="text-muted-foreground">
                {order.customerName} · Qty {order.quantity} · Rs{" "}
                {(order.totalAmount ?? order.productPrice * order.quantity).toLocaleString()}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profit-amount">Profit Amount (PKR)</Label>
              <Input
                id="profit-amount"
                type="number"
                min={0}
                autoFocus
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 450"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={onClose} disabled={saving}>
                Later
              </Button>
              <Button variant="gold" className="flex-1" onClick={save} disabled={saving}>
                {saving && <Loader2 className="size-4 animate-spin" />} Save
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}


interface ProductFormState {
  name: string;
  price: number;
  category: string;
  description: string;
  images: string[];
  options: { name: string; values: string[] }[];
}

const emptyProduct: ProductFormState = {
  name: "",
  price: 0,
  category: "",
  description: "",
  images: [""],
  options: [],
};

function ProductsPanel() {
  const { db } = useFirebase();
  const { products, loading } = useProducts();
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  /** Ids of products ticked for bulk deletion. */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const allSelected = products.length > 0 && products.every((p) => selected.has(p.id));
  const toggleOne = (id: string, on: boolean) =>
    setSelected((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const toggleAll = (on: boolean) =>
    setSelected(on ? new Set(products.map((p) => p.id)) : new Set());

  const deleteSelected = async () => {
    if (!db || selected.size === 0) return;
    setBulkDeleting(true);
    try {
      const ids = Array.from(selected);
      // Firestore batches cap at 500 writes.
      for (let i = 0; i < ids.length; i += 450) {
        const batch = writeBatch(db);
        ids.slice(i, i + 450).forEach((id) => batch.delete(doc(db, "products", id)));
        await batch.commit();
      }
      toast.success(`${ids.length} product(s) deleted`);
      setSelected(new Set());
    } catch {
      toast.error("Failed to delete selected products");
    } finally {
      setBulkDeleting(false);
    }
  };

  /** Existing categories from Firebase products (used by the import dialog). */
  const categories = useMemo(
    () =>
      Array.from(
        new Set(products.map((p) => (p.category ?? "").trim()).filter(Boolean)),
      ).sort((a, b) => a.localeCompare(b)),
    [products],
  );

  const openNew = () => {
    setEditing(null);
    setOpen(true);
  };
  const openEdit = (p: Product) => {
    setEditing(p);
    setOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">{products.length} product(s)</span>
        <div className="flex flex-wrap gap-2">
          <Button variant="goldOutline" onClick={() => setImportOpen(true)}>
            <Upload className="size-4" /> Import from Markaz
          </Button>
          <Button variant="goldOutline" onClick={() => setBulkOpen(true)}>
            <Layers className="size-4" /> Bulk Add
          </Button>
          <Button variant="gold" onClick={openNew}>
            <Plus className="size-4" /> Add Product
          </Button>
        </div>
      </div>

      {products.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 bg-card px-3 py-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={allSelected ? true : selected.size > 0 ? "indeterminate" : false}
              onCheckedChange={(v) => toggleAll(v === true)}
              aria-label="Select all products"
            />
            Select All
            {selected.size > 0 && (
              <span className="text-muted-foreground">({selected.size} selected)</span>
            )}
          </label>
          {selected.size > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={bulkDeleting}>
                  {bulkDeleting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                  Delete Selected ({selected.size})
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete {selected.size} product(s)?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently remove the selected products from your store. This
                    cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={deleteSelected}>
                    Delete {selected.size}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      ) : products.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground">
          No products yet. Add your first product.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => (
            <div
              key={p.id}
              className={`flex gap-3 rounded-xl border bg-card p-3 transition-colors ${
                selected.has(p.id) ? "border-primary/60 bg-primary/5" : "border-border/60"
              }`}
            >
              <Checkbox
                className="mt-1"
                checked={selected.has(p.id)}
                onCheckedChange={(v) => toggleOne(p.id, v === true)}
                aria-label={`Select ${p.name}`}
              />
              <ProductImage
                src={p.image || p.images?.[0]}
                alt={p.name}
                className="size-16 shrink-0 rounded-lg object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="line-clamp-1 font-medium">{p.name}</p>
                <p className="text-xs text-muted-foreground">{p.category}</p>
                <p className="text-sm text-primary">Rs {p.price.toLocaleString()}</p>
              </div>
              <div className="flex flex-col gap-1">
                <Button variant="ghost" size="icon" onClick={() => openEdit(p)} aria-label="Edit">
                  <Pencil className="size-4" />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="Delete" className="text-destructive">
                      <Trash2 className="size-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete this product?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently remove &quot;{p.name}&quot;.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={async () => {
                          if (!db) return;
                          try {
                            await deleteProduct(db, p.id);
                            toast.success("Product deleted");
                          } catch {
                            toast.error("Failed to delete");
                          }
                        }}
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ))}
        </div>
      )}

      <ProductFormDialog open={open} onOpenChange={setOpen} editing={editing} />
      <ImportProductsDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        categories={categories}
      />

    </div>
  );
}

function ProductFormDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: Product | null;
}) {
  const { db, storage } = useFirebase();
  const [form, setForm] = useState<ProductFormState>(emptyProduct);
  const [saving, setSaving] = useState(false);
  const [initId, setInitId] = useState<string | null>(null);
  /** Live gallery-upload progress: file name → 0-100. */
  const [uploads, setUploads] = useState<{ name: string; percent: number }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);


  // Sync form when dialog opens or target changes.
  const targetId = editing?.id ?? "new";
  if (open && initId !== targetId) {
    setInitId(targetId);
    setForm(
      editing
        ? {
            name: editing.name,
            price: editing.price,
            category: editing.category,
            description: editing.description,
            images:
              editing.images && editing.images.length
                ? [...editing.images]
                : [editing.image || ""],
            options: editing.options ? editing.options.map((o) => ({ ...o, values: [...o.values] })) : [],
          }
        : emptyProduct,
    );
  }
  if (!open && initId !== null) setInitId(null);

  // ---- Image field helpers ----
  const setImage = (i: number, value: string) =>
    setForm((f) => ({ ...f, images: f.images.map((img, idx) => (idx === i ? value : img)) }));
  const addImage = () => setForm((f) => ({ ...f, images: [...f.images, ""] }));
  const removeImage = (i: number) =>
    setForm((f) => ({ ...f, images: f.images.filter((_, idx) => idx !== i) }));

  /**
   * Upload picked files to Firebase Storage and drop the resulting download
   * URLs straight into the image fields — the admin never copies a URL.
   */
  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!storage) {
      toast.error("Storage not connected.");
      return;
    }
    const list = Array.from(files);
    const valid: File[] = [];
    for (const file of list) {
      const err = validateImageFile(file);
      if (err) toast.error(err);
      else valid.push(file);
    }
    if (!valid.length) return;

    setUploads(valid.map((f) => ({ name: f.name, percent: 0 })));
    for (let i = 0; i < valid.length; i++) {
      try {
        const url = await uploadProductFile(storage, valid[i], (percent) =>
          setUploads((u) => u.map((row, idx) => (idx === i ? { ...row, percent } : row))),
        );
        // Fill the first empty slot, otherwise append.
        setForm((f) => {
          const images = [...f.images];
          const empty = images.findIndex((img) => !img.trim());
          if (empty >= 0) images[empty] = url;
          else images.push(url);
          return { ...f, images };
        });
      } catch {
        toast.error(`Failed to upload ${valid[i].name}`);
      }
    }
    setUploads([]);
    toast.success(valid.length > 1 ? "Images uploaded" : "Image uploaded");
  };


  // ---- Option helpers ----
  const addOption = () =>
    setForm((f) => ({ ...f, options: [...f.options, { name: "", values: [""] }] }));
  const removeOption = (oi: number) =>
    setForm((f) => ({ ...f, options: f.options.filter((_, idx) => idx !== oi) }));
  const setOptionName = (oi: number, name: string) =>
    setForm((f) => ({
      ...f,
      options: f.options.map((o, idx) => (idx === oi ? { ...o, name } : o)),
    }));
  const addValue = (oi: number) =>
    setForm((f) => ({
      ...f,
      options: f.options.map((o, idx) => (idx === oi ? { ...o, values: [...o.values, ""] } : o)),
    }));
  const setValue = (oi: number, vi: number, value: string) =>
    setForm((f) => ({
      ...f,
      options: f.options.map((o, idx) =>
        idx === oi ? { ...o, values: o.values.map((v, vIdx) => (vIdx === vi ? value : v)) } : o,
      ),
    }));
  const removeValue = (oi: number, vi: number) =>
    setForm((f) => ({
      ...f,
      options: f.options.map((o, idx) =>
        idx === oi ? { ...o, values: o.values.filter((_, vIdx) => vIdx !== vi) } : o,
      ),
    }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.category.trim() || form.price <= 0) {
      toast.error("Name, price and category are required.");
      return;
    }
    const images = form.images.map((i) => i.trim()).filter(Boolean);
    if (images.length === 0) {
      toast.error("Please add at least one image URL.");
      return;
    }
    const options = form.options
      .map((o) => ({
        name: o.name.trim(),
        values: o.values.map((v) => v.trim()).filter(Boolean),
      }))
      .filter((o) => o.name && o.values.length > 0);

    if (!db) {
      toast.error("Store not connected.");
      return;
    }

    setSaving(true);
    try {
      const payload: ProductInput = {
        name: form.name.trim(),
        price: form.price,
        category: form.category.trim(),
        description: form.description.trim(),
        image: images[0],
        images,
        options,
      };
      if (editing) {
        await updateProduct(db, editing.id, payload);
        toast.success("Product updated");
      } else {
        await addProduct(db, payload);
        toast.success("Product added");
      }
      onOpenChange(false);
    } catch (err) {
      toast.error("Failed to save product");
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            {editing ? "Edit Product" : "Add Product"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="p-name">Product Name</Label>
            <Input id="p-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-price">Product Price (Rs)</Label>
            <Input
              id="p-price"
              type="number"
              min={0}
              value={form.price || ""}
              onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-cat">Category</Label>
            <Input id="p-cat" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-desc">Description</Label>
            <Textarea id="p-desc" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>

          {/* Product Images */}
          <div className="space-y-3 rounded-lg border border-border/60 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label>Product Images</Label>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="goldOutline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploads.length > 0}
                >
                  <ImagePlus className="size-4" /> Upload From Gallery
                </Button>
                <Button type="button" size="sm" variant="goldOutline" onClick={addImage}>
                  <Plus className="size-4" /> Add Image
                </Button>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                void handleFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <p className="text-xs text-muted-foreground">
              Paste an image URL or upload from your device — the first image is used as
              the main thumbnail.
            </p>
            {uploads.length > 0 && (
              <div className="space-y-2">
                {uploads.map((u) => (
                  <div key={u.name} className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span className="line-clamp-1">{u.name}</span>
                      <span>{u.percent}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${u.percent}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-3">
              {form.images.map((img, i) => (
                <div key={i} className="flex items-start gap-2">
                  {img.trim() ? (
                    <img
                      src={img.trim()}
                      alt={`Preview ${i + 1}`}
                      className="size-14 shrink-0 rounded-md border border-border/60 object-cover"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src =
                          "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='56' height='56'><rect width='100%25' height='100%25' fill='%23222'/></svg>";
                      }}
                    />
                  ) : (
                    <div className="grid size-14 shrink-0 place-items-center rounded-md border border-dashed border-border/60 text-[10px] text-muted-foreground">
                      {i === 0 ? "Main" : `#${i + 1}`}
                    </div>
                  )}
                  <Input
                    value={img}
                    onChange={(e) => setImage(i, e.target.value)}
                    placeholder="https://..."
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="shrink-0 text-destructive"
                    onClick={() => removeImage(i)}
                    disabled={form.images.length === 1}
                    aria-label="Remove image"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Product Options */}
          <div className="space-y-3 rounded-lg border border-border/60 p-3">
            <div className="flex items-center justify-between">
              <Label>Product Options</Label>
              <Button type="button" size="sm" variant="goldOutline" onClick={addOption}>
                <Plus className="size-4" /> Add Option
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              e.g. Color → Black, White · Size → S, M, L
            </p>
            {form.options.length === 0 && (
              <p className="text-xs text-muted-foreground">No options added.</p>
            )}
            <div className="space-y-4">
              {form.options.map((opt, oi) => (
                <div key={oi} className="space-y-2 rounded-lg border border-border/60 bg-secondary/30 p-3">
                  <div className="flex items-center gap-2">
                    <Input
                      value={opt.name}
                      onChange={(e) => setOptionName(oi, e.target.value)}
                      placeholder="Option name (e.g. Color)"
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="shrink-0 text-destructive"
                      onClick={() => removeOption(oi)}
                      aria-label="Remove option"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {opt.values.map((val, vi) => (
                      <div key={vi} className="flex items-center gap-2">
                        <Input
                          value={val}
                          onChange={(e) => setValue(oi, vi, e.target.value)}
                          placeholder={`Value ${vi + 1} (e.g. Black)`}
                        />
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="shrink-0 text-destructive"
                          onClick={() => removeValue(oi, vi)}
                          disabled={opt.values.length === 1}
                          aria-label="Remove value"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <Button type="button" size="sm" variant="ghost" onClick={() => addValue(oi)}>
                    <Plus className="size-4" /> Add Value
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <Button type="submit" variant="gold" className="w-full" disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            {editing ? "Save Changes" : "Add Product"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReviewsPanel() {
  const { db } = useFirebase();
  const { reviews, loading } = useReviews(false);
  const [filter, setFilter] = useState<"All" | "Pending" | "Approved">("All");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return reviews
      .filter((r) => (filter === "All" ? true : filter === "Approved" ? r.approved : !r.approved))
      .filter((r) =>
        !q
          ? true
          : [r.customerName, r.productName, r.message]
              .filter(Boolean)
              .some((v) => String(v).toLowerCase().includes(q)),
      );
  }, [reviews, filter, search]);

  const stats = useMemo(() => {
    const approved = reviews.filter((r) => r.approved);
    const avg = approved.length
      ? approved.reduce((s, r) => s + (r.rating || 0), 0) / approved.length
      : 0;
    return { total: reviews.length, approved: approved.length, avg };
  }, [reviews]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All Reviews</SelectItem>
            <SelectItem value="Pending">Hidden</SelectItem>
            <SelectItem value="Approved">Visible</SelectItem>
          </SelectContent>
        </Select>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search product, customer or text..."
          className="w-full sm:w-72"
        />
        <span className="ml-auto text-sm text-muted-foreground">
          {filtered.length} shown · {stats.approved}/{stats.total} visible · avg{" "}
          {stats.avg.toFixed(1)}★
        </span>
      </div>


      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground">No reviews found.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => (
            <div key={r.id} className="rounded-xl border border-border/60 bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{r.customerName}</span>
                    <span className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <Star
                          key={i}
                          className={`size-3.5 ${
                            i <= r.rating
                              ? "fill-primary text-primary"
                              : "fill-transparent text-muted-foreground/40"
                          }`}
                        />
                      ))}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {r.createdAt ? new Date(r.createdAt).toLocaleString() : "—"}
                  </p>
                  <p className="text-sm font-medium text-primary">
  {r.productName}
</p>
                </div>
                <Badge
                  variant="outline"
                  className={
                    r.approved
                      ? "border-green-500/30 bg-green-500/15 text-green-400"
                      : "border-yellow-500/30 bg-yellow-500/15 text-yellow-500"
                  }
                >
                  {r.approved ? "Visible" : "Hidden"}
                </Badge>
              </div>
              <p className="mt-3 text-sm text-foreground/90">{r.message}</p>
              {reviewImages(r).length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {reviewImages(r).map((src) => (
                    <a key={src} href={src} target="_blank" rel="noreferrer">
                      <img
                        src={src}
                        alt="Review"
                        loading="lazy"
                        className="size-24 rounded-lg border object-cover transition-transform hover:scale-105"
                      />
                    </a>
                  ))}
                </div>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant={r.approved ? "outline" : "gold"}
                  onClick={async () => {
                    if (!db) return;
                    try {
                      await approveReview(db, r.id, !r.approved);
                      toast.success(r.approved ? "Review hidden" : "Review approved");
                    } catch {
                      toast.error("Failed to update review");
                    }
                  }}
                >
                  {r.approved ? (
                    <>
                      <XCircle className="size-4" /> Unapprove
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="size-4" /> Approve
                    </>
                  )}
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="ghost" className="text-destructive">
                      <Trash2 className="size-4" /> Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete this review?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently remove the review from {r.customerName}.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={async () => {
                          if (!db) return;
                          try {
                            await deleteReview(db, r.id);
                            toast.success("Review deleted");
                          } catch {
                            toast.error("Failed to delete review");
                          }
                        }}
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
