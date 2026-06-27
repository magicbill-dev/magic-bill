import { useState, useEffect, useMemo } from "react";
import Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";
import QRCode from "qrcode";
import { Download, Printer, Calendar as CalendarIcon, TrendingUp, Package, Users, Receipt, Eye, Edit2, Trash2, X, PlusCircle, BarChart3, ShoppingBag, Wallet, Award, CheckCircle2 } from "lucide-react";

interface ReportsProps {
  db: Database | null;
  onRequireAuth?: () => void;
}

interface FinalizedOrder {
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
  customer_id: number | null;
}

interface CustomerPayment {
    id: number;
    customer_id: number;
    amount: number;
    payment_mode: string;
    date: string;
}

interface Transaction {
    type: 'bill' | 'payment';
    id: number;
    date: string;
    amount: number;
    mode: string;
    details?: string;
}

interface Expense {
  id: number;
  description: string;
  amount: number;
  category: string;
  date: string;
}

interface Category {
  id: number;
  name: string;
}

interface Customer {
  id: number;
  name: string;
  phone: string;
  credit_balance: number;
  created_at: string;
}

export default function Reports({ db }: ReportsProps) {
  const [activeMainTab, setActiveMainTab] = useState("Sales Overview");
  const [activeReport, setActiveReport] = useState("Sales Summary"); // For Sales Overview
  const [dateRange, setDateRange] = useState({ start: "", end: "" });
  const [orders, setOrders] = useState<FinalizedOrder[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Record<number, string>>({});
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isPlanExpired, setIsPlanExpired] = useState(false);
  const [isCheckingPlan, setIsCheckingPlan] = useState(true);
  
  const [itemSalesFilter, setItemSalesFilter] = useState({
    item: "All Items",
    category: "All Categories",
    search: ""
  });

  // Credit Customer Detail States
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerTransactions, setCustomerTransactions] = useState<Transaction[]>([]);
  const [customerDateRange, setCustomerDateRange] = useState({ start: "", end: "" });
  const [partialPaymentAmount, setPartialPaymentAmount] = useState<string>("");
  const [partialPaymentMode, setPartialPaymentMode] = useState<string>("Cash");
  const [editingCustomer, setEditingCustomer] = useState<{id: number, name: string} | null>(null);

  // Edit Payment Mode State
  const [editingPaymentModeId, setEditingPaymentModeId] = useState<number | null>(null);
  const [newPaymentMode, setNewPaymentMode] = useState<string>("Cash");

  const [loading, setLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [billSettings, setBillSettings] = useState<any>(null);
  const [printerSettings, setPrinterSettings] = useState<any>(null);
  const [storeSettings, setStoreSettings] = useState<any>(null);

  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split("T")[0];
    
    setDateRange({ start: today, end: today });
    setCustomerDateRange({ start: thirtyDaysAgoStr, end: today });
  }, []);

  useEffect(() => {
    async function fetchSettings() {
      if (!db) return;
      setIsCheckingPlan(true);
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

        setIsPlanExpired(isExpired);
        setIsCheckingPlan(false);

        if (isExpired) {
           setLoading(false);
           return;
        }

        const sRes = await db.select<any[]>("SELECT * FROM bill_settings WHERE id = 1");
        if (sRes.length > 0) setBillSettings(sRes[0]);
        const pRes = await db.select<any[]>("SELECT * FROM printer_settings WHERE id = 1");
        if (pRes.length > 0) setPrinterSettings(pRes[0]);
        const stRes = await db.select<any[]>("SELECT * FROM store_settings WHERE id = 1");
        if (stRes.length > 0) setStoreSettings(stRes[0]);
      } catch (err) {
        console.error("Failed to load settings:", err);
      } finally {
        setIsCheckingPlan(false);
      }
    }
    fetchSettings();
  }, [db]);

  useEffect(() => {
    if (db && dateRange.start && dateRange.end) {
      fetchData();
    }
  }, [db, dateRange, activeMainTab, activeReport]);

  useEffect(() => {
    if (db && selectedCustomer && customerDateRange.start && customerDateRange.end) {
        fetchCustomerTransactions(selectedCustomer.id);
    }
  }, [db, selectedCustomer, customerDateRange]);

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  const fetchData = async () => {
    if (!db) return;
    try {
      setLoading(true);
      const startDate = `${dateRange.start} 00:00:00`;
      const endDate = `${dateRange.end} 23:59:59`;

      if (activeMainTab === "Sales Overview") {
        const cats = await db.select<Category[]>("SELECT * FROM categories");
        const catMap: Record<number, string> = {};
        cats.forEach(c => catMap[c.id] = c.name);
        setCategories(catMap);

        const fetchedOrders = await db.select<FinalizedOrder[]>(
          "SELECT * FROM finalized_orders WHERE datetime(created_at, 'localtime') >= $1 AND datetime(created_at, 'localtime') <= $2 ORDER BY created_at DESC",
          [startDate, endDate]
        );
        setOrders(fetchedOrders);

        const fetchedExpenses = await db.select<Expense[]>(
          "SELECT * FROM expenses WHERE datetime(date, 'localtime') >= $1 AND datetime(date, 'localtime') <= $2 ORDER BY date DESC",
          [startDate, endDate]
        );
        setExpenses(fetchedExpenses);
      } else if (activeMainTab === "Credit Customers") {
        const fetchedCustomers = await db.select<Customer[]>(
          "SELECT * FROM customers ORDER BY name ASC"
        );
        setCustomers(fetchedCustomers);
      }
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomerTransactions = async (customerId: number) => {
    if (!db) return;
    try {
        const startDate = `${customerDateRange.start} 00:00:00`;
        const endDate = `${customerDateRange.end} 23:59:59`;
        
        // Fetch Bills
        const bills = await db.select<FinalizedOrder[]>(
            "SELECT * FROM finalized_orders WHERE customer_id = $1 AND datetime(created_at, 'localtime') >= $2 AND datetime(created_at, 'localtime') <= $3",
            [customerId, startDate, endDate]
        );
        
        // Fetch Payments
        let payments: CustomerPayment[] = [];
        try {
            payments = await db.select<CustomerPayment[]>(
                "SELECT * FROM customer_payments WHERE customer_id = $1 AND datetime(date, 'localtime') >= $2 AND datetime(date, 'localtime') <= $3",
                [customerId, startDate, endDate]
            );
        } catch (e) {
            console.warn("Failed to fetch customer payments. Table might not exist yet:", e);
        }

        // Merge and sort
        const transactions: Transaction[] = [
            ...bills.map(b => ({
                type: 'bill' as const,
                id: b.id,
                date: b.created_at,
                amount: b.total,
                mode: b.payment_mode,
                details: `Bill #${b.id}`
            })),
            ...payments.map(p => ({
                type: 'payment' as const,
                id: p.id,
                date: p.date,
                amount: p.amount,
                mode: p.payment_mode,
                details: 'Payment Recorded'
            }))
        ];

        transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setCustomerTransactions(transactions);
    } catch (e) {
        console.error("Failed to fetch customer transactions:", e);
    }
  };

  const handlePartialPayment = async () => {
      if (!db || !selectedCustomer || !partialPaymentAmount) return;
      const amount = parseFloat(partialPaymentAmount);
      if (isNaN(amount) || amount <= 0) {
          setToastMessage("Invalid payment amount.");
          return;
      }

      try {
          await db.execute("UPDATE customers SET credit_balance = credit_balance - $1 WHERE id = $2", [amount, selectedCustomer.id]);
          const dateStr = new Date().toISOString();
          await db.execute("INSERT INTO customer_payments (customer_id, amount, payment_mode, date) VALUES ($1, $2, $3, $4)",
              [selectedCustomer.id, amount, partialPaymentMode, dateStr]);
          
          setToastMessage("Payment recorded successfully.");
          setPartialPaymentAmount("");
          
          // Refresh customer info
          const res = await db.select<Customer[]>("SELECT * FROM customers WHERE id = $1", [selectedCustomer.id]);
          if (res.length > 0) setSelectedCustomer(res[0]);
          
          fetchData();
          fetchCustomerTransactions(selectedCustomer.id);
      } catch (e) {
          console.error("Failed to record payment:", e);
          setToastMessage("Failed to record payment.");
      }
  };

  const handleEditCustomerName = async () => {
      if (!db || !editingCustomer) return;
      try {
          await db.execute("UPDATE customers SET name = $1 WHERE id = $2", [editingCustomer.name, editingCustomer.id]);
          setToastMessage("Customer name updated.");
          setEditingCustomer(null);
          fetchData();
          if (selectedCustomer?.id === editingCustomer.id) {
              setSelectedCustomer(prev => prev ? {...prev, name: editingCustomer.name} : null);
          }
      } catch (e) {
          console.error("Failed to update name:", e);
          setToastMessage("Failed to update name.");
      }
  };

  const handleDeleteCustomer = async (customerId: number) => {
      if (!db) return;
      if (!confirm("Are you sure you want to delete this customer? This will also remove their association from all bills and payments.")) return;
      
      try {
          await db.execute("UPDATE finalized_orders SET customer_id = NULL WHERE customer_id = $1", [customerId]);
          await db.execute("DELETE FROM customer_payments WHERE customer_id = $1", [customerId]);
          await db.execute("DELETE FROM customers WHERE id = $1", [customerId]);
          setToastMessage("Customer deleted.");
          if (selectedCustomer?.id === customerId) setSelectedCustomer(null);
          fetchData();
      } catch (e) {
          console.error("Failed to delete customer:", e);
          setToastMessage("Failed to delete customer.");
      }
  };

  const settleCustomerDue = async (customerId: number) => {
      if(!db || !selectedCustomer) return;
      const amount = selectedCustomer.credit_balance;
      if (amount <= 0) return;

      try {
          await db.execute("UPDATE customers SET credit_balance = 0 WHERE id = $1", [customerId]);
          const dateStr = new Date().toISOString();
          await db.execute("INSERT INTO customer_payments (customer_id, amount, payment_mode, date) VALUES ($1, $2, $3, $4)", 
            [customerId, amount, "Full Settlement", dateStr]);
            
          setToastMessage("Customer due settled successfully.");
          fetchData();
          if (selectedCustomer?.id === customerId) {
              setSelectedCustomer(prev => prev ? {...prev, credit_balance: 0} : null);
              fetchCustomerTransactions(customerId);
          }
      } catch(e) {
          console.error("Failed to settle due:", e);
          setToastMessage("Failed to settle due.");
      }
  };

  // --- REPORT CALCULATIONS ---
  // Rich analytics computed once per orders/expenses change.
  const salesStats = useMemo(() => {
    let totalRevenue = 0;
    let grossSales = 0;
    let totalGst = 0;
    let totalItemsSold = 0;
    const paymentBreakdown = { Cash: { amount: 0, count: 0 }, Card: { amount: 0, count: 0 }, UPI: { amount: 0, count: 0 }, Credit: { amount: 0, count: 0 } } as Record<string, { amount: number; count: number }>;
    const typeBreakdown = { "Self Service": { amount: 0, count: 0 }, "Table": { amount: 0, count: 0 }, "Parcel": { amount: 0, count: 0 } } as Record<string, { amount: number; count: number }>;
    const itemAgg: Record<string, { qty: number; total: number }> = {};
    const dayAgg: Record<string, { orders: number; gross: number; gst: number; total: number }> = {};

    orders.forEach(order => {
      totalRevenue += order.total;
      grossSales += order.subtotal;
      totalGst += order.gst;

      const pm = order.payment_mode || "Cash";
      if (!paymentBreakdown[pm]) paymentBreakdown[pm] = { amount: 0, count: 0 };
      paymentBreakdown[pm].amount += order.total;
      paymentBreakdown[pm].count += 1;

      const ot = order.order_type || "Self Service";
      if (!typeBreakdown[ot]) typeBreakdown[ot] = { amount: 0, count: 0 };
      typeBreakdown[ot].amount += order.total;
      typeBreakdown[ot].count += 1;

      const dayKey = (order.created_at || "").split("T")[0] || order.created_at;
      if (!dayAgg[dayKey]) dayAgg[dayKey] = { orders: 0, gross: 0, gst: 0, total: 0 };
      dayAgg[dayKey].orders += 1;
      dayAgg[dayKey].gross += order.subtotal;
      dayAgg[dayKey].gst += order.gst;
      dayAgg[dayKey].total += order.total;

      try {
        const cart = JSON.parse(order.cart_data);
        cart.forEach((item: any) => {
          totalItemsSold += item.quantity;
          if (!itemAgg[item.name]) itemAgg[item.name] = { qty: 0, total: 0 };
          itemAgg[item.name].qty += item.quantity;
          itemAgg[item.name].total += item.price * item.quantity;
        });
      } catch (e) {}
    });

    const totalExpenses = expenses.reduce((sum, exp) => sum + exp.amount, 0);
    const totalOrders = orders.length;
    const avgBill = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    const netProfit = totalRevenue - totalExpenses;

    const topItems = Object.entries(itemAgg)
      .map(([name, d]) => ({ name, ...d }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    const daySeries = Object.entries(dayAgg)
      .map(([date, d]) => ({ date, ...d }))
      .sort((a, b) => b.date.localeCompare(a.date));

    const bestDay = daySeries.reduce<{ date: string; total: number } | null>(
      (best, d) => (!best || d.total > best.total ? { date: d.date, total: d.total } : best),
      null
    );

    return {
      totalRevenue, grossSales, totalGst, totalExpenses, totalOrders,
      avgBill, netProfit, totalItemsSold, paymentBreakdown, typeBreakdown,
      topItems, daySeries, bestDay, activeDays: daySeries.length,
    };
  }, [orders, expenses]);

  // Expense analytics — category breakdown + totals.
  const expenseStats = useMemo(() => {
    const byCat: Record<string, { amount: number; count: number }> = {};
    let total = 0;
    expenses.forEach(e => {
      const cat = e.category || "Uncategorized";
      if (!byCat[cat]) byCat[cat] = { amount: 0, count: 0 };
      byCat[cat].amount += e.amount;
      byCat[cat].count += 1;
      total += e.amount;
    });
    const cats = Object.entries(byCat)
      .map(([name, d]) => ({ name, ...d }))
      .sort((a, b) => b.amount - a.amount);
    return { total, count: expenses.length, avg: expenses.length ? total / expenses.length : 0, cats };
  }, [expenses]);

  // Backwards-compatible accessor used by print/export handlers.
  const calculateSalesSummary = () => ({
    totalRevenue: salesStats.totalRevenue,
    totalGst: salesStats.totalGst,
    paymentBreakdown: Object.fromEntries(Object.entries(salesStats.paymentBreakdown).map(([k, v]) => [k, v.amount])),
    typeBreakdown: Object.fromEntries(Object.entries(salesStats.typeBreakdown).map(([k, v]) => [k, v.amount])),
    totalExpenses: salesStats.totalExpenses,
  });

  const uniqueItems = useMemo(() => {
    const items = new Set<string>();
    orders.forEach(order => {
      try {
        const cart = JSON.parse(order.cart_data);
        cart.forEach((item: any) => items.add(item.name));
      } catch(e) {}
    });
    return Array.from(items).sort();
  }, [orders]);

  const calculateFilteredItemSales = () => {
    const itemSales: Record<string, { qty: number, total: number, category: string }> = {};
    orders.forEach(order => {
      try {
        const cart = JSON.parse(order.cart_data);
        cart.forEach((item: any) => {
          const catName = categories[item.category_id] || "Uncategorized";
          
          if (itemSalesFilter.category !== "All Categories" && catName !== itemSalesFilter.category) return;
          if (itemSalesFilter.item !== "All Items" && item.name !== itemSalesFilter.item) return;
          if (itemSalesFilter.search && !item.name.toLowerCase().includes(itemSalesFilter.search.toLowerCase())) return;

          if (!itemSales[item.name]) itemSales[item.name] = { qty: 0, total: 0, category: catName };
          itemSales[item.name].qty += item.quantity;
          itemSales[item.name].total += (item.price * item.quantity);
        });
      } catch(e) {}
    });
    return Object.entries(itemSales)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.total - a.total);
  };

  // --- EXPORT & PRINT ---
  const handleExportCSV = () => {
    let csvContent = "";
    if (activeMainTab === "Sales Overview") {
        if (activeReport === "Sales Summary") {
        csvContent += "Order ID,Date,Customer,Type,Payment Mode,Subtotal,GST,Total\n";
        orders.forEach(o => {
            csvContent += `${o.id},${o.created_at},${o.customer_name || 'Guest'},${o.order_type},${o.payment_mode},${o.subtotal},${o.gst},${o.total}\n`;
        });
        } else if (activeReport === "Item Sales") {
        csvContent += "Item Name,Category,Quantity Sold,Total Revenue\n";
        calculateFilteredItemSales().forEach((row) => {
            csvContent += `${row.name},${row.category},${row.qty},${row.total}\n`;
        });
        } else if (activeReport === "Recent Bills") {
        csvContent += "Order ID,Date,Customer,Type,Payment Mode,Total\n";
        orders.forEach(o => {
            csvContent += `${o.id},${o.created_at},${o.customer_name || 'Guest'},${o.order_type},${o.payment_mode},${o.total}\n`;
        });
        } else if (activeReport === "Expenses") {
        csvContent += "Date,Description,Category,Amount\n";
        expenses.forEach(e => {
            csvContent += `${e.date},${e.description},${e.category || 'Uncategorized'},${e.amount}\n`;
        });
        csvContent += `\nCategory,Entries,Total\n`;
        expenseStats.cats.forEach(c => {
            csvContent += `${c.name},${c.count},${c.amount}\n`;
        });
        csvContent += `TOTAL,,${expenseStats.total}\n`;
        } else if (activeReport === "Tax Report") {
        csvContent += "Bill No,Date,Taxable Value,GST,Total\n";
        orders.forEach(o => {
            csvContent += `${(o as any).bill_number || o.id},${o.created_at},${o.subtotal},${o.gst},${o.total}\n`;
        });
        csvContent += `\nTaxable Value,GST Collected,Total\n`;
        csvContent += `${salesStats.grossSales},${salesStats.totalGst},${salesStats.totalRevenue}\n`;
        } else if (activeReport === "Day-wise Sales") {
        csvContent += "Date,Orders,Gross Sales,GST,Net Revenue\n";
        salesStats.daySeries.forEach(d => {
            csvContent += `${d.date},${d.orders},${d.gross},${d.gst},${d.total}\n`;
        });
        }
    } else if (activeMainTab === "Credit Customers") {
        if (selectedCustomer) {
            csvContent += `Statement for ${selectedCustomer.name} (${selectedCustomer.phone || 'No Phone'})\n`;
            csvContent += `Date Range: ${customerDateRange.start} to ${customerDateRange.end}\n`;
            csvContent += `Current Credit Balance: ₹${selectedCustomer.credit_balance.toFixed(2)}\n\n`;
            csvContent += "Type,ID/Details,Date,Amount,Mode\n";
            customerTransactions.forEach(t => {
                csvContent += `${t.type.toUpperCase()},${t.details},${t.date},${t.amount},${t.mode}\n`;
            });
        } else {
            csvContent += "Customer ID,Name,Phone,Credit Balance\n";
            customers.forEach(c => {
                csvContent += `${c.id},${c.name},${c.phone},${c.credit_balance}\n`;
            });
        }
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `${activeMainTab.replace(/ /g, '_')}_${selectedCustomer ? selectedCustomer.name : ''}_${dateRange.start}_to_${dateRange.end}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setToastMessage("Report exported to CSV.");
  };

  const getLineWidth = (paperSize: string) => {
    switch (paperSize) {
      case "2inch": return 32;
      case "4inch": return 64;
      case "3inch":
      default: return 48;
    }
  };

  const padRight = (text: string, width: number) => text.length >= width ? text.substring(0, width) : text.padEnd(width);
  const padLeft = (text: string, width: number) => text.length >= width ? text.substring(0, width) : text.padStart(width);

  const generateESCPOSImage = async (base64: string, sizePercent: number, paperSize: string): Promise<number[]> => {
    return new Promise((resolve) => {
      if (!base64) {
        resolve([]);
        return;
      }
      const img = new Image();
      img.onload = () => {
        if (!img.width || !img.height || img.width <= 0 || img.height <= 0) {
           resolve([]);
           return;
        }
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve([]); return; }
        let maxWidth = 384; 
        if (paperSize === "4inch") maxWidth = 800; 
        else if (paperSize === "3inch") maxWidth = 576; 
        const targetWidth = Math.max(8, Math.floor(maxWidth * (sizePercent / 100)));
        const targetHeight = Math.max(8, Math.floor((img.height / img.width) * targetWidth));
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
        bytes.push(0x1B, 0x61, 0x01); 
        bytes.push(0x1D, 0x76, 0x30, 0x00); 
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
                const isBlack = (a > 128) && (luma < 128);
                if (isBlack) byte |= (1 << (7 - bit));
              }
            }
            bytes.push(byte);
          }
        }
        bytes.push(0x1B, 0x61, 0x00); 
        bytes.push(0x0A);
        resolve(bytes);
      };
      img.onerror = () => resolve([]);
      img.src = base64;
    });
  };

  const buildPrintData = (text: string, printBold: boolean): number[] => {
    const encoder = new TextEncoder();
    let data: number[] = [0x1B, 0x40];
    if (printBold) data.push(0x1B, 0x45, 0x01);
    data = data.concat(Array.from(encoder.encode(text)));
    if (printBold) data.push(0x1B, 0x45, 0x00);
    data.push(0x1D, 0x56, 0x41, 0x10);
    return data;
  };

  const handleReprintBill = async (orderId: number) => {
      if(!db) return;
      const res = await db.select<FinalizedOrder[]>("SELECT * FROM finalized_orders WHERE id = $1", [orderId]);
      if(res.length === 0) return;
      const order = res[0];

      const printerName = printerSettings?.default_printer;
      if (!printerName) {
          setToastMessage("No default printer set!");
          return;
      }

      const lineWidth = getLineWidth(printerSettings?.paper_size);
      const showLineSeps = billSettings?.show_line_separators !== false;
      const sep = showLineSeps ? "-".repeat(lineWidth) : "\n";
      
      let text = ``;
      
      const headerSize = billSettings?.header_font_size || "16px";
      if (headerSize === "24px" || headerSize === "28px" || headerSize === "20px") text += "\x1D\x21\x11";
      else if (headerSize === "18px" || headerSize === "16px") text += "\x1D\x21\x01";
      
      text += "\x1B\x61\x01";
      if (storeSettings?.hotel_name) text += `${storeSettings.hotel_name.toUpperCase()}\n`;
      text += "\x1D\x21\x00"; 
      
      if (storeSettings?.address) text += `${storeSettings.address}\n`;
      if (billSettings?.show_phone && storeSettings?.phone_number) text += `Tel: ${storeSettings.phone_number}\n`;
      text += `\n`;
      
      text += "\x1B\x61\x00";
      
      const orderDate = new Date(order.created_at);
      const dateStr = orderDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-');
      const timeStr = orderDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
      
      const billNoStr = (order as any).bill_number || order.id;
      text += `${padRight(`Bill No: ${billNoStr}`, Math.floor(lineWidth/2))}${padLeft(`Date: ${dateStr}`, Math.ceil(lineWidth/2))}\n`;
      text += `${padRight(`Time: ${timeStr}`, Math.floor(lineWidth/2))}${padLeft(`Cashier: Admin`, Math.ceil(lineWidth/2))}\n`;
      if (order.customer_name) {
          text += `${padRight(`Customer: ${order.customer_name}`, lineWidth)}\n`;
      }
      
      const tokenNumber = (order as any).token_number;
      if (tokenNumber) {
          text += `${sep}\n`;
          if (printerSettings?.token_print_size === "Extra Large") {
              text += "\x1D\x21\x22"; 
          } else if (printerSettings?.token_print_size === "Large") {
              text += "\x1D\x21\x11"; 
          } else {
              text += "\x1D\x21\x01"; 
          }
          text += "\x1B\x61\x01"; 
          text += `TOKEN: ${tokenNumber}\n`;
          text += "\x1D\x21\x00"; 
          text += "\x1B\x61\x00"; 
      }
      
      text += `${sep}\n`;
      
      const itemWidth = lineWidth - 4 - 8 - 8 - 3;
      text += `${padRight("Item", itemWidth)} ${padLeft("Qty", 4)} ${padLeft("Price", 8)} ${padLeft("Amt", 8)}\n`;
      text += `${sep}\n`;
      
      try {
          const cart = JSON.parse(order.cart_data);
          cart.forEach((item: any) => {
              let nameStr = padRight(item.name, itemWidth);
              const qtyStr = padLeft(item.quantity.toString(), 4);
              const priceStr = padLeft(item.price.toFixed(2), 8);
              const amtStr = padLeft((item.quantity * item.price).toFixed(2), 8);
              text += `${nameStr} ${qtyStr} ${priceStr} ${amtStr}\n`;
          });
      } catch(e) {}
      
      text += `${sep}\n`;
      text += `${padRight("Subtotal:", lineWidth - 12)}${padLeft(order.subtotal.toFixed(2), 12)}\n`;
      if (order.gst > 0) {
          text += `${padRight(`GST:`, lineWidth - 12)}${padLeft(order.gst.toFixed(2), 12)}\n`;
      }
      text += `${sep}\n`;
      text += "\x1B\x45\x01";
      text += `${padRight("GRAND TOTAL:", lineWidth - 14)}${padLeft(`Rs. ${order.total.toFixed(2)}`, 14)}\n`;
      text += "\x1B\x45\x00";
      text += `${sep}\n\n`;
      text += "\x1B\x61\x01";
      text += `${billSettings?.footer_message || "Thank you! Visit again."}\n\n\n\n`;
      text += "\x1B\x61\x00";

      try {
          let rawData = buildPrintData(text, Boolean(printerSettings?.print_bold));

          // --- UPI QR CODE SECTION ---
          if (storeSettings?.upi_id && billSettings?.no_qr_print === false) {
              let upiString = `upi://pay?pa=${storeSettings.upi_id}&pn=${encodeURIComponent(storeSettings.merchant_name || storeSettings.hotel_name || 'Restaurant')}&cu=INR`;
              
              if (storeSettings.payment_reference) {
                  upiString += `&tr=${encodeURIComponent(storeSettings.payment_reference)}`;
              }
              
              if (billSettings?.dynamic_upi_qr) {
                  upiString += `&am=${order.total.toFixed(2)}`;
              }

              try {
                  const qrBase64 = await QRCode.toDataURL(upiString, { margin: 1, width: 250 });
                  const qrBytes = await generateESCPOSImage(qrBase64, 40, printerSettings?.paper_size || "3inch");
                  
                  if (qrBytes.length > 0) {
                      const cutBytes = rawData.splice(-4, 4);
                      rawData.push(0x1B, 0x61, 0x01); 
                      rawData.push(...Array.from(new TextEncoder().encode("Scan to Pay via UPI\n")));
                      rawData = rawData.concat(qrBytes);
                      rawData.push(0x0A, 0x0A, 0x0A, 0x0A);
                      rawData = rawData.concat(cutBytes);
                  }
              } catch (qrErr) {
                  console.error("Failed to generate QR code:", qrErr);
              }
          }

          await invoke("print_receipt_raw", { printerName, data: rawData });
          setToastMessage(`Print successful!`);
      } catch (e) {
          console.error("Print failed:", e);
          setToastMessage(`Print failed.`);
      }
  };

  const handleUpdatePaymentMode = async (orderId: number) => {
      if (!db) return;
      try {
          await db.execute("UPDATE finalized_orders SET payment_mode = $1 WHERE id = $2", [newPaymentMode, orderId]);
          setOrders(prev => prev.map(o => o.id === orderId ? { ...o, payment_mode: newPaymentMode } : o));
          setEditingPaymentModeId(null);
          setToastMessage("Payment mode updated successfully.");
          fetchData(); // Refresh the sales summary if needed
      } catch (err) {
          console.error("Failed to update payment mode:", err);
          setToastMessage("Failed to update payment mode.");
      }
  };

  const handlePrintCustomerReport = async () => {
      if (!selectedCustomer) return;
      const printerName = printerSettings?.default_printer;
      if (!printerName) {
          setToastMessage("No default printer set!");
          return;
      }

      const lineWidth = getLineWidth(printerSettings?.paper_size);
      const sep = "-".repeat(lineWidth);
      
      let text = ``;
      text += "\x1B\x61\x01"; // Center
      text += "\x1D\x21\x01"; // Large
      if (storeSettings?.hotel_name) text += `${storeSettings.hotel_name.toUpperCase()}\n`;
      text += "\x1D\x21\x00"; // Normal
      text += `CUSTOMER STATEMENT\n`;
      text += `${sep}\n`;
      text += "\x1B\x61\x00"; // Left
      text += `Customer: ${selectedCustomer.name}\n`;
      if (selectedCustomer.phone) text += `Phone: ${selectedCustomer.phone}\n`;
      text += `Period: ${customerDateRange.start} to ${customerDateRange.end}\n`;
      text += `${sep}\n`;
      
      text += `${padRight("Date", 10)} ${padRight("Type", 8)} ${padLeft("Amount", 10)} ${padLeft("Mode", 8)}\n`;
      text += `${sep}\n`;
      
      customerTransactions.forEach(t => {
          const dateStr = new Date(t.date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' });
          text += `${padRight(dateStr, 10)} ${padRight(t.type === 'bill' ? 'Bill' : 'Pay', 8)} ${padLeft(t.amount.toFixed(2), 10)} ${padLeft(t.mode, 8)}\n`;
      });
      
      text += `${sep}\n`;
      text += "\x1B\x45\x01"; // Bold
      text += `${padRight("PENDING BALANCE:", lineWidth - 12)}${padLeft(selectedCustomer.credit_balance.toFixed(2), 12)}\n`;
      text += "\x1B\x45\x00"; // Normal
      text += `${sep}\n\n\n\n`;

      try {
          const rawData = buildPrintData(text, false);
          await invoke("print_receipt_raw", { printerName, data: rawData });
          setToastMessage(`Statement printed!`);
      } catch (e) {
          console.error("Print failed:", e);
          setToastMessage(`Print failed.`);
      }
  };

  const handlePrintCurrentReport = async () => {
    const printerName = printerSettings?.default_printer;
    if (!printerName) {
        setToastMessage("No default printer set!");
        return;
    }

    const lineWidth = getLineWidth(printerSettings?.paper_size);
    const sep = "-".repeat(lineWidth);
    let text = ``;

    text += "\x1B\x61\x01"; // Center
    text += "\x1D\x21\x01"; // Large
    if (storeSettings?.hotel_name) text += `${storeSettings.hotel_name.toUpperCase()}\n`;
    text += "\x1D\x21\x00"; // Normal

    if (activeMainTab === "Sales Overview") {
        if (activeReport === "Sales Summary") {
            text += `SALES SUMMARY\n`;
            text += `Period: ${dateRange.start} to ${dateRange.end}\n`;
            text += `${sep}\n`;
            text += "\x1B\x61\x00"; // Left
            
            const summary = calculateSalesSummary();
            text += `${padRight("Total Revenue:", lineWidth - 15)}${padLeft(summary.totalRevenue.toFixed(2), 15)}\n`;
            text += `${padRight("GST Collected:", lineWidth - 15)}${padLeft(summary.totalGst.toFixed(2), 15)}\n`;
            text += `${padRight("Total Expenses:", lineWidth - 15)}${padLeft(summary.totalExpenses.toFixed(2), 15)}\n`;
            text += `${sep}\n`;
            text += "\x1B\x45\x01"; // Bold
            text += `${padRight("NET PROFIT:", lineWidth - 15)}${padLeft((summary.totalRevenue - summary.totalExpenses).toFixed(2), 15)}\n`;
            text += "\x1B\x45\x00"; // Normal
            text += `${sep}\n`;
        } else if (activeReport === "Item Sales") {
            text += `ITEM SALES REPORT\n`;
            text += `Period: ${dateRange.start} to ${dateRange.end}\n`;
            if (itemSalesFilter.category !== "All Categories") text += `Category: ${itemSalesFilter.category}\n`;
            if (itemSalesFilter.item !== "All Items") text += `Item: ${itemSalesFilter.item}\n`;
            text += `${sep}\n`;
            text += "\x1B\x61\x00"; // Left
            
            text += `${padRight("Item", Math.floor(lineWidth * 0.55))} ${padLeft("Qty", Math.floor(lineWidth * 0.15))} ${padLeft("Total", Math.floor(lineWidth * 0.3) - 2)}\n`;
            text += `${sep}\n`;
            
            const data = calculateFilteredItemSales();
            let grandTotal = 0;
            data.forEach(row => {
                grandTotal += row.total;
                text += `${padRight(row.name, Math.floor(lineWidth * 0.55))} ${padLeft(row.qty.toString(), Math.floor(lineWidth * 0.15))} ${padLeft(row.total.toFixed(2), Math.floor(lineWidth * 0.3) - 2)}\n`;
            });
            text += `${sep}\n`;
            text += "\x1B\x45\x01"; // Bold
            text += `${padRight("TOTAL REVENUE:", lineWidth - 15)}${padLeft(grandTotal.toFixed(2), 15)}\n`;
            text += "\x1B\x45\x00"; // Normal
        } else if (activeReport === "Recent Bills") {
            text += `RECENT BILLS\n`;
            text += `Period: ${dateRange.start} to ${dateRange.end}\n`;
            text += `${sep}\n`;
            text += "\x1B\x61\x00"; // Left
            text += `${padRight("Bill No", 10)} ${padLeft("Total", lineWidth - 11)}\n`;
            text += `${sep}\n`;
            let grandTotal = 0;
            orders.forEach(o => {
                grandTotal += o.total;
                const billNoStr = (o as any).bill_number || `#${o.id}`;
                text += `${padRight(billNoStr, 10)} ${padLeft(o.total.toFixed(2), lineWidth - 11)}\n`;
            });
            text += `${sep}\n`;
            text += "\x1B\x45\x01";
            text += `${padRight("TOTAL:", lineWidth - 15)}${padLeft(grandTotal.toFixed(2), 15)}\n`;
            text += "\x1B\x45\x00";
        } else if (activeReport === "Expenses") {
            text += `EXPENSE REPORT\n`;
            text += `Period: ${dateRange.start} to ${dateRange.end}\n`;
            text += `${sep}\n`;
            text += "\x1B\x61\x00"; // Left
            text += `${padRight("Category", Math.floor(lineWidth * 0.5))} ${padLeft("Entries", Math.floor(lineWidth * 0.2))} ${padLeft("Amount", Math.floor(lineWidth * 0.3) - 2)}\n`;
            text += `${sep}\n`;
            expenseStats.cats.forEach(c => {
                text += `${padRight(c.name, Math.floor(lineWidth * 0.5))} ${padLeft(c.count.toString(), Math.floor(lineWidth * 0.2))} ${padLeft(c.amount.toFixed(2), Math.floor(lineWidth * 0.3) - 2)}\n`;
            });
            text += `${sep}\n`;
            text += "\x1B\x45\x01";
            text += `${padRight("TOTAL EXPENSES:", lineWidth - 15)}${padLeft(expenseStats.total.toFixed(2), 15)}\n`;
            text += "\x1B\x45\x00";
        } else if (activeReport === "Tax Report") {
            text += `TAX (GST) REPORT\n`;
            text += `Period: ${dateRange.start} to ${dateRange.end}\n`;
            text += `${sep}\n`;
            text += "\x1B\x61\x00"; // Left
            text += `${padRight("Taxable Value:", lineWidth - 15)}${padLeft(salesStats.grossSales.toFixed(2), 15)}\n`;
            text += `${padRight("CGST:", lineWidth - 15)}${padLeft((salesStats.totalGst / 2).toFixed(2), 15)}\n`;
            text += `${padRight("SGST:", lineWidth - 15)}${padLeft((salesStats.totalGst / 2).toFixed(2), 15)}\n`;
            text += `${sep}\n`;
            text += "\x1B\x45\x01";
            text += `${padRight("TOTAL GST:", lineWidth - 15)}${padLeft(salesStats.totalGst.toFixed(2), 15)}\n`;
            text += `${padRight("GROSS TOTAL:", lineWidth - 15)}${padLeft(salesStats.totalRevenue.toFixed(2), 15)}\n`;
            text += "\x1B\x45\x00";
        } else if (activeReport === "Day-wise Sales") {
            text += `DAY-WISE SALES\n`;
            text += `Period: ${dateRange.start} to ${dateRange.end}\n`;
            text += `${sep}\n`;
            text += "\x1B\x61\x00"; // Left
            text += `${padRight("Date", 12)} ${padLeft("Bills", 6)} ${padLeft("Revenue", lineWidth - 20)}\n`;
            text += `${sep}\n`;
            salesStats.daySeries.forEach(d => {
                text += `${padRight(d.date, 12)} ${padLeft(d.orders.toString(), 6)} ${padLeft(d.total.toFixed(2), lineWidth - 20)}\n`;
            });
            text += `${sep}\n`;
            text += "\x1B\x45\x01";
            text += `${padRight("TOTAL:", lineWidth - 15)}${padLeft(salesStats.totalRevenue.toFixed(2), 15)}\n`;
            text += "\x1B\x45\x00";
        }
    } else if (activeMainTab === "Credit Customers") {
        text += `CREDIT CUSTOMERS BALANCE\n`;
        text += `${sep}\n`;
        text += "\x1B\x61\x00"; // Left
        text += `${padRight("Customer", Math.floor(lineWidth * 0.6))} ${padLeft("Balance", lineWidth - Math.floor(lineWidth * 0.6) - 1)}\n`;
        text += `${sep}\n`;
        let totalDue = 0;
        customers.forEach(c => {
            totalDue += c.credit_balance;
            text += `${padRight(c.name, Math.floor(lineWidth * 0.6))} ${padLeft(c.credit_balance.toFixed(2), lineWidth - Math.floor(lineWidth * 0.6) - 1)}\n`;
        });
        text += `${sep}\n`;
        text += "\x1B\x45\x01";
        text += `${padRight("TOTAL DUE:", lineWidth - 15)}${padLeft(totalDue.toFixed(2), 15)}\n`;
        text += "\x1B\x45\x00";
    }

    text += `\n\n\n\n`;

    try {
        const rawData = buildPrintData(text, false);
        await invoke("print_receipt_raw", { printerName, data: rawData });
        setToastMessage(`Report printed successfully!`);
    } catch (e) {
        console.error("Print failed:", e);
        setToastMessage(`Print failed.`);
    }
  };

  if (isCheckingPlan) {
    return (
      <div className="loading-center" style={{ background: 'var(--bg-light)' }}>
        <div className="spinner" style={{ width: '32px', height: '32px', border: 'var(--border-thick) solid var(--border-color)', borderTopColor: 'var(--primary)', borderRadius: '50%' }}></div>
      </div>
    );
  }

  if (isPlanExpired) {
    return (
      <div className="expired-plan-overlay">
        <div className="expired-plan-card">
          <div className="expired-plan-icon">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
          </div>
          <h2 style={{ fontSize: 'var(--text-3xl)', margin: '0 0 1rem 0', color: 'var(--text-primary)', fontWeight: 'var(--font-bold)', letterSpacing: '-0.02em' }}>
            You don't have an active plan
          </h2>
          <p style={{ color: 'var(--text-secondary)', margin: '0 0 2.5rem 0', fontSize: 'var(--text-base)', lineHeight: 1.6 }}>
            Your subscription has expired or hasn't been activated. Upgrade your plan to restore access to the Dashboard, Reports, and all premium features.
          </p>
          <a href="https://magicbill.in" target="_blank" rel="noopener noreferrer" className="upgrade-btn">
            Activate Plan Now
          </a>
        </div>
      </div>
    );
  }

  const fmt = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const pct = (part: number, whole: number) => whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : "0%";
  const dateRangeActive = activeMainTab === "Sales Overview";

  return (
    <div className="rep-page">
      {toastMessage && <div className="toast-notification">{toastMessage}</div>}

      {/* Top bar: title + main tabs */}
      <div className="rep-topbar">
        <div className="rep-title-wrap">
          <h1 className="rep-title"><BarChart3 size={24} /> Reports &amp; Analytics</h1>
          <p className="rep-subtitle">Sales performance, item insights and customer credit — all in one place</p>
        </div>
        <div className="rep-maintabs">
          {[
            { id: "Sales Overview", icon: TrendingUp },
            { id: "Credit Customers", icon: Users },
          ].map(tab => (
            <button
              key={tab.id}
              className={`rep-maintab ${activeMainTab === tab.id ? 'active' : ''}`}
              onClick={() => { setActiveMainTab(tab.id); setSelectedCustomer(null); }}
            >
              <tab.icon size={17} /> {tab.id}
            </button>
          ))}
        </div>
      </div>

      {/* Toolbar: sub-tabs + date + actions */}
      <div className="rep-toolbar">
        <div className="rep-toolbar-left">
          {activeMainTab === "Sales Overview" ? (
            <div className="rep-subtabs">
              {[
                { id: "Sales Summary", icon: TrendingUp },
                { id: "Day-wise Sales", icon: CalendarIcon },
                { id: "Item Sales", icon: Package },
                { id: "Tax Report", icon: BarChart3 },
                { id: "Expenses", icon: Wallet },
                { id: "Recent Bills", icon: Receipt },
              ].map(tab => (
                <button
                  key={tab.id}
                  className={`rep-subtab ${activeReport === tab.id ? 'active' : ''}`}
                  onClick={() => setActiveReport(tab.id)}
                >
                  <tab.icon size={15} /> {tab.id}
                </button>
              ))}
            </div>
          ) : (
            <h3 className="rep-context-label" style={{ margin: 0, fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)', color: 'var(--text-primary)' }}>
              Credit Customers
            </h3>
          )}
        </div>

        <div className="rep-toolbar-right">
          {dateRangeActive && (
            <div className="date-range-picker">
              <div className="date-input-wrapper" onClick={(e) => { const i = e.currentTarget.querySelector('input'); if (i) i.showPicker(); }}>
                <CalendarIcon size={16} className="date-icon" />
                <input type="date" value={dateRange.start} onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))} className="modern-date-input" />
              </div>
              <span className="date-separator">to</span>
              <div className="date-input-wrapper" onClick={(e) => { const i = e.currentTarget.querySelector('input'); if (i) i.showPicker(); }}>
                <CalendarIcon size={16} className="date-icon" />
                <input type="date" value={dateRange.end} onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))} className="modern-date-input" />
              </div>
            </div>
          )}
          <button className="modern-btn" onClick={handlePrintCurrentReport}>
            <Printer size={16} /> Print Report
          </button>
          <button className="modern-btn" onClick={handleExportCSV}>
            <Download size={16} /> Export CSV
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="rep-content">
        {loading ? (
          <div className="loading-center" style={{ minHeight: '200px', gap: 'var(--space-3)' }}>
            <div className="spinner" style={{ width: '24px', height: '24px', border: 'var(--border-thick) solid var(--border-color)', borderTopColor: 'var(--primary)', borderRadius: '50%' }}></div>
            Loading Data…
          </div>
        ) : (
          <>
            {/* --- SALES SUMMARY --- */}
            {activeMainTab === "Sales Overview" && activeReport === "Sales Summary" && (
              <>
                {/* Summary stat cards */}
                <div className="rep-stat-grid">
                  {[
                    { label: "Total Revenue", val: fmt(salesStats.totalRevenue), sub: `${salesStats.totalOrders} bills` },
                    { label: "Gross Sales", val: fmt(salesStats.grossSales), sub: "Before tax" },
                    { label: "GST Collected", val: fmt(salesStats.totalGst), sub: "Output tax" },
                    { label: "Avg. Bill Value", val: fmt(salesStats.avgBill), sub: "Per order" },
                    { label: "Total Orders", val: salesStats.totalOrders.toLocaleString('en-IN'), sub: `${salesStats.totalItemsSold} items` },
                    { label: "Total Expenses", val: fmt(salesStats.totalExpenses), sub: `${expenseStats.count} entries` },
                    { label: "Net Profit", val: fmt(salesStats.netProfit), sub: "Revenue − expenses" },
                  ].map(stat => (
                    <div key={stat.label} className="rep-stat">
                      <span className="rep-stat-label">{stat.label}</span>
                      <span className="rep-stat-value">{stat.val}</span>
                      <span className="rep-stat-sub">{stat.sub}</span>
                    </div>
                  ))}
                </div>

                {/* Breakdown tables */}
                <div className="rep-panel-grid">
                  <div className="rep-card">
                    <div className="rep-card-head"><Wallet size={15} /> Payment Methods</div>
                    <table className="rep-table">
                      <thead>
                        <tr><th>Mode</th><th className="rep-num">Bills</th><th className="rep-num">Share</th><th className="rep-num">Amount</th></tr>
                      </thead>
                      <tbody>
                        {Object.entries(salesStats.paymentBreakdown).map(([mode, data]) => (
                          <tr key={mode}>
                            <td className="rep-strong">{mode}</td>
                            <td className="rep-num">{data.count}</td>
                            <td className="rep-num">{pct(data.amount, salesStats.totalRevenue)}</td>
                            <td className="rep-num rep-strong">{fmt(data.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="rep-card">
                    <div className="rep-card-head"><ShoppingBag size={15} /> Order Types</div>
                    <table className="rep-table">
                      <thead>
                        <tr><th>Type</th><th className="rep-num">Orders</th><th className="rep-num">Share</th><th className="rep-num">Amount</th></tr>
                      </thead>
                      <tbody>
                        {Object.entries(salesStats.typeBreakdown).map(([type, data]) => (
                          <tr key={type}>
                            <td className="rep-strong">{type}</td>
                            <td className="rep-num">{data.count}</td>
                            <td className="rep-num">{pct(data.amount, salesStats.totalRevenue)}</td>
                            <td className="rep-num rep-strong">{fmt(data.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Top selling items */}
                <div className="rep-card">
                  <div className="rep-card-head"><Award size={15} /> Top Selling Items</div>
                  <table className="rep-table">
                    <thead>
                      <tr>
                        <th style={{ width: '48px' }}>#</th>
                        <th>Item</th>
                        <th className="rep-num">Qty Sold</th>
                        <th className="rep-num">Revenue</th>
                        <th className="rep-num">% of Sales</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salesStats.topItems.length === 0 ? (
                        <tr className="rep-empty-row"><td colSpan={5}>No sales recorded for this period.</td></tr>
                      ) : salesStats.topItems.map((item, idx) => (
                        <tr key={item.name}>
                          <td style={{ color: 'var(--text-tertiary)' }}>{idx + 1}</td>
                          <td className="rep-strong">{item.name}</td>
                          <td className="rep-num">{item.qty}</td>
                          <td className="rep-num rep-strong">{fmt(item.total)}</td>
                          <td className="rep-num">{pct(item.total, salesStats.grossSales)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* --- ITEM SALES REPORT --- */}
            {activeMainTab === "Sales Overview" && activeReport === "Item Sales" && (() => {
              const itemRows = calculateFilteredItemSales();
              const itemTotalQty = itemRows.reduce((s, r) => s + r.qty, 0);
              const itemTotalRev = itemRows.reduce((s, r) => s + r.total, 0);
              return (
                <>
                  <div className="rep-filters">
                    <div className="rep-filter-field">
                      <label>Item</label>
                      <select value={itemSalesFilter.item} onChange={e => setItemSalesFilter(p => ({ ...p, item: e.target.value }))} className="modern-select">
                        <option>All Items</option>
                        {uniqueItems.map(item => <option key={item}>{item}</option>)}
                      </select>
                    </div>
                    <div className="rep-filter-field">
                      <label>Category</label>
                      <select value={itemSalesFilter.category} onChange={e => setItemSalesFilter(p => ({ ...p, category: e.target.value }))} className="modern-select">
                        <option>All Categories</option>
                        {Object.values(categories).map(cat => <option key={cat}>{cat}</option>)}
                      </select>
                    </div>
                    <div className="rep-filter-field" style={{ flex: 2 }}>
                      <label>Search</label>
                      <input type="text" placeholder="Search items…" value={itemSalesFilter.search} onChange={e => setItemSalesFilter(p => ({ ...p, search: e.target.value }))} className="modern-input" />
                    </div>
                    <button className="modern-btn" onClick={() => setItemSalesFilter({ item: "All Items", category: "All Categories", search: "" })}>
                      Reset
                    </button>
                  </div>

                  <div className="rep-table-wrap">
                    <table className="rep-table">
                      <thead>
                        <tr>
                          <th style={{ width: '48px' }}>#</th>
                          <th>Item Name</th>
                          <th>Category</th>
                          <th className="rep-num">Qty Sold</th>
                          <th className="rep-num">Total Revenue</th>
                          <th className="rep-num">% Share</th>
                        </tr>
                      </thead>
                      <tbody>
                        {itemRows.length === 0 ? (
                          <tr className="rep-empty-row"><td colSpan={6}>No items found matching the filters.</td></tr>
                        ) : (
                          itemRows.map((row, idx) => (
                            <tr key={row.name}>
                              <td style={{ color: 'var(--text-tertiary)' }}>{idx + 1}</td>
                              <td className="rep-strong">{row.name}</td>
                              <td style={{ color: 'var(--text-secondary)' }}>{row.category}</td>
                              <td className="rep-num">{row.qty}</td>
                              <td className="rep-num rep-strong">{fmt(row.total)}</td>
                              <td className="rep-num">{pct(row.total, itemTotalRev)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                      {itemRows.length > 0 && (
                        <tfoot>
                          <tr style={{ borderTop: 'var(--border-thick) solid var(--border-color)' }}>
                            <td colSpan={3} className="rep-strong" style={{ padding: 'var(--space-3) var(--space-4)' }}>Total ({itemRows.length} items)</td>
                            <td className="rep-num rep-strong" style={{ padding: 'var(--space-3) var(--space-4)' }}>{itemTotalQty}</td>
                            <td className="rep-num rep-strong" style={{ padding: 'var(--space-3) var(--space-4)' }}>{fmt(itemTotalRev)}</td>
                            <td className="rep-num" style={{ padding: 'var(--space-3) var(--space-4)' }}>100%</td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </>
              );
            })()}

            {/* --- RECENT BILLS --- */}
            {activeMainTab === "Sales Overview" && activeReport === "Recent Bills" && (
              <div className="rep-table-wrap">
                <table className="rep-table">
                  <thead>
                    <tr>
                      <th>Bill No</th>
                      <th>Date / Time</th>
                      <th>Customer</th>
                      <th>Type</th>
                      <th>Payment Mode</th>
                      <th className="rep-num">Total</th>
                      <th className="rep-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.length === 0 ? (
                      <tr className="rep-empty-row"><td colSpan={7}>No bills found for this period.</td></tr>
                    ) : orders.map((o) => (
                      <tr key={o.id}>
                        <td className="rep-strong" style={{ color: 'var(--primary)' }}>{(o as any).bill_number ? `${(o as any).bill_number}` : `#${o.id}`}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>{new Date(o.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</td>
                        <td className="rep-strong">{o.customer_name || 'Guest'}</td>
                        <td style={{ color: 'var(--text-secondary)' }}>{o.order_type}</td>
                        <td>
                          {editingPaymentModeId === o.id ? (
                            <div className="rep-inline-edit">
                              <select value={newPaymentMode} onChange={(e) => setNewPaymentMode(e.target.value)} className="modern-select" style={{ width: 'auto', padding: '0.35rem 0.5rem' }}>
                                <option value="Cash">Cash</option>
                                <option value="Card">Card</option>
                                <option value="UPI">UPI</option>
                                <option value="Credit">Credit</option>
                              </select>
                              <button className="modern-btn-primary" style={{ padding: '0.35rem 0.7rem' }} onClick={() => handleUpdatePaymentMode(o.id)}>Save</button>
                              <button className="modern-btn" style={{ padding: '0.35rem 0.7rem' }} onClick={() => setEditingPaymentModeId(null)}>Cancel</button>
                            </div>
                          ) : (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                              <span className="badge badge--info">{o.payment_mode || 'Cash'}</span>
                              <button className="row-action-btn" title="Edit Payment Mode" onClick={() => { setEditingPaymentModeId(o.id); setNewPaymentMode(o.payment_mode || 'Cash'); }}>
                                <Edit2 size={13} />
                              </button>
                            </span>
                          )}
                        </td>
                        <td className="rep-num rep-strong">{fmt(o.total)}</td>
                        <td className="rep-center">
                          <button className="modern-btn" style={{ padding: '0.4rem 0.75rem' }} onClick={() => handleReprintBill(o.id)}>
                            <Printer size={14} /> Reprint
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* --- DAY-WISE SALES --- */}
            {activeMainTab === "Sales Overview" && activeReport === "Day-wise Sales" && (
              <>
                <div className="rep-stat-grid">
                  {[
                    { label: "Active Days", val: salesStats.activeDays.toLocaleString('en-IN'), sub: "With sales" },
                    { label: "Avg / Day", val: fmt(salesStats.activeDays ? salesStats.totalRevenue / salesStats.activeDays : 0), sub: "Revenue" },
                    { label: "Best Day", val: salesStats.bestDay ? fmt(salesStats.bestDay.total) : '—', sub: salesStats.bestDay ? new Date(salesStats.bestDay.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : 'No data' },
                    { label: "Total Revenue", val: fmt(salesStats.totalRevenue), sub: `${salesStats.totalOrders} bills` },
                  ].map(stat => (
                    <div key={stat.label} className="rep-stat">
                      <span className="rep-stat-label">{stat.label}</span>
                      <span className="rep-stat-value">{stat.val}</span>
                      <span className="rep-stat-sub">{stat.sub}</span>
                    </div>
                  ))}
                </div>
                <div className="rep-table-wrap">
                  <table className="rep-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th className="rep-num">Bills</th>
                        <th className="rep-num">Gross Sales</th>
                        <th className="rep-num">GST</th>
                        <th className="rep-num">Net Revenue</th>
                        <th className="rep-num">Avg Bill</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salesStats.daySeries.length === 0 ? (
                        <tr className="rep-empty-row"><td colSpan={6}>No sales recorded for this period.</td></tr>
                      ) : salesStats.daySeries.map((d) => (
                        <tr key={d.date}>
                          <td className="rep-strong" style={{ whiteSpace: 'nowrap' }}>{new Date(d.date).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</td>
                          <td className="rep-num">{d.orders}</td>
                          <td className="rep-num">{fmt(d.gross)}</td>
                          <td className="rep-num">{fmt(d.gst)}</td>
                          <td className="rep-num rep-strong">{fmt(d.total)}</td>
                          <td className="rep-num">{fmt(d.orders ? d.total / d.orders : 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                    {salesStats.daySeries.length > 0 && (
                      <tfoot>
                        <tr style={{ borderTop: 'var(--border-thick) solid var(--border-color)' }}>
                          <td className="rep-strong" style={{ padding: 'var(--space-3) var(--space-4)' }}>Total</td>
                          <td className="rep-num rep-strong" style={{ padding: 'var(--space-3) var(--space-4)' }}>{salesStats.totalOrders}</td>
                          <td className="rep-num rep-strong" style={{ padding: 'var(--space-3) var(--space-4)' }}>{fmt(salesStats.grossSales)}</td>
                          <td className="rep-num rep-strong" style={{ padding: 'var(--space-3) var(--space-4)' }}>{fmt(salesStats.totalGst)}</td>
                          <td className="rep-num rep-strong" style={{ padding: 'var(--space-3) var(--space-4)' }}>{fmt(salesStats.totalRevenue)}</td>
                          <td className="rep-num" style={{ padding: 'var(--space-3) var(--space-4)' }}>{fmt(salesStats.avgBill)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </>
            )}

            {/* --- TAX (GST) REPORT --- */}
            {activeMainTab === "Sales Overview" && activeReport === "Tax Report" && (
              <>
                <div className="rep-stat-grid">
                  {[
                    { label: "Taxable Value", val: fmt(salesStats.grossSales), sub: "Net of tax" },
                    { label: "CGST", val: fmt(salesStats.totalGst / 2), sub: "Central GST" },
                    { label: "SGST", val: fmt(salesStats.totalGst / 2), sub: "State GST" },
                    { label: "Total GST", val: fmt(salesStats.totalGst), sub: "Output tax" },
                    { label: "Gross Total", val: fmt(salesStats.totalRevenue), sub: "Incl. tax" },
                  ].map(stat => (
                    <div key={stat.label} className="rep-stat">
                      <span className="rep-stat-label">{stat.label}</span>
                      <span className="rep-stat-value">{stat.val}</span>
                      <span className="rep-stat-sub">{stat.sub}</span>
                    </div>
                  ))}
                </div>
                <div className="rep-table-wrap">
                  <table className="rep-table">
                    <thead>
                      <tr>
                        <th>Bill No</th>
                        <th>Date</th>
                        <th>Payment</th>
                        <th className="rep-num">Taxable Value</th>
                        <th className="rep-num">CGST</th>
                        <th className="rep-num">SGST</th>
                        <th className="rep-num">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.length === 0 ? (
                        <tr className="rep-empty-row"><td colSpan={7}>No taxable bills for this period.</td></tr>
                      ) : orders.map((o) => (
                        <tr key={o.id}>
                          <td className="rep-strong" style={{ color: 'var(--primary)' }}>{(o as any).bill_number ? `${(o as any).bill_number}` : `#${o.id}`}</td>
                          <td style={{ whiteSpace: 'nowrap' }}>{new Date(o.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                          <td style={{ color: 'var(--text-secondary)' }}>{o.payment_mode || 'Cash'}</td>
                          <td className="rep-num">{fmt(o.subtotal)}</td>
                          <td className="rep-num">{fmt(o.gst / 2)}</td>
                          <td className="rep-num">{fmt(o.gst / 2)}</td>
                          <td className="rep-num rep-strong">{fmt(o.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                    {orders.length > 0 && (
                      <tfoot>
                        <tr style={{ borderTop: 'var(--border-thick) solid var(--border-color)' }}>
                          <td colSpan={3} className="rep-strong" style={{ padding: 'var(--space-3) var(--space-4)' }}>Total</td>
                          <td className="rep-num rep-strong" style={{ padding: 'var(--space-3) var(--space-4)' }}>{fmt(salesStats.grossSales)}</td>
                          <td className="rep-num rep-strong" style={{ padding: 'var(--space-3) var(--space-4)' }}>{fmt(salesStats.totalGst / 2)}</td>
                          <td className="rep-num rep-strong" style={{ padding: 'var(--space-3) var(--space-4)' }}>{fmt(salesStats.totalGst / 2)}</td>
                          <td className="rep-num rep-strong" style={{ padding: 'var(--space-3) var(--space-4)' }}>{fmt(salesStats.totalRevenue)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </>
            )}

            {/* --- EXPENSES REPORT --- */}
            {activeMainTab === "Sales Overview" && activeReport === "Expenses" && (
              <>
                <div className="rep-stat-grid">
                  {[
                    { label: "Total Expenses", val: fmt(expenseStats.total), sub: `${expenseStats.count} entries` },
                    { label: "Categories", val: expenseStats.cats.length.toLocaleString('en-IN'), sub: "Heads" },
                    { label: "Avg / Entry", val: fmt(expenseStats.avg), sub: "Per expense" },
                    { label: "Net Profit", val: fmt(salesStats.netProfit), sub: "After expenses" },
                  ].map(stat => (
                    <div key={stat.label} className="rep-stat">
                      <span className="rep-stat-label">{stat.label}</span>
                      <span className="rep-stat-value">{stat.val}</span>
                      <span className="rep-stat-sub">{stat.sub}</span>
                    </div>
                  ))}
                </div>

                {expenseStats.cats.length > 0 && (
                  <div className="rep-card">
                    <div className="rep-card-head"><Wallet size={15} /> Expenses by Category</div>
                    <table className="rep-table">
                      <thead>
                        <tr><th>Category</th><th className="rep-num">Entries</th><th className="rep-num">Share</th><th className="rep-num">Amount</th></tr>
                      </thead>
                      <tbody>
                        {expenseStats.cats.map((c) => (
                          <tr key={c.name}>
                            <td className="rep-strong">{c.name}</td>
                            <td className="rep-num">{c.count}</td>
                            <td className="rep-num">{pct(c.amount, expenseStats.total)}</td>
                            <td className="rep-num rep-strong">{fmt(c.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="rep-table-wrap">
                  <table className="rep-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Description</th>
                        <th>Category</th>
                        <th className="rep-num">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {expenses.length === 0 ? (
                        <tr className="rep-empty-row"><td colSpan={4}>No expenses recorded for this period.</td></tr>
                      ) : expenses.map((e) => (
                        <tr key={e.id}>
                          <td style={{ whiteSpace: 'nowrap' }}>{new Date(e.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                          <td className="rep-strong">{e.description || '—'}</td>
                          <td><span className="badge badge--warning">{e.category || 'Uncategorized'}</span></td>
                          <td className="rep-num rep-strong">{fmt(e.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                    {expenses.length > 0 && (
                      <tfoot>
                        <tr style={{ borderTop: 'var(--border-thick) solid var(--border-color)' }}>
                          <td colSpan={3} className="rep-strong" style={{ padding: 'var(--space-3) var(--space-4)' }}>Total ({expenseStats.count})</td>
                          <td className="rep-num rep-strong" style={{ padding: 'var(--space-3) var(--space-4)' }}>{fmt(expenseStats.total)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </>
            )}

            {/* --- CREDIT CUSTOMERS --- */}
            {activeMainTab === "Credit Customers" && (() => {
              const totalDue = customers.reduce((s, c) => s + (c.credit_balance > 0 ? c.credit_balance : 0), 0);
              const withDue = customers.filter(c => c.credit_balance > 0).length;
              return (
                <>
                  <div className="rep-stat-grid">
                    {[
                      { label: "Total Customers", val: customers.length.toLocaleString('en-IN'), sub: "On record" },
                      { label: "Customers With Due", val: withDue.toLocaleString('en-IN'), sub: "Pending credit" },
                      { label: "Total Outstanding", val: fmt(totalDue), sub: "Receivable" },
                    ].map(stat => (
                      <div key={stat.label} className="rep-stat">
                        <span className="rep-stat-label">{stat.label}</span>
                        <span className="rep-stat-value">{stat.val}</span>
                        <span className="rep-stat-sub">{stat.sub}</span>
                      </div>
                    ))}
                  </div>

                  <div className="rep-table-wrap">
                    <table className="rep-table">
                      <thead>
                        <tr>
                          <th>Customer Name</th>
                          <th>Phone</th>
                          <th className="rep-num">Balance</th>
                          <th className="rep-num">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {customers.length === 0 ? (
                          <tr className="rep-empty-row"><td colSpan={4}>No customers found.</td></tr>
                        ) : customers.map((c) => (
                          <tr key={c.id}>
                            <td>
                              {editingCustomer?.id === c.id ? (
                                <div className="rep-inline-edit">
                                  <input type="text" value={editingCustomer.name} onChange={e => setEditingCustomer({ ...editingCustomer, name: e.target.value })} className="modern-input" style={{ padding: '0.35rem 0.5rem', width: 'auto' }} />
                                  <button className="modern-btn-primary" style={{ padding: '0.35rem 0.7rem' }} onClick={handleEditCustomerName}>Save</button>
                                  <button className="modern-btn" style={{ padding: '0.35rem 0.7rem' }} onClick={() => setEditingCustomer(null)}>Cancel</button>
                                </div>
                              ) : (
                                <button className="rep-link" onClick={() => setSelectedCustomer(c)}>{c.name}</button>
                              )}
                            </td>
                            <td style={{ color: 'var(--text-secondary)' }}>{c.phone || '—'}</td>
                            <td className={`rep-num ${c.credit_balance > 0 ? 'rep-amt-due' : 'rep-amt-clear'}`}>{fmt(c.credit_balance)}</td>
                            <td>
                              <div className="rep-actions">
                                <button className="modern-btn-primary" style={{ padding: '0.4rem 0.75rem' }} onClick={() => setSelectedCustomer(c)}>
                                  <Eye size={14} /> View
                                </button>
                                <button className="modern-btn" style={{ padding: '0.4rem 0.75rem' }} onClick={() => setEditingCustomer({ id: c.id, name: c.name })}>
                                  <Edit2 size={14} /> Edit
                                </button>
                                <button className="modern-btn-danger" style={{ padding: '0.4rem 0.6rem' }} onClick={() => handleDeleteCustomer(c.id)} title="Delete customer">
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              );
            })()}
          </>
        )}
      </div>

      {/* --- CUSTOMER DETAILS MODAL --- */}
      {selectedCustomer && (
        <div className="modal-overlay modal-overlay--heavy" onClick={() => setSelectedCustomer(null)}>
          <div className="rep-modal-card" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="rep-modal-head">
              <div>
                <h2 className="rep-modal-title">{selectedCustomer.name}</h2>
                <p className="rep-modal-sub">{selectedCustomer.phone || 'No phone'}</p>
              </div>
              <button className="icon-btn" onClick={() => setSelectedCustomer(null)}><X size={20} /></button>
            </div>

            {/* Modal Body */}
            <div className="rep-modal-body">
              {/* Summary + quick actions */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-5)', alignItems: 'center' }}>
                <div className="rep-stat">
                  <span className="rep-stat-label">Pending Balance</span>
                  <span className="rep-stat-value" style={{ fontSize: 'var(--text-2xl)' }}>
                    {fmt(selectedCustomer.credit_balance)}
                  </span>
                </div>
                <div className="rep-modal-actions">
                  <button className="modern-btn" onClick={handlePrintCustomerReport}>
                    <Printer size={16} /> Print Statement
                  </button>
                  <button className="modern-btn-primary" onClick={() => settleCustomerDue(selectedCustomer.id)} disabled={selectedCustomer.credit_balance <= 0}>
                    <CheckCircle2 size={16} /> Settle All Due
                  </button>
                </div>
              </div>

              {/* Record Payment */}
              <div className="rep-filters">
                <div className="rep-filter-field" style={{ flex: 2 }}>
                  <label>Record Payment</label>
                  <input type="number" placeholder="Amount" value={partialPaymentAmount} onChange={e => setPartialPaymentAmount(e.target.value)} className="modern-input" />
                </div>
                <div className="rep-filter-field">
                  <label>Mode</label>
                  <select value={partialPaymentMode} onChange={e => setPartialPaymentMode(e.target.value)} className="modern-select">
                    <option>Cash</option>
                    <option>UPI</option>
                    <option>Card</option>
                  </select>
                </div>
                <button className="modern-btn-primary" onClick={handlePartialPayment}>
                  <PlusCircle size={18} /> Record
                </button>
              </div>

              {/* Transaction History */}
              <div>
                <div className="rep-section-head">
                  <h4>Transaction History</h4>
                  <div className="date-range-picker">
                    <div className="date-input-wrapper" onClick={(e) => { const i = e.currentTarget.querySelector('input'); if (i) i.showPicker(); }}>
                      <CalendarIcon size={14} className="date-icon" />
                      <input type="date" value={customerDateRange.start} onChange={e => setCustomerDateRange(p => ({ ...p, start: e.target.value }))} className="modern-date-input" style={{ fontSize: 'var(--text-sm)' }} />
                    </div>
                    <span className="date-separator" style={{ fontSize: 'var(--text-xs)' }}>to</span>
                    <div className="date-input-wrapper" onClick={(e) => { const i = e.currentTarget.querySelector('input'); if (i) i.showPicker(); }}>
                      <CalendarIcon size={14} className="date-icon" />
                      <input type="date" value={customerDateRange.end} onChange={e => setCustomerDateRange(p => ({ ...p, end: e.target.value }))} className="modern-date-input" style={{ fontSize: 'var(--text-sm)' }} />
                    </div>
                  </div>
                </div>
                <div className="rep-table-wrap">
                  <table className="rep-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Details</th>
                        <th className="rep-num">Amount</th>
                        <th>Mode</th>
                        <th className="rep-center">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customerTransactions.length === 0 ? (
                        <tr className="rep-empty-row"><td colSpan={5}>No history found.</td></tr>
                      ) : customerTransactions.map((t) => (
                        <tr key={`${t.type}-${t.id}`}>
                          <td style={{ whiteSpace: 'nowrap' }}>{new Date(t.date).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}</td>
                          <td>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                              <span className={`badge ${t.type === 'bill' ? 'badge--danger' : 'badge--success'}`} style={{ textTransform: 'uppercase' }}>{t.type}</span>
                              {t.details}
                            </span>
                          </td>
                          <td className="rep-num rep-strong">{fmt(t.amount)}</td>
                          <td>{t.mode}</td>
                          <td className="rep-center">
                            {t.type === 'bill' && (
                              <button className="row-action-btn" title="Reprint Bill" onClick={() => handleReprintBill(t.id)}>
                                <Printer size={14} />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
