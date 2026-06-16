import { useState, useEffect, useRef, KeyboardEvent } from "react";
import Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";
import QRCode from "qrcode";
import { 
  Search, 
  Plus, 
  Minus, 
  Trash2, 
  CreditCard, 
  Banknote, 
  Smartphone,
  Printer,
  X,
  ListTodo,
  ChevronDown,
  ChevronUp,
  CheckCircle
} from "lucide-react";

interface Item {
  id: number;
  category_id: number;
  name: string;
  price: number;
}

interface CartItem extends Item {
  quantity: number;
}

interface ProcessingOrder {
  id: number;
  cart_data: string;
  customer_name: string;
  customer_phone: string;
  payment_mode: string;
  subtotal: number;
  gst: number;
  total: number;
  order_type: string;
  table_number: string;
  created_at: string;
  token_number?: number;
  bill_number?: string;
}

interface BillingProps {
  db: Database | null;
}

const invokeWithTimeout = async (cmd: string, args: any, timeoutMs = 15000) => {
  return Promise.race([
    invoke(cmd, args),
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Tauri invoke timeout: ${cmd}`)), timeoutMs))
  ]);
};

export default function Billing({ db }: BillingProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [suggestions, setSuggestions] = useState<Item[]>([]);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [originalCart, setOriginalCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [paymentMode, setPaymentMode] = useState("Cash");
  const [allItems, setAllItems] = useState<Item[]>([]);
  
  const [isQtyPopupOpen, setIsQtyPopupOpen] = useState(false);
  const [selectedItemForQty, setSelectedItemForQty] = useState<Item | null>(null);
  const [currentQty, setCurrentQty] = useState<number | "">(1);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isKOTPrinted, setIsKOTPrinted] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Credit Billing States
  const [billingType, setBillingType] = useState<"Cash" | "Credit">("Cash");
  const [creditCustomers, setCreditCustomers] = useState<any[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [isAddCustomerPopupOpen, setIsAddCustomerPopupOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");

  // Processing Orders State
  const [processingOrders, setProcessingOrders] = useState<ProcessingOrder[]>([]);
  const [activeOrderId, setActiveOrderId] = useState<number | null>(null);
  const [activeTokenNumber, setActiveTokenNumber] = useState<number | null>(null);
  const [activeBillNumber, setActiveBillNumber] = useState<string | null>(null);
  const [orderType, setOrderType] = useState<"Table" | "Parcel" | "Self Service">("Self Service");
  const [tableNumber, setTableNumber] = useState("");
  const [isTablePopupOpen, setIsTablePopupOpen] = useState(false);
  const [isAlphabetPopupOpen, setIsAlphabetPopupOpen] = useState(false);
  const [selectedAlphabetIndex, setSelectedAlphabetIndex] = useState(0);
  const [isKotConfirmPopupOpen, setIsKotConfirmPopupOpen] = useState(false);
  const [isBillConfirmPopupOpen, setIsBillConfirmPopupOpen] = useState(false);
  const [billSettings, setBillSettings] = useState<any>(null);
  const [kotSettings, setKotSettings] = useState<any>(null);
  const [printerSettings, setPrinterSettings] = useState<any>(null);
  const [storeSettings, setStoreSettings] = useState<any>(null);
  const [isPaymentModeOpen, setIsPaymentModeOpen] = useState(true);
  const [categoryPrinters, setCategoryPrinters] = useState<Record<number, string>>({});
  const [categories, setCategories] = useState<any[]>([]);

  // Subscription State
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const suggestionListRef = useRef<HTMLDivElement>(null);
  const qtyInputRef = useRef<HTMLInputElement>(null);
  const tableInputRef = useRef<HTMLInputElement>(null);

  // Focus search input on mount
  useEffect(() => {
    if (subscriptionStatus === "active") {
      setTimeout(() => searchInputRef.current?.focus(), 0);
    }
  }, [subscriptionStatus]);

  const fetchCreditCustomers = async () => {
    if (!db) return;
    try {
      const result = await db.select<any[]>("SELECT * FROM customers ORDER BY name");
      setCreditCustomers(result);
    } catch (error) {
      console.error("Failed to fetch credit customers:", error);
    }
  };

  // Fetch all items on mount for searching
  useEffect(() => {
    async function fetchInitialData() {
      if (!db) return;
      try {
        const subResult = await db.select<any[]>("SELECT * FROM subscription WHERE id = 1");
        let isExpired = true;
        if (subResult.length > 0 && subResult[0].nextBillingDate) {
            const nextBilling = new Date(subResult[0].nextBillingDate).getTime();
            const now = new Date().getTime();
            const gracePeriodMs = 10 * 24 * 60 * 60 * 1000;
            const lastChecked = subResult[0].last_checked_date ? new Date(subResult[0].last_checked_date).getTime() : 0;

            if (now < lastChecked) {
                isExpired = true;
            } else if (now <= nextBilling + gracePeriodMs) {
                isExpired = false;
                db.execute(`UPDATE subscription SET last_checked_date = $1 WHERE id = 1 AND (last_checked_date IS NULL OR last_checked_date < $1)`, [new Date().toISOString()]).catch(() => {});
            }
        }
        
        if (!isExpired) {
           setSubscriptionStatus("active");
        } else {
           setSubscriptionStatus("inactive");
        }

        const result = await db.select<Item[]>("SELECT * FROM items ORDER BY name");
        setAllItems(result);

        const cats = await db.select<any[]>("SELECT * FROM categories ORDER BY name");
        setCategories(cats);

        const mappingResult = await db.select<any[]>("SELECT * FROM category_printers");
        const mappings: Record<number, string> = {};
        mappingResult.forEach(m => {
          mappings[m.category_id] = m.printer_name;
        });
        setCategoryPrinters(mappings);
        
        const settingsRes = await db.select<any[]>("SELECT * FROM bill_settings WHERE id = 1");
        if (settingsRes.length > 0) {
          const row = settingsRes[0];
          setBillSettings({
            ...row,
            show_gst: row.show_gst !== 0 && row.show_gst !== false && row.show_gst !== "0",
            show_fssai: row.show_fssai !== 0 && row.show_fssai !== false && row.show_fssai !== "0",
            show_address: row.show_address !== 0 && row.show_address !== false && row.show_address !== "0",
            show_phone: row.show_phone !== 0 && row.show_phone !== false && row.show_phone !== "0",
            show_cashier_name: row.show_cashier_name !== 0 && row.show_cashier_name !== false && row.show_cashier_name !== "0",
            gst_enabled: row.gst_enabled !== 0 && row.gst_enabled !== false && row.gst_enabled !== "0",
            show_line_separators: row.show_line_separators !== 0 && row.show_line_separators !== false && row.show_line_separators !== "0",
            show_token: row.show_token !== 0 && row.show_token !== false && row.show_token !== "0",
            sep_header: row.sep_header !== 0 && row.sep_header !== false && row.sep_header !== "0",
            sep_meta: row.sep_meta !== 0 && row.sep_meta !== false && row.sep_meta !== "0",
            sep_token: row.sep_token !== 0 && row.sep_token !== false && row.sep_token !== "0",
            sep_table_header: row.sep_table_header !== 0 && row.sep_table_header !== false && row.sep_table_header !== "0",
            sep_table_body: row.sep_table_body !== 0 && row.sep_table_body !== false && row.sep_table_body !== "0",
            sep_subtotals: row.sep_subtotals !== 0 && row.sep_subtotals !== false && row.sep_subtotals !== "0",
            sep_grand_total: row.sep_grand_total !== 0 && row.sep_grand_total !== false && row.sep_grand_total !== "0",
            dynamic_upi_qr: row.dynamic_upi_qr !== 0 && row.dynamic_upi_qr !== false && row.dynamic_upi_qr !== "0",
            static_upi_qr: row.static_upi_qr !== 0 && row.static_upi_qr !== false && row.static_upi_qr !== "0",
            no_qr_print: row.no_qr_print !== 0 && row.no_qr_print !== false && row.no_qr_print !== "0",
          });
        }

        const kotRes = await db.select<any[]>("SELECT * FROM kot_settings WHERE id = 1");
        if (kotRes.length > 0) {
          const row = kotRes[0];
          setKotSettings({
            ...row,
            show_line_separators: row.show_line_separators !== 0 && row.show_line_separators !== false,
            show_token: row.show_token !== 0 && row.show_token !== false,
            sep_token: row.sep_token !== 0 && row.sep_token !== false,
            sep_header: row.sep_header !== 0 && row.sep_header !== false,
            sep_meta: row.sep_meta !== 0 && row.sep_meta !== false,
            sep_table_header: row.sep_table_header !== 0 && row.sep_table_header !== false,
            sep_table_body: row.sep_table_body !== 0 && row.sep_table_body !== false
          });
        }

        try {
          const printerRes = await db.select<any[]>("SELECT * FROM printer_settings WHERE id = 1");
          if (printerRes.length > 0) {
            const pSettings = printerRes[0];
            
            // Handle Daily Resets
            const today = new Date().toLocaleDateString('en-GB'); // DD/MM/YYYY
            let updatedPSettings = { ...pSettings };
            let needsUpdate = false;

            if (pSettings.last_reset_date !== today) {
                if (pSettings.token_reset_daily) {
                    updatedPSettings.token_current_number = pSettings.token_starting_number || 0;
                    needsUpdate = true;
                }
                if (pSettings.bill_reset_daily) {
                    updatedPSettings.bill_current_number = pSettings.bill_starting_number || 0;
                    needsUpdate = true;
                }
                updatedPSettings.last_reset_date = today;
                needsUpdate = true;
            }

            if (needsUpdate) {
               try {
                 await db.execute(`
                    UPDATE printer_settings SET 
                    token_current_number = $1,
                    bill_current_number = $2,
                    last_reset_date = $3
                    WHERE id = 1
                 `, [updatedPSettings.token_current_number || 0, updatedPSettings.bill_current_number || 0, today]);
               } catch (updateErr) {
                 console.error("Failed to update daily reset:", updateErr);
               }
            }
            
            setPrinterSettings(updatedPSettings);
          }
        } catch (printerErr) {
          console.error("Failed to load printer settings:", printerErr);
        }

        const storeRes = await db.select<any[]>("SELECT * FROM store_settings WHERE id = 1");
        if (storeRes.length > 0) {
          setStoreSettings(storeRes[0]);
        }
        
        await fetchCreditCustomers();
      } catch (error) {
        console.error("Failed to fetch initial data:", error);
      }
    }
    fetchInitialData();
  }, [db]);

  // Fetch Processing Orders
  const fetchProcessingOrders = async () => {
    if (!db) return;
    try {
      const result = await db.select<ProcessingOrder[]>("SELECT * FROM processing_orders ORDER BY created_at DESC");
      setProcessingOrders(result);
    } catch (error) {
      console.error("Failed to fetch processing orders:", error);
    }
  };

  useEffect(() => {
    fetchProcessingOrders();
  }, [db]);

  // Update suggestions when search term changes
  useEffect(() => {
    if (searchTerm.trim() === "") {
      setSuggestions([]);
      setSelectedSuggestionIndex(-1);
      return;
    }

    const searchLower = searchTerm.toLowerCase();
    const filtered = allItems.filter(item => {
      const nameLower = item.name.toLowerCase();
      return nameLower.startsWith(searchLower);
    }).slice(0, 10); // Limit to 10 suggestions

    setSuggestions(filtered);
    setSelectedSuggestionIndex(filtered.length > 0 ? 0 : -1);
  }, [searchTerm, allItems]);

  useEffect(() => {
    if (isQtyPopupOpen) {
      setTimeout(() => qtyInputRef.current?.focus(), 0);
    }
  }, [isQtyPopupOpen]);

  // Auto-hide toast
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => {
        setToastMessage(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  const addToCart = (item: Item, quantity: number) => {
    setCart(prevCart => {
      const existingItem = prevCart.find(i => i.id === item.id);
      if (existingItem) {
        return prevCart.map(i => 
          i.id === item.id ? { ...i, quantity: i.quantity + quantity } : i
        );
      }
      return [...prevCart, { ...item, quantity }];
    });
    setSearchTerm("");
    setSuggestions([]);
    setIsKOTPrinted(false);
    searchInputRef.current?.focus();
  };

  const openQtyPopup = (item: Item) => {
    setSelectedItemForQty(item);
    setCurrentQty(1);
    setIsQtyPopupOpen(true);
  };

  const closeQtyPopup = () => {
    setIsQtyPopupOpen(false);
    setSelectedItemForQty(null);
    setCurrentQty(1);
    searchInputRef.current?.focus();
  };

  const handleAddToCartFromPopup = () => {
    if (selectedItemForQty && currentQty !== "" && currentQty > 0) {
      addToCart(selectedItemForQty, Number(currentQty));
      closeQtyPopup();
    } else if (selectedItemForQty) {
      // If they try to add while it's empty, default to 1
      addToCart(selectedItemForQty, 1);
      closeQtyPopup();
    }
  };

  const removeFromCart = (id: number) => {
    setCart(prevCart => prevCart.filter(item => item.id !== id));
    setIsKOTPrinted(false);
  };

  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const isGstEnabled = billSettings ? Boolean(billSettings.show_gst) && Boolean(billSettings.gst_enabled) : true;
  const gstType = billSettings?.gst_type || "Exclusive";
  const gstPercentage = billSettings?.gst_percentage !== undefined ? Number(billSettings.gst_percentage) : 5;
  
  let gst = 0;
  let total = subtotal;

  if (isGstEnabled) {
    if (gstType === "Exclusive") {
      gst = subtotal * (gstPercentage / 100);
      total = subtotal + gst;
    } else {
      // Inclusive: total is subtotal, GST is a portion of it
      // Formula: GST = Total - (Total / (1 + Rate))
      gst = subtotal - (subtotal / (1 + (gstPercentage / 100)));
      total = subtotal;
    }
  }

  const getLineWidth = (paperSize: string) => {
    switch (paperSize) {
      case "2inch": return 32;
      case "4inch": return 64;
      case "3inch":
      default: return 48;
    }
  };

  const centerText = (text: any, width: number) => {
    const str = String(text || "");
    const spaces = Math.max(0, Math.floor((width - str.length) / 2));
    return " ".repeat(spaces) + str;
  };

  const padRight = (text: any, width: number) => {
    const str = String(text || "");
    if (str.length >= width) return str.substring(0, width);
    return str.padEnd(width);
  };

  const padLeft = (text: any, width: number) => {
    const str = String(text || "");
    if (str.length >= width) return str.substring(0, width);
    return str.padStart(width);
  };

  const generateESCPOSImage = async (base64: string, sizePercent: number, paperSize: string): Promise<number[]> => {
    return new Promise((resolve) => {
      if (!base64) {
        resolve([]);
        return;
      }
      const img = new Image();
      img.onload = () => {
        if (!img.width || !img.height || img.width <= 0 || img.height <= 0) {
           console.error("Invalid image dimensions:", img.width, img.height);
           resolve([]);
           return;
        }

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve([]);
          return;
        }
        
        let maxWidth = 384; // 2inch (48mm)
        if (paperSize === "4inch") maxWidth = 800; // 100mm
        else if (paperSize === "3inch") maxWidth = 576; // 80mm

        const targetWidth = Math.max(8, Math.floor(maxWidth * (sizePercent / 100)));
        const targetHeight = Math.max(8, Math.floor((img.height / img.width) * targetWidth));
        
        if (!isFinite(targetWidth) || !isFinite(targetHeight)) {
           console.error("Invalid calculated dimensions:", targetWidth, targetHeight);
           resolve([]);
           return;
        }

        // ESC/POS requires width to be a multiple of 8
        const width = Math.floor((targetWidth + 7) / 8) * 8;
        const height = targetHeight;
        
        canvas.width = width;
        canvas.height = height;
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, width, height);
        
        ctx.drawImage(img, 0, 0, targetWidth, height);
        
        const imgData = ctx.getImageData(0, 0, width, height);
        const pixels = imgData.data;
        
        const bytes: number[] = [];
        
        // Center alignment command for image
        bytes.push(0x1B, 0x61, 0x01); // Center

        bytes.push(0x1D, 0x76, 0x30, 0x00); // GS v 0 0
        
        const xL = (width / 8) % 256;
        const xH = Math.floor((width / 8) / 256);
        const yL = height % 256;
        const yH = Math.floor(height / 256);
        
        bytes.push(xL, xH, yL, yH);
        
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x += 8) {
            let byte = 0;
            for (let bit = 0; bit < 8; bit++) {
              if (x + bit < width) {
                const idx = ((y * width) + (x + bit)) * 4;
                const r = pixels[idx];
                const g = pixels[idx + 1];
                const b = pixels[idx + 2];
                const a = pixels[idx + 3];
                
                const luma = (r * 0.299 + g * 0.587 + b * 0.114);
                // Threshold at 128
                const isBlack = (a > 128) && (luma < 128);
                if (isBlack) {
                  byte |= (1 << (7 - bit));
                }
              }
            }
            bytes.push(byte);
          }
        }

        // Reset alignment
        bytes.push(0x1B, 0x61, 0x00); 
        // Add a line break
        bytes.push(0x0A);
        
        resolve(bytes);
      };
      img.onerror = () => resolve([]);
      img.src = base64;
    });
  };

  const buildPrintData = (text: string, printBold: boolean, imageBytes: number[] = [], logoPosition: string = 'none'): number[] => {
    const encoder = new TextEncoder();
    let data: number[] = [];
    
    // ESC @ (Initialize Printer)
    data.push(0x1B, 0x40);

    // Append Image Bytes if any (Top position)
    if (imageBytes && imageBytes.length > 0 && logoPosition === 'top') {
      data = data.concat(imageBytes);
    }

    if (printBold) {
      // ESC E 1 (Bold ON)
      data.push(0x1B, 0x45, 0x01);
    }
    
    // Add Text Bytes
    const textBytes = Array.from(encoder.encode(text));
    data = data.concat(textBytes);

    if (printBold) {
      // ESC E 0 (Bold OFF)
      data.push(0x1B, 0x45, 0x00);
    }

    // Append Image Bytes if any (Bottom or Watermark fallback)
    if (imageBytes && imageBytes.length > 0 && (logoPosition === 'bottom' || logoPosition === 'watermark')) {
      // For thermal printers, true watermarks (transparent image behind text) are impossible in raw text mode.
      // We print it at the bottom as a fallback.
      data.push(0x1B, 0x61, 0x01); // Center
      data = data.concat(imageBytes);
      data.push(0x1B, 0x61, 0x00); // Left
    }

    // GS V A \x10 (Cut Paper)
    data.push(0x1D, 0x56, 0x41, 0x10);

    return data;
  };

  const executePrintKOT = async (overrideTableNumber?: string, skipPrint: boolean = false) => {
    if (cart.length === 0) {
      setToastMessage("Cart is empty!");
      return;
    }

    if (isProcessing) return;
    setIsProcessing(true);

    try {
      const finalTableNumber = overrideTableNumber !== undefined ? overrideTableNumber : tableNumber;

      if (orderType === "Table" && !finalTableNumber) {
        setIsTablePopupOpen(true);
        setIsProcessing(false);
        return;
      }

      let currentOrderId = activeOrderId;
      let assignedTokenNumber = activeTokenNumber;
      let assignedBillNumber = activeBillNumber;

      if (db) {
        try {
          const cartDataStr = JSON.stringify(cart);

          let cName = customerName;
          let cPhone = customerPhone;
          let pMode = paymentMode;

          if (billingType === "Credit" && selectedCustomerId) {
            const c = creditCustomers.find(c => c.id === selectedCustomerId);
            if (c) {
              cName = c.name;
              cPhone = c.phone;
              pMode = "Credit";
            }
          }

          if (activeOrderId) {
            await db.execute(
              `UPDATE processing_orders 
               SET cart_data = $1, customer_name = $2, customer_phone = $3, payment_mode = $4, subtotal = $5, gst = $6, total = $7, order_type = $8, table_number = $9, customer_id = $10 
               WHERE id = $11`,
              [cartDataStr, cName, cPhone, pMode, subtotal, gst, total, orderType, finalTableNumber, selectedCustomerId, activeOrderId]
            );
          } else {
            if (!assignedTokenNumber) {
              assignedTokenNumber = printerSettings?.token_current_number || 100;
            }
            if (!assignedBillNumber) {
              const currentBillNumber = printerSettings?.bill_current_number || 1;
              assignedBillNumber = `${printerSettings?.bill_prefix || ""}${currentBillNumber}`;
            }
            const result = await db.execute(
              `INSERT INTO processing_orders (cart_data, customer_name, customer_phone, payment_mode, subtotal, gst, total, order_type, table_number, customer_id, token_number, bill_number) 
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
              [cartDataStr, cName, cPhone, pMode, subtotal, gst, total, orderType, finalTableNumber, selectedCustomerId, assignedTokenNumber, assignedBillNumber]
            );
            currentOrderId = result.lastInsertId || null;
            setActiveOrderId(currentOrderId);
            setActiveTokenNumber(assignedTokenNumber);
            setActiveBillNumber(assignedBillNumber);

            await db.execute("UPDATE printer_settings SET token_current_number = token_current_number + 1, bill_current_number = bill_current_number + 1 WHERE id = 1");
            setPrinterSettings((prev: any) => prev ? {...prev, token_current_number: assignedTokenNumber! + 1, bill_current_number: (prev.bill_current_number || 0) + 1} : prev);
          }
          await fetchProcessingOrders();
        } catch (err) {
          console.error("Failed to save KOT to processing orders:", err);
        }
      }

      if (skipPrint) {
         setToastMessage("Order Moved to Processing");
         setOriginalCart([...cart]);
         startNewOrder();
         return;
      }

      // Calculate Delta for KOT Printing
      const itemsToPrint: CartItem[] = [];
      if (activeOrderId) {
        // It's an existing order, only print added items/quantities
        cart.forEach(item => {
          const originalItem = originalCart.find(oi => oi.id === item.id);
          if (!originalItem) {
            // Completely new item
            itemsToPrint.push(item);
          } else if (item.quantity > originalItem.quantity) {
            // Existing item but quantity increased
            itemsToPrint.push({ ...item, quantity: item.quantity - originalItem.quantity });
          }
        });
      } else {
        // New order, print everything
        itemsToPrint.push(...cart);
      }

      if (itemsToPrint.length === 0) {
         setToastMessage("Order Saved (No new items to print KOT)");
         setOriginalCart([...cart]); // Update original cart to current so future adds work
         startNewOrder();
         return;
      }

      // Determine the printers involved and group items
      // Map: printerName -> Map<categoryId, CartItem[]>
      const defaultPrinter = printerSettings?.default_printer;
      const printJobs = new Map<string, Map<number, CartItem[]>>();

      itemsToPrint.forEach(item => {
          let pName = defaultPrinter;
          if (printerSettings?.printer_mode === "Multiple Printers") {
               pName = categoryPrinters[item.category_id] || defaultPrinter;
          }
          
          if (!pName) return; // No printer available for this item
          
          if (!printJobs.has(pName)) {
              printJobs.set(pName, new Map());
          }
          const printerCategories = printJobs.get(pName)!;
          if (!printerCategories.has(item.category_id)) {
              printerCategories.set(item.category_id, []);
          }
          printerCategories.get(item.category_id)!.push(item);
      });

      if (printJobs.size === 0) {
          setToastMessage("Order Saved (No printers configured for items)");
          setOriginalCart([...cart]);
          startNewOrder();
          return;
      }

      const lineWidth = getLineWidth(printerSettings?.paper_size);
      const showLineSeps = billSettings?.show_line_separators !== false;
      const sep = showLineSeps ? "-".repeat(lineWidth) : "\n";
      
      const currentTokenNumberToPrint = assignedTokenNumber || printerSettings?.token_current_number || 100;
      const billNoToPrint = assignedBillNumber || `${printerSettings?.bill_prefix || ""}${printerSettings?.bill_current_number || 1}`;

      const generateTicketText = (ticketItems: CartItem[], categoryName?: string) => {
         let text = ``;
         if (kotSettings?.show_token !== false) {
             if (printerSettings?.token_print_size === "Extra Large") {
                 text += "\x1D\x21\x22";
             } else if (printerSettings?.token_print_size === "Large") {
                 text += "\x1D\x21\x11";
             } else {
                 text += "\x1D\x21\x01";
             }
             text += "\x1B\x61\x01";
             text += `TOKEN: ${currentTokenNumberToPrint}\n`;
             text += "\x1D\x21\x00";
             if (kotSettings?.sep_token !== false) text += `${sep}\n`;
         }
         
         text += `${centerText("--- KOT ---", lineWidth)}\n`;
         if (categoryName) {
             text += `${centerText(`[ ${categoryName} ]`, lineWidth)}\n`;
         }
         if (kotSettings?.sep_header !== false) text += `${sep}\n`;

         text += `Bill No: ${billNoToPrint}\n`;
         text += `Order Type: ${orderType}\n`;
         if (tableNumber) text += `Table: ${tableNumber}\n`;
         text += `Date: ${new Date().toLocaleString()}\n`;
         
         if (kotSettings?.sep_meta !== false) text += `${sep}\n`;
         
         text += `${padRight("Item", lineWidth - 5)} ${padLeft("Qty", 4)}\n`;
         if (kotSettings?.sep_table_header !== false) text += `${sep}\n`;
         
         ticketItems.forEach(item => {
           const nameStr = padRight(item.name, lineWidth - 5);
           const qtyStr = padLeft(item.quantity?.toString(), 4);
           text += `${nameStr} ${qtyStr}\n`;
         });
         
         if (kotSettings?.sep_table_body !== false) text += `${sep}\n`;
         text += `\n\n\n`;
         text += "\x1B\x61\x00"; 
         return text;
      };

      let hasError = false;

      // Loop through each printer's jobs
      for (const [pName, categoriesMap] of printJobs.entries()) {
          const isCategoryWise = printerSettings?.kot_printing_style === "Category-wise KOTs";
          
          if (isCategoryWise) {
              // Print one ticket per category to this printer
              for (const [catId, catItems] of categoriesMap.entries()) {
                  const catName = categories.find(c => c.id === catId)?.name || "Items";
                  const text = generateTicketText(catItems, catName);
                  try {
                      const rawData = buildPrintData(text, Boolean(printerSettings?.print_bold));
                      await invokeWithTimeout("print_receipt_raw", { printerName: pName, data: rawData });
                  } catch (e) {
                      console.error("Print KOT failed, trying text fallback:", e);
                      const fallbackText = text.replace(/[\x1B\x1D][^a-zA-Z0-9]*[a-zA-Z0-9]/g, "");
                      try {
                          await invokeWithTimeout("print_receipt_text", { printerName: pName, text: fallbackText });
                      } catch (e2) {
                          hasError = true;
                      }
                  }
              }
          } else {
              // Combine all categories into one ticket for this printer
              const allPrinterItems = Array.from(categoriesMap.values()).flat();
              const text = generateTicketText(allPrinterItems);
              try {
                  const rawData = buildPrintData(text, Boolean(printerSettings?.print_bold));
                  await invokeWithTimeout("print_receipt_raw", { printerName: pName, data: rawData });
              } catch (e) {
                  console.error("Print KOT failed, trying text fallback:", e);
                  try {
                      await invokeWithTimeout("print_receipt_text", { printerName: pName, text });
                  } catch (e2) {
                      hasError = true;
                  }
              }
          }
      }

      if (hasError) {
          setToastMessage("Order Saved (Some KOTs failed to print)");
      } else {
          setToastMessage("KOT(s) Printed & Order Saved!");
      }
      
      setOriginalCart([...cart]);
      startNewOrder();
    } catch (error) {
      console.error("Unexpected error in executePrintKOT:", error);
      setToastMessage("An error occurred. Check console for details.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePrintKOT = (overrideTableNumber?: string | React.MouseEvent | React.KeyboardEvent) => {
    const finalTableNum = typeof overrideTableNumber === 'string' ? overrideTableNumber : tableNumber;
    
    if (cart.length === 0) {
      setToastMessage("Cart is empty!");
      return;
    }

    if (orderType === "Table" && !finalTableNum) {
        setIsTablePopupOpen(true);
        return;
    }

    if (orderType === "Table" && finalTableNum && typeof finalTableNum === 'string') {
        setTableNumber(finalTableNum);
    }

    if (printerSettings?.kot_print_confirmation) {
      setIsKotConfirmPopupOpen(true);
    } else {
      executePrintKOT(finalTableNum);
    }
  };

  const loadProcessingOrder = (order: ProcessingOrder) => {
    try {
      const parsedCart = JSON.parse(order.cart_data) as CartItem[];
      setCart(parsedCart);
      setOriginalCart(JSON.parse(order.cart_data) as CartItem[]);
      setCustomerName(order.customer_name || "");
      setCustomerPhone(order.customer_phone || "");
      
      if (order.payment_mode === "Credit") {
        setBillingType("Credit");
        setPaymentMode("Cash");
        setSelectedCustomerId((order as any).customer_id || null);
      } else {
        setBillingType("Cash");
        setPaymentMode(order.payment_mode || "Cash");
        setSelectedCustomerId(null);
      }

      setOrderType((order.order_type as "Table" | "Parcel" | "Self Service") || "Self Service");
      setTableNumber(order.table_number || "");
      setActiveOrderId(order.id);
      setActiveTokenNumber(order.token_number || null);
      setActiveBillNumber(order.bill_number || null);
      setIsKOTPrinted(true);
      setTimeout(() => searchInputRef.current?.focus(), 0);
    } catch (e) {
      console.error("Failed to parse cart data", e);
    }
  };

  const startNewOrder = () => {
    setCart([]);
    setOriginalCart([]);
    setCustomerName("");
    setCustomerPhone("");
    setPaymentMode("Cash");
    setTableNumber("");
    setActiveOrderId(null);
    setActiveTokenNumber(null);
    setActiveBillNumber(null);
    setIsKOTPrinted(false);
    setBillingType("Cash");
    setSelectedCustomerId(null);
    setTimeout(() => searchInputRef.current?.focus(), 0);
  };

  const handleAddCustomer = async () => {
    if (!newCustomerName || !db) return;
    if (newCustomerPhone && newCustomerPhone.length !== 10) {
      setToastMessage("Phone number must be exactly 10 digits.");
      return;
    }
    try {
      const result = await db.execute(
        `INSERT INTO customers (name, phone) VALUES ($1, $2)`,
        [newCustomerName, newCustomerPhone]
      );
      await fetchCreditCustomers();
      setIsAddCustomerPopupOpen(false);
      setNewCustomerName("");
      setNewCustomerPhone("");
      setSelectedCustomerId(result.lastInsertId || null);
      setToastMessage("Customer added successfully!");
    } catch (error) {
      console.error("Failed to add customer:", error);
      setToastMessage("Failed to add customer.");
    }
  };

  const cycleOrderType = (direction: "left" | "right") => {
    const types: ("Table" | "Parcel" | "Self Service")[] = ["Self Service", "Table", "Parcel"];
    const currentIndex = types.indexOf(orderType);
    let nextIndex = currentIndex;
    if (direction === "left") {
      nextIndex = (currentIndex - 1 + types.length) % types.length;
    } else {
      nextIndex = (currentIndex + 1) % types.length;
    }
    setOrderType(types[nextIndex]);
  };

  useEffect(() => {
    const handleGlobalKeyDown = (e: globalThis.KeyboardEvent) => {
      if (isQtyPopupOpen || isTablePopupOpen || isAlphabetPopupOpen || isAddCustomerPopupOpen || isKotConfirmPopupOpen || isBillConfirmPopupOpen) return;

      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';

      if (e.key === "Escape") {
        // If it's the search input, let its own handler handle it (so it can close suggestions first)
        if (target.id === 'search-input' || target.classList.contains('billing-search-input')) {
            return;
        }
        e.preventDefault();
        startNewOrder();
        return;
      }

      if (isInput) return;

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        cycleOrderType("left");
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        cycleOrderType("right");
      }

      if (processingOrders.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          const currentIndex = processingOrders.findIndex(o => o.id === activeOrderId);
          const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % processingOrders.length;
          loadProcessingOrder(processingOrders[nextIndex]);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          const currentIndex = processingOrders.findIndex(o => o.id === activeOrderId);
          const prevIndex = currentIndex === -1 ? processingOrders.length - 1 : (currentIndex - 1 + processingOrders.length) % processingOrders.length;
          loadProcessingOrder(processingOrders[prevIndex]);
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [processingOrders, activeOrderId, isQtyPopupOpen, isTablePopupOpen, isAlphabetPopupOpen, isKotConfirmPopupOpen, isBillConfirmPopupOpen, orderType, isAddCustomerPopupOpen]);

  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Don't steal focus if clicking on input, textarea, or select
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
        return;
      }
      
      // Don't steal focus if a popup is open
      if (isQtyPopupOpen || isTablePopupOpen || isAlphabetPopupOpen) return;

      // Don't steal focus if text is selected
      if (window.getSelection()?.toString().length) {
        return;
      }
      
      searchInputRef.current?.focus();
    };

    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, [isQtyPopupOpen, isTablePopupOpen, isAlphabetPopupOpen]);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      if (suggestions.length > 0) {
        setSuggestions([]);
        setSelectedSuggestionIndex(-1);
      } else {
        startNewOrder();
      }
      return;
    }

    if (e.key === "ArrowLeft") {
      e.preventDefault();
      cycleOrderType("left");
      return;
    }
    if (e.key === "ArrowRight") {
      e.preventDefault();
      cycleOrderType("right");
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      const trimmedSearch = searchTerm.trim();

      if (trimmedSearch) {
        const matchingTableOrder = processingOrders.find(
          o => o.order_type === 'Table' && String(o.table_number).toLowerCase() === trimmedSearch.toLowerCase()
        );
        if (matchingTableOrder) {
          loadProcessingOrder(matchingTableOrder);
          setSearchTerm("");
          setSuggestions([]);
          return;
        }
      }

      if (suggestions.length > 0 && selectedSuggestionIndex >= 0) {
        openQtyPopup(suggestions[selectedSuggestionIndex]);
      } else if (trimmedSearch === "") {
        if (cart.length > 0) {
          if (printerSettings?.disable_kot) {
            handleCheckout();
          } else if (!isKOTPrinted) {
            handlePrintKOT();
          } else {
            handleCheckout();
          }
        } else if (processingOrders.length > 0) {
          if (activeOrderId === null) {
            loadProcessingOrder(processingOrders[0]);
          }
        }
      }
      return;
    }

    if (suggestions.length === 0) {
      if (searchTerm.trim() === "" && processingOrders.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          const currentIndex = processingOrders.findIndex(o => o.id === activeOrderId);
          const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % processingOrders.length;
          loadProcessingOrder(processingOrders[nextIndex]);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          const currentIndex = processingOrders.findIndex(o => o.id === activeOrderId);
          const prevIndex = currentIndex === -1 ? processingOrders.length - 1 : (currentIndex - 1 + processingOrders.length) % processingOrders.length;
          loadProcessingOrder(processingOrders[prevIndex]);
        }
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedSuggestionIndex(prev => (prev + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedSuggestionIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
    }
  };

  const handlePopupKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddToCartFromPopup();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeQtyPopup();
    }
  };

  const handleCheckout = () => {
    if (cart.length === 0) {
      setToastMessage("Cart is empty!");
      return;
    }
    if (printerSettings?.bill_print_confirmation) {
      setIsBillConfirmPopupOpen(true);
    } else {
      executeCheckout();
    }
  };

  const executeCheckout = async (skipPrint: boolean = false) => {
    if (cart.length === 0) {
      setToastMessage("Cart is empty!");
      return;
    }

    if (isProcessing) return;
    setIsProcessing(true);
    
    try {
      let finalCustomerId = null;
      let finalBillNo = "";
      let finalTokenNumber = activeTokenNumber;

      let cName = customerName;
      let cPhone = customerPhone;
      let pMode = paymentMode;

      if (billingType === "Credit" && selectedCustomerId) {
        const c = creditCustomers.find(c => c.id === selectedCustomerId);
        if (c) {
          cName = c.name;
          cPhone = c.phone;
          pMode = "Credit";
        }
        finalCustomerId = selectedCustomerId;
      }

      if (db && activeOrderId) {
        try {
          // Find the order before deleting
          const orderData = await db.select<any[]>("SELECT * FROM processing_orders WHERE id = $1", [activeOrderId]);
          if (orderData.length > 0) {
              const order = orderData[0];
              finalBillNo = order.bill_number;
              
              if (!finalTokenNumber && order.token_number) {
                  finalTokenNumber = order.token_number;
              }

              const cartDataStr = JSON.stringify(cart);

              // Note: bill_current_number was already incremented when the processing_order (KOT) was created.
              await db.execute(
                `INSERT INTO finalized_orders (cart_data, customer_name, customer_phone, payment_mode, subtotal, gst, total, order_type, table_number, customer_id, bill_number, token_number, created_at) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
                [cartDataStr, cName, cPhone, pMode, subtotal, gst, total, orderType, tableNumber, finalCustomerId, finalBillNo, finalTokenNumber, order.created_at]
              );

              if (pMode === "Credit" && finalCustomerId) {
                 await db.execute("UPDATE customers SET credit_balance = credit_balance + $1 WHERE id = $2", [total, finalCustomerId]);
              }
          }
          await db.execute("DELETE FROM processing_orders WHERE id = $1", [activeOrderId]);
          await fetchProcessingOrders();
        } catch (err) {
          console.error("Failed to clear processing order:", err);
        }
      } else if (db && !activeOrderId && cart.length > 0) {
         // Direct checkout without KOT
         try {
             const currentBillNumber = printerSettings?.bill_current_number || 1;
             finalBillNo = `${printerSettings?.bill_prefix || ""}${currentBillNumber}`;

             if (!finalTokenNumber) {
                 finalTokenNumber = printerSettings?.token_current_number || 100;
                 await db.execute("UPDATE printer_settings SET token_current_number = token_current_number + 1 WHERE id = 1");
                 setPrinterSettings((prev: any) => prev ? {...prev, token_current_number: finalTokenNumber! + 1} : prev);
             }
             
             const cartDataStr = JSON.stringify(cart);

             if (pMode === "Credit" && finalCustomerId) {
               await db.execute("UPDATE customers SET credit_balance = credit_balance + $1 WHERE id = $2", [total, finalCustomerId]);
             }

             await db.execute(
                `INSERT INTO finalized_orders (cart_data, customer_name, customer_phone, payment_mode, subtotal, gst, total, order_type, table_number, customer_id, bill_number, token_number) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
                [cartDataStr, cName, cPhone, pMode, subtotal, gst, total, orderType, tableNumber, finalCustomerId, finalBillNo, finalTokenNumber]
             );
             
             await db.execute("UPDATE printer_settings SET bill_current_number = bill_current_number + 1 WHERE id = 1");
             setPrinterSettings((prev: any) => prev ? {...prev, bill_current_number: currentBillNumber + 1} : prev);
         } catch (err) {
             console.error("Failed to insert finalized order:", err);
         }
      }

      if (skipPrint) {
          setToastMessage(`Checkout successful! Total: Rs. ${total.toFixed(2)}`);
          startNewOrder();
          return;
      }

      // Print Bill
      const printerName = printerSettings?.default_printer;
      if (printerName) {
          const lineWidth = getLineWidth(printerSettings?.paper_size);
          const showLineSeps = billSettings?.show_line_separators !== false;
          const sep = showLineSeps ? "-".repeat(lineWidth) : "\n";
          
          let text = ``;
          let imageBytes: number[] = [];
          
          if (billSettings?.logo_base64 && billSettings.logo_position !== 'none') {
              try {
                  imageBytes = await generateESCPOSImage(billSettings.logo_base64, billSettings.logo_size || 50, printerSettings?.paper_size || "3inch");
              } catch (e) {
                  console.error("Failed to generate image bytes", e);
              }
          }
          
          // --- HEADER SECTION ---
          // Header Font Size mapping
          const headerSize = billSettings?.header_font_size || "16px";
          if (headerSize === "24px" || headerSize === "28px" || headerSize === "20px") {
              // Double width + Double height
              text += "\x1D\x21\x11";
          } else if (headerSize === "18px" || headerSize === "16px") {
              // Double height
              text += "\x1D\x21\x01";
          }
          
          // Center alignment for header
          text += "\x1B\x61\x01";
          
          if (storeSettings?.hotel_name) text += `${String(storeSettings.hotel_name).toUpperCase()}\n`;
          
          // Reset to normal size for the rest of the header (address, etc.) if it was large, or just keep it.
          // Usually Address and Tel are smaller than the main Hotel Name.
          text += "\x1D\x21\x00"; 
          
          if (billSettings?.show_address !== false && storeSettings?.address) text += `${storeSettings.address}\n`;
          if (billSettings?.show_phone !== false && storeSettings?.phone_number) text += `Tel: ${storeSettings.phone_number}\n`;
          if (billSettings?.show_gst !== false && storeSettings?.gst_number) text += `GSTIN: ${storeSettings.gst_number}\n`;
          if (billSettings?.show_fssai !== false && storeSettings?.fssai_number) text += `FSSAI: ${storeSettings.fssai_number}\n`;
          text += `\n`;
          
          // --- BODY SECTION ---
          // Left align for body
          text += "\x1B\x61\x00";
          if (billSettings?.sep_header !== false) text += `${sep}\n`;
          
          const now = new Date();
          const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-');
          const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
          
          text += `${padRight(`Bill No: ${finalBillNo}`, Math.floor(lineWidth/2))}${padLeft(`Date: ${dateStr}`, Math.ceil(lineWidth/2))}\n`;
          
          let timeCashierLine = padRight(`Time: ${timeStr}`, Math.floor(lineWidth/2));
          if (billSettings?.show_cashier_name !== false) {
             timeCashierLine += padLeft(`Cashier: Admin`, Math.ceil(lineWidth/2));
          }
          text += timeCashierLine + "\n";

          if (orderType === "Table" && tableNumber) {
             text += `${padRight(`Order: Table ${tableNumber}`, lineWidth)}\n`;
          } else if (orderType !== "Self Service") {
             text += `${padRight(`Order: ${orderType}`, lineWidth)}\n`;
          }
          
          if (billSettings?.sep_meta !== false) text += `${sep}\n`;

          // Print Token Number in Bill if needed
          if (billSettings?.show_token !== false) {
              if (printerSettings?.token_print_size === "Extra Large") {
                  text += "\x1D\x21\x22"; 
              } else if (printerSettings?.token_print_size === "Large") {
                  text += "\x1D\x21\x11"; 
              } else {
                  text += "\x1D\x21\x01"; 
              }
              text += "\x1B\x61\x01"; 
              text += `TOKEN: ${finalTokenNumber}\n`;
              text += "\x1D\x21\x00"; 
              text += "\x1B\x61\x00"; 
              if (billSettings?.sep_token !== false) text += `${sep}\n`;
          }
          
          // Columns: Item (flex), Qty (4), Price (8), Amt (8)
          const itemWidth = lineWidth - 4 - 8 - 8 - 3; // -3 for spaces
          text += `${padRight("Item", itemWidth)} ${padLeft("Qty", 4)} ${padLeft("Price", 8)} ${padLeft("Amt", 8)}\n`;
          if (billSettings?.sep_table_header !== false) text += `${sep}\n`;
          
          cart.forEach(item => {
              let nameStr = String(item.name || "");
              if (nameStr.length > itemWidth) {
                  // If name is too long, print it on one line, and details on next
                  text += `${nameStr}\n`;
                  text += `${padRight("", itemWidth)} ${padLeft(item.quantity?.toString() || "1", 4)} ${padLeft(item.price?.toFixed(2) || "0.00", 8)} ${padLeft(((item.quantity || 1) * (item.price || 0)).toFixed(2), 8)}\n`;
              } else {
                  nameStr = padRight(nameStr, itemWidth);
                  const qtyStr = padLeft(item.quantity?.toString() || "1", 4);
                  const priceStr = padLeft(item.price?.toFixed(2) || "0.00", 8);
                  const amtStr = padLeft(((item.quantity || 1) * (item.price || 0)).toFixed(2), 8);
                  text += `${nameStr} ${qtyStr} ${priceStr} ${amtStr}\n`;
              }
          });
          if (billSettings?.sep_table_body !== false) text += `${sep}\n`;
          
          text += `${padRight("Subtotal:", lineWidth - 12)}${padLeft(subtotal.toFixed(2), 12)}\n`;
          if (isGstEnabled) {
               if (gstType === "Inclusive") {
                   text += `(Includes Rs. ${gst.toFixed(2)} GST)\n`;
               } else {
                   text += `${padRight(`GST (${gstPercentage}%):`, lineWidth - 12)}${padLeft(gst.toFixed(2), 12)}\n`;
               }
          }
          if (billSettings?.sep_subtotals !== false) text += `${sep}\n`;
          
          // Grand Total bold
          text += "\x1B\x45\x01"; // Bold ON
          text += `${padRight("GRAND TOTAL:", lineWidth - 14)}${padLeft(`Rs. ${total.toFixed(2)}`, 14)}\n`;
          text += "\x1B\x45\x00"; // Bold OFF
          
          if (billSettings?.sep_grand_total !== false) text += `${sep}\n`;
          text += `\n`;
          
          // --- FOOTER SECTION ---
          // Center align
          text += "\x1B\x61\x01";
          const footerMsg = billSettings?.footer_message || "Thank you! Visit again.";
          text += `${footerMsg}\n\n`; // Reduced newlines here to leave space for QR
          
          // Reset alignment
          text += "\x1B\x61\x00";

          try {
              let rawData = buildPrintData(text, Boolean(printerSettings?.print_bold), imageBytes, billSettings?.logo_position || 'none');

              // --- UPI QR CODE SECTION ---
              if (storeSettings?.upi_id && billSettings?.no_qr_print === false) {
                  let upiString = `upi://pay?pa=${storeSettings.upi_id}&pn=${encodeURIComponent(storeSettings.merchant_name || storeSettings.hotel_name || 'Restaurant')}&cu=INR`;
                  
                  if (storeSettings.payment_reference) {
                      upiString += `&tr=${encodeURIComponent(storeSettings.payment_reference)}`;
                  }
                  
                  if (billSettings?.dynamic_upi_qr) {
                      upiString += `&am=${total.toFixed(2)}`;
                  }

                  try {
                      // Generate QR Base64
                      const qrBase64 = await QRCode.toDataURL(upiString, { margin: 1, width: 250 });
                      
                      // Convert to ESC/POS Bytes
                      const qrBytes = await generateESCPOSImage(qrBase64, 40, printerSettings?.paper_size || "3inch");
                      
                      if (qrBytes.length > 0) {
                          // The cut command in buildPrintData is 4 bytes at the end: 0x1D, 0x56, 0x41, 0x10
                          const cutBytes = rawData.splice(-4, 4);
                          
                          // Center align text
                          rawData.push(0x1B, 0x61, 0x01); 
                          rawData.push(...Array.from(new TextEncoder().encode("Scan to Pay via UPI\n")));
                          
                          // Append QR
                          rawData = rawData.concat(qrBytes);
                          
                          // Add padding space
                          rawData.push(0x0A, 0x0A, 0x0A, 0x0A);
                          
                          // Append cut bytes back
                          rawData = rawData.concat(cutBytes);
                      }
                  } catch (qrErr) {
                      console.error("Failed to generate QR code:", qrErr);
                  }
              }

              await invokeWithTimeout("print_receipt_raw", { printerName, data: rawData });
              setToastMessage(`Checkout successful! Bill printed.`);
          } catch (e) {
              console.error("Print Bill failed, trying text fallback:", e);
              // Try fallback without raw ESC/POS commands so it doesn't print garbage
              const fallbackText = text.replace(/[\x1B\x1D][^a-zA-Z0-9]*[a-zA-Z0-9]/g, "");
              try {
                  await invokeWithTimeout("print_receipt_text", { printerName, text: fallbackText });
                  setToastMessage(`Checkout successful! Bill printed (Fallback).`);
              } catch(e2) {
                  setToastMessage(`Checkout successful! Total: Rs. ${total.toFixed(2)} (Print Failed)`);
              }
          }
      } else {
          setToastMessage(`Checkout successful! Total: Rs. ${total.toFixed(2)}`);
      }

      startNewOrder();
    } catch (error) {
      console.error("Unexpected error in handleCheckout:", error);
      setToastMessage("An error occurred during checkout. Check console.");
    } finally {
      setIsProcessing(false);
    }
  };

  const ALPHABETS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

  const handleTableConfirm = () => {
    const trimmedTable = tableNumber.trim();
    if (!trimmedTable) return;
    
    // Check if table is occupied by checking if any order starts with this number and is exactly the number or number+alphabet
    const isOccupied = processingOrders.some(
      o => o.order_type === 'Table' && o.table_number && o.table_number.match(new RegExp(`^${trimmedTable}[A-Z]?$`))
    );

    if (isOccupied && !activeOrderId) {
        setIsAlphabetPopupOpen(true);
        setIsTablePopupOpen(false);
        const firstAvailableIndex = ALPHABETS.findIndex(alpha => !processingOrders.some(
            o => o.order_type === 'Table' && String(o.table_number).toUpperCase() === `${trimmedTable}${alpha}`
        ));
        setSelectedAlphabetIndex(firstAvailableIndex !== -1 ? firstAvailableIndex : 0);
        return;
    }

    setIsTablePopupOpen(false);
    handlePrintKOT();
  };

  const handleAlphabetConfirm = (alphabet: string) => {
    const newTableNum = `${tableNumber.trim()}${alphabet}`;
    setTableNumber(newTableNum);
    setIsAlphabetPopupOpen(false);
    handlePrintKOT(newTableNum);
  };

  const handleTablePopupKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleTableConfirm();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsTablePopupOpen(false);
      searchInputRef.current?.focus();
    }
  };

  const handleAlphabetPopupKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const alpha = ALPHABETS[selectedAlphabetIndex];
      const isOccupied = processingOrders.some(
        o => o.order_type === 'Table' && String(o.table_number).toUpperCase() === `${tableNumber.trim()}${alpha}`
      );
      if (!isOccupied) {
        handleAlphabetConfirm(alpha);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsAlphabetPopupOpen(false);
      setIsTablePopupOpen(true); // Go back to table number input
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      setSelectedAlphabetIndex(prev => (prev + 1) % ALPHABETS.length);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setSelectedAlphabetIndex(prev => (prev - 1 + ALPHABETS.length) % ALPHABETS.length);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedAlphabetIndex(prev => (prev + 4) % ALPHABETS.length); // 4 columns
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedAlphabetIndex(prev => (prev - 4 + ALPHABETS.length) % ALPHABETS.length);
    }
  };

  const handleKotConfirmKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      setIsKotConfirmPopupOpen(false);
      executePrintKOT();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setIsKotConfirmPopupOpen(false);
      executePrintKOT(undefined, true);
    }
  };

  const handleBillConfirmKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      setIsBillConfirmPopupOpen(false);
      executeCheckout();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setIsBillConfirmPopupOpen(false);
      executeCheckout(true);
    }
  };

  useEffect(() => {
    if (isTablePopupOpen) {
      setTimeout(() => tableInputRef.current?.focus(), 0);
    }
  }, [isTablePopupOpen]);

  // Focus Kot confirm popup when it opens so it can catch key events
  const kotConfirmRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (isKotConfirmPopupOpen) {
      setTimeout(() => kotConfirmRef.current?.focus(), 0);
    }
  }, [isKotConfirmPopupOpen]);

  const billConfirmRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (isBillConfirmPopupOpen) {
      setTimeout(() => billConfirmRef.current?.focus(), 0);
    }
  }, [isBillConfirmPopupOpen]);

  const alphabetPopupRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (isAlphabetPopupOpen) {
      setTimeout(() => alphabetPopupRef.current?.focus(), 0);
    }
  }, [isAlphabetPopupOpen]);

  return (
    <div className="billing-page" style={{ position: 'relative' }}>
      <style>{`
        @keyframes text-blink-animation {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .text-blink {
          animation: text-blink-animation 1.5s ease-in-out infinite;
        }
      `}</style>
      {toastMessage && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          backgroundColor: 'var(--primary)',
          color: 'var(--primary-fg)',
          padding: '1rem',
          borderRadius: '0.5rem',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.5)',
          zIndex: 1000,
          fontWeight: 600
        }}>
          {toastMessage}
        </div>
      )}

      <div className="billing-main">
        {/* Search Header */}
        <div className="search-section">
          <div className="search-bar-container">
            <Search className="search-icon" size={20} />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search items (Type name...)"
              value={searchTerm}
              onChange={(e) => {
                const val = e.target.value;
                if (val.startsWith(' ') && val.trim() === '') return;
                setSearchTerm(val);
              }}
              onKeyDown={handleKeyDown}
              className="billing-search-input"
            />
            {searchTerm && (
              <button className="clear-search" onClick={() => setSearchTerm("")}>
                <X size={16} />
              </button>
            )}
            
            {suggestions.length > 0 && (
              <div className="suggestions-list" ref={suggestionListRef}>
                {suggestions.map((item, index) => (
                  <div
                    key={item.id}
                    className={`suggestion-item ${index === selectedSuggestionIndex ? "selected" : ""}`}
                    onClick={() => openQtyPopup(item)}
                    onMouseEnter={() => setSelectedSuggestionIndex(index)}
                  >
                    <span className="item-name">{item.name}</span>
                    <span className="item-price">₹{item.price.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Processing Orders Sidebar */}
      <div className="processing-orders-sidebar" style={{ width: '416px', minWidth: '416px', flexShrink: 0, borderLeft: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', padding: '1rem', gap: '1rem', background: 'var(--bg-light)' }}>
        <div className="processing-orders-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, fontSize: '1.1rem', color: 'var(--text-primary)' }}>
            <ListTodo size={20} /> Processing Orders
          </div>
          <button 
            onClick={startNewOrder}
            style={{ 
              display: 'flex', alignItems: 'center', gap: '0.4rem', 
              background: 'var(--primary)', color: 'var(--primary-fg)', 
              border: 'none', borderRadius: '2rem', 
              padding: '0.4rem 0.8rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700,
              transition: 'transform 0.1s ease-in-out, box-shadow 0.1s', boxShadow: '0 2px 5px rgba(0, 0, 0, 0.3)' 
            }}
            title="Press Esc to start a new order"
            onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
            onMouseDown={e => e.currentTarget.style.transform = 'translateY(1px)'}
            onMouseUp={e => e.currentTarget.style.transform = 'translateY(0)'}
          >
            <Plus size={16} /> New <span style={{ fontSize: '0.7rem', opacity: 0.8, fontWeight: 500 }}>(Esc)</span>
          </button>
        </div>
        
        <div className="order-type-selection" style={{ 
          display: 'flex', 
          gap: '0.4rem', 
          padding: '1rem 0',
          margin: '0',
          borderTop: '1px solid var(--border-color)',
          borderBottom: '1px solid var(--border-color)'
        }}>
          {["Self Service", "Table", "Parcel"].map(type => (
            <button
              key={type}
              onClick={() => setOrderType(type as any)}
              className={`modern-tab-btn ${orderType === type ? 'active' : ''}`}
            >
              {type}
            </button>
          ))}
        </div>

        <div className="processing-orders-list" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem', paddingRight: '0.25rem' }}>
          {processingOrders.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
              No active orders.
            </div>
          ) : (
            processingOrders.map(order => (
              <div 
                key={order.id} 
                className={`processing-order-card ${activeOrderId === order.id ? 'active' : ''}`}
                onClick={() => loadProcessingOrder(order)}
              >
                <div className="processing-order-title">
                  <span>{order.bill_number ? `Order ${order.bill_number}` : `Order #${order.id}`}</span>
                  {order.order_type === 'Table' && order.table_number ? (
                      <span style={{
                          background: 'var(--bg-light)',
                          color: 'var(--warning, #f59e0b)',
                          border: '1px solid var(--warning, #f59e0b)',
                          padding: '0.1rem 0.4rem',
                          borderRadius: '0.25rem',
                          fontSize: '0.85rem',
                          fontWeight: 700,
                          display: 'inline-block'
                      }}>
                          <span className="text-blink">{order.table_number.replace(/([A-Za-z]+)/g, '-$1')}</span>
                      </span>
                  ) : (
                      <span>₹{order.total.toFixed(2)}</span>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.2rem' }}>
                  <div className="processing-order-details">
                      {order.order_type}
                      {order.order_type === 'Table' && order.table_number && (
                          <span style={{ marginLeft: '0.5rem', fontWeight: 600 }}>
                              ₹{order.total.toFixed(2)}
                          </span>
                      )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {isQtyPopupOpen && selectedItemForQty && (
        <div className="popup-overlay">
          <div className="qty-popup" onKeyDown={handlePopupKeyDown}>
            <h3>{selectedItemForQty.name}</h3>
            <p>Price: ₹{selectedItemForQty.price.toFixed(2)}</p>
            <div className="qty-popup-controls">
              <label htmlFor="qty-input">Quantity:</label>
              <div className="qty-input-wrapper">
                <button onClick={() => setCurrentQty(q => Math.max(1, (typeof q === 'number' ? q : 1) - 1))} className="qty-btn"><Minus size={16} /></button>
                <input
                  ref={qtyInputRef}
                  id="qty-input"
                  type="number"
                  value={currentQty}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "") {
                      setCurrentQty("");
                    } else {
                      setCurrentQty(Math.max(1, parseInt(val) || 1));
                    }
                  }}
                  onBlur={() => {
                    if (currentQty === "" || currentQty < 1) setCurrentQty(1);
                  }}
                  onFocus={(e) => e.target.select()}
                  className="qty-popup-input"
                />
                <button onClick={() => setCurrentQty(q => (typeof q === 'number' ? q : 0) + 1)} className="qty-btn"><Plus size={16} /></button>
              </div>
            </div>
            <button className="btn-add-to-cart" onClick={handleAddToCartFromPopup}>
              Add to Cart
            </button>
            <button className="popup-close-btn" onClick={closeQtyPopup}>
              <X size={20} />
            </button>
          </div>
        </div>
      )}

      {isTablePopupOpen && (
        <div className="popup-overlay">
          <div className="qty-popup" onKeyDown={handleTablePopupKeyDown} tabIndex={0} style={{ outline: 'none' }}>
            <h3>Enter Table Number</h3>
            <div className="qty-popup-controls" style={{ marginTop: '1rem', marginBottom: '1rem' }}>
              <input
                ref={tableInputRef}
                type="text"
                value={tableNumber}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9]/g, '');
                  setTableNumber(val);
                }}
                placeholder="e.g. 5"
                className="qty-popup-input"
                style={{ width: '100%', padding: '0.5rem' }}
              />
            </div>
            <button className="btn-add-to-cart" onClick={handleTableConfirm}>
              Confirm & Save
            </button>
            <button className="popup-close-btn" onClick={() => setIsTablePopupOpen(false)}>
              <X size={20} />
            </button>
          </div>
        </div>
      )}

      {isAlphabetPopupOpen && (
        <div className="popup-overlay">
          <div 
            className="qty-popup" 
            onKeyDown={handleAlphabetPopupKeyDown} 
            tabIndex={0} 
            ref={alphabetPopupRef}
            style={{ outline: 'none', maxWidth: '350px' }}
          >
            <h3 style={{ marginBottom: '1rem' }}>Table Occupied</h3>
            <p style={{ marginBottom: '1rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              Select a sub-table identifier for table {tableNumber}
            </p>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(4, 1fr)', 
              gap: '0.5rem', 
              marginBottom: '1.5rem' 
            }}>
              {ALPHABETS.map((alpha, index) => {
                const isOccupied = processingOrders.some(
                  o => o.order_type === 'Table' && String(o.table_number).toUpperCase() === `${tableNumber.trim()}${alpha}`
                );
                return (
                  <div
                    key={alpha}
                    onClick={() => { if (!isOccupied) handleAlphabetConfirm(alpha); }}
                    onMouseEnter={() => { if (!isOccupied) setSelectedAlphabetIndex(index); }}
                    style={{
                      padding: '0.75rem',
                      textAlign: 'center',
                      border: '1px solid var(--border-color)',
                      borderRadius: '0.5rem',
                      cursor: isOccupied ? 'not-allowed' : 'pointer',
                      background: isOccupied ? 'rgba(0,0,0,0.05)' : (index === selectedAlphabetIndex ? 'var(--primary)' : 'var(--bg-white)'),
                      color: isOccupied ? 'var(--text-secondary)' : (index === selectedAlphabetIndex ? 'var(--primary-fg)' : 'var(--text-primary)'),
                      fontWeight: index === selectedAlphabetIndex && !isOccupied ? 'bold' : 'normal',
                      boxShadow: index === selectedAlphabetIndex && !isOccupied ? '0 0 0 2px var(--primary) inset' : 'none',
                      opacity: isOccupied ? 0.4 : 1
                    }}
                  >
                    {alpha}
                  </div>
                );
              })}
            </div>
            <button 
              className="btn-add-to-cart" 
              onClick={() => {
                const alpha = ALPHABETS[selectedAlphabetIndex];
                const isOccupied = processingOrders.some(
                  o => o.order_type === 'Table' && String(o.table_number).toUpperCase() === `${tableNumber.trim()}${alpha}`
                );
                if (!isOccupied) {
                   handleAlphabetConfirm(alpha);
                }
              }}
              style={{
                opacity: processingOrders.some(
                  o => o.order_type === 'Table' && String(o.table_number).toUpperCase() === `${tableNumber.trim()}${ALPHABETS[selectedAlphabetIndex]}`
                ) ? 0.5 : 1,
                cursor: processingOrders.some(
                  o => o.order_type === 'Table' && String(o.table_number).toUpperCase() === `${tableNumber.trim()}${ALPHABETS[selectedAlphabetIndex]}`
                ) ? 'not-allowed' : 'pointer'
              }}
            >
              Confirm {ALPHABETS[selectedAlphabetIndex]}
            </button>
            <button className="popup-close-btn" onClick={() => { setIsAlphabetPopupOpen(false); setIsTablePopupOpen(true); }}>
              <X size={20} />
            </button>
          </div>
        </div>
      )}


      {/* Sidebar Summary */}
      <div className="billing-sidebar">


        {/* Cart Table (Moved to Sidebar) */}
        <div className="cart-section" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div className="cart-table-container" style={{ flex: 1, overflowY: 'auto' }}>
            {cart.length > 0 ? (
              <table className="billing-table" style={{ fontSize: '0.95rem' }}>
                <thead>
                  <tr>
                    <th style={{ padding: '0.5rem' }}>Item</th>
                    <th className="text-right" style={{ padding: '0.5rem' }}>Price</th>
                    <th className="text-center" style={{ padding: '0.5rem' }}>Qty</th>
                    <th className="text-right" style={{ padding: '0.5rem' }}>Total</th>
                    <th className="text-center" style={{ padding: '0.5rem' }}>Act</th>
                  </tr>
                </thead>
                <tbody>
                  {cart.map((item) => (
                    <tr key={item.id}>
                      <td style={{ padding: '0.5rem' }}>
                        <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100px' }} title={item.name}>{item.name}</div>
                      </td>
                      <td className="text-right" style={{ padding: '0.5rem', color: 'var(--text-secondary)' }}>
                        ₹{item.price.toFixed(2)}
                      </td>
                      <td className="text-center" style={{ padding: '0.5rem' }}>
                        <input
                          type="number"
                          min="1"
                          value={item.quantity || ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === "") {
                              setCart(prevCart => prevCart.map(i => i.id === item.id ? { ...i, quantity: 0 } : i));
                            } else {
                              const newQty = parseInt(val);
                              if (!isNaN(newQty)) {
                                setCart(prevCart => prevCart.map(i => i.id === item.id ? { ...i, quantity: newQty } : i));
                                setIsKOTPrinted(false);
                              }
                            }
                          }}
                          onBlur={() => {
                             if (item.quantity === 0 || isNaN(item.quantity)) {
                                 setCart(prevCart => prevCart.map(i => i.id === item.id ? { ...i, quantity: 1 } : i));
                             }
                          }}
                          onFocus={(e) => e.target.select()}
                          className="qty-popup-input"
                          style={{
                             width: '40px',
                             padding: '0.2rem',
                             fontSize: '0.95rem',
                             textAlign: 'center',
                             border: '1px solid var(--border-color)',
                             borderRadius: '0.25rem'
                          }}
                        />
                      </td>
                      <td className="text-right" style={{ padding: '0.5rem', fontWeight: 600 }}>₹{(item.price * item.quantity).toFixed(2)}</td>
                      <td className="text-center" style={{ padding: '0.5rem' }}>
                        <button className="remove-btn" onClick={() => removeFromCart(item.id)} style={{ padding: '0.25rem' }}>
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty-cart" style={{ padding: '1rem', minHeight: '100px' }}>
                No items added yet.
              </div>
            )}
          </div>
        </div>

        <div className="payment-mode-section">
          <button 
            onClick={() => setIsPaymentModeOpen(!isPaymentModeOpen)}
            style={{ 
              width: '100%', 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              background: 'none', 
              border: 'none', 
              padding: 0, 
              cursor: 'pointer',
              color: 'inherit',
              marginBottom: isPaymentModeOpen ? '0.25rem' : '0'
            }}
          >
            <h4 style={{ margin: 0 }}>Payment Mode: {billingType === "Credit" ? "Credit" : paymentMode}</h4>
            {isPaymentModeOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </button>
          
          {isPaymentModeOpen && (
            <>
              <div className="payment-grid" style={{ marginBottom: '0.5rem' }}>
                <button 
                  className={`modern-tab-btn ${paymentMode === "Cash" && billingType !== "Credit" ? "active" : ""}`}
                  onClick={() => { setPaymentMode("Cash"); setBillingType("Cash"); }}
                >
                  <Banknote size={16} />
                  <span>Cash</span>
                </button>
                <button 
                  className={`modern-tab-btn ${paymentMode === "Card" && billingType !== "Credit" ? "active" : ""}`}
                  onClick={() => { setPaymentMode("Card"); setBillingType("Cash"); }}
                >
                  <CreditCard size={16} />
                  <span>Card</span>
                </button>
                <button 
                  className={`modern-tab-btn ${paymentMode === "UPI" && billingType !== "Credit" ? "active" : ""}`}
                  onClick={() => { setPaymentMode("UPI"); setBillingType("Cash"); }}
                >
                  <Smartphone size={16} />
                  <span>UPI</span>
                </button>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button
                  onClick={() => { setBillingType("Credit"); setPaymentMode("Cash"); }}
                  className={`modern-tab-btn ${billingType === "Credit" ? 'active' : ''}`}
                  style={{ flex: billingType === "Credit" ? '0 0 auto' : '1' }}
                >
                  Credit Billing
                </button>

                {billingType === "Credit" && (
                  <>
                    <select
                      value={selectedCustomerId || ""}
                      onChange={(e) => setSelectedCustomerId(Number(e.target.value))}
                      style={{
                        flex: 1,
                        padding: '0.5rem',
                        borderRadius: '0.5rem',
                        border: '1px solid var(--border-color)',
                        background: 'var(--bg-white)',
                        color: 'var(--text-primary)'
                      }}
                    >
                      <option value="" disabled>Select Customer</option>
                      {creditCustomers.map(c => (
                        <option key={c.id} value={c.id}>{c.name} {c.phone ? `(${c.phone})` : ''}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => setIsAddCustomerPopupOpen(true)}
                      style={{
                        padding: '0.5rem',
                        background: 'var(--primary)',
                        color: 'var(--primary-fg)',
                        border: 'none',
                        borderRadius: '0.5rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                      title="Add Customer"
                    >
                      <Plus size={20} />
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        <div className="bill-summary">
          <div className="summary-row">
            <span>Subtotal</span>
            <span>₹{subtotal.toFixed(2)}</span>
          </div>
          {isGstEnabled && (
            <div className="summary-row">
              <span>{gstType === 'Inclusive' ? `Included GST (${gstPercentage}%)` : `GST (${gstPercentage}%)`}</span>
              <span>₹{gst.toFixed(2)}</span>
            </div>
          )}
          <div className="summary-row total">
            <span>Total Amount</span>
            <span>₹{total.toFixed(2)}</span>
          </div>
        </div>

        <div className="action-buttons" style={{ display: 'flex', gap: '0.5rem' }}>
          {!printerSettings?.disable_kot && (
            <button className="btn-checkout" onClick={handlePrintKOT} disabled={isProcessing} style={{ flex: 1, opacity: isProcessing ? 0.6 : 1, cursor: isProcessing ? 'not-allowed' : 'pointer' }}>
              <Printer size={16} style={{ marginRight: '0.25rem' }} /> {isProcessing ? 'Processing...' : 'Print KOT'}
            </button>
          )}
          <button className="btn-checkout" onClick={handleCheckout} disabled={isProcessing} style={{ flex: 1, opacity: isProcessing ? 0.6 : 1, cursor: isProcessing ? 'not-allowed' : 'pointer' }}>
            <CheckCircle size={16} style={{ marginRight: '0.25rem' }} /> {isProcessing ? 'Processing...' : 'Complete Bill'}
          </button>
        </div>
      </div>
      {isAddCustomerPopupOpen && (
        <div className="popup-overlay">
          <div className="qty-popup">
            <h3>Add Customer</h3>
            <div className="qty-popup-controls" style={{ marginTop: '1rem', gap: '1rem' }}>
              <input
                type="text"
                value={newCustomerName}
                onChange={(e) => setNewCustomerName(e.target.value)}
                placeholder="Name"
                className="qty-popup-input"
                style={{ width: '100%', padding: '0.5rem', textAlign: 'left', fontSize: '1rem', fontWeight: 'normal' }}
              />
              <input
                type="text"
                value={newCustomerPhone}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                  setNewCustomerPhone(val);
                }}
                placeholder="Phone Number (10 digits)"
                className="qty-popup-input"
                style={{ width: '100%', padding: '0.5rem', textAlign: 'left', fontSize: '1rem', fontWeight: 'normal' }}
              />
            </div>
            <button className="btn-add-to-cart" onClick={handleAddCustomer}>
              Add Customer
            </button>
            <button className="popup-close-btn" onClick={() => setIsAddCustomerPopupOpen(false)}>
              <X size={20} />
            </button>
          </div>
        </div>
      )}
      {isKotConfirmPopupOpen && (
        <div className="popup-overlay">
          <div 
            className="qty-popup" 
            onKeyDown={handleKotConfirmKeyDown} 
            tabIndex={0} 
            ref={kotConfirmRef}
            style={{ outline: 'none', minWidth: '300px' }}
          >
            <h3 style={{ marginBottom: '1rem', color: 'var(--text-primary)', textAlign: 'center' }}>Print KOT?</h3>
            <p style={{ textAlign: 'center', marginBottom: '1.5rem', color: 'var(--text-secondary)' }}>Are you sure you want to print the KOT?</p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
              <button 
                className="btn-checkout" 
                onClick={() => { setIsKotConfirmPopupOpen(false); executePrintKOT(); }}
                style={{ flex: 1, padding: '0.75rem', fontSize: '1rem' }}
              >
                Yes (Enter)
              </button>
              <button 
                className="btn-print" 
                onClick={(e) => { e.stopPropagation(); setIsKotConfirmPopupOpen(false); executePrintKOT(undefined, true); }}
                style={{ flex: 1, padding: '0.75rem', fontSize: '1rem', background: 'var(--bg-light)', color: 'var(--text-primary)' }}
              >
                No (Esc)
              </button>
            </div>
            <button className="popup-close-btn" onClick={() => setIsKotConfirmPopupOpen(false)}>
              <X size={20} />
            </button>
          </div>
        </div>
      )}
      {isBillConfirmPopupOpen && (
        <div className="popup-overlay">
          <div 
            className="qty-popup" 
            onKeyDown={handleBillConfirmKeyDown} 
            tabIndex={0} 
            ref={billConfirmRef}
            style={{ outline: 'none', minWidth: '300px' }}
          >
            <h3 style={{ marginBottom: '1rem', color: 'var(--text-primary)', textAlign: 'center' }}>Print Bill?</h3>
            <p style={{ textAlign: 'center', marginBottom: '1.5rem', color: 'var(--text-secondary)' }}>Are you sure you want to print the final Bill?</p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
              <button 
                className="btn-checkout" 
                onClick={() => { setIsBillConfirmPopupOpen(false); executeCheckout(); }}
                style={{ flex: 1, padding: '0.75rem', fontSize: '1rem' }}
              >
                Yes (Enter)
              </button>
              <button 
                className="btn-print" 
                onClick={(e) => { e.stopPropagation(); setIsBillConfirmPopupOpen(false); executeCheckout(true); }}
                style={{ flex: 1, padding: '0.75rem', fontSize: '1rem', background: 'var(--bg-light)', color: 'var(--text-primary)' }}
              >
                No (Esc)
              </button>
            </div>
            <button className="popup-close-btn" onClick={() => setIsBillConfirmPopupOpen(false)}>
              <X size={20} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
