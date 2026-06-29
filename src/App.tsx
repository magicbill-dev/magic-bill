import { useState, useEffect } from "react";
import Database from "@tauri-apps/plugin-sql";
import { open } from "@tauri-apps/plugin-dialog";
import { join } from "@tauri-apps/api/path";
import { getVersion } from "@tauri-apps/api/app";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import {
  LayoutDashboard,
  ReceiptText,
  UtensilsCrossed,
  Settings,
  TrendingUp,
  Wallet,
  Users,
  Receipt,
  Printer,
  FolderOpen,
  DownloadCloud,
  RefreshCw,
  XCircle,
  UserCircle
} from "lucide-react";
import MenuManagement from "./components/MenuManagement";
import GeneralSettings from "./components/GeneralSettings";
import PrinterSettings from "./components/PrinterSettings";
import BillSettings from "./components/BillSettings";
import StaffManagement from "./components/StaffManagement";
import ExpenseTracker from "./components/ExpenseTracker";
import Dashboard from "./components/Dashboard";
import Billing from "./components/Billing";
import Reports from "./components/Reports";
import Account from "./components/Account";
import { firestore } from "./firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { getDeviceInfo } from "./device";
import "./App.css";

function App() {
  const [activeTab, setActiveTab] = useState("Dashboard");
  const [db, setDb] = useState<Database | null>(null);
  const [loading, setLoading] = useState(true);
  // ---- Update system ----
  // updateInfo: persistent "an update exists" flag that drives the sidebar chip.
  const [updateInfo, setUpdateInfo] = useState<{ available: boolean; version?: string }>({ available: false });
  const [checking, setChecking] = useState(false); // inline spinner during a manual check
  const [install, setInstall] = useState<{ state: 'idle' | 'downloading' | 'error'; progress: number; error?: string }>({ state: 'idle', progress: 0 });
  const [showUpdateModal, setShowUpdateModal] = useState(false); // install dialog
  const [showUpdateNotif, setShowUpdateNotif] = useState(false); // auto-check snackbar (skippable)
  const [updateToast, setUpdateToast] = useState<string | null>(null); // transient status (e.g. "up to date")
  const [dbFolderPath, setDbFolderPath] = useState<string | null>(() => localStorage.getItem("dbFolderPath"));
  const [appVersion, setAppVersion] = useState<string>("");

  // Fetch app version on startup (no update check here — keeps launch fast)
  useEffect(() => {
    async function fetchVersion() {
      try {
        const version = await getVersion();
        setAppVersion(version);
      } catch (error) {
        console.error("Failed to get app version:", error);
      }
    }
    fetchVersion();
  }, []);

  // Check for an update. `manual` = user clicked the chip (show modal/toast);
  // otherwise it's the silent auto-check (raises a skippable notification).
  const runCheck = async (manual: boolean) => {
    if (checking || install.state === 'downloading') return;
    try {
      if (manual) setChecking(true);
      const update = await check();
      if (update) {
        setUpdateInfo({ available: true, version: update.version });
        if (manual) setShowUpdateModal(true);
        else setShowUpdateNotif(true);
      } else {
        setUpdateInfo({ available: false });
        if (manual) setUpdateToast("You're on the latest version ✓");
      }
    } catch (error: any) {
      console.error("Failed to check for updates:", error);
      if (manual) setUpdateToast("Couldn't check for updates. Try again later.");
    } finally {
      setChecking(false);
    }
  };

  const startInstall = async () => {
    try {
      setInstall({ state: 'downloading', progress: 0 });
      const update = await check();
      if (!update) {
        // No longer available (already updated elsewhere)
        setInstall({ state: 'idle', progress: 0 });
        setUpdateInfo({ available: false });
        setShowUpdateModal(false);
        return;
      }
      let downloaded = 0;
      let contentLength = 0;
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            contentLength = event.data.contentLength || 0;
            break;
          case 'Progress':
            downloaded += event.data.chunkLength;
            if (contentLength > 0) {
              setInstall({ state: 'downloading', progress: Math.round((downloaded / contentLength) * 100) });
            }
            break;
          case 'Finished':
            setInstall({ state: 'downloading', progress: 100 });
            break;
        }
      });
      await relaunch();
    } catch (error: any) {
      console.error("Failed to update:", error);
      setInstall({ state: 'error', progress: 0, error: error?.message || String(error) });
    }
  };

  // Auto-check once, 5 minutes after launch (kept off the startup path so the
  // app loads fast). If an update is found it raises a skippable notification.
  useEffect(() => {
    const t = setTimeout(() => { runCheck(false); }, 5 * 60 * 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-dismiss the transient status toast.
  useEffect(() => {
    if (!updateToast) return;
    const t = setTimeout(() => setUpdateToast(null), 3500);
    return () => clearTimeout(t);
  }, [updateToast]);

  // Initialize Database
  useEffect(() => {
    async function initDb() {
      if (!dbFolderPath) {
        setLoading(false);
        return;
      }
      try {
        const fullDbPath = await join(dbFolderPath, "restaurant.db");
        const dbInstance = await Database.load(`sqlite:${fullDbPath}`);
        setDb(dbInstance);

        // Create Tables
        await dbInstance.execute(`
          CREATE TABLE IF NOT EXISTS subscription (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            status TEXT,
            planId TEXT,
            subscriptionId TEXT,
            nextBillingDate TEXT,
            updatedAt TEXT,
            last_checked_date TEXT
          );
        `);

        try { await dbInstance.execute(`ALTER TABLE subscription ADD COLUMN last_checked_date TEXT`); } catch(e) {}

        // Initialize subscription if empty
        await dbInstance.execute(`INSERT OR IGNORE INTO subscription (id) VALUES (1)`);

        await dbInstance.execute(`
          CREATE TABLE IF NOT EXISTS store_settings (
            id INTEGER PRIMARY KEY CHECK (id = 1), -- Ensure only one row exists
            hotel_name TEXT,
            address TEXT,
            phone_number TEXT,
            gst_number TEXT,
            fssai_number TEXT
          );
        `);

        await dbInstance.execute(`
          CREATE TABLE IF NOT EXISTS printer_settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            printer_mode TEXT,
            default_printer TEXT,
            kot_printing_style TEXT,
            token_reset_daily BOOLEAN,
            token_starting_number INTEGER,
            bill_reset_daily BOOLEAN,
            bill_starting_number INTEGER,
            paper_size TEXT,
            print_bold BOOLEAN
          );
        `);

        await dbInstance.execute(`
          CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE
          );
        `);

        await dbInstance.execute(`
          CREATE TABLE IF NOT EXISTS category_printers (
            category_id INTEGER PRIMARY KEY,
            printer_name TEXT,
            FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
          );
        `);

        await dbInstance.execute(`
          CREATE TABLE IF NOT EXISTS items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category_id INTEGER,
            name TEXT NOT NULL,
            price REAL NOT NULL,
            FOREIGN KEY (category_id) REFERENCES categories(id)
          );
        `);

        await dbInstance.execute(`
          CREATE TABLE IF NOT EXISTS bill_settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            footer_message TEXT,
            show_gst BOOLEAN DEFAULT 1,
            show_fssai BOOLEAN DEFAULT 1,
            show_address BOOLEAN DEFAULT 1,
            show_phone BOOLEAN DEFAULT 1,
            bill_font_size TEXT DEFAULT 'Medium'
          );
        `);

        // Migration for new bill_settings columns
        const addColumn = async (table: string, column: string, type: string, def: string) => {
          try {
            await dbInstance.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${type} DEFAULT ${def}`);
          } catch (e) {
            // Column might already exist, ignore
          }
        };

        await addColumn('bill_settings', 'printer_size', 'TEXT', "'3inch'");
        await addColumn('bill_settings', 'header_font_family', 'TEXT', "'monospace'");
        await addColumn('bill_settings', 'header_font_size', 'TEXT', "'16px'");
        await addColumn('bill_settings', 'body_font_family', 'TEXT', "'monospace'");
        await addColumn('bill_settings', 'body_font_size', 'TEXT', "'12px'");
        await addColumn('bill_settings', 'footer_font_family', 'TEXT', "'monospace'");
        await addColumn('bill_settings', 'footer_font_size', 'TEXT', "'12px'");
        await addColumn('bill_settings', 'gst_enabled', 'BOOLEAN', "1");
        await addColumn('bill_settings', 'gst_type', 'TEXT', "'Exclusive'");
        await addColumn('bill_settings', 'show_cashier_name', 'BOOLEAN', "1");
        await addColumn('bill_settings', 'gst_percentage', 'REAL', "5");
        await addColumn('bill_settings', 'row_height', 'TEXT', "'4px'");
        await addColumn('bill_settings', 'logo_position', 'TEXT', "'none'");
        await addColumn('bill_settings', 'logo_size', 'INTEGER', "50");
        await addColumn('bill_settings', 'logo_opacity', 'REAL', "0.2");
        await addColumn('bill_settings', 'logo_base64', 'TEXT', "''");
        await addColumn('bill_settings', 'show_line_separators', 'BOOLEAN', "1");
        await addColumn('bill_settings', 'show_token', 'BOOLEAN', "1");

        // New granular settings for Bill
        await addColumn('bill_settings', 'sep_header', 'BOOLEAN', "1");
        await addColumn('bill_settings', 'sep_meta', 'BOOLEAN', "1");
        await addColumn('bill_settings', 'sep_token', 'BOOLEAN', "1");
        await addColumn('bill_settings', 'sep_table_header', 'BOOLEAN', "1");
        await addColumn('bill_settings', 'sep_table_body', 'BOOLEAN', "1");
        await addColumn('bill_settings', 'sep_subtotals', 'BOOLEAN', "1");
        await addColumn('bill_settings', 'sep_grand_total', 'BOOLEAN', "1");
        await addColumn('bill_settings', 'store_name_size', 'TEXT', "'16px'");
        await addColumn('bill_settings', 'address_size', 'TEXT', "'12px'");
        await addColumn('bill_settings', 'table_font_size', 'TEXT', "'12px'");
        await addColumn('bill_settings', 'total_font_size', 'TEXT', "'12px'");

        await addColumn('printer_settings', 'paper_size', 'TEXT', "'3inch'");
        await addColumn('printer_settings', 'print_bold', 'BOOLEAN', "0");
        await addColumn('printer_settings', 'bill_prefix', 'TEXT', "''");
        await addColumn('printer_settings', 'bill_current_number', 'INTEGER', "0");
        await addColumn('printer_settings', 'token_current_number', 'INTEGER', "100");
        await addColumn('printer_settings', 'token_print_size', 'TEXT', "'Large'");
        await addColumn('printer_settings', 'last_reset_date', 'TEXT', "''");
        await addColumn('printer_settings', 'kot_print_confirmation', 'BOOLEAN', "0");
        await addColumn('printer_settings', 'bill_print_confirmation', 'BOOLEAN', "0");
        await addColumn('printer_settings', 'disable_kot', 'BOOLEAN', "0");

        // UPI and QR Settings
        await addColumn('store_settings', 'upi_id', 'TEXT', "''");
        await addColumn('store_settings', 'merchant_name', 'TEXT', "''");
        await addColumn('store_settings', 'payment_reference', 'TEXT', "''");
        await addColumn('bill_settings', 'dynamic_upi_qr', 'BOOLEAN', "0");
        await addColumn('bill_settings', 'static_upi_qr', 'BOOLEAN', "0");
        await addColumn('bill_settings', 'no_qr_print', 'BOOLEAN', "1");
        await addColumn('bill_settings', 'search_match_mode', 'TEXT', "'starts'");

        // Unified font + per-section bold (applies to Bill and KOT previews)
        await addColumn('bill_settings', 'global_font_family', 'TEXT', "'monospace'");
        await addColumn('bill_settings', 'store_name_bold', 'BOOLEAN', "1");
        await addColumn('bill_settings', 'address_bold', 'BOOLEAN', "0");
        await addColumn('bill_settings', 'table_bold', 'BOOLEAN', "0");
        await addColumn('bill_settings', 'total_bold', 'BOOLEAN', "1");
        await addColumn('bill_settings', 'footer_bold', 'BOOLEAN', "0");

        await dbInstance.execute(`
          CREATE TABLE IF NOT EXISTS kot_settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            header_font_family TEXT DEFAULT 'monospace',
            header_font_size TEXT DEFAULT '16px',
            body_font_family TEXT DEFAULT 'monospace',
            body_font_size TEXT DEFAULT '12px',
            row_height TEXT DEFAULT '4px 0',
            show_line_separators BOOLEAN DEFAULT 1
          );
        `);

        // Initialize kot_settings if empty
        await dbInstance.execute(`INSERT OR IGNORE INTO kot_settings (id) VALUES (1)`);

        await addColumn('kot_settings', 'show_token', 'BOOLEAN', "1");
        
        // New granular settings for KOT
        await addColumn('kot_settings', 'sep_token', 'BOOLEAN', "1");
        await addColumn('kot_settings', 'sep_header', 'BOOLEAN', "1");
        await addColumn('kot_settings', 'sep_meta', 'BOOLEAN', "1");
        await addColumn('kot_settings', 'sep_table_header', 'BOOLEAN', "1");
        await addColumn('kot_settings', 'sep_table_body', 'BOOLEAN', "1");
        await addColumn('kot_settings', 'table_font_size', 'TEXT', "'12px'");

        // Per-content visibility, sizing and styling for KOT
        await addColumn('kot_settings', 'show_kot_title', 'BOOLEAN', "1");
        await addColumn('kot_settings', 'show_bill_no', 'BOOLEAN', "1");
        await addColumn('kot_settings', 'show_order_type', 'BOOLEAN', "1");
        await addColumn('kot_settings', 'show_table', 'BOOLEAN', "1");
        await addColumn('kot_settings', 'show_date', 'BOOLEAN', "1");
        await addColumn('kot_settings', 'meta_font_size', 'TEXT', "'12px'");
        await addColumn('kot_settings', 'title_bold', 'BOOLEAN', "1");
        await addColumn('kot_settings', 'meta_bold', 'BOOLEAN', "0");
        await addColumn('kot_settings', 'items_bold', 'BOOLEAN', "1");
        await addColumn('kot_settings', 'meta_two_column', 'BOOLEAN', "1");

        await dbInstance.execute(`
          CREATE TABLE IF NOT EXISTS staff (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            role TEXT,
            phone TEXT,
            pin TEXT -- For future login/auth
          );
        `);

        await dbInstance.execute(`
          CREATE TABLE IF NOT EXISTS expenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            description TEXT NOT NULL,
            amount REAL NOT NULL,
            category TEXT,
            date TEXT DEFAULT CURRENT_TIMESTAMP
          );
        `);

        await dbInstance.execute(`
          CREATE TABLE IF NOT EXISTS processing_orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cart_data TEXT,
            customer_name TEXT,
            customer_phone TEXT,
            payment_mode TEXT,
            subtotal REAL,
            gst REAL,
            total REAL,
            order_type TEXT DEFAULT 'Self Service',
            table_number TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
          );
        `);

        await dbInstance.execute(`
          CREATE TABLE IF NOT EXISTS finalized_orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cart_data TEXT,
            customer_name TEXT,
            customer_phone TEXT,
            payment_mode TEXT,
            subtotal REAL,
            gst REAL,
            total REAL,
            order_type TEXT,
            table_number TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
          );
        `);

        await dbInstance.execute(`
          CREATE TABLE IF NOT EXISTS customers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            phone TEXT,
            credit_balance REAL DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
          );
        `);

        await dbInstance.execute(`
          CREATE TABLE IF NOT EXISTS customer_payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id INTEGER NOT NULL,
            amount REAL NOT NULL,
            payment_mode TEXT,
            date TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE
          );
        `);

        await addColumn('finalized_orders', 'customer_id', 'INTEGER', "NULL");
        await addColumn('processing_orders', 'customer_id', 'INTEGER', "NULL");
        await addColumn('processing_orders', 'token_number', 'INTEGER', "NULL");
        await addColumn('finalized_orders', 'token_number', 'INTEGER', "NULL");
        await addColumn('finalized_orders', 'bill_number', 'TEXT', "NULL");
        await addColumn('processing_orders', 'bill_number', 'TEXT', "NULL");
        
        console.log("Database initialized successfully");
      } catch (error) {
        console.error("Failed to initialize database:", error);
        alert(`Database Initialization Error: ${error}`);
      } finally {
        setLoading(false);
      }
    }

    initDb();
  }, [dbFolderPath]);

  // Global Firebase Synchronization
  useEffect(() => {
    if (!db || !navigator.onLine) return;

    const licenseKey = localStorage.getItem('magicbill_license_key');
    if (licenseKey) {
      const syncSubscription = async () => {
        try {
          const userDocRef = doc(firestore, 'users', licenseKey);
          const userDoc = await getDoc(userDocRef);
          if (userDoc.exists()) {
            const data = userDoc.data();

            // ── Verify this device still owns the license ────────────────
            // If the binding was transferred (e.g. reset by support and
            // claimed on another PC), lock this device back to activation.
            const device = await getDeviceInfo();
            const boundDevice = data.device;
            if (boundDevice && boundDevice.id && boundDevice.id !== device.id) {
              localStorage.removeItem('magicbill_license_key');
              await db.execute('UPDATE subscription SET status="", planId="", subscriptionId="", nextBillingDate="", updatedAt="" WHERE id=1');
              return;
            }
            // Refresh heartbeat for the owning device.
            try { await updateDoc(userDocRef, { 'device.lastSeen': new Date().toISOString() }); } catch (e) {}

            const sub = data.subscription || {};

            // Sync to SQLite
            await db.execute(
              `UPDATE subscription SET 
                status = $1, 
                planId = $2, 
                subscriptionId = $3, 
                nextBillingDate = $4, 
                updatedAt = $5
              WHERE id = 1`,
              [
                sub.status || '', 
                sub.planId || '', 
                sub.id || '', 
                sub.nextBillingDate || '', 
                sub.updatedAt || ''
              ]
            );
          }
        } catch (err) {
          console.error("Global Sync: Error fetching subscription from Firebase:", err);
        }
      };
      
      syncSubscription();
    }
  }, [db]);

  const handleSelectDbFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select Database Folder"
      });
      if (selected && typeof selected === "string") {
        localStorage.setItem("dbFolderPath", selected);
        setDbFolderPath(selected);
      }
    } catch (error) {
      console.error("Failed to open dialog:", error);
    }
  };

  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(false);

  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showUnsavedPopup, setShowUnsavedPopup] = useState(false);
  const [pendingTabNav, setPendingTabNav] = useState<string | null>(null);
  const [_triggerSave, _setTriggerSave] = useState<(() => Promise<boolean>) | null>(null);
  const setTriggerSave = (fn: () => Promise<boolean>) => {
    _setTriggerSave(() => fn);
  };

  const handleNavigate = (label: string) => {
    if (hasUnsavedChanges) {
      setPendingTabNav(label);
      setShowUnsavedPopup(true);
      return;
    }
    setActiveTab(label);
    setIsSettingsPanelOpen(false);
  };

  const handleSettingsNavigate = (label: string) => {
    if (hasUnsavedChanges) {
      setPendingTabNav(label);
      setShowUnsavedPopup(true);
      return;
    }
    setActiveTab(label);
  };

  const navItems = [
    { id: "dashboard", icon: LayoutDashboard, label: "Dashboard" },
    { id: "billing", icon: ReceiptText, label: "Billing" },
    { id: "expenses", icon: Wallet, label: "Expenses" },
    { id: "reports", icon: TrendingUp, label: "Reports" },
  ];

  const settingsItems = [
    { id: "general", icon: Settings, label: "General Settings" },
    { id: "bill", icon: Receipt, label: "Bill Settings" },
    { id: "printer", icon: Printer, label: "Printer Settings" },
    { id: "menu", icon: UtensilsCrossed, label: "Menu Management" },
    { id: "staff", icon: Users, label: "Staff Management" },
  ];

  if (!dbFolderPath) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: 'var(--bg-light)', color: 'var(--text-primary)', padding: 'var(--space-8)' }}>
        <FolderOpen size={64} style={{ color: 'var(--primary)', marginBottom: 'var(--space-4)' }} />
        <h1 style={{ fontSize: 'var(--text-3xl)', marginBottom: '0.5rem' }}>Welcome to Magic Bill</h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem', textAlign: 'center', maxWidth: '400px' }}>
          To get started, please select a folder where your database and all application data will be safely stored.
        </p>
        <button 
          onClick={handleSelectDbFolder}
          style={{
            padding: '1rem 2rem',
            fontSize: 'var(--text-lg)',
            backgroundColor: 'var(--primary)',
            color: 'var(--primary-fg)',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            fontWeight: 'bold',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
          }}
        >
          <FolderOpen size={20} />
          Select Database Folder
        </button>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Sidebar */}
      <aside className="sidebar compact-sidebar">
        <button
          className={`account-nav-btn ${activeTab === "Account" ? "active" : ""}`}
          onClick={() => handleNavigate("Account")}
          title="Account"
        >
          <div className="account-nav-logo-wrap">
            <img src="/magic_bill_logo.png" alt="Magic Bill Logo" />
            <span className="account-nav-badge"><UserCircle size={13} /></span>
          </div>
          <span className="account-nav-brand">MAGIC BILL</span>
          <span className="account-nav-label">ACCOUNT</span>
        </button>
        
        <nav className="nav-menu">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${activeTab === item.label ? "active" : ""}`}
              onClick={() => handleNavigate(item.label)}
              title={item.label}
            >
              <item.icon size={24} className="nav-icon" />
              <span className="nav-label">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button
            className={`nav-item ${isSettingsPanelOpen ? "active" : ""}`}
            onClick={() => setIsSettingsPanelOpen(!isSettingsPanelOpen)}
            title="Settings"
          >
            <Settings size={24} className="nav-icon" />
            <span className="nav-label">Settings</span>
          </button>

          <div className="sidebar-footer-divider" />

          {updateInfo.available ? (
            <button
              className="update-chip available"
              onClick={() => setShowUpdateModal(true)}
              title={`Update available — v${updateInfo.version}. Click to install.`}
            >
              <DownloadCloud size={16} className="update-chip-icon" />
              <span className="update-chip-text">
                <span className="update-chip-label">Update</span>
                <span className="update-chip-ver">v{updateInfo.version}</span>
              </span>
            </button>
          ) : (
            <button
              className="update-chip"
              onClick={() => runCheck(true)}
              disabled={checking}
              title="Check for updates"
            >
              <RefreshCw size={14} className={`update-chip-icon ${checking ? 'spin' : ''}`} />
              <span className="update-chip-text">
                <span className="update-chip-ver">{appVersion ? `v${appVersion}` : '—'}</span>
                <span className="update-chip-label">{checking ? 'Checking…' : 'Check updates'}</span>
              </span>
            </button>
          )}
        </div>
      </aside>

      {/* Secondary Settings Panel */}
      <aside className={`settings-panel ${isSettingsPanelOpen ? "open" : ""}`}>
        <nav className="settings-nav-menu">
          {settingsItems.map((item) => (
            <button
              key={item.id}
              className={`nav-item settings-item ${activeTab === item.label ? "active" : ""}`}
              onClick={() => handleSettingsNavigate(item.label)}
              title={item.label}
            >
              <item.icon size={20} className="nav-icon" />
              <span className="nav-label multiline">{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        {loading ? (
          <p>Loading system...</p>
        ) : (
          <>
            {activeTab === "Dashboard" && (
              <Dashboard db={db} />
            )}

            {activeTab === "Menu Management" && (
              <MenuManagement db={db} activeTab="Menu" />
            )}

            {activeTab === "Staff Management" && (
              <StaffManagement db={db} activeTab="Staff" />
            )}

            {activeTab === "Expenses" && (
              <ExpenseTracker db={db} />
            )}

            {activeTab === "General Settings" && (
              <GeneralSettings db={db} activeTab="General" setUnsavedChanges={setHasUnsavedChanges} setTriggerSave={setTriggerSave} />
            )}

            {activeTab === "Bill Settings" && (
              <BillSettings db={db} activeTab="Bill" setUnsavedChanges={setHasUnsavedChanges} setTriggerSave={setTriggerSave} />
            )}

            {activeTab === "Printer Settings" && (
              <PrinterSettings db={db} activeTab="Printer" setUnsavedChanges={setHasUnsavedChanges} setTriggerSave={setTriggerSave} />
            )}

            {activeTab === "Billing" && (
              <Billing db={db} />
            )}

            {activeTab === "Reports" && (
              <Reports db={db} />
            )}

            {activeTab === "Account" && (
              <Account db={db} />
            )}

            {![
              "Dashboard", 
              "Menu Management", 
              "Staff Management", 
              "Expenses", 
              "General Settings", 
              "Bill Settings", 
              "Printer Settings", 
              "Billing", 
              "Reports",
              "Account"
            ].includes(activeTab) && (
               <div className="empty-state">
                  <p>{activeTab} feature coming soon...</p>
               </div>
            )}
          </>
        )}
      </main>

      {/* Unsaved Changes Popup */}
      {showUnsavedPopup && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ backgroundColor: 'var(--bg-white)', padding: 'var(--space-8)', borderRadius: 'var(--radius-md)', maxWidth: '400px', width: '100%', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
            <h3 style={{ marginTop: 0, color: 'var(--text-primary)' }}>Unsaved Changes</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-6)', lineHeight: '1.5' }}>
              You have unsaved changes in the current settings tab. Do you want to save them before leaving?
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
              <button 
                onClick={() => { setShowUnsavedPopup(false); setPendingTabNav(null); }}
                style={{ padding: 'var(--space-2) var(--space-4)', border: 'var(--border-thin) solid var(--border-color)', backgroundColor: 'transparent', color: 'var(--text-primary)', borderRadius: 'var(--radius-xs)', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  setHasUnsavedChanges(false);
                  setShowUnsavedPopup(false);
                  if (pendingTabNav) {
                    setActiveTab(pendingTabNav);
                    if (!settingsItems.some(item => item.label === pendingTabNav)) {
                      setIsSettingsPanelOpen(false);
                    }
                    setPendingTabNav(null);
                  }
                }}
                style={{ padding: 'var(--space-2) var(--space-4)', border: 'none', backgroundColor: 'var(--danger)', color: 'white', borderRadius: 'var(--radius-xs)', cursor: 'pointer' }}
              >
                Discard
              </button>
              <button 
                onClick={async () => {
                  if (_triggerSave) {
                    const success = await _triggerSave();
                    if (success) {
                      setHasUnsavedChanges(false);
                      setShowUnsavedPopup(false);
                      if (pendingTabNav) {
                        setActiveTab(pendingTabNav);
                        if (!settingsItems.some(item => item.label === pendingTabNav)) {
                          setIsSettingsPanelOpen(false);
                        }
                        setPendingTabNav(null);
                      }
                    } else {
                       setShowUnsavedPopup(false);
                    }
                  }
                }}
                style={{ padding: 'var(--space-2) var(--space-4)', border: 'none', backgroundColor: 'var(--primary)', color: 'var(--primary-fg)', borderRadius: 'var(--radius-xs)', cursor: 'pointer', fontWeight: 'var(--font-semibold)' }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Update install dialog (overlay — does not take over the whole app) */}
      {showUpdateModal && (
        <div className="modal-overlay modal-overlay--heavy">
          <div className="modal-card update-modal">
            {install.state === 'downloading' ? (
              <>
                <div className="update-modal-icon-wrap">
                  <DownloadCloud size={36} />
                </div>
                <h3 className="update-modal-title">Updating Magic Bill…</h3>
                <p className="update-modal-text">Please don't close the app — it will restart automatically when finished.</p>
                <div className="update-progress">
                  <div className="update-progress-bar" style={{ width: `${install.progress}%` }} />
                </div>
                <span className="update-progress-pct">{install.progress}%</span>
              </>
            ) : install.state === 'error' ? (
              <>
                <div className="update-modal-icon-wrap danger">
                  <XCircle size={36} />
                </div>
                <h3 className="update-modal-title">Update Failed</h3>
                <p className="update-modal-text update-modal-err">{install.error}</p>
                <div className="update-modal-actions">
                  <button className="update-btn-ghost" onClick={() => { setInstall({ state: 'idle', progress: 0 }); setShowUpdateModal(false); }}>Close</button>
                  <button className="update-btn-primary" onClick={startInstall}>Retry</button>
                </div>
              </>
            ) : (
              <>
                <div className="update-modal-icon-wrap accent">
                  <DownloadCloud size={36} />
                </div>
                <h3 className="update-modal-title">Update Available</h3>
                <p className="update-modal-text">
                  Magic Bill <strong>v{updateInfo.version}</strong> is ready to install. The app will restart to finish the update.
                </p>
                <div className="update-modal-actions">
                  <button className="update-btn-ghost" onClick={() => setShowUpdateModal(false)}>Later</button>
                  <button className="update-btn-primary" onClick={startInstall}>
                    <DownloadCloud size={16} /> Download &amp; Install
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Skippable notification raised by the silent auto-check */}
      {showUpdateNotif && (
        <div className="update-snackbar">
          <DownloadCloud size={22} className="update-snackbar-icon" />
          <div className="update-snackbar-text">
            <strong>Update available</strong>
            <span>Magic Bill v{updateInfo.version} is ready to install.</span>
          </div>
          <div className="update-snackbar-actions">
            <button className="update-snackbar-btn primary" onClick={() => { setShowUpdateNotif(false); setShowUpdateModal(true); }}>Update</button>
            <button className="update-snackbar-btn" onClick={() => setShowUpdateNotif(false)}>Skip</button>
          </div>
        </div>
      )}

      {/* Transient status (e.g. "you're on the latest version") */}
      {updateToast && <div className="toast-notification">{updateToast}</div>}
    </div>
  );
}

export default App;
