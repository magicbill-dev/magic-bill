import { useState, useEffect, useMemo } from "react";
import Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";
import { Download, Printer, Calendar as CalendarIcon, TrendingUp, Package, Users, Receipt, Eye, Edit2, Trash2, X, PlusCircle } from "lucide-react";

interface ReportsProps {
  db: Database | null;
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
      try {
        const sRes = await db.select<any[]>("SELECT * FROM bill_settings WHERE id = 1");
        if (sRes.length > 0) setBillSettings(sRes[0]);
        const pRes = await db.select<any[]>("SELECT * FROM printer_settings WHERE id = 1");
        if (pRes.length > 0) setPrinterSettings(pRes[0]);
        const stRes = await db.select<any[]>("SELECT * FROM store_settings WHERE id = 1");
        if (stRes.length > 0) setStoreSettings(stRes[0]);
      } catch (err) {
        console.error("Failed to load settings:", err);
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

      if (activeMainTab === "Sales Overview" || activeMainTab === "Recent Bills") {
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
        const payments = await db.select<CustomerPayment[]>(
            "SELECT * FROM customer_payments WHERE customer_id = $1 AND datetime(date, 'localtime') >= $2 AND datetime(date, 'localtime') <= $3",
            [customerId, startDate, endDate]
        );

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
          await db.execute("INSERT INTO customer_payments (customer_id, amount, payment_mode) VALUES ($1, $2, $3)", 
              [selectedCustomer.id, amount, partialPaymentMode]);
          
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
          await db.execute("INSERT INTO customer_payments (customer_id, amount, payment_mode) VALUES ($1, $2, $3)", 
            [customerId, amount, "Full Settlement"]);
            
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
  const calculateSalesSummary = () => {
    let totalRevenue = 0;
    let totalGst = 0;
    const paymentBreakdown = { Cash: 0, Card: 0, UPI: 0, Credit: 0 } as Record<string, number>;
    const typeBreakdown = { "Self Service": 0, "Table": 0, "Parcel": 0 } as Record<string, number>;

    orders.forEach(order => {
      totalRevenue += order.total;
      totalGst += order.gst;
      paymentBreakdown[order.payment_mode] = (paymentBreakdown[order.payment_mode] || 0) + order.total;
      typeBreakdown[order.order_type] = (typeBreakdown[order.order_type] || 0) + order.total;
    });

    const totalExpenses = expenses.reduce((sum, exp) => sum + exp.amount, 0);

    return { totalRevenue, totalGst, paymentBreakdown, typeBreakdown, totalExpenses };
  };

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
        }
    } else if (activeMainTab === "Recent Bills") {
        csvContent += "Order ID,Date,Customer,Type,Payment Mode,Total\n";
        orders.forEach(o => {
            csvContent += `${o.id},${o.created_at},${o.customer_name || 'Guest'},${o.order_type},${o.payment_mode},${o.total}\n`;
        });
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
          const rawData = buildPrintData(text, Boolean(printerSettings?.print_bold));
          await invoke("print_receipt_raw", { printerName, data: rawData });
          setToastMessage(`Print successful!`);
      } catch (e) {
          console.error("Print failed:", e);
          setToastMessage(`Print failed.`);
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
        }
    } else if (activeMainTab === "Recent Bills") {
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

  return (
    <div className="reports-page" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', height: '100%', overflowY: 'auto', background: 'var(--bg-light)' }}>
      {toastMessage && (
        <div style={{
          position: 'fixed', top: '20px', right: '20px', backgroundColor: 'var(--primary)', color: 'var(--primary-fg)',
          padding: '0.75rem 1.25rem', borderRadius: '0.5rem', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)', zIndex: 2000, fontWeight: 600, fontSize: '0.875rem'
        }}>
          {toastMessage}
        </div>
      )}

      {/* Main Tabs Navigation */}
      <div style={{ display: 'flex', gap: '0.75rem', paddingBottom: '0.5rem' }}>
        {[
          { id: "Sales Overview", icon: TrendingUp },
          { id: "Credit Customers", icon: Users },
          { id: "Recent Bills", icon: Receipt },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => {
                setActiveMainTab(tab.id);
                setSelectedCustomer(null);
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.25rem', borderRadius: '0.5rem',
              background: activeMainTab === tab.id ? 'var(--primary)' : 'var(--bg-light)',
              color: activeMainTab === tab.id ? 'var(--primary-fg)' : 'var(--text-primary)',
              border: activeMainTab === tab.id ? 'none' : '1px solid var(--border-color)', 
              cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', 
              transition: 'all 0.2s ease',
              boxShadow: activeMainTab === tab.id ? '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)' : 'none'
            }}
          >
            <tab.icon size={18} /> {tab.id}
          </button>
        ))}
      </div>

      {/* Dynamic Header & Controls */}
      <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '1.25rem', borderRadius: '0.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          
          {/* Left Side Controls: Selection Buttons */}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', background: 'var(--bg-light)', padding: '0.35rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)' }}>
              {activeMainTab === "Sales Overview" && [
                  { id: "Sales Summary", icon: TrendingUp },
                  { id: "Item Sales", icon: Package },
              ].map(tab => (
                  <button
                  key={tab.id}
                  onClick={() => setActiveReport(tab.id)}
                  style={{
                      display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', borderRadius: '0.375rem',
                      background: activeReport === tab.id ? 'var(--primary)' : 'transparent',
                      color: activeReport === tab.id ? 'var(--primary-fg)' : 'var(--text-secondary)',
                      border: 'none',
                      cursor: 'pointer', fontWeight: activeReport === tab.id ? 600 : 500, fontSize: '0.875rem',
                      transition: 'all 0.2s ease',
                      boxShadow: activeReport === tab.id ? '0 1px 3px rgba(0,0,0,0.2)' : 'none'
                  }}
                  >
                  <tab.icon size={16} /> {tab.id}
                  </button>
              ))}
              {activeMainTab !== "Sales Overview" && (
                  <h3 style={{ margin: '0 0.5rem', fontSize: '1.2rem', color: 'var(--text-primary)', fontWeight: 600 }}>{activeMainTab}</h3>
              )}
          </div>

          {/* Right Side Controls: Date Picker & Export */}
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {(activeMainTab === "Sales Overview" || activeMainTab === "Recent Bills") && (
              <div className="date-range-picker">
                <div className="date-input-wrapper" onClick={(e) => { const i = e.currentTarget.querySelector('input'); if(i) i.showPicker(); }}>
                  <CalendarIcon size={16} className="date-icon" />
                  <input 
                    type="date" 
                    value={dateRange.start} 
                    onChange={e => setDateRange(prev => ({...prev, start: e.target.value}))} 
                    className="modern-date-input" 
                  />
                </div>
                <span className="date-separator">to</span>
                <div className="date-input-wrapper" onClick={(e) => { const i = e.currentTarget.querySelector('input'); if(i) i.showPicker(); }}>
                  <CalendarIcon size={16} className="date-icon" />
                  <input 
                    type="date" 
                    value={dateRange.end} 
                    onChange={e => setDateRange(prev => ({...prev, end: e.target.value}))} 
                    className="modern-date-input" 
                  />
                </div>
              </div>
            )}
            
            <button 
              onClick={handlePrintCurrentReport}
              style={{ 
                display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.25rem', borderRadius: '0.5rem', 
                background: 'var(--bg-light)', border: '1px solid var(--border-color)', color: 'var(--text-primary)',
                cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600, transition: 'all 0.2s ease',
              }}
            >
              <Printer size={16} /> Print Report
            </button>
            <button 
              onClick={handleExportCSV}
              style={{ 
                display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.25rem', borderRadius: '0.5rem', 
                background: 'var(--bg-light)', border: '1px solid var(--border-color)', color: 'var(--text-primary)',
                cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600, transition: 'all 0.2s ease',
              }}
            >
              <Download size={16} /> Export CSV
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="panel" style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', borderRadius: '0.75rem' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px', color: 'var(--text-secondary)', fontSize: '1.1rem' }}>
             <div className="spinner" style={{ marginRight: '1rem', width: '24px', height: '24px', border: '3px solid var(--border-color)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
             Loading Data...
          </div>
        ) : (
          <>
            {/* --- SALES OVERVIEW --- */}
            {activeMainTab === "Sales Overview" && activeReport === "Sales Summary" && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem' }}>
                {[
                  { label: "Total Revenue", val: calculateSalesSummary().totalRevenue, color: 'var(--text-primary)' },
                  { label: "GST Collected", val: calculateSalesSummary().totalGst, color: 'var(--text-primary)' },
                  { label: "Total Expenses", val: calculateSalesSummary().totalExpenses, color: 'var(--error)' },
                  { label: "Net Profit", val: (calculateSalesSummary().totalRevenue - calculateSalesSummary().totalExpenses), color: 'var(--success, #10b981)' },
                ].map(stat => (
                  <div key={stat.label} style={{ padding: '1.5rem', background: 'var(--bg-light)', borderRadius: '0.5rem', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: 0, fontWeight: 500 }}>{stat.label}</p>
                    <p style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0, color: stat.color }}>₹{stat.val.toFixed(2)}</p>
                  </div>
                ))}

                <div style={{ gridColumn: '1 / -1', marginTop: '1rem' }}>
                  <h4 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: 'var(--text-primary)' }}>Payment Methods</h4>
                  <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', background: 'var(--bg-light)', padding: '1.25rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)' }}>
                    {Object.entries(calculateSalesSummary().paymentBreakdown).map(([mode, amt]) => (
                      <div key={mode} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: '100px' }}>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', fontWeight: 500 }}>{mode}</span>
                        <span style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-primary)' }}>₹{amt.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* --- ITEM SALES REPORT --- */}
            {activeMainTab === "Sales Overview" && activeReport === "Item Sales" && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end', background: 'var(--bg-light)', padding: '1.25rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)' }}>
                    <div style={{ flex: 1, minWidth: '150px' }}>
                        <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.5rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Item</label>
                        <select 
                            value={itemSalesFilter.item} 
                            onChange={e => setItemSalesFilter(p => ({...p, item: e.target.value}))}
                            style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)', background: 'var(--bg-light)', color: 'var(--text-primary)', outline: 'none', cursor: 'pointer' }}
                        >
                            <option>All Items</option>
                            {uniqueItems.map(item => <option key={item}>{item}</option>)}
                        </select>
                    </div>
                    <div style={{ flex: 1, minWidth: '150px' }}>
                        <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.5rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Category</label>
                        <select 
                            value={itemSalesFilter.category} 
                            onChange={e => setItemSalesFilter(p => ({...p, category: e.target.value}))}
                            style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)', background: 'var(--bg-light)', color: 'var(--text-primary)', outline: 'none', cursor: 'pointer' }}
                        >
                            <option>All Categories</option>
                            {Object.values(categories).map(cat => <option key={cat}>{cat}</option>)}
                        </select>
                    </div>
                    <div style={{ flex: 2, minWidth: '200px' }}>
                        <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.5rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Search</label>
                        <input 
                            type="text"
                            placeholder="Search items..."
                            value={itemSalesFilter.search} 
                            onChange={e => setItemSalesFilter(p => ({...p, search: e.target.value}))}
                            style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)', background: 'var(--bg-light)', color: 'var(--text-primary)', outline: 'none' }}
                        />
                    </div>
                    <button 
                        onClick={() => setItemSalesFilter({ item: "All Items", category: "All Categories", search: "" })}
                        style={{ padding: '0.6rem 1.25rem', background: 'var(--bg-light)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '0.375rem', cursor: 'pointer', fontWeight: 600, transition: 'all 0.2s', height: '42px' }}
                    >
                        Reset
                    </button>
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-color)', textAlign: 'left' }}>
                      <th style={{ padding: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Name</th>
                      <th style={{ padding: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Category</th>
                      <th style={{ padding: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'right' }}>Qty</th>
                      <th style={{ padding: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'right' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calculateFilteredItemSales().length === 0 ? (
                        <tr><td colSpan={4} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>No items found matching the filters.</td></tr>
                    ) : (
                        calculateFilteredItemSales().map((row, idx) => (
                        <tr key={row.name} style={{ borderBottom: '1px solid var(--border-color)', backgroundColor: idx % 2 === 0 ? 'transparent' : 'var(--bg-light)', transition: 'background-color 0.15s' }}>
                            <td style={{ padding: '0.875rem 0.75rem', fontWeight: 500 }}>{row.name}</td>
                            <td style={{ padding: '0.875rem 0.75rem', color: 'var(--text-secondary)' }}>{row.category}</td>
                            <td style={{ padding: '0.875rem 0.75rem', textAlign: 'right' }}>{row.qty}</td>
                            <td style={{ padding: '0.875rem 0.75rem', textAlign: 'right', fontWeight: 600 }}>₹{row.total.toFixed(2)}</td>
                        </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* --- CREDIT CUSTOMERS --- */}
            {activeMainTab === "Credit Customers" && (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                    <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-color)', textAlign: 'left' }}>
                        <th style={{ padding: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Customer Name</th>
                        <th style={{ padding: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Phone</th>
                        <th style={{ padding: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'right' }}>Balance</th>
                        <th style={{ padding: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'right' }}>Actions</th>
                    </tr>
                    </thead>
                    <tbody>
                    {customers.length === 0 ? (
                        <tr><td colSpan={4} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>No customers found.</td></tr>
                    ) : customers.map((c, idx) => (
                        <tr key={c.id} style={{ borderBottom: '1px solid var(--border-color)', backgroundColor: idx % 2 === 0 ? 'transparent' : 'var(--bg-light)' }}>
                            <td style={{ padding: '0.875rem 0.75rem', fontWeight: 500 }}>
                                {editingCustomer?.id === c.id ? (
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <input 
                                            type="text" 
                                            value={editingCustomer.name} 
                                            onChange={e => setEditingCustomer({...editingCustomer, name: e.target.value})}
                                            style={{ padding: '0.3rem 0.5rem', borderRadius: '0.25rem', border: '1px solid var(--primary)', fontSize: '0.875rem', background: 'var(--bg-light)', color: 'var(--text-primary)' }}
                                        />
                                        <button onClick={handleEditCustomerName} style={{ background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '0.25rem', padding: '0.3rem 0.6rem', cursor: 'pointer', fontWeight: 600 }}>Save</button>
                                        <button onClick={() => setEditingCustomer(null)} style={{ background: 'var(--bg-light)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '0.25rem', padding: '0.3rem 0.6rem', cursor: 'pointer' }}>Cancel</button>
                                    </div>
                                ) : (
                                    <span 
                                        onClick={() => setSelectedCustomer(c)} 
                                        style={{ cursor: 'pointer', color: 'var(--primary)', fontWeight: 600, transition: 'color 0.2s' }}
                                    >
                                        {c.name}
                                    </span>
                                )}
                            </td>
                            <td style={{ padding: '0.875rem 0.75rem' }}>{c.phone || '-'}</td>
                            <td style={{ padding: '0.875rem 0.75rem', textAlign: 'right', fontWeight: 700, color: c.credit_balance > 0 ? 'var(--error)' : 'var(--success)' }}>
                                ₹{c.credit_balance.toFixed(2)}
                            </td>
                            <td style={{ padding: '0.875rem 0.75rem', textAlign: 'right' }}>
                                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                    <button 
                                        onClick={() => setSelectedCustomer(c)}
                                        style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.4rem 0.75rem', background: 'var(--primary)', color: 'var(--primary-fg)', border: 'none', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
                                    >
                                        <Eye size={14} /> View
                                    </button>
                                    <button 
                                        onClick={() => setEditingCustomer({id: c.id, name: c.name})}
                                        style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.4rem 0.75rem', background: 'var(--bg-light)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.8rem' }}
                                    >
                                        <Edit2 size={14} /> Edit
                                    </button>
                                    <button 
                                        onClick={() => handleDeleteCustomer(c.id)}
                                        style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.4rem 0.75rem', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </td>
                        </tr>
                    ))}
                    </tbody>
                </table>
            )}

            {/* --- RECENT BILLS --- */}
            {activeMainTab === "Recent Bills" && (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                    <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-color)', textAlign: 'left' }}>
                        <th style={{ padding: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Bill No</th>
                        <th style={{ padding: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Date/Time</th>
                        <th style={{ padding: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Customer</th>
                        <th style={{ padding: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'right' }}>Total</th>
                        <th style={{ padding: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'center' }}>Action</th>
                    </tr>
                    </thead>
                    <tbody>
                    {orders.length === 0 ? (
                        <tr><td colSpan={5} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>No bills found.</td></tr>
                    ) : orders.map((o, idx) => (
                        <tr key={o.id} style={{ borderBottom: '1px solid var(--border-color)', backgroundColor: idx % 2 === 0 ? 'transparent' : 'var(--bg-light)' }}>
                            <td style={{ padding: '0.875rem 0.75rem', fontWeight: 600, color: 'var(--primary)' }}>{(o as any).bill_number ? `${(o as any).bill_number}` : `#${o.id}`}</td>
                            <td style={{ padding: '0.875rem 0.75rem' }}>{new Date(o.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</td>
                            <td style={{ padding: '0.875rem 0.75rem', fontWeight: 500 }}>{o.customer_name || 'Guest'}</td>
                            <td style={{ padding: '0.875rem 0.75rem', textAlign: 'right', fontWeight: 700 }}>₹{o.total.toFixed(2)}</td>
                            <td style={{ padding: '0.875rem 0.75rem', textAlign: 'center' }}>
                                <button 
                                    onClick={() => handleReprintBill(o.id)}
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.75rem', background: 'var(--bg-light)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
                                >
                                    <Printer size={14} /> Reprint
                                </button>
                            </td>
                        </tr>
                    ))}
                    </tbody>
                </table>
            )}
          </>
        )}
      </div>

      {/* --- CUSTOMER DETAILS MODAL --- */}
      {selectedCustomer && (
          <div style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
              backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1500, padding: '1.5rem',
              backdropFilter: 'blur(6px)'
          }}>
              <div style={{
                  background: 'var(--bg-white)', width: '100%', maxWidth: '800px', maxHeight: '90vh', 
                  borderRadius: '16px', display: 'flex', flexDirection: 'column', overflow: 'hidden',
                  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                  border: '1px solid var(--border-color)'
              }}>
                  {/* Modal Header */}
                  <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-white)' }}>
                      <div>
                          <h2 style={{ margin: 0, fontSize: '1.5rem', color: 'var(--text-primary)', fontWeight: 700 }}>{selectedCustomer.name}</h2>
                          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{selectedCustomer.phone || 'No phone'}</p>
                      </div>
                      <button onClick={() => setSelectedCustomer(null)} style={{ background: 'var(--bg-light)', border: '1px solid var(--border-color)', borderRadius: '50%', padding: '0.5rem', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }} onMouseOver={e => e.currentTarget.style.color = 'var(--text-primary)'} onMouseOut={e => e.currentTarget.style.color = 'var(--text-secondary)'}><X size={20} /></button>
                  </div>

                  {/* Modal Body */}
                  <div style={{ padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.5rem', background: 'var(--bg-white)' }}>
                      
                      {/* Summary Cards */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                          <div style={{ padding: '1.25rem', background: 'var(--bg-light)', borderRadius: '0.5rem', border: '1px solid var(--border-color)' }}>
                              <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Pending Balance</p>
                              <p style={{ margin: '0.5rem 0 0 0', fontSize: '2rem', fontWeight: 700, color: selectedCustomer.credit_balance > 0 ? 'var(--error)' : 'var(--success)' }}>₹{selectedCustomer.credit_balance.toFixed(2)}</p>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', justifyContent: 'center' }}>
                              <button 
                                  onClick={handlePrintCustomerReport}
                                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.75rem', background: 'var(--bg-light)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600 }}
                              >
                                  <Printer size={16} /> Print Statement
                              </button>
                              <button 
                                  onClick={() => settleCustomerDue(selectedCustomer.id)}
                                  style={{ width: '100%', padding: '0.75rem', background: 'var(--primary)', color: 'var(--primary-fg)', border: 'none', borderRadius: '0.375rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' }}
                              >
                                  Settle All Due
                              </button>
                          </div>
                      </div>

                      {/* Record Payment Section */}
                      <div style={{ padding: '1.25rem', background: 'var(--bg-light)', borderRadius: '0.5rem', border: '1px solid var(--border-color)', display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end' }}>
                          <div style={{ flex: 1, minWidth: '150px' }}>
                              <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.5rem', fontWeight: 500 }}>Record Payment</label>
                              <input 
                                  type="number" 
                                  placeholder="Amount" 
                                  value={partialPaymentAmount}
                                  onChange={e => setPartialPaymentAmount(e.target.value)}
                                  style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)', background: 'var(--bg-light)', color: 'var(--text-primary)', fontSize: '1rem', outline: 'none' }}
                              />
                          </div>
                          <div style={{ minWidth: '120px' }}>
                              <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.5rem', fontWeight: 500 }}>Mode</label>
                              <select 
                                  value={partialPaymentMode}
                                  onChange={e => setPartialPaymentMode(e.target.value)}
                                  style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)', background: 'var(--bg-light)', color: 'var(--text-primary)', fontSize: '1rem', outline: 'none', cursor: 'pointer' }}
                              >
                                  <option>Cash</option>
                                  <option>UPI</option>
                                  <option>Card</option>
                              </select>
                          </div>
                          <button 
                              onClick={handlePartialPayment}
                              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1.25rem', background: 'var(--success, #10b981)', color: 'white', border: 'none', borderRadius: '0.375rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', height: 'fit-content' }}
                          >
                              <PlusCircle size={18} /> Record
                          </button>
                      </div>

                      {/* Transactions Table */}
                      <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                              <h4 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)' }}>Transaction History</h4>
                              <div className="date-range-picker">
                                <div className="date-input-wrapper" onClick={(e) => { const i = e.currentTarget.querySelector('input'); if(i) i.showPicker(); }}>
                                  <CalendarIcon size={14} className="date-icon" />
                                  <input type="date" value={customerDateRange.start} onChange={e => setCustomerDateRange(p => ({...p, start: e.target.value}))} className="modern-date-input" style={{ fontSize: '0.8rem' }} />
                                </div>
                                <span className="date-separator" style={{ fontSize: '0.75rem' }}>to</span>
                                <div className="date-input-wrapper" onClick={(e) => { const i = e.currentTarget.querySelector('input'); if(i) i.showPicker(); }}>
                                  <CalendarIcon size={14} className="date-icon" />
                                  <input type="date" value={customerDateRange.end} onChange={e => setCustomerDateRange(p => ({...p, end: e.target.value}))} className="modern-date-input" style={{ fontSize: '0.8rem' }} />
                                </div>
                              </div>
                          </div>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                              <thead>
                                  <tr style={{ borderBottom: '2px solid var(--border-color)', textAlign: 'left' }}>
                                      <th style={{ padding: '0.75rem' }}>Date</th>
                                      <th style={{ padding: '0.75rem' }}>Details</th>
                                      <th style={{ padding: '0.75rem', textAlign: 'right' }}>Amount</th>
                                      <th style={{ padding: '0.75rem' }}>Mode</th>
                                      <th style={{ padding: '0.75rem', textAlign: 'center' }}>Action</th>
                                  </tr>
                              </thead>
                              <tbody>
                                  {customerTransactions.length === 0 ? (
                                      <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>No history found.</td></tr>
                                  ) : customerTransactions.map((t, idx) => (
                                      <tr key={`${t.type}-${t.id}`} style={{ borderBottom: '1px solid var(--border-color)', background: idx % 2 === 0 ? 'transparent' : 'var(--bg-light)' }}>
                                          <td style={{ padding: '0.75rem' }}>{new Date(t.date).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                                          <td style={{ padding: '0.75rem', display: 'flex', alignItems: 'center' }}>
                                              <span style={{ 
                                                  padding: '0.15rem 0.4rem', borderRadius: '0.25rem', fontSize: '0.7rem', marginRight: '0.5rem',
                                                  background: t.type === 'bill' ? '#fee2e2' : '#dcfce7',
                                                  color: t.type === 'bill' ? '#dc2626' : '#16a34a',
                                                  textTransform: 'uppercase', fontWeight: 700
                                              }}>
                                                  {t.type}
                                              </span>
                                              {t.details}
                                          </td>
                                          <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 700 }}>₹{t.amount.toFixed(2)}</td>
                                          <td style={{ padding: '0.75rem', fontWeight: 500 }}>{t.mode}</td>
                                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                              {t.type === 'bill' && (
                                                  <button 
                                                      onClick={() => handleReprintBill(t.id)}
                                                      style={{ background: 'var(--bg-light)', border: '1px solid var(--border-color)', borderRadius: '0.25rem', padding: '0.3rem', cursor: 'pointer', color: 'var(--text-primary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                                      title="Reprint Bill"
                                                  >
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
      )}
    </div>
  );
}
