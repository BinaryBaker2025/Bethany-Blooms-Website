import { useMemo, useRef, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { useAdminData } from "../../context/AdminDataContext.jsx";
import { useFirestoreCollection } from "../../hooks/useFirestoreCollection.js";
import { usePageMetadata } from "../../hooks/usePageMetadata.js";
import { getFirebaseFunctions } from "../../lib/firebase.js";
import { getStockStatus } from "../../lib/stockStatus.js";

const POS_TABS = [
  { id: "products", label: "Products" },
  { id: "pos-products", label: "POS-only" },
  { id: "workshops", label: "Workshops" },
  { id: "classes", label: "Classes" },
  { id: "events", label: "Events" },
];

const moneyFormatter = new Intl.NumberFormat("en-ZA", {
  style: "currency",
  currency: "ZAR",
  maximumFractionDigits: 2,
});

const INITIAL_POS_PRODUCT = {
  name: "",
  price: "",
  quantity: "1",
  forceOutOfStock: false,
  status: "active",
};

const DEFAULT_CUSTOMER = {
  name: "",
  email: "",
  phone: "",
};

const parseNumber = (value, fallback = null) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clampQuantity = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.floor(parsed));
};

const formatCurrency = (value) => {
  const amount = parseNumber(value, 0);
  return moneyFormatter.format(amount);
};

const parseDateValue = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value?.toDate === "function") {
    try {
      const converted = value.toDate();
      return Number.isNaN(converted.getTime()) ? null : converted;
    } catch {
      return null;
    }
  }
  if (typeof value === "object" && typeof value.seconds === "number") {
    const converted = new Date(value.seconds * 1000);
    return Number.isNaN(converted.getTime()) ? null : converted;
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
};

const formatTimeValue = (value) => {
  if (!value) return "";
  if (value instanceof Date) {
    return new Intl.DateTimeFormat("en-ZA", { timeStyle: "short" }).format(value);
  }
  if (typeof value !== "string") return "";
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours)) return value;
  const date = new Date();
  date.setHours(hours);
  date.setMinutes(Number.isFinite(minutes) ? minutes : 0);
  date.setSeconds(0, 0);
  return new Intl.DateTimeFormat("en-ZA", { timeStyle: "short" }).format(date);
};

const formatTimeRange = (startTime, endTime) => {
  const startLabel = formatTimeValue(startTime);
  if (!startLabel) return "";
  const endLabel = formatTimeValue(endTime);
  if (!endLabel) return startLabel;
  return `${startLabel} - ${endLabel}`;
};

const buildCartKey = ({ type, sourceId, variantId, sessionId }) =>
  [type, sourceId, variantId || "base", sessionId || "default"].join(":");

const normalizeCategoryValue = (value) =>
  value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

function AdminPosPage() {
  usePageMetadata({
    title: "Admin · POS",
    description: "Process in-person sales for products, workshops, events, and classes.",
  });

  const {
    db,
    products,
    productCategories,
    workshops,
    events,
    cutFlowerClasses,
    inventoryEnabled,
    inventoryLoading,
    inventoryError,
  } = useAdminData();

  const { items: posProducts } = useFirestoreCollection("posProducts", {
    orderByField: "createdAt",
    orderDirection: "desc",
  });

  const functionsInstance = useMemo(() => {
    try {
      return getFirebaseFunctions();
    } catch {
      return null;
    }
  }, []);

  const [activeTab, setActiveTab] = useState(POS_TABS[0].id);
  const [searchTerm, setSearchTerm] = useState("");
  const [cartItems, setCartItems] = useState([]);
  const [customer, setCustomer] = useState(DEFAULT_CUSTOMER);
  const [paymentMethod, setPaymentMethod] = useState("card");
  const [notes, setNotes] = useState("");
  const [sendEmailReceipt, setSendEmailReceipt] = useState(false);
  const [showPrintableReceipt, setShowPrintableReceipt] = useState(false);
  const [checkoutStatus, setCheckoutStatus] = useState("idle");
  const [checkoutError, setCheckoutError] = useState(null);
  const [receiptData, setReceiptData] = useState(null);
  const [discountType, setDiscountType] = useState("none");
  const [discountValue, setDiscountValue] = useState("");
  const [cashReceived, setCashReceived] = useState("");
  const [changeConfirmOpen, setChangeConfirmOpen] = useState(false);
  const changeConfirmRef = useRef(false);

  const [posProductForm, setPosProductForm] = useState(INITIAL_POS_PRODUCT);
  const [posProductSaving, setPosProductSaving] = useState(false);
  const [posProductError, setPosProductError] = useState(null);
  const [editingPosProductId, setEditingPosProductId] = useState(null);
  const [posItemsOpen, setPosItemsOpen] = useState(false);

  const [variantSelections, setVariantSelections] = useState({});
  const [workshopSelections, setWorkshopSelections] = useState({});
  const [classSelections, setClassSelections] = useState({});
  const [classOptionSelections, setClassOptionSelections] = useState({});
  const [eventSelections, setEventSelections] = useState({});
  const [activeCategoryId, setActiveCategoryId] = useState("all");
  const [posCatalogOpen, setPosCatalogOpen] = useState(false);

  const normalizedProducts = useMemo(() => {
    return (products || []).map((product) => {
      const priceNumber = parseNumber(product.price, null);
      const variants = Array.isArray(product.variants)
        ? product.variants
            .map((variant) => {
              const label = (variant.label || variant.name || "").toString().trim();
              if (!label) return null;
              const variantPrice = parseNumber(variant.price, null);
              return {
                id: (variant.id || label).toString(),
                label,
                price: variantPrice,
              };
            })
            .filter(Boolean)
        : [];
      const stockStatus = getStockStatus({
        quantity: product.stock_quantity ?? product.quantity,
        forceOutOfStock: product.forceOutOfStock || product.stock_status === "out_of_stock",
        status: product.stock_status,
      });
      return {
        ...product,
        name: product.name || product.title || "Product",
        numericPrice: priceNumber,
        displayPrice: Number.isFinite(priceNumber) ? formatCurrency(priceNumber) : "Price on request",
        variants,
        stockStatus,
      };
    });
  }, [products]);

  const normalizedPosProducts = useMemo(() => {
    return (posProducts || []).map((product) => {
      const priceNumber = parseNumber(product.price, null);
      const stockStatus = getStockStatus({
        quantity: product.stock_quantity ?? product.quantity,
        forceOutOfStock: product.forceOutOfStock || product.stock_status === "out_of_stock",
        status: product.stock_status,
      });
      return {
        ...product,
        name: product.name || "POS Item",
        numericPrice: priceNumber,
        displayPrice: Number.isFinite(priceNumber) ? formatCurrency(priceNumber) : "Price on request",
        stockStatus,
      };
    });
  }, [posProducts]);

  const sessionFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat("en-ZA", {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [],
  );

  const normalizedWorkshops = useMemo(() => {
    return (workshops || []).map((workshop) => {
      const priceNumber = parseNumber(workshop.price, null);
      const sessions = Array.isArray(workshop.sessions) ? workshop.sessions : [];
      const normalizedSessions = sessions
        .map((session, index) => {
          const startDate = parseDateValue(session.start || session.startDate || session.date || workshop.scheduledFor);
          const label = (session.label || session.name || "").toString().trim();
          const formatted = startDate ? sessionFormatter.format(startDate) : "Session";
          return {
            id: session.id || `session-${index}-${workshop.id}`,
            label: label || formatted,
            date: session.date || (startDate ? startDate.toISOString().slice(0, 10) : ""),
            start: startDate ? startDate.toISOString() : "",
          };
        })
        .filter((session) => session.id);
      return {
        ...workshop,
        title: workshop.title || workshop.name || "Workshop",
        numericPrice: priceNumber,
        displayPrice: Number.isFinite(priceNumber) ? formatCurrency(priceNumber) : "Price on request",
        sessions: normalizedSessions,
      };
    });
  }, [sessionFormatter, workshops]);

  const normalizedClasses = useMemo(() => {
    return (cutFlowerClasses || []).map((classDoc) => {
      const priceNumber = parseNumber(classDoc.price, null);
      const eventDate = parseDateValue(classDoc.eventDate);
      const timeSlots = Array.isArray(classDoc.timeSlots) ? classDoc.timeSlots : [];
      const normalizedSlots = timeSlots
        .map((slot, index) => {
          const label = slot.label?.trim() || formatTimeRange(slot.time, slot.endTime) || "Session";
          return {
            id: slot.id || `class-slot-${index}-${classDoc.id}`,
            label,
            time: slot.time || "",
            endTime: slot.endTime || "",
          };
        })
        .filter((slot) => slot.id);
      const options = Array.isArray(classDoc.options)
        ? classDoc.options
            .map((option, index) => {
              const label = (option.label || option.name || "").toString().trim();
              if (!label) return null;
              const price = parseNumber(option.price, null);
              return {
                id: (option.id || `class-option-${index}-${classDoc.id}`).toString(),
                label,
                price,
              };
            })
            .filter(Boolean)
        : [];
      return {
        ...classDoc,
        title: classDoc.title || "Class",
        numericPrice: priceNumber,
        displayPrice: Number.isFinite(priceNumber) ? formatCurrency(priceNumber) : "Price on request",
        eventDate,
        displayDate: eventDate ? sessionFormatter.format(eventDate) : "Date to be confirmed",
        slots: normalizedSlots,
        options,
      };
    });
  }, [cutFlowerClasses, sessionFormatter]);

  const normalizedEvents = useMemo(() => {
    return (events || []).map((event) => {
      const eventDate = parseDateValue(event.eventDate);
      const timeSlots = Array.isArray(event.timeSlots) ? event.timeSlots : [];
      const normalizedSlots = timeSlots
        .map((slot, index) => {
          const label = slot.label?.trim() || formatTimeRange(slot.time, slot.endTime) || "Session";
          return {
            id: slot.id || `event-slot-${index}-${event.id}`,
            label,
            time: slot.time || "",
            endTime: slot.endTime || "",
          };
        })
        .filter((slot) => slot.id);
      return {
        ...event,
        title: event.title || "Event",
        eventDate,
        displayDate: eventDate ? sessionFormatter.format(eventDate) : "Date to be confirmed",
        slots: normalizedSlots,
      };
    });
  }, [events, sessionFormatter]);

  const categoryOptions = useMemo(() => {
    return (productCategories || [])
      .map((category) => {
        const name = (category.name || "").toString().trim();
        if (!name) return null;
        return {
          id: category.id,
          name,
          slug: normalizeCategoryValue(name),
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [productCategories]);

  const activeCategory = useMemo(() => {
    if (activeCategoryId === "all") return null;
    return categoryOptions.find((category) => category.id === activeCategoryId) ?? null;
  }, [activeCategoryId, categoryOptions]);

  const filteredProducts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    let filtered = normalizedProducts;
    if (activeCategory) {
      filtered = filtered.filter((product) => {
        const categoryId = product.categoryId || "";
        const categoryValue = product.category || "";
        const productSlug = normalizeCategoryValue(categoryValue);
        return (
          categoryId === activeCategory.id ||
          productSlug === activeCategory.slug ||
          categoryValue.toString().trim() === activeCategory.name
        );
      });
    }
    if (!term) return filtered;
    return filtered.filter((product) => product.name.toLowerCase().includes(term));
  }, [activeCategory, normalizedProducts, searchTerm]);

  const filteredPosProducts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return normalizedPosProducts;
    return normalizedPosProducts.filter((product) => product.name.toLowerCase().includes(term));
  }, [normalizedPosProducts, searchTerm]);

  const filteredWorkshops = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return normalizedWorkshops;
    return normalizedWorkshops.filter((workshop) => workshop.title.toLowerCase().includes(term));
  }, [normalizedWorkshops, searchTerm]);

  const filteredClasses = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return normalizedClasses;
    return normalizedClasses.filter((classDoc) => classDoc.title.toLowerCase().includes(term));
  }, [normalizedClasses, searchTerm]);

  const filteredEvents = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return normalizedEvents;
    return normalizedEvents.filter((event) => event.title.toLowerCase().includes(term));
  }, [normalizedEvents, searchTerm]);

  const activeCount = useMemo(() => {
    if (activeTab === "products") return filteredProducts.length;
    if (activeTab === "pos-products") return filteredPosProducts.length;
    if (activeTab === "workshops") return filteredWorkshops.length;
    if (activeTab === "classes") return filteredClasses.length;
    if (activeTab === "events") return filteredEvents.length;
    return 0;
  }, [activeTab, filteredClasses, filteredEvents, filteredPosProducts, filteredProducts, filteredWorkshops]);

  const hasBookingItems = useMemo(
    () => cartItems.some((item) => item.type === "workshop" || item.type === "class"),
    [cartItems],
  );

  const requiresCustomerDetails = sendEmailReceipt;

  const pricing = useMemo(() => {
    const subtotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const rawDiscount = parseNumber(discountValue, 0);
    let discountAmount = 0;
    let discountPercent = null;

    if (discountType === "amount") {
      const safeAmount = Math.max(0, rawDiscount);
      discountAmount = Math.min(subtotal, safeAmount);
    }

    if (discountType === "percent") {
      const safePercent = Math.min(100, Math.max(0, rawDiscount));
      discountPercent = safePercent;
      discountAmount = subtotal * (safePercent / 100);
    }

    const total = Math.max(0, subtotal - discountAmount);
    return {
      subtotal,
      total,
      discountAmount,
      discountPercent,
    };
  }, [cartItems, discountType, discountValue]);

  const cashStats = useMemo(() => {
    const cashNumber = parseNumber(cashReceived, null);
    if (paymentMethod !== "cash") {
      return { cashReceived: cashNumber, changeDue: null, isValid: true };
    }
    if (!Number.isFinite(cashNumber)) {
      return { cashReceived: cashNumber, changeDue: null, isValid: false };
    }
    const changeDue = Math.max(0, cashNumber - pricing.total);
    return {
      cashReceived: cashNumber,
      changeDue,
      isValid: cashNumber >= pricing.total,
    };
  }, [cashReceived, paymentMethod, pricing.total]);

  const updateCustomerField = (field) => (event) => {
    const value = event.target.value;
    setCustomer((prev) => ({ ...prev, [field]: value }));
  };

  const handleAddToCart = (item) => {
    setCartItems((prev) => {
      const existingIndex = prev.findIndex((entry) => entry.key === item.key);
      if (existingIndex === -1) {
        return [...prev, item];
      }
      const next = [...prev];
      next[existingIndex] = {
        ...next[existingIndex],
        quantity: next[existingIndex].quantity + item.quantity,
      };
      return next;
    });
  };

  const handleRemoveCartItem = (key) => {
    setCartItems((prev) => prev.filter((item) => item.key !== key));
  };

  const handleCartQuantityChange = (key, value) => {
    const nextQuantity = Math.max(1, Number.parseInt(value, 10) || 1);
    setCartItems((prev) =>
      prev.map((item) => (item.key === key ? { ...item, quantity: nextQuantity } : item)),
    );
  };

  const adjustCartQuantity = (key, delta) => {
    setCartItems((prev) =>
      prev.map((item) => {
        if (item.key !== key) return item;
        const nextQuantity = Math.max(1, (Number(item.quantity) || 1) + delta);
        return { ...item, quantity: nextQuantity };
      }),
    );
  };

  const resetCheckout = () => {
    setCartItems([]);
    setCustomer(DEFAULT_CUSTOMER);
    setNotes("");
    setPaymentMethod("card");
    setDiscountType("none");
    setDiscountValue("");
    setCashReceived("");
    changeConfirmRef.current = false;
    setChangeConfirmOpen(false);
    setCheckoutStatus("idle");
    setCheckoutError(null);
  };

  const handleSavePosProduct = async (event) => {
    event.preventDefault();
    if (!db || !inventoryEnabled) {
      setPosProductError("You do not have permission to manage POS products.");
      return;
    }
    const name = posProductForm.name.trim();
    const priceNumber = parseNumber(posProductForm.price, null);
    if (!name) {
      setPosProductError("POS product name is required.");
      return;
    }
    if (!Number.isFinite(priceNumber)) {
      setPosProductError("Please enter a valid price.");
      return;
    }

    const quantityValue = clampQuantity(posProductForm.quantity);
    const payload = {
      name,
      price: priceNumber,
      quantity: quantityValue === null ? 0 : quantityValue,
      forceOutOfStock: Boolean(posProductForm.forceOutOfStock),
      status: posProductForm.status || "active",
      updatedAt: serverTimestamp(),
    };

    setPosProductSaving(true);
    setPosProductError(null);

    try {
      if (editingPosProductId) {
        await updateDoc(doc(db, "posProducts", editingPosProductId), payload);
      } else {
        await addDoc(collection(db, "posProducts"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
      }
      setPosProductForm(INITIAL_POS_PRODUCT);
      setEditingPosProductId(null);
    } catch (error) {
      setPosProductError(error.message || "Unable to save POS product.");
    } finally {
      setPosProductSaving(false);
    }
  };

  const handleEditPosProduct = (product) => {
    setEditingPosProductId(product.id);
    setPosProductForm({
      name: product.name || "",
      price: Number.isFinite(parseNumber(product.price)) ? String(product.price) : "",
      quantity:
        product.quantity === undefined || product.quantity === null ? "" : String(product.quantity),
      forceOutOfStock: Boolean(product.forceOutOfStock),
      status: product.status || "active",
    });
  };

  const handleDeletePosProduct = async (productId) => {
    if (!db || !inventoryEnabled) return;
    try {
      await deleteDoc(doc(db, "posProducts", productId));
    } catch (error) {
      setPosProductError(error.message || "Unable to delete POS product.");
    }
  };

  const closePosItemsModal = () => {
    setPosItemsOpen(false);
    setEditingPosProductId(null);
    setPosProductForm(INITIAL_POS_PRODUCT);
    setPosProductError(null);
  };

  const openPosItemsModal = () => {
    setPosCatalogOpen(false);
    setPosItemsOpen(true);
  };

  const closeCatalogModal = () => {
    setPosCatalogOpen(false);
  };

  const openCatalogModal = () => {
    setPosItemsOpen(false);
    setPosCatalogOpen(true);
  };

  const handleCheckout = async () => {
    if (!db || !inventoryEnabled) {
      setCheckoutError("POS is unavailable. Please check your admin permissions.");
      return;
    }
    if (cartItems.length === 0) {
      setCheckoutError("Add at least one item to the cart.");
      return;
    }

    const trimmedCustomer = {
      name: customer.name.trim(),
      email: customer.email.trim(),
      phone: customer.phone.trim(),
    };

    if (sendEmailReceipt && !trimmedCustomer.email) {
      setCheckoutError("Please provide a customer email to send the receipt.");
      return;
    }

    let confirmedChange = null;
    if (paymentMethod === "cash") {
      if (!Number.isFinite(cashStats.cashReceived)) {
        setCheckoutError("Enter the cash amount received.");
        return;
      }
      if (!cashStats.isValid) {
        setCheckoutError("Cash received is less than the total.");
        return;
      }
      if (!changeConfirmRef.current) {
        setChangeConfirmOpen(true);
        return;
      }
      confirmedChange = true;
    }
    changeConfirmRef.current = false;

    const outOfStockItems = cartItems.filter((item) => {
      if (item.type === "product") {
        const product = normalizedProducts.find((entry) => entry.id === item.sourceId);
        const currentQty = clampQuantity(product?.quantity);
        return currentQty !== null && currentQty < item.quantity;
      }
      if (item.type === "pos-product") {
        const product = normalizedPosProducts.find((entry) => entry.id === item.sourceId);
        const currentQty = clampQuantity(product?.quantity);
        return currentQty !== null && currentQty < item.quantity;
      }
      return false;
    });

    if (outOfStockItems.length > 0) {
      setCheckoutError("Some items do not have enough stock. Please adjust quantities.");
      return;
    }

    setCheckoutStatus("saving");
    setCheckoutError(null);

    const receiptNumber = `POS-${Date.now().toString().slice(-6)}`;
    const discountPayload = {
      type: discountType,
      value:
        discountType === "percent"
          ? pricing.discountPercent ?? 0
          : discountType === "amount"
            ? pricing.discountAmount
            : 0,
      amount: pricing.discountAmount,
    };
    const salePayload = {
      receiptNumber,
      customer: trimmedCustomer,
      paymentMethod,
      notes: notes.trim(),
      items: cartItems.map((item) => ({
        id: item.sourceId,
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        type: item.type,
        metadata: item.metadata || null,
      })),
      subtotal: pricing.subtotal,
      total: pricing.total,
      discount: discountPayload,
      cashReceived: paymentMethod === "cash" ? cashStats.cashReceived : null,
      changeDue: paymentMethod === "cash" ? cashStats.changeDue : null,
      changeConfirmed: paymentMethod === "cash" ? confirmedChange : null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      const saleRef = await addDoc(collection(db, "posSales"), salePayload);

      const stockUpdates = cartItems.reduce((map, item) => {
        if (item.type !== "product" && item.type !== "pos-product") return map;
        const key = `${item.type}:${item.sourceId}`;
        map.set(key, (map.get(key) || 0) + item.quantity);
        return map;
      }, new Map());

      const stockPromises = Array.from(stockUpdates.entries()).map(([key, quantity]) => {
        const [type, sourceId] = key.split(":");
        const sourceCollection = type === "product" ? "products" : "posProducts";
        const sourceList = type === "product" ? normalizedProducts : normalizedPosProducts;
        const sourceItem = sourceList.find((entry) => entry.id === sourceId);
        const currentQty = clampQuantity(sourceItem?.quantity);
        if (currentQty === null) return null;
        const nextQty = Math.max(0, currentQty - quantity);
        return updateDoc(doc(db, sourceCollection, sourceId), {
          quantity: nextQty,
          updatedAt: serverTimestamp(),
        });
      });

      const bookingPromises = cartItems
        .filter((item) => item.type === "workshop")
        .map((item) => {
          const notesValue = [
            `POS sale (${paymentMethod})`,
            notes.trim() || null,
          ]
            .filter(Boolean)
            .join(" - ")
            .slice(0, 1000);
          const payload = {
            name: trimmedCustomer.name,
            email: trimmedCustomer.email,
            frame: "POS",
            sessionDate: item.metadata?.sessionDate || "TBC",
            sessionLabel: item.metadata?.sessionLabel || "TBC",
            workshopId: item.sourceId,
            createdAt: serverTimestamp(),
          };
          if (notesValue) {
            payload.notes = notesValue;
          }
          return addDoc(collection(db, "bookings"), payload);
        });

      const classBookingPromises = cartItems
        .filter((item) => item.type === "class")
        .map((item) => {
          const notesValue = [
            `POS sale (${paymentMethod})`,
            notes.trim() || null,
          ]
            .filter(Boolean)
            .join(" - ")
            .slice(0, 1000);
          const payload = {
            customerName: trimmedCustomer.name,
            email: trimmedCustomer.email,
            phone: trimmedCustomer.phone,
            occasion: item.name,
            location: item.metadata?.location || "Bethany Blooms Studio",
            status: "confirmed",
            eventDate: item.metadata?.sessionDate || null,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            classId: item.sourceId,
            sessionLabel: item.metadata?.sessionLabel || null,
            attendeeCount: item.quantity,
          };
          if (notesValue) {
            payload.notes = notesValue;
          }
          if (item.metadata?.optionLabel) {
            payload.optionLabel = item.metadata.optionLabel;
          }
          if (item.metadata?.optionId) {
            payload.optionValue = item.metadata.optionId;
          }
          return addDoc(collection(db, "cutFlowerBookings"), payload);
        });

      await Promise.all([
        ...stockPromises.filter(Boolean),
        ...bookingPromises,
        ...classBookingPromises,
      ]);

      if (sendEmailReceipt && functionsInstance) {
        try {
          const sendReceipt = httpsCallable(functionsInstance, "sendPosReceipt");
          await sendReceipt({
            receiptId: saleRef.id,
            receiptNumber,
            customer: trimmedCustomer,
            items: salePayload.items,
            subtotal: salePayload.subtotal,
            total: salePayload.total,
            discount: salePayload.discount,
            paymentMethod,
            cashReceived: salePayload.cashReceived,
            changeDue: salePayload.changeDue,
          });
        } catch (error) {
          console.warn("Unable to send POS receipt", error);
        }
      }

      setReceiptData({
        id: saleRef.id,
        receiptNumber,
        createdAt: new Date(),
        customer: trimmedCustomer,
        items: salePayload.items,
        subtotal: salePayload.subtotal,
        total: salePayload.total,
        discount: salePayload.discount,
        paymentMethod,
        cashReceived: salePayload.cashReceived,
        changeDue: salePayload.changeDue,
      });
      setCheckoutStatus("success");
      if (showPrintableReceipt) {
        setTimeout(() => window.print(), 100);
      }
      resetCheckout();
    } catch (error) {
      setCheckoutStatus("error");
      setCheckoutError(error.message || "Unable to complete the sale.");
    }
  };

  return (
    <div className="admin-panel pos-panel">
      <header className="admin-panel__header pos-panel__header">
        <div>
          <h2>Point of Sale</h2>
          <p className="modal__meta">Process in-store orders, bookings, and class sales.</p>
        </div>
        <div className="pos-panel__actions">
          <button
            className="btn btn--secondary pos-mobile-only"
            type="button"
            onClick={openCatalogModal}
          >
            Add items
          </button>
          <button
            className="btn btn--secondary"
            type="button"
            onClick={openPosItemsModal}
            disabled={!inventoryEnabled}
          >
            Add POS items
          </button>
        </div>
      </header>

      {inventoryError && <p className="admin-panel__error">{inventoryError}</p>}

      {posCatalogOpen && (
        <button
          className="pos-catalog__overlay pos-mobile-only"
          type="button"
          onClick={closeCatalogModal}
          aria-label="Close item catalog"
        />
      )}

      <div className="pos-layout">
        <section className={`pos-catalog ${posCatalogOpen ? "is-mobile-open" : ""}`}>
          <div className="pos-catalog__mobile-header pos-mobile-only">
            <div>
              <h3>Add items</h3>
              <p className="modal__meta">Search and add items to the cart.</p>
            </div>
            <button
              className="icon-btn"
              type="button"
              onClick={closeCatalogModal}
              aria-label="Close item catalog"
            >
              &times;
            </button>
          </div>
          <div className="pos-toolbar pos-print-hide">
            <div className="pos-toolbar__row">
              <div className="admin-tabs">
                {POS_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={`admin-tab ${activeTab === tab.id ? "is-active" : ""}`}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="pos-toolbar__row pos-toolbar__row--search">
              <input
                className="input pos-search"
                type="search"
                placeholder="Search items"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
              <span className="modal__meta pos-toolbar__count">Showing {activeCount} items</span>
            </div>
            {activeTab === "products" && categoryOptions.length > 0 && (
              <div className="pos-toolbar__categories">
                <button
                  className={`pos-category-chip ${activeCategoryId === "all" ? "is-active" : ""}`}
                  type="button"
                  onClick={() => setActiveCategoryId("all")}
                >
                  All categories
                </button>
                {categoryOptions.map((category) => (
                  <button
                    className={`pos-category-chip ${
                      activeCategoryId === category.id ? "is-active" : ""
                    }`}
                    type="button"
                    key={category.id}
                    onClick={() => setActiveCategoryId(category.id)}
                  >
                    {category.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          {inventoryLoading && <p className="modal__meta">Loading inventory...</p>}

          {activeTab === "products" && (
            <div className="pos-grid">
              {filteredProducts.map((product) => {
                const selection = variantSelections[product.id] || "";
                const variant = product.variants.find((entry) => entry.id === selection) || null;
                const variantPrice = Number.isFinite(variant?.price) ? variant.price : product.numericPrice;
                const priceLabel = Number.isFinite(variantPrice) ? formatCurrency(variantPrice) : "Price on request";
                const canAdd = product.stockStatus?.state !== "out";
                return (
                  <article className="pos-item-card" key={product.id}>
                    <div>
                      <h4>{product.name}</h4>
                      <p className="modal__meta">{priceLabel}</p>
                      {product.stockStatus && (
                        <span className={`badge badge--stock-${product.stockStatus.state}`}>
                          {product.stockStatus.label}
                        </span>
                      )}
                      {product.variants.length > 0 && (
                        <label className="modal__meta pos-item-card__field">
                          Variant
                          <select
                            className="input"
                            value={selection}
                            onChange={(event) =>
                              setVariantSelections((prev) => ({
                                ...prev,
                                [product.id]: event.target.value,
                              }))
                            }
                          >
                            <option value="">Select variant</option>
                            {product.variants.map((variantOption) => (
                              <option key={variantOption.id} value={variantOption.id}>
                                {variantOption.label}
                                {Number.isFinite(variantOption.price) ? ` - ${formatCurrency(variantOption.price)}` : ""}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                    </div>
                    <button
                      className="btn btn--secondary"
                      type="button"
                      disabled={!canAdd || (product.variants.length > 0 && !selection)}
                      onClick={() => {
                        const finalPrice = Number.isFinite(variantPrice) ? variantPrice : 0;
                        const metadata = {
                          type: "product",
                          productId: product.id,
                          variantId: variant?.id || null,
                          variantLabel: variant?.label || null,
                        };
                        handleAddToCart({
                          key: buildCartKey({
                            type: "product",
                            sourceId: product.id,
                            variantId: variant?.id,
                          }),
                          sourceId: product.id,
                          type: "product",
                          name: product.name,
                          price: finalPrice,
                          quantity: 1,
                          metadata,
                        });
                      }}
                    >
                      Add
                    </button>
                  </article>
                );
              })}
            </div>
          )}

          {activeTab === "pos-products" && (
            <div className="pos-grid">
              {filteredPosProducts.map((product) => {
                const canAdd = product.stockStatus?.state !== "out";
                return (
                  <article className="pos-item-card" key={product.id}>
                    <div>
                      <h4>{product.name}</h4>
                      <p className="modal__meta">{product.displayPrice}</p>
                      {product.stockStatus && (
                        <span className={`badge badge--stock-${product.stockStatus.state}`}>
                          {product.stockStatus.label}
                        </span>
                      )}
                    </div>
                    <button
                      className="btn btn--secondary"
                      type="button"
                      disabled={!canAdd}
                      onClick={() => {
                        const price = Number.isFinite(product.numericPrice) ? product.numericPrice : 0;
                        handleAddToCart({
                          key: buildCartKey({ type: "pos-product", sourceId: product.id }),
                          sourceId: product.id,
                          type: "pos-product",
                          name: product.name,
                          price,
                          quantity: 1,
                          metadata: { type: "pos-product" },
                        });
                      }}
                    >
                      Add
                    </button>
                  </article>
                );
              })}
            </div>
          )}

          {activeTab === "workshops" && (
            <div className="pos-grid">
              {filteredWorkshops.map((workshop) => {
                const selectedSessionId = workshopSelections[workshop.id] || workshop.sessions[0]?.id || "";
                const selectedSession = workshop.sessions.find((session) => session.id === selectedSessionId) || null;
                const price = Number.isFinite(workshop.numericPrice) ? workshop.numericPrice : 0;
                return (
                  <article className="pos-item-card" key={workshop.id}>
                    <div>
                      <h4>{workshop.title}</h4>
                      <p className="modal__meta">{workshop.displayPrice}</p>
                      {workshop.sessions.length > 0 && (
                        <label className="modal__meta pos-item-card__field">
                          Session
                          <select
                            className="input"
                            value={selectedSessionId}
                            onChange={(event) =>
                              setWorkshopSelections((prev) => ({
                                ...prev,
                                [workshop.id]: event.target.value,
                              }))
                            }
                          >
                            {workshop.sessions.map((session) => (
                              <option key={session.id} value={session.id}>
                                {session.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                    </div>
                    <button
                      className="btn btn--secondary"
                      type="button"
                      onClick={() => {
                        const metadata = {
                          type: "workshop",
                          workshopId: workshop.id,
                          sessionId: selectedSession?.id || null,
                          sessionLabel: selectedSession?.label || null,
                          sessionDate: selectedSession?.date || "",
                        };
                        handleAddToCart({
                          key: buildCartKey({
                            type: "workshop",
                            sourceId: workshop.id,
                            sessionId: selectedSession?.id,
                          }),
                          sourceId: workshop.id,
                          type: "workshop",
                          name: workshop.title,
                          price,
                          quantity: 1,
                          metadata,
                        });
                      }}
                    >
                      Add
                    </button>
                  </article>
                );
              })}
            </div>
          )}

          {activeTab === "classes" && (
            <div className="pos-grid">
              {filteredClasses.map((classDoc) => {
                const selectedSlotId = classSelections[classDoc.id] || classDoc.slots[0]?.id || "";
                const selectedSlot = classDoc.slots.find((slot) => slot.id === selectedSlotId) || null;
                const selectedOptionId = classOptionSelections[classDoc.id] || classDoc.options[0]?.id || "";
                const selectedOption = classDoc.options.find((option) => option.id === selectedOptionId) || null;
                const optionPrice = Number.isFinite(selectedOption?.price) ? selectedOption.price : null;
                const price = Number.isFinite(optionPrice)
                  ? optionPrice
                  : Number.isFinite(classDoc.numericPrice)
                    ? classDoc.numericPrice
                    : 0;
                const priceLabel = Number.isFinite(optionPrice)
                  ? formatCurrency(optionPrice)
                  : classDoc.displayPrice;
                const sessionLabel = selectedSlot?.label
                  ? `${classDoc.displayDate} - ${selectedSlot.label}`
                  : classDoc.displayDate;
                const canAdd = classDoc.options.length === 0 || Boolean(selectedOption);
                return (
                  <article className="pos-item-card" key={classDoc.id}>
                    <div>
                      <h4>{classDoc.title}</h4>
                      <p className="modal__meta">{priceLabel}</p>
                      <p className="modal__meta">{classDoc.displayDate}</p>
                      {classDoc.slots.length > 0 && (
                        <label className="modal__meta pos-item-card__field">
                          Time slot
                          <select
                            className="input"
                            value={selectedSlotId}
                            onChange={(event) =>
                              setClassSelections((prev) => ({
                                ...prev,
                                [classDoc.id]: event.target.value,
                              }))
                            }
                          >
                            {classDoc.slots.map((slot) => (
                              <option key={slot.id} value={slot.id}>
                                {slot.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      {classDoc.options.length > 0 && (
                        <label className="modal__meta pos-item-card__field">
                          Option
                          <select
                            className="input"
                            value={selectedOptionId}
                            onChange={(event) =>
                              setClassOptionSelections((prev) => ({
                                ...prev,
                                [classDoc.id]: event.target.value,
                              }))
                            }
                          >
                            <option value="">Select option</option>
                            {classDoc.options.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.label}
                                {Number.isFinite(option.price) ? ` - ${formatCurrency(option.price)}` : ""}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                    </div>
                    <button
                      className="btn btn--secondary"
                      type="button"
                      disabled={!canAdd}
                      onClick={() => {
                        const metadata = {
                          type: "cut-flower",
                          classId: classDoc.id,
                          sessionLabel,
                          sessionDate: classDoc.eventDate ? classDoc.eventDate.toISOString() : "",
                          location: classDoc.location || "",
                          optionId: selectedOption?.id || null,
                          optionLabel: selectedOption?.label || null,
                          optionPrice,
                        };
                        handleAddToCart({
                          key: buildCartKey({
                            type: "class",
                            sourceId: classDoc.id,
                            sessionId: selectedSlot?.id,
                            variantId: selectedOption?.id,
                          }),
                          sourceId: classDoc.id,
                          type: "class",
                          name: classDoc.title,
                          price,
                          quantity: 1,
                          metadata,
                        });
                      }}
                    >
                      Add
                    </button>
                  </article>
                );
              })}
            </div>
          )}

          {activeTab === "events" && (
            <div className="pos-grid">
              {filteredEvents.map((event) => {
                const selectedSlotId = eventSelections[event.id] || event.slots[0]?.id || "";
                const selectedSlot = event.slots.find((slot) => slot.id === selectedSlotId) || null;
                const sessionLabel = selectedSlot?.label
                  ? `${event.displayDate} - ${selectedSlot.label}`
                  : event.displayDate;
                return (
                  <article className="pos-item-card" key={event.id}>
                    <div>
                      <h4>{event.title}</h4>
                      <p className="modal__meta">{event.displayDate}</p>
                      {event.slots.length > 0 && (
                        <label className="modal__meta pos-item-card__field">
                          Time slot
                          <select
                            className="input"
                            value={selectedSlotId}
                            onChange={(eventSlot) =>
                              setEventSelections((prev) => ({
                                ...prev,
                                [event.id]: eventSlot.target.value,
                              }))
                            }
                          >
                            {event.slots.map((slot) => (
                              <option key={slot.id} value={slot.id}>
                                {slot.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                    </div>
                    <button
                      className="btn btn--secondary"
                      type="button"
                      onClick={() => {
                        const metadata = {
                          type: "event",
                          eventId: event.id,
                          sessionLabel,
                          sessionDate: event.eventDate ? event.eventDate.toISOString() : "",
                          location: event.location || "",
                        };
                        handleAddToCart({
                          key: buildCartKey({
                            type: "event",
                            sourceId: event.id,
                            sessionId: selectedSlot?.id,
                          }),
                          sourceId: event.id,
                          type: "event",
                          name: event.title,
                          price: 0,
                          quantity: 1,
                          metadata,
                        });
                      }}
                    >
                      Add
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </section>
        <section className="pos-cart">
          <div className="pos-cart__panel">
            <h3>Cart</h3>
            {cartItems.length === 0 ? (
              <p className="empty-state">Add items to start a sale.</p>
            ) : (
              <ul className="pos-cart__list">
                {cartItems.map((item) => (
                  <li key={item.key} className="pos-cart__item">
                    <div className="pos-cart__row">
                      <div className="pos-cart__info">
                        <p className="pos-cart__name">{item.name}</p>
                        <div className="pos-cart__meta">
                          {item.metadata?.variantLabel && <span>Variant: {item.metadata.variantLabel}</span>}
                          {item.metadata?.optionLabel && <span>Option: {item.metadata.optionLabel}</span>}
                          {item.metadata?.sessionLabel && <span>Session: {item.metadata.sessionLabel}</span>}
                        </div>
                      </div>
                      <div className="pos-cart__line-total">
                        {formatCurrency(item.price * item.quantity)}
                      </div>
                    </div>
                    <div className="pos-cart__controls">
                      <div className="pos-cart__field">
                        <span className="pos-cart__label">Qty</span>
                        <div className="pos-cart__stepper">
                          <button
                            className="pos-cart__stepper-btn"
                            type="button"
                            onClick={() => adjustCartQuantity(item.key, -1)}
                            aria-label={`Decrease ${item.name} quantity`}
                          >
                            -
                          </button>
                          <input
                            className="input pos-cart__input"
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(event) => handleCartQuantityChange(item.key, event.target.value)}
                          />
                          <button
                            className="pos-cart__stepper-btn"
                            type="button"
                            onClick={() => adjustCartQuantity(item.key, 1)}
                            aria-label={`Increase ${item.name} quantity`}
                          >
                            +
                          </button>
                        </div>
                      </div>
                      <button
                        className="icon-btn icon-btn--danger pos-cart__remove"
                        type="button"
                        onClick={() => handleRemoveCartItem(item.key)}
                        aria-label={`Remove ${item.name}`}
                      >
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 24 24"
                          width="18"
                          height="18"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M3 6h18" />
                          <path d="M8 6v-2a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                          <path d="M10 11v6M14 11v6" />
                        </svg>
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="pos-cart__panel">
            <h3>Checkout</h3>
            <div className="pos-checkout__section">
              <div className="pos-checkout__section-title">
                <h4>Discount</h4>
                <p className="modal__meta">Apply a once-off discount to this sale.</p>
              </div>
              <div className="pos-discount">
                <label className="modal__meta">
                  Discount type
                  <select
                    className="input"
                    value={discountType}
                    onChange={(event) => setDiscountType(event.target.value)}
                  >
                    <option value="none">None</option>
                    <option value="amount">Amount (R)</option>
                    <option value="percent">Percent (%)</option>
                  </select>
                </label>
                {discountType !== "none" && (
                  <label className="modal__meta">
                    {discountType === "amount" ? "Discount amount" : "Discount percent"}
                    <input
                      className="input"
                      type="number"
                      min="0"
                      step={discountType === "amount" ? "0.01" : "1"}
                      max={discountType === "percent" ? "100" : undefined}
                      value={discountValue}
                      onChange={(event) => setDiscountValue(event.target.value)}
                    />
                  </label>
                )}
              </div>
            </div>

            <div className="pos-checkout__section">
              <div className="pos-checkout__section-title">
                <h4>Totals</h4>
              </div>
              <div className="pos-checkout__totals">
                <div>
                  <span>Subtotal</span>
                  <strong>{formatCurrency(pricing.subtotal)}</strong>
                </div>
              {pricing.discountAmount > 0 && (
                <div>
                  <span>
                    Discount
                    {discountType === "percent" && pricing.discountPercent !== null
                      ? ` (${pricing.discountPercent}%)`
                      : ""}
                  </span>
                  <strong>-{formatCurrency(pricing.discountAmount)}</strong>
                </div>
              )}
                <div>
                  <span>Total</span>
                  <strong>{formatCurrency(pricing.total)}</strong>
                </div>
              </div>
            </div>

            <div className="pos-checkout__options">
              <label className="modal__meta">
                Payment method
                <select
                  className="input"
                  value={paymentMethod}
                  onChange={(event) => setPaymentMethod(event.target.value)}
                >
                  <option value="card">Card</option>
                  <option value="cash">Cash</option>
                </select>
              </label>
              {paymentMethod === "cash" && (
                <div className="pos-cash">
                  <label className="modal__meta">
                    Cash received
                    <input
                      className="input"
                      type="number"
                      min="0"
                      step="0.01"
                      value={cashReceived}
                      onChange={(event) => setCashReceived(event.target.value)}
                    />
                  </label>
                  <div className="pos-cash__summary">
                    <span className="modal__meta">Change due</span>
                    <strong>{formatCurrency(cashStats.changeDue || 0)}</strong>
                  </div>
                  <p className="modal__meta">Confirm the change amount at checkout.</p>
                </div>
              )}
            </div>

            <div className="pos-checkout__section">
              <div className="pos-checkout__section-title">
                <h4>Receipt</h4>
                <p className="modal__meta">Ask the customer if they want an emailed receipt.</p>
              </div>
              <label className="admin-checkbox">
                <input
                  type="checkbox"
                  checked={sendEmailReceipt}
                  onChange={(event) => setSendEmailReceipt(event.target.checked)}
                />
                Email receipt to customer
              </label>
              <label className="admin-checkbox">
                <input
                  type="checkbox"
                  checked={showPrintableReceipt}
                  onChange={(event) => setShowPrintableReceipt(event.target.checked)}
                />
                Show printable receipt after sale
              </label>
            </div>

            {requiresCustomerDetails && (
              <div className="pos-checkout__section">
                <div className="pos-checkout__section-title">
                  <h4>Customer details</h4>
                  <p className="modal__meta">Needed for emailed receipts.</p>
                </div>
                <div className="pos-checkout__fields">
                  <input
                    className="input"
                    placeholder="Customer name"
                    value={customer.name}
                    onChange={updateCustomerField("name")}
                  />
                  <input
                    className="input"
                    type="email"
                    placeholder="Customer email"
                    value={customer.email}
                    onChange={updateCustomerField("email")}
                  />
                  <input
                    className="input"
                    placeholder="Phone"
                    value={customer.phone}
                    onChange={updateCustomerField("phone")}
                  />
                  <textarea
                    className="input"
                    rows="3"
                    placeholder="Notes for this sale"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                  />
                </div>
              </div>
            )}

            {!requiresCustomerDetails && (
              <div className="pos-checkout__section">
                <div className="pos-checkout__section-title">
                  <h4>Notes</h4>
                  <p className="modal__meta">Optional notes for this sale.</p>
                </div>
                <textarea
                  className="input"
                  rows="3"
                  placeholder="Notes for this sale"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </div>
            )}

            {checkoutError && <p className="admin-panel__error">{checkoutError}</p>}
            {checkoutStatus === "success" && <p className="admin-panel__status">Sale completed.</p>}

            <div className="admin-form__actions">
              <button
                className="btn btn--primary"
                type="button"
                disabled={checkoutStatus === "saving"}
                onClick={handleCheckout}
              >
                {checkoutStatus === "saving" ? "Processing..." : "Complete Sale"}
              </button>
              <button
                className="btn btn--secondary"
                type="button"
                onClick={resetCheckout}
                disabled={checkoutStatus === "saving"}
              >
                Clear
              </button>
            </div>
          </div>
        </section>
      </div>

      {posItemsOpen && (
        <div
          className="modal is-active admin-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pos-items-title"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closePosItemsModal();
            }
          }}
        >
          <div className="modal__content">
            <button className="modal__close" type="button" onClick={closePosItemsModal} aria-label="Close">
              &times;
            </button>
            <h3 className="modal__title" id="pos-items-title">
              POS-only Products
            </h3>
            <p className="modal__meta">Add items sold only at the studio (cool drinks, add-ons, etc).</p>
            <div className="admin-panel__content pos-products__content">
              <form className="admin-form" onSubmit={handleSavePosProduct}>
                <input
                  className="input"
                  placeholder="POS product name"
                  value={posProductForm.name}
                  onChange={(event) =>
                    setPosProductForm((prev) => ({
                      ...prev,
                      name: event.target.value,
                    }))
                  }
                  required
                />
                <input
                  className="input"
                  placeholder="Price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={posProductForm.price}
                  onChange={(event) =>
                    setPosProductForm((prev) => ({
                      ...prev,
                      price: event.target.value,
                    }))
                  }
                  required
                />
                <input
                  className="input"
                  placeholder="Quantity"
                  type="number"
                  min="0"
                  value={posProductForm.quantity}
                  onChange={(event) =>
                    setPosProductForm((prev) => ({
                      ...prev,
                      quantity: event.target.value,
                    }))
                  }
                />
                <label className="admin-checkbox">
                  <input
                    type="checkbox"
                    checked={posProductForm.forceOutOfStock}
                    onChange={(event) =>
                      setPosProductForm((prev) => ({
                        ...prev,
                        forceOutOfStock: event.target.checked,
                      }))
                    }
                  />
                  Mark as out of stock
                </label>
                <div className="admin-form__actions">
                  <button className="btn btn--primary" type="submit" disabled={posProductSaving}>
                    {editingPosProductId ? "Update POS Product" : "Add POS Product"}
                  </button>
                  {editingPosProductId && (
                    <button
                      className="btn btn--secondary"
                      type="button"
                      onClick={() => {
                        setEditingPosProductId(null);
                        setPosProductForm(INITIAL_POS_PRODUCT);
                      }}
                    >
                      Cancel
                    </button>
                  )}
                </div>
                {posProductError && <p className="admin-panel__error">{posProductError}</p>}
              </form>

              <div className="admin-panel__list">
                {normalizedPosProducts.length === 0 ? (
                  <p className="empty-state">No POS-only products yet.</p>
                ) : (
                  normalizedPosProducts.map((product) => (
                    <div className="admin-category-card" key={product.id}>
                      <div>
                        <strong>{product.name}</strong>
                        <p className="modal__meta">{product.displayPrice}</p>
                      </div>
                      <div className="admin-panel__header-actions">
                        <button
                          className="btn btn--secondary"
                          type="button"
                          onClick={() => handleEditPosProduct(product)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn btn--secondary"
                          type="button"
                          onClick={() => handleDeletePosProduct(product.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {changeConfirmOpen && (
        <div
          className="modal is-active admin-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="change-confirm-title"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setChangeConfirmOpen(false);
            }
          }}
        >
          <div className="modal__content">
            <button className="modal__close" type="button" onClick={() => setChangeConfirmOpen(false)} aria-label="Close">
              &times;
            </button>
            <h3 className="modal__title" id="change-confirm-title">
              Confirm change given
            </h3>
            <p className="modal__meta">Cash received: {formatCurrency(cashStats.cashReceived || 0)}</p>
            <p className="modal__meta">Change due: {formatCurrency(cashStats.changeDue || 0)}</p>
            <div className="admin-form__actions" style={{ marginTop: "1.5rem" }}>
              <button
                className="btn btn--secondary"
                type="button"
                onClick={() => setChangeConfirmOpen(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn--primary"
                type="button"
                onClick={() => {
                  changeConfirmRef.current = true;
                  setChangeConfirmOpen(false);
                  handleCheckout();
                }}
              >
                Confirm change
              </button>
            </div>
          </div>
        </div>
      )}

      {receiptData && (
        <section className="pos-receipt">
          <header className="pos-receipt__header">
            <div>
              <h3>Receipt {receiptData.receiptNumber}</h3>
              <p className="modal__meta">{receiptData.createdAt.toLocaleString("en-ZA")}</p>
            </div>
            <div className="pos-receipt__actions pos-print-hide">
              <button className="btn btn--secondary" type="button" onClick={() => window.print()}>
                Print
              </button>
              <button className="btn btn--secondary" type="button" onClick={() => setReceiptData(null)}>
                Close
              </button>
            </div>
          </header>
          <div className="pos-receipt__body">
            <div className="pos-receipt__section">
              <p>
                <strong>Customer:</strong> {receiptData.customer.name || "Walk-in"}
              </p>
              {receiptData.customer.email && (
                <p>
                  <strong>Email:</strong> {receiptData.customer.email}
                </p>
              )}
              {receiptData.customer.phone && (
                <p>
                  <strong>Phone:</strong> {receiptData.customer.phone}
                </p>
              )}
              <p>
                <strong>Payment:</strong> {receiptData.paymentMethod}
              </p>
              {receiptData.paymentMethod === "cash" && receiptData.cashReceived !== null && (
                <>
                  <p>
                    <strong>Cash received:</strong> {formatCurrency(receiptData.cashReceived)}
                  </p>
                  <p>
                    <strong>Change due:</strong> {formatCurrency(receiptData.changeDue || 0)}
                  </p>
                </>
              )}
            </div>
            <div className="pos-receipt__section">
              <ul>
                {receiptData.items.map((item, index) => (
                  <li key={`${item.id}-${index}`}>
                    {item.name} x{item.quantity} · {formatCurrency(item.price * item.quantity)}
                  </li>
                ))}
              </ul>
            </div>
            <div className="pos-receipt__section pos-receipt__totals">
              {receiptData.discount?.amount > 0 && (
                <p>
                  <strong>Discount:</strong> -{formatCurrency(receiptData.discount.amount)}
                </p>
              )}
              <p>
                <strong>Total:</strong> {formatCurrency(receiptData.total)}
              </p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

export default AdminPosPage;
