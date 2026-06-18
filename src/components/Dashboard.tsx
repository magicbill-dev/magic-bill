import { useState, useEffect, useMemo } from "react";
import Database from "@tauri-apps/plugin-sql";
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, 
  BarChart, Bar, PieChart, Pie, Cell, Legend
} from "recharts";
import { 
  TrendingUp, ReceiptText, IndianRupee, ShoppingCart, 
  Activity, Tag, Clock, UtensilsCrossed, CreditCard
} from "lucide-react";

interface DashboardProps {
  db: Database | null;
}

export default function Dashboard({ db }: DashboardProps) {
    const [loading, setLoading] = useState(true);
    const [isCheckingPlan, setIsCheckingPlan] = useState(true);
    const [timeRange, setTimeRange] = useState<"today" | "7d" | "30d" | "all">(() => {
        return (localStorage.getItem("dashboardTimeRange") as any) || "today";
    });
    const [isPlanExpired, setIsPlanExpired] = useState(false);
    
    // Save time range preference
    useEffect(() => {
        localStorage.setItem("dashboardTimeRange", timeRange);
    }, [timeRange]);

    // Raw Data
    const [orders, setOrders] = useState<any[]>([]);
    const [expenses, setExpenses] = useState<any[]>([]);
    const [categories, setCategories] = useState<Record<number, string>>({});

    // Fetch data whenever timeRange changes
    useEffect(() => {
        async function fetchData() {
            if (!db) return;
            setLoading(true);
            setIsCheckingPlan(true);
            try {
                // Subscription Check
                const subResult = await db.select<any[]>("SELECT * FROM subscription WHERE id = 1");
                let isExpired = true;
                if (subResult.length > 0 && subResult[0].nextBillingDate) {
                    const nextBilling = new Date(subResult[0].nextBillingDate).getTime();
                    const now = new Date().getTime();
                    const gracePeriodMs = 10 * 24 * 60 * 60 * 1000;
                    const lastChecked = subResult[0].last_checked_date ? new Date(subResult[0].last_checked_date).getTime() : 0;
                    
                    if (now < lastChecked) {
                        // Tamper detected
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

                // Fetch categories to map IDs to names
                const cats = await db.select<any[]>("SELECT * FROM categories");
                const catMap: Record<number, string> = {};
                cats.forEach(c => catMap[c.id] = c.name);
                setCategories(catMap);

                // Determine date filter for SQLite queries
                let dateFilter = "";
                if (timeRange === "today") {
                    dateFilter = `date(created_at, 'localtime') = date('now', 'localtime')`;
                } else if (timeRange === "7d") {
                    dateFilter = `date(created_at, 'localtime') >= date('now', '-7 days', 'localtime')`;
                } else if (timeRange === "30d") {
                    dateFilter = `date(created_at, 'localtime') >= date('now', '-30 days', 'localtime')`;
                } else {
                    dateFilter = "1=1"; // All time
                }

                // Expenses usually use `date` column instead of `created_at`
                const expDateFilter = dateFilter.replace(/created_at/g, 'date');

                const ordersRes = await db.select<any[]>(`SELECT * FROM finalized_orders WHERE ${dateFilter} ORDER BY created_at DESC`);
                const expensesRes = await db.select<any[]>(`SELECT * FROM expenses WHERE ${expDateFilter}`);

                setOrders(ordersRes);
                setExpenses(expensesRes);

            } catch (err) {
                console.error("Dashboard fetch error:", err);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, [db, timeRange]);

    // Compute Derived Data
    const dashboardData = useMemo(() => {
        let totalRevenue = 0;
        let totalExpenses = 0;
        let totalItemsSold = 0;
        
        const dateMap: Record<string, { Revenue: number, Expenses: number, display: string }> = {};
        const pModeMap: Record<string, number> = {};
        const oTypeMap: Record<string, number> = {};
        const itemSales: Record<number, { name: string, qty: number, revenue: number, category_id: number }> = {};

        orders.forEach(o => {
            totalRevenue += (o.total || 0);
            
            // Payment Modes
            const pMode = o.payment_mode || "Other";
            pModeMap[pMode] = (pModeMap[pMode] || 0) + (o.total || 0);

            // Order Types
            const oType = o.order_type || "Unknown";
            oTypeMap[oType] = (oTypeMap[oType] || 0) + 1;

            // Trend mapping
            let dKey, dDisplay;
            if (timeRange === "today") {
                const dateObj = new Date(o.created_at);
                if (!isNaN(dateObj.getTime())) {
                    const hour = dateObj.getHours();
                    dKey = hour.toString().padStart(2, '0');
                    const ampm = hour >= 12 ? 'PM' : 'AM';
                    const hour12 = hour % 12 || 12;
                    dDisplay = `${hour12} ${ampm}`;
                } else {
                    dKey = 'Unknown';
                    dDisplay = 'Unknown';
                }
            } else {
                dKey = o.created_at ? o.created_at.substring(0, 10) : 'Unknown';
                const dObj = new Date(dKey);
                dDisplay = isNaN(dObj.getTime()) ? dKey : dObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            }

            if (!dateMap[dKey]) dateMap[dKey] = { Revenue: 0, Expenses: 0, display: dDisplay };
            dateMap[dKey].Revenue += (o.total || 0);

            // Item extraction from cart_data JSON
            try {
                if (o.cart_data) {
                    const cart = JSON.parse(o.cart_data);
                    cart.forEach((item: any) => {
                        if (!itemSales[item.id]) {
                            itemSales[item.id] = { name: item.name, qty: 0, revenue: 0, category_id: item.category_id };
                        }
                        const qty = item.quantity || 1;
                        itemSales[item.id].qty += qty;
                        itemSales[item.id].revenue += ((item.price || 0) * qty);
                        totalItemsSold += qty;
                    });
                }
            } catch (e) {
                // Ignore parse errors for older corrupted data
            }
        });

        expenses.forEach(e => {
            totalExpenses += (e.amount || 0);
            
            let dKey, dDisplay;
            if (timeRange === "today") {
                const dateObj = new Date(e.date || e.created_at);
                if (!isNaN(dateObj.getTime())) {
                    const hour = dateObj.getHours();
                    dKey = hour.toString().padStart(2, '0');
                    const ampm = hour >= 12 ? 'PM' : 'AM';
                    const hour12 = hour % 12 || 12;
                    dDisplay = `${hour12} ${ampm}`;
                } else {
                    dKey = 'Unknown';
                    dDisplay = 'Unknown';
                }
            } else {
                dKey = (e.date || e.created_at) ? (e.date || e.created_at).substring(0, 10) : 'Unknown';
                const dObj = new Date(dKey);
                dDisplay = isNaN(dObj.getTime()) ? dKey : dObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            }

            if (!dateMap[dKey]) dateMap[dKey] = { Revenue: 0, Expenses: 0, display: dDisplay };
            dateMap[dKey].Expenses += (e.amount || 0);
        });

        // Trend Data Array - sorted chronologically by key
        let trendData = Object.keys(dateMap).sort().map(key => ({
            rawDate: key,
            name: dateMap[key].display,
            Revenue: dateMap[key].Revenue,
            Expenses: dateMap[key].Expenses
        }));

        // Fix Recharts AreaChart issue with single data point by duplicating it
        if (trendData.length === 1) {
            trendData = [
                { ...trendData[0], name: trendData[0].name + " (Start)" },
                { ...trendData[0], name: trendData[0].name + " (End)" }
            ];
        }

        // Top Items by Quantity Sold
        const topItems = Object.values(itemSales).sort((a, b) => b.qty - a.qty).slice(0, 5);

        // Category Sales (Revenue per Category)
        const catSalesMap: Record<string, number> = {};
        Object.values(itemSales).forEach(item => {
            const catName = categories[item.category_id] || "Uncategorized";
            catSalesMap[catName] = (catSalesMap[catName] || 0) + item.revenue;
        });
        const categoryData = Object.keys(catSalesMap)
            .map(k => ({ name: k, value: catSalesMap[k] }))
            .sort((a,b) => b.value - a.value)
            .slice(0, 5); // Top 5 categories to avoid clutter

        // Recent Orders
        const recentOrders = orders.slice(0, 6);

        return {
            totalRevenue,
            totalOrders: orders.length,
            aov: orders.length > 0 ? totalRevenue / orders.length : 0,
            totalItemsSold,
            totalExpenses,
            netProfit: totalRevenue - totalExpenses,
            trendData,
            paymentData: Object.keys(pModeMap).map(k => ({ name: k, value: pModeMap[k] })),
            orderTypeData: Object.keys(oTypeMap).map(k => ({ name: k, orders: oTypeMap[k] })),
            topItems,
            categoryData,
            recentOrders
        };
    }, [orders, expenses, categories]);

    const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444', '#ec4899', '#06b6d4', '#14b8a6'];

    if (isCheckingPlan) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', backgroundColor: 'var(--bg-light)' }}>
                <Activity className="text-blink" size={32} color="var(--primary)" />
            </div>
        );
    }

    if (isPlanExpired) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', backgroundColor: 'var(--bg-dark, #0f172a)', color: 'white', padding: '2rem', borderRadius: '8px' }}>
                <style>{`
                  @keyframes pulseRed {
                     0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
                     70% { box-shadow: 0 0 0 20px rgba(239, 68, 68, 0); }
                     100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
                  }
                  .upgrade-btn {
                     display: inline-flex;
                     align-items: center;
                     justify-content: center;
                     background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
                     color: white;
                     font-weight: 600;
                     font-size: 1.1rem;
                     padding: 0.875rem 2rem;
                     border-radius: 0.75rem;
                     text-decoration: none;
                     transition: all 0.2s ease;
                     box-shadow: 0 4px 15px -3px rgba(239, 68, 68, 0.5);
                     border: 1px solid rgba(255,255,255,0.1);
                     animation: pulseRed 2s infinite;
                  }
                  .upgrade-btn:hover {
                     transform: translateY(-2px);
                     box-shadow: 0 8px 25px -5px rgba(239, 68, 68, 0.6);
                     filter: brightness(1.1);
                  }
                `}</style>
                <div style={{ 
                    background: 'rgba(255,255,255,0.02)', 
                    border: '1px solid rgba(255,255,255,0.05)', 
                    padding: '3rem', 
                    borderRadius: '1.5rem', 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'center',
                    maxWidth: '500px',
                    textAlign: 'center',
                    boxShadow: '0 20px 40px -10px rgba(0,0,0,0.5)'
                }}>
                    <div style={{ 
                        width: '80px', height: '80px', 
                        borderRadius: '50%', 
                        background: 'rgba(239, 68, 68, 0.1)', 
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        marginBottom: '1.5rem',
                        border: '1px solid rgba(239, 68, 68, 0.2)'
                    }}>
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                        </svg>
                    </div>
                    <h2 style={{ fontSize: '2rem', margin: '0 0 1rem 0', color: '#f8fafc', fontWeight: 800, letterSpacing: '-0.02em' }}>
                        You don't have an active plan
                    </h2>
                    <p style={{ color: '#94a3b8', margin: '0 0 2.5rem 0', fontSize: '1rem', lineHeight: '1.6' }}>
                        Your subscription has expired or hasn't been activated. Upgrade your plan to restore access to the Dashboard, Reports, and all premium features.
                    </p>
                    <a href="https://magicbill.in" target="_blank" rel="noopener noreferrer" className="upgrade-btn">
                        Activate Plan Now
                    </a>
                </div>
            </div>
        );
    }

    return (
        <div className="dash-wrapper" style={{ position: 'relative' }}>
            <style>{`
                .dash-wrapper {
                    padding: 1.5rem;
                    display: flex;
                    flex-direction: column;
                    gap: 1.5rem;
                    overflow-y: auto;
                    height: 100%;
                    background: var(--bg-light); 
                    color: var(--text-primary);
                }
                .dash-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .dash-title {
                    font-size: 1.6rem;
                    font-weight: 800;
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                }
                .time-selector {
                    padding: 0.5rem 1rem;
                    border-radius: 0.75rem;
                    border: 1px solid var(--border-color);
                    background: var(--bg-light);
                    color: var(--text-primary);
                    font-weight: 600;
                    outline: none;
                    cursor: pointer;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.05);
                    transition: all 0.2s ease;
                }
                .time-selector:hover {
                    border-color: var(--primary);
                }
                .kpi-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
                    gap: 1.5rem;
                }
                .kpi-box {
                    background: var(--bg-light);
                    border: 1px solid var(--border-color);
                    border-radius: 1.25rem;
                    padding: 1.5rem;
                    position: relative;
                    overflow: hidden;
                    box-shadow: 0 4px 20px -5px rgba(0, 0, 0, 0.08);
                    display: flex;
                    flex-direction: column;
                    gap: 0.75rem;
                    transition: transform 0.2s ease, box-shadow 0.2s ease;
                }
                .kpi-box:hover {
                    transform: translateY(-4px);
                    box-shadow: 0 8px 25px -5px rgba(0, 0, 0, 0.12);
                }
                .kpi-box::before {
                    content: '';
                    position: absolute;
                    top: 0; left: 0; right: 0; height: 5px;
                    background: var(--kpi-color);
                }
                .kpi-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    color: var(--text-secondary);
                    font-weight: 600;
                    font-size: 0.95rem;
                }
                .kpi-icon-wrap {
                    width: 42px;
                    height: 42px;
                    border-radius: 0.75rem;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    background: color-mix(in srgb, var(--kpi-color) 15%, transparent);
                    color: var(--kpi-color);
                }
                .kpi-value {
                    font-size: 2.2rem;
                    font-weight: 800;
                    line-height: 1.1;
                }
                .chart-grid {
                    display: grid;
                    grid-template-columns: 2fr 1fr;
                    gap: 1.5rem;
                }
                .bottom-grid {
                    display: grid;
                    grid-template-columns: 1fr 2fr;
                    gap: 1.5rem;
                }
                .dash-panel {
                    background: var(--bg-light);
                    border: 1px solid var(--border-color);
                    border-radius: 1.25rem;
                    padding: 1.5rem;
                    box-shadow: 0 4px 20px -5px rgba(0, 0, 0, 0.08);
                    display: flex;
                    flex-direction: column;
                    position: relative;
                }
                .panel-title {
                    font-size: 1.1rem;
                    font-weight: 700;
                    margin-bottom: 1.25rem;
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                }
                .list-item {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 0.85rem 0;
                    border-bottom: 1px solid var(--border-color);
                }
                .list-item:last-child { border-bottom: none; }
                .item-info {
                    display: flex;
                    flex-direction: column;
                    gap: 0.2rem;
                }
                .item-name { font-weight: 600; font-size: 0.95rem; }
                .item-meta { font-size: 0.8rem; color: var(--text-secondary); }
                .item-value { font-weight: 700; font-size: 0.95rem; }
                
                .recent-table { width: 100%; border-collapse: collapse; }
                .recent-table th {
                    text-align: left;
                    padding: 0.75rem 0.5rem;
                    color: var(--text-secondary);
                    font-weight: 600;
                    font-size: 0.85rem;
                    border-bottom: 2px solid var(--border-color);
                }
                .recent-table td {
                    padding: 0.85rem 0.5rem;
                    border-bottom: 1px solid var(--border-color);
                    font-size: 0.95rem;
                }
                .recent-table tr:last-child td { border-bottom: none; }
                .badge {
                    padding: 0.25rem 0.6rem;
                    border-radius: 0.35rem;
                    font-size: 0.75rem;
                    font-weight: 700;
                    background: var(--bg-color);
                    border: 1px solid var(--border-color);
                }
                .loader-overlay {
                    position: absolute;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0, 0, 0, 0.7);
                    backdrop-filter: blur(2px);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    z-index: 10;
                    border-radius: inherit;
                }
                
                @media (max-width: 1200px) {
                    .chart-grid { grid-template-columns: 1fr; }
                    .bottom-grid { grid-template-columns: 1fr; }
                }
                @media (max-width: 768px) {
                    .bottom-grid { grid-template-columns: 1fr; }
                }
            `}</style>

            <div className="dash-header">
                <div className="dash-title">
                    <Activity size={28} color="var(--primary)" />
                    Business Overview
                </div>
                <select 
                    className="time-selector" 
                    value={timeRange} 
                    onChange={(e) => setTimeRange(e.target.value as any)}
                >
                    <option value="today">Today</option>
                    <option value="7d">Last 7 Days</option>
                    <option value="30d">Last 30 Days</option>
                    <option value="all">All Time</option>
                </select>
            </div>

            {/* Top KPIs */}
            <div className="kpi-grid">
                <div className="kpi-box" style={{ '--kpi-color': '#10b981' } as React.CSSProperties}>
                    <div className="kpi-header">
                        <span>Gross Revenue</span>
                        <div className="kpi-icon-wrap"><IndianRupee size={22} /></div>
                    </div>
                    <div className="kpi-value">₹{dashboardData.totalRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                </div>

                <div className="kpi-box" style={{ '--kpi-color': '#3b82f6' } as React.CSSProperties}>
                    <div className="kpi-header">
                        <span>Total Orders</span>
                        <div className="kpi-icon-wrap"><ReceiptText size={22} /></div>
                    </div>
                    <div className="kpi-value">{dashboardData.totalOrders}</div>
                </div>

                <div className="kpi-box" style={{ '--kpi-color': '#8b5cf6' } as React.CSSProperties}>
                    <div className="kpi-header">
                        <span>Avg. Order Value</span>
                        <div className="kpi-icon-wrap"><ShoppingCart size={22} /></div>
                    </div>
                    <div className="kpi-value">₹{dashboardData.aov.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                </div>

                <div className="kpi-box" style={{ '--kpi-color': '#f59e0b' } as React.CSSProperties}>
                    <div className="kpi-header">
                        <span>Net Profit</span>
                        <div className="kpi-icon-wrap"><TrendingUp size={22} /></div>
                    </div>
                    <div className="kpi-value" style={{ color: dashboardData.netProfit >= 0 ? 'inherit' : '#ef4444' }}>
                        ₹{dashboardData.netProfit.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                </div>
            </div>

            {/* Middle Section: Trend Chart & Category/Payment Analytics */}
            <div className="chart-grid">
                <div className="dash-panel" style={{ minHeight: '350px' }}>
                    {loading && <div className="loader-overlay"><Activity className="text-blink" size={32} color="var(--primary)"/></div>}
                    <div className="panel-title"><TrendingUp size={20} /> Revenue vs Expenses Trend</div>
                    <div style={{ flex: 1, width: '100%', minHeight: '300px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={dashboardData.trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                    </linearGradient>
                                    <linearGradient id="colorExp" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4}/>
                                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                                <XAxis dataKey="name" stroke="var(--text-secondary)" tick={{fontSize: 12}} axisLine={false} tickLine={false} />
                                <YAxis stroke="var(--text-secondary)" tick={{fontSize: 12}} axisLine={false} tickLine={false} tickFormatter={(val) => `₹${val}`} />
                                <RechartsTooltip 
                                    contentStyle={{ backgroundColor: 'var(--bg-light)', border: '1px solid var(--border-color)', borderRadius: '0.75rem', boxShadow: '0 4px 10px rgba(0,0,0,0.1)' }}
                                    itemStyle={{ fontWeight: 600 }}
                                />
                                <Legend wrapperStyle={{ paddingTop: '10px' }} />
                                <Area type="monotone" name="Revenue" dataKey="Revenue" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
                                <Area type="monotone" name="Expenses" dataKey="Expenses" stroke="#ef4444" strokeWidth={3} fillOpacity={1} fill="url(#colorExp)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Merged Category & Payment Analytics */}
                <div className="dash-panel" style={{ minHeight: '400px' }}>
                    {loading && <div className="loader-overlay"><Activity className="text-blink" size={32} color="var(--primary)"/></div>}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {/* Sales by Category */}
                        <div style={{ flex: 1.5, minHeight: '240px', display: 'flex', flexDirection: 'column' }}>
                            <div className="panel-title" style={{ marginBottom: '0.25rem' }}><Tag size={20} /> Sales by Category</div>
                            <div style={{ flex: 1, width: '100%', position: 'relative' }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={dashboardData.categoryData}
                                            cx="50%" cy="45%"
                                            innerRadius={45} outerRadius={70}
                                            paddingAngle={3}
                                            dataKey="value"
                                            stroke="none"
                                        >
                                            {dashboardData.categoryData.map((_entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <RechartsTooltip 
                                            formatter={(value: any) => `₹${Number(value).toFixed(2)}`} 
                                            contentStyle={{ backgroundColor: 'var(--bg-light)', border: '1px solid var(--border-color)', borderRadius: '0.75rem' }} 
                                        />
                                        <Legend verticalAlign="bottom" align="center" iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        <div style={{ height: '1px', background: 'var(--border-color)', opacity: 0.5 }}></div>

                        {/* Payment Modes */}
                        <div style={{ flex: 1, minHeight: '120px', display: 'flex', flexDirection: 'column' }}>
                            <div className="panel-title" style={{ marginBottom: '0.5rem' }}><CreditCard size={20} /> Payment Modes</div>
                            <div style={{ flex: 1 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={dashboardData.paymentData} layout="vertical" margin={{ top: 0, right: 30, left: 0, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="var(--border-color)" />
                                        <XAxis type="number" hide />
                                        <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{fontSize: 11, fill: 'var(--text-primary)'}} width={65} />
                                        <RechartsTooltip 
                                            formatter={(value: any) => `₹${Number(value).toFixed(2)}`}
                                            cursor={{fill: 'rgba(128,128,128,0.1)'}}
                                            contentStyle={{ backgroundColor: 'var(--bg-light)', border: '1px solid var(--border-color)', borderRadius: '0.75rem' }}
                                        />
                                        <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={18}>
                                            {dashboardData.paymentData.map((_entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[(index + 4) % COLORS.length]} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom Section: Top Items & Recent Orders */}
            <div className="bottom-grid">
                
                {/* Top Selling Items */}
                <div className="dash-panel">
                    {loading && <div className="loader-overlay"><Activity className="text-blink" size={32} color="var(--primary)"/></div>}
                    <div className="panel-title"><UtensilsCrossed size={20} /> Top Selling Items</div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                        {dashboardData.topItems.length > 0 ? (
                            dashboardData.topItems.map((item, idx) => (
                                <div key={idx} className="list-item">
                                    <div className="item-info">
                                        <span className="item-name">{item.name}</span>
                                        <span className="item-meta">{item.qty} units sold</span>
                                    </div>
                                    <span className="item-value" style={{ color: '#10b981' }}>₹{item.revenue.toFixed(2)}</span>
                                </div>
                            ))
                        ) : (
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
                                No sales data found.
                            </div>
                        )}
                    </div>
                </div>

                {/* Recent Orders */}
                <div className="dash-panel" style={{ overflowX: 'auto' }}>
                    {loading && <div className="loader-overlay"><Activity className="text-blink" size={32} color="var(--primary)"/></div>}
                    <div className="panel-title" style={{ marginBottom: '1rem' }}><Clock size={20} /> Recent Orders</div>
                    {dashboardData.recentOrders.length > 0 ? (
                        <table className="recent-table">
                            <thead>
                                <tr>
                                    <th>Bill No</th>
                                    <th>Date & Time</th>
                                    <th>Type</th>
                                    <th>Mode</th>
                                    <th style={{ textAlign: 'right' }}>Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {dashboardData.recentOrders.map((order, idx) => (
                                    <tr key={idx}>
                                        <td style={{ fontWeight: 600 }}>{order.bill_number || `#${order.id}`}</td>
                                        <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                            {order.created_at ? new Date(order.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) : 'Unknown'}
                                        </td>
                                        <td><span className="badge">{order.order_type || 'Unknown'}</span></td>
                                        <td>{order.payment_mode || 'Cash'}</td>
                                        <td style={{ textAlign: 'right', fontWeight: 700, color: '#10b981' }}>
                                            ₹{(order.total || 0).toFixed(2)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
                            No recent orders found in this period.
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
}
