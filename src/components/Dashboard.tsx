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

const getThemeColors = (): string[] => {
  const style = getComputedStyle(document.documentElement);
  return [
    style.getPropertyValue('--chart-1').trim() || '#34d399',
    style.getPropertyValue('--chart-2').trim() || '#60a5fa',
    style.getPropertyValue('--chart-3').trim() || '#fbbf24',
    style.getPropertyValue('--chart-4').trim() || '#a78bfa',
    style.getPropertyValue('--chart-5').trim() || '#f87171',
    style.getPropertyValue('--chart-6').trim() || '#f472b6',
    style.getPropertyValue('--chart-7').trim() || '#22d3ee',
    style.getPropertyValue('--chart-8').trim() || '#2dd4bf',
  ];
};



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

    const COLORS = getThemeColors();

    if (isCheckingPlan) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', backgroundColor: 'var(--bg-light)' }}>
                <Activity className="text-blink" size={32} color="var(--primary)" />
            </div>
        );
    }

    if (isPlanExpired) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', padding: 'var(--space-8)', borderRadius: 'var(--radius-md)' }}>
                
                <div style={{ 
                    background: 'var(--bg-inset)', 
                    border: 'var(--border-thin) solid var(--border-subtle)', 
                    padding: '3rem', 
                    borderRadius: 'var(--radius-2xl)', 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'center',
                    maxWidth: '500px',
                    textAlign: 'center',
                    boxShadow: 'var(--shadow-xl)'
                }}>
                    <div style={{ 
                        width: '80px', height: '80px', 
                        borderRadius: '50%', 
                        background: 'var(--danger-subtle)', 
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        marginBottom: 'var(--space-6)',
                        border: 'var(--border-thin) solid color-mix(in srgb, var(--danger) 30%, transparent)'
                    }}>
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                        </svg>
                    </div>
                    <h2 style={{ fontSize: 'var(--text-3xl)', margin: '0 0 1rem 0', color: 'var(--text-primary)', fontWeight: 'var(--font-bold)', letterSpacing: '-0.02em' }}>
                        You don't have an active plan
                    </h2>
                    <p style={{ color: 'var(--text-secondary)', margin: '0 0 2.5rem 0', fontSize: 'var(--text-base)', lineHeight: '1.6' }}>
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
                <div className="kpi-box" style={{ '--kpi-color': 'var(--success)' } as React.CSSProperties}>
                    <div className="kpi-header">
                        <span>Gross Revenue</span>
                        <div className="kpi-icon-wrap"><IndianRupee size={22} /></div>
                    </div>
                    <div className="kpi-value">₹{dashboardData.totalRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                </div>

                <div className="kpi-box" style={{ '--kpi-color': 'var(--info)' } as React.CSSProperties}>
                    <div className="kpi-header">
                        <span>Total Orders</span>
                        <div className="kpi-icon-wrap"><ReceiptText size={22} /></div>
                    </div>
                    <div className="kpi-value">{dashboardData.totalOrders}</div>
                </div>

                <div className="kpi-box" style={{ '--kpi-color': 'var(--chart-4)' } as React.CSSProperties}>
                    <div className="kpi-header">
                        <span>Avg. Order Value</span>
                        <div className="kpi-icon-wrap"><ShoppingCart size={22} /></div>
                    </div>
                    <div className="kpi-value">₹{dashboardData.aov.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                </div>

                <div className="kpi-box" style={{ '--kpi-color': 'var(--warning)' } as React.CSSProperties}>
                    <div className="kpi-header">
                        <span>Net Profit</span>
                        <div className="kpi-icon-wrap"><TrendingUp size={22} /></div>
                    </div>
                    <div className="kpi-value" style={{ color: dashboardData.netProfit >= 0 ? 'inherit' : 'var(--danger)' }}>
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
                                        <stop offset="5%" stopColor="var(--success)" stopOpacity={0.4}/>
                                        <stop offset="95%" stopColor="var(--success)" stopOpacity={0}/>
                                    </linearGradient>
                                    <linearGradient id="colorExp" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="var(--danger)" stopOpacity={0.4}/>
                                        <stop offset="95%" stopColor="var(--danger)" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                                <XAxis dataKey="name" stroke="var(--text-secondary)" tick={{fontSize: 12}} axisLine={false} tickLine={false} />
                                <YAxis stroke="var(--text-secondary)" tick={{fontSize: 12}} axisLine={false} tickLine={false} tickFormatter={(val) => `₹${val}`} />
                                <RechartsTooltip 
                                    contentStyle={{ backgroundColor: 'var(--bg-light)', border: 'var(--border-thin) solid var(--border-color)', borderRadius: 'var(--radius-lg)', boxShadow: '0 4px 10px rgba(0,0,0,0.1)' }}
                                    itemStyle={{ fontWeight: 'var(--font-semibold)' }}
                                />
                                <Legend wrapperStyle={{ paddingTop: '10px' }} />
                                <Area type="monotone" name="Revenue" dataKey="Revenue" stroke="var(--success)" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
                                <Area type="monotone" name="Expenses" dataKey="Expenses" stroke="var(--danger)" strokeWidth={3} fillOpacity={1} fill="url(#colorExp)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Merged Category & Payment Analytics */}
                <div className="dash-panel" style={{ minHeight: '400px' }}>
                    {loading && <div className="loader-overlay"><Activity className="text-blink" size={32} color="var(--primary)"/></div>}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
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
                                            contentStyle={{ backgroundColor: 'var(--bg-light)', border: 'var(--border-thin) solid var(--border-color)', borderRadius: 'var(--radius-lg)' }} 
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
                                            contentStyle={{ backgroundColor: 'var(--bg-light)', border: 'var(--border-thin) solid var(--border-color)', borderRadius: 'var(--radius-lg)' }}
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
                                    <span className="item-value" style={{ color: 'var(--success)' }}>₹{item.revenue.toFixed(2)}</span>
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
                    <div className="panel-title" style={{ marginBottom: 'var(--space-4)' }}><Clock size={20} /> Recent Orders</div>
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
                                        <td style={{ fontWeight: 'var(--font-semibold)' }}>{order.bill_number || `#${order.id}`}</td>
                                        <td style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
                                            {order.created_at ? new Date(order.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) : 'Unknown'}
                                        </td>
                                        <td><span className="badge">{order.order_type || 'Unknown'}</span></td>
                                        <td>{order.payment_mode || 'Cash'}</td>
                                        <td style={{ textAlign: 'right', fontWeight: 'var(--font-bold)', color: 'var(--success)' }}>
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
