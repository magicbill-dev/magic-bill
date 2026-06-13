import { useState, useEffect } from "react";
import Database from "@tauri-apps/plugin-sql";
import { open } from "@tauri-apps/plugin-dialog";
import { join } from "@tauri-apps/api/path";
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
  FolderOpen
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
import "./App.css";

function App() {
  const [activeTab, setActiveTab] = useState("Dashboard");
  const [db, setDb] = useState<Database | null>(null);
  const [loading, setLoading] = useState(true);
  const [dbFolderPath, setDbFolderPath] = useState<string | null>(() => localStorage.getItem("dbFolderPath"));

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

  const handleNavigate = (label: string) => {
    setActiveTab(label);
    setIsSettingsPanelOpen(false);
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
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: 'var(--bg-light)', color: 'var(--text-primary)', padding: '2rem' }}>
        <FolderOpen size={64} style={{ color: 'var(--primary)', marginBottom: '1rem' }} />
        <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Welcome to Magic Bill</h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem', textAlign: 'center', maxWidth: '400px' }}>
          To get started, please select a folder where your database and all application data will be safely stored.
        </p>
        <button 
          onClick={handleSelectDbFolder}
          style={{
            padding: '1rem 2rem',
            fontSize: '1.1rem',
            backgroundColor: 'var(--primary)',
            color: 'var(--primary-fg)',
            border: 'none',
            borderRadius: '0.5rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
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
        <div className="logo-area compact-logo">
          <img src="/magic_bill_logo.png" alt="Magic Bill Logo" style={{ width: '48px', height: '48px', objectFit: 'contain' }} />
          <span>Magic Bill</span>
        </div>
        
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

        <div className="user-profile compact-profile">
          <button 
            className={`nav-item ${isSettingsPanelOpen ? "active" : ""}`}
            onClick={() => setIsSettingsPanelOpen(!isSettingsPanelOpen)}
            title="Settings"
          >
            <Settings size={24} className="nav-icon" />
            <span className="nav-label">Settings</span>
          </button>
        </div>
      </aside>

      {/* Secondary Settings Panel */}
      <aside className={`settings-panel ${isSettingsPanelOpen ? "open" : ""}`}>
        <nav className="settings-nav-menu">
          {settingsItems.map((item) => (
            <button
              key={item.id}
              className={`nav-item settings-item ${activeTab === item.label ? "active" : ""}`}
              onClick={() => setActiveTab(item.label)}
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
              <GeneralSettings db={db} activeTab="General" />
            )}

            {activeTab === "Bill Settings" && (
              <BillSettings db={db} activeTab="Bill" />
            )}

            {activeTab === "Printer Settings" && (
              <PrinterSettings db={db} activeTab="Printer" />
            )}

            {activeTab === "Billing" && (
              <Billing db={db} />
            )}

            {activeTab === "Reports" && (
              <Reports db={db} />
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
              "Reports"
            ].includes(activeTab) && (
               <div className="empty-state">
                  <p>{activeTab} feature coming soon...</p>
               </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default App;
