import { useState, useEffect } from "react";
import Database from "@tauri-apps/plugin-sql";
import { Save, Eye, Type, Settings2, UtensilsCrossed, Scissors, QrCode } from "lucide-react";

interface StoreSettings {
  hotel_name: string;
  address: string;
  phone_number: string;
  gst_number: string;
  fssai_number: string;
}

interface BillConfig {
  footer_message: string;
  show_gst: boolean;
  show_fssai: boolean;
  show_address: boolean;
  show_phone: boolean;
  printer_size: string;
  header_font_family: string;
  header_font_size: string;
  body_font_family: string;
  body_font_size: string;
  footer_font_family: string;
  footer_font_size: string;
  gst_enabled: boolean;
  gst_type: string;
  show_cashier_name: boolean;
  gst_percentage: number;
  row_height: string;
  logo_position: string;
  logo_size: number;
  logo_opacity: number;
  logo_base64: string;
  show_line_separators: boolean;
  show_token: boolean;
  sep_header: boolean;
  sep_meta: boolean;
  sep_token: boolean;
  sep_table_header: boolean;
  sep_table_body: boolean;
  sep_subtotals: boolean;
  sep_grand_total: boolean;
  store_name_size: string;
  address_size: string;
  table_font_size: string;
  total_font_size: string;
  dynamic_upi_qr: boolean;
  static_upi_qr: boolean;
  no_qr_print: boolean;
}

interface KotConfig {
  header_font_family: string;
  header_font_size: string;
  body_font_family: string;
  body_font_size: string;
  row_height: string;
  show_line_separators: boolean;
  show_token: boolean;
  sep_token: boolean;
  sep_header: boolean;
  sep_meta: boolean;
  sep_table_header: boolean;
  sep_table_body: boolean;
  table_font_size: string;
}

interface BillSettingsProps {
  db: Database | null;
  activeTab: string;
  setUnsavedChanges?: (unsaved: boolean) => void;
  setTriggerSave?: (saveFn: () => Promise<boolean>) => void;
}

const fontFamilies = [
  { label: "Monospace", value: "monospace" },
  { label: "Sans-Serif", value: "sans-serif" },
  { label: "Serif", value: "serif" },
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Courier New", value: "'Courier New', monospace" },
  { label: "Times New Roman", value: "'Times New Roman', serif" },
];

const fontSizes = ["10px", "12px", "14px", "16px", "18px", "20px", "24px", "28px"];

export default function BillSettings({ db, activeTab, setUnsavedChanges, setTriggerSave }: BillSettingsProps) {
  const [storeSettings, setStoreSettings] = useState<StoreSettings>({
    hotel_name: "RESTAURANT NAME",
    address: "123, Street Name, City",
    phone_number: "0000000000",
    gst_number: "00XXXXX0000X0X0",
    fssai_number: "00000000000000"
  });

  const [billConfig, setBillConfig] = useState<BillConfig>({
    footer_message: "Thank you! Visit again.",
    show_gst: true,
    show_fssai: true,
    show_address: true,
    show_phone: true,
    printer_size: "3inch",
    header_font_family: "monospace",
    header_font_size: "16px",
    body_font_family: "monospace",
    body_font_size: "12px",
    footer_font_family: "monospace",
    footer_font_size: "12px",
    gst_enabled: true,
    gst_type: "Inclusive",
    show_cashier_name: true,
    gst_percentage: 5,
    row_height: "2px 0",
    logo_position: "none",
    logo_size: 50,
    logo_opacity: 1,
    logo_base64: "",
    show_line_separators: true,
    show_token: true,
    sep_header: true,
    sep_meta: true,
    sep_token: true,
    sep_table_header: true,
    sep_table_body: true,
    sep_subtotals: true,
    sep_grand_total: true,
    store_name_size: "16px",
    address_size: "12px",
    table_font_size: "12px",
    total_font_size: "12px",
    dynamic_upi_qr: false,
    static_upi_qr: false,
    no_qr_print: true
  });

  const [kotConfig, setKotConfig] = useState<KotConfig>({
    header_font_family: "monospace",
    header_font_size: "16px",
    body_font_family: "monospace",
    body_font_size: "12px",
    row_height: "4px 0",
    show_line_separators: true,
    show_token: true,
    sep_token: true,
    sep_header: true,
    sep_meta: true,
    sep_table_header: true,
    sep_table_body: true,
    table_font_size: "12px"
  });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [initialStoreSettings, setInitialStoreSettings] = useState<StoreSettings | null>(null);
  const [initialBillConfig, setInitialBillConfig] = useState<BillConfig | null>(null);
  const [initialKotConfig, setInitialKotConfig] = useState<KotConfig | null>(null);

  useEffect(() => {
    if (setUnsavedChanges && initialStoreSettings && initialBillConfig && initialKotConfig) {
      const isUnsaved = 
        JSON.stringify(storeSettings) !== JSON.stringify(initialStoreSettings) ||
        JSON.stringify(billConfig) !== JSON.stringify(initialBillConfig) ||
        JSON.stringify(kotConfig) !== JSON.stringify(initialKotConfig);
      setUnsavedChanges(isUnsaved);
    }
  }, [storeSettings, billConfig, kotConfig, initialStoreSettings, initialBillConfig, initialKotConfig, setUnsavedChanges]);

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  useEffect(() => {
    if (db && activeTab === "Bill") {
      fetchData();
    }
  }, [db, activeTab]);

  const fetchData = async () => {
    if (!db) return;
    try {
      setLoading(true);
      
      const storeRes = await db.select<StoreSettings[]>("SELECT * FROM store_settings WHERE id = 1");
      if (storeRes.length > 0) {
        const s = {
          hotel_name: storeRes[0].hotel_name || "Easybill",
          address: storeRes[0].address || "123 Street Name, City",
          phone_number: storeRes[0].phone_number || "+91 9876543210",
          gst_number: storeRes[0].gst_number || "27AAAAA0000A1Z5",
          fssai_number: storeRes[0].fssai_number || "12345678901234"
        };
        setStoreSettings(s);
        setInitialStoreSettings(s);
      } else {
        setInitialStoreSettings(storeSettings);
      }

      const billRes = await db.select<any[]>("SELECT * FROM bill_settings WHERE id = 1");
      if (billRes.length > 0) {
        const row = billRes[0];
        const b = {
          footer_message: row.footer_message || "",
          show_gst: row.show_gst !== 0 && row.show_gst !== false,
          show_fssai: row.show_fssai !== 0 && row.show_fssai !== false,
          show_address: row.show_address !== 0 && row.show_address !== false,
          show_phone: row.show_phone !== 0 && row.show_phone !== false,
          printer_size: row.printer_size || "3inch",
          header_font_family: row.header_font_family || "monospace",
          header_font_size: row.header_font_size || "16px",
          body_font_family: row.body_font_family || "monospace",
          body_font_size: row.body_font_size || "12px",
          footer_font_family: row.footer_font_family || "monospace",
          footer_font_size: row.footer_font_size || "12px",
          gst_enabled: row.gst_enabled !== 0 && row.gst_enabled !== false,
          gst_type: row.gst_type || "Inclusive",
          show_cashier_name: row.show_cashier_name !== 0 && row.show_cashier_name !== false,
          gst_percentage: row.gst_percentage !== undefined ? Number(row.gst_percentage) : 5,
          row_height: row.row_height || "2px 0",
          logo_position: row.logo_position || "none",
          logo_size: row.logo_size !== undefined ? Number(row.logo_size) : 50,
          logo_opacity: row.logo_opacity !== undefined ? Number(row.logo_opacity) : 1,
          logo_base64: row.logo_base64 || "",
          show_line_separators: row.show_line_separators !== 0 && row.show_line_separators !== false,
          show_token: row.show_token !== 0 && row.show_token !== false,
          sep_header: row.sep_header !== 0 && row.sep_header !== false,
          sep_meta: row.sep_meta !== 0 && row.sep_meta !== false,
          sep_token: row.sep_token !== 0 && row.sep_token !== false,
          sep_table_header: row.sep_table_header !== 0 && row.sep_table_header !== false,
          sep_table_body: row.sep_table_body !== 0 && row.sep_table_body !== false,
          sep_subtotals: row.sep_subtotals !== 0 && row.sep_subtotals !== false,
          sep_grand_total: row.sep_grand_total !== 0 && row.sep_grand_total !== false,
          store_name_size: row.store_name_size || "16px",
          address_size: row.address_size || "12px",
          table_font_size: row.table_font_size || "12px",
          total_font_size: row.total_font_size || "12px",
          dynamic_upi_qr: row.dynamic_upi_qr !== 0 && row.dynamic_upi_qr !== false,
          static_upi_qr: row.static_upi_qr !== 0 && row.static_upi_qr !== false,
          no_qr_print: row.no_qr_print !== 0 && row.no_qr_print !== false,
        };
        setBillConfig(b);
        setInitialBillConfig(b);
      } else {
        setInitialBillConfig(billConfig);
      }

      const kotRes = await db.select<any[]>("SELECT * FROM kot_settings WHERE id = 1");
      if (kotRes.length > 0) {
        const row = kotRes[0];
        const k = {
          header_font_family: row.header_font_family || "monospace",
          header_font_size: row.header_font_size || "16px",
          body_font_family: row.body_font_family || "monospace",
          body_font_size: row.body_font_size || "12px",
          row_height: row.row_height || "4px 0",
          show_line_separators: row.show_line_separators !== 0 && row.show_line_separators !== false,
          show_token: row.show_token !== 0 && row.show_token !== false,
          sep_token: row.sep_token !== 0 && row.sep_token !== false,
          sep_header: row.sep_header !== 0 && row.sep_header !== false,
          sep_meta: row.sep_meta !== 0 && row.sep_meta !== false,
          sep_table_header: row.sep_table_header !== 0 && row.sep_table_header !== false,
          sep_table_body: row.sep_table_body !== 0 && row.sep_table_body !== false,
          table_font_size: row.table_font_size || "12px"
        };
        setKotConfig(k);
        setInitialKotConfig(k);
      } else {
        setInitialKotConfig(kotConfig);
      }
    } catch (error) {
      console.error("Failed to fetch settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const doSave = async () => {
    if (!db) return false;

    try {
      setSaving(true);
      const existing = await db.select<any[]>("SELECT id FROM bill_settings WHERE id = 1");
      
      if (existing.length > 0) {
        await db.execute(
          `UPDATE bill_settings SET 
            footer_message = $1, show_gst = $2, show_fssai = $3, show_address = $4, show_phone = $5, 
            printer_size = $6, header_font_family = $7, header_font_size = $8, body_font_family = $9,
            body_font_size = $10, footer_font_family = $11, footer_font_size = $12, gst_enabled = $13,
            gst_type = $14, show_cashier_name = $15, gst_percentage = $16, row_height = $17,
            logo_position = $18, logo_size = $19, logo_opacity = $20, logo_base64 = $21,
            show_line_separators = $22, show_token = $23, sep_header = $24, sep_meta = $25,
            sep_token = $26, sep_table_header = $27, sep_table_body = $28, sep_subtotals = $29,
            sep_grand_total = $30, store_name_size = $31, address_size = $32, table_font_size = $33, total_font_size = $34,
            dynamic_upi_qr = $35, static_upi_qr = $36, no_qr_print = $37
          WHERE id = 1`,
          [
            billConfig.footer_message, billConfig.show_gst ? 1 : 0, billConfig.show_fssai ? 1 : 0, billConfig.show_address ? 1 : 0, billConfig.show_phone ? 1 : 0,
            billConfig.printer_size, billConfig.header_font_family, billConfig.header_font_size, billConfig.body_font_family,
            billConfig.body_font_size, billConfig.footer_font_family, billConfig.footer_font_size, billConfig.gst_enabled ? 1 : 0,
            billConfig.gst_type, billConfig.show_cashier_name ? 1 : 0, billConfig.gst_percentage, billConfig.row_height,
            billConfig.logo_position, billConfig.logo_size, billConfig.logo_opacity, billConfig.logo_base64,
            billConfig.show_line_separators ? 1 : 0, billConfig.show_token ? 1 : 0, billConfig.sep_header ? 1 : 0, billConfig.sep_meta ? 1 : 0,
            billConfig.sep_token ? 1 : 0, billConfig.sep_table_header ? 1 : 0, billConfig.sep_table_body ? 1 : 0, billConfig.sep_subtotals ? 1 : 0,
            billConfig.sep_grand_total ? 1 : 0, billConfig.store_name_size, billConfig.address_size, billConfig.table_font_size, billConfig.total_font_size,
            billConfig.dynamic_upi_qr ? 1 : 0, billConfig.static_upi_qr ? 1 : 0, billConfig.no_qr_print ? 1 : 0
          ]
        );
      } else {
        await db.execute(
          `INSERT INTO bill_settings (
            id, footer_message, show_gst, show_fssai, show_address, show_phone, printer_size, header_font_family, header_font_size, body_font_family,
            body_font_size, footer_font_family, footer_font_size, gst_enabled, gst_type, show_cashier_name, gst_percentage, row_height, logo_position, logo_size, logo_opacity, logo_base64,
            show_line_separators, show_token, sep_header, sep_meta, sep_token, sep_table_header, sep_table_body, sep_subtotals, sep_grand_total,
            store_name_size, address_size, table_font_size, total_font_size, dynamic_upi_qr, static_upi_qr, no_qr_print
          ) VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37)`,
          [
            billConfig.footer_message, billConfig.show_gst ? 1 : 0, billConfig.show_fssai ? 1 : 0, billConfig.show_address ? 1 : 0, billConfig.show_phone ? 1 : 0,
            billConfig.printer_size, billConfig.header_font_family, billConfig.header_font_size, billConfig.body_font_family,
            billConfig.body_font_size, billConfig.footer_font_family, billConfig.footer_font_size, billConfig.gst_enabled ? 1 : 0,
            billConfig.gst_type, billConfig.show_cashier_name ? 1 : 0, billConfig.gst_percentage, billConfig.row_height,
            billConfig.logo_position, billConfig.logo_size, billConfig.logo_opacity, billConfig.logo_base64,
            billConfig.show_line_separators ? 1 : 0, billConfig.show_token ? 1 : 0, billConfig.sep_header ? 1 : 0, billConfig.sep_meta ? 1 : 0,
            billConfig.sep_token ? 1 : 0, billConfig.sep_table_header ? 1 : 0, billConfig.sep_table_body ? 1 : 0, billConfig.sep_subtotals ? 1 : 0,
            billConfig.sep_grand_total ? 1 : 0, billConfig.store_name_size, billConfig.address_size, billConfig.table_font_size, billConfig.total_font_size,
            billConfig.dynamic_upi_qr ? 1 : 0, billConfig.static_upi_qr ? 1 : 0, billConfig.no_qr_print ? 1 : 0
          ]
        );
      }

      const existingKot = await db.select<any[]>("SELECT id FROM kot_settings WHERE id = 1");
      if (existingKot.length > 0) {
        await db.execute(
          `UPDATE kot_settings SET 
            header_font_family = $1, header_font_size = $2, body_font_family = $3, body_font_size = $4,
            row_height = $5, show_line_separators = $6, show_token = $7, sep_token = $8, sep_header = $9,
            sep_meta = $10, sep_table_header = $11, sep_table_body = $12, table_font_size = $13
          WHERE id = 1`,
          [
            kotConfig.header_font_family, kotConfig.header_font_size, kotConfig.body_font_family, kotConfig.body_font_size,
            kotConfig.row_height, kotConfig.show_line_separators ? 1 : 0, kotConfig.show_token ? 1 : 0,
            kotConfig.sep_token ? 1 : 0, kotConfig.sep_header ? 1 : 0, kotConfig.sep_meta ? 1 : 0,
            kotConfig.sep_table_header ? 1 : 0, kotConfig.sep_table_body ? 1 : 0, kotConfig.table_font_size
          ]
        );
      } else {
        await db.execute(
          `INSERT INTO kot_settings (
            id, header_font_family, header_font_size, body_font_family, body_font_size, row_height, show_line_separators, show_token,
            sep_token, sep_header, sep_meta, sep_table_header, sep_table_body, table_font_size
          ) VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [
            kotConfig.header_font_family, kotConfig.header_font_size, kotConfig.body_font_family, kotConfig.body_font_size,
            kotConfig.row_height, kotConfig.show_line_separators ? 1 : 0, kotConfig.show_token ? 1 : 0,
            kotConfig.sep_token ? 1 : 0, kotConfig.sep_header ? 1 : 0, kotConfig.sep_meta ? 1 : 0,
            kotConfig.sep_table_header ? 1 : 0, kotConfig.sep_table_body ? 1 : 0, kotConfig.table_font_size
          ]
        );
      }

      setInitialStoreSettings(storeSettings);
      setInitialBillConfig(billConfig);
      setInitialKotConfig(kotConfig);
      setToastMessage("Bill settings saved successfully!");
      return true;
    } catch (error) {
      console.error("Failed to save bill settings:", error);
      setToastMessage(`Error saving settings: ${error}`);
      return false;
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (setTriggerSave) {
      setTriggerSave(doSave);
    }
  }, [storeSettings, billConfig, kotConfig, db, setTriggerSave]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await doSave();
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setBillConfig({ ...billConfig, logo_base64: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  const getPreviewWidth = () => {
    switch(billConfig.printer_size) {
      case '4inch': return '380px';
      case '5inch': return '450px';
      case '3inch':
      default: return '320px';
    }
  };

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading bill settings...</div>;
  }

  return (
    <div style={{ height: '100%', display: 'flex', overflow: 'hidden' }}>
      {toastMessage && <div className="toast-notification">{toastMessage}</div>}

      {/* Configuration */}
      <div className="sx-page" style={{ flex: '1.6', maxWidth: 'none', margin: 0 }}>
        <div className="sx-head">
          <h1>Bill Settings</h1>
          <p>Configure your receipt design and formatting</p>
        </div>

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>

          {/* Receipt Format */}
          <div className="sx-group">
            <div className="sx-group-head"><Settings2 size={14} /> Receipt Format</div>
            <div className="sx-grid">
              <div className="sx-field">
                <label>Printer Size</label>
                <select value={billConfig.printer_size} onChange={(e) => setBillConfig({ ...billConfig, printer_size: e.target.value })} className="sx-select">
                  <option value="3inch">3 Inch (80mm) — Standard</option>
                  <option value="4inch">4 Inch (100mm)</option>
                  <option value="5inch">5 Inch (120mm)</option>
                </select>
              </div>
              <div className="sx-field">
                <label>Row Height (Item Spacing)</label>
                <select value={billConfig.row_height} onChange={(e) => setBillConfig({ ...billConfig, row_height: e.target.value })} className="sx-select">
                  <option value="2px 0">Compact</option>
                  <option value="4px 0">Standard</option>
                  <option value="8px 0">Relaxed</option>
                </select>
              </div>
            </div>
          </div>

          {/* Receipt Fonts & Sizes */}
          <div className="sx-group">
            <div className="sx-group-head"><Type size={14} /> Receipt Fonts &amp; Sizes</div>
            <div className="sx-grid cols-3">
              <div className="sx-field">
                <label>Header Font</label>
                <select value={billConfig.header_font_family} onChange={(e) => setBillConfig({ ...billConfig, header_font_family: e.target.value })} className="sx-select">
                  {fontFamilies.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </div>
              <div className="sx-field">
                <label>Body Font</label>
                <select value={billConfig.body_font_family} onChange={(e) => setBillConfig({ ...billConfig, body_font_family: e.target.value })} className="sx-select">
                  {fontFamilies.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </div>
              <div className="sx-field">
                <label>Footer Font</label>
                <select value={billConfig.footer_font_family} onChange={(e) => setBillConfig({ ...billConfig, footer_font_family: e.target.value })} className="sx-select">
                  {fontFamilies.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </div>
            </div>
            <div className="sx-grid">
              <div className="sx-field">
                <label>Hotel Name Size</label>
                <select value={billConfig.store_name_size} onChange={(e) => setBillConfig({ ...billConfig, store_name_size: e.target.value })} className="sx-select">{fontSizes.map(s => <option key={s} value={s}>{s}</option>)}</select>
              </div>
              <div className="sx-field">
                <label>Address / Meta Size</label>
                <select value={billConfig.address_size} onChange={(e) => setBillConfig({ ...billConfig, address_size: e.target.value })} className="sx-select">{fontSizes.map(s => <option key={s} value={s}>{s}</option>)}</select>
              </div>
              <div className="sx-field">
                <label>Table Items Size</label>
                <select value={billConfig.table_font_size} onChange={(e) => setBillConfig({ ...billConfig, table_font_size: e.target.value })} className="sx-select">{fontSizes.map(s => <option key={s} value={s}>{s}</option>)}</select>
              </div>
              <div className="sx-field">
                <label>Totals Size</label>
                <select value={billConfig.total_font_size} onChange={(e) => setBillConfig({ ...billConfig, total_font_size: e.target.value })} className="sx-select">{fontSizes.map(s => <option key={s} value={s}>{s}</option>)}</select>
              </div>
              <div className="sx-field">
                <label>Footer Size</label>
                <select value={billConfig.footer_font_size} onChange={(e) => setBillConfig({ ...billConfig, footer_font_size: e.target.value })} className="sx-select">{fontSizes.map(s => <option key={s} value={s}>{s}</option>)}</select>
              </div>
            </div>
          </div>

          {/* Line Separators */}
          <div className="sx-group">
            <div className="sx-group-head"><Scissors size={14} /> Receipt Line Separators</div>
            <div className="sx-grid cols-3">
              <label className="sx-check"><input type="checkbox" checked={billConfig.sep_header} onChange={(e) => setBillConfig({...billConfig, sep_header: e.target.checked})} /> Below Store Header</label>
              <label className="sx-check"><input type="checkbox" checked={billConfig.sep_meta} onChange={(e) => setBillConfig({...billConfig, sep_meta: e.target.checked})} /> Below Meta (Date/Time)</label>
              <label className="sx-check"><input type="checkbox" checked={billConfig.sep_token} onChange={(e) => setBillConfig({...billConfig, sep_token: e.target.checked})} /> Below Token Number</label>
              <label className="sx-check"><input type="checkbox" checked={billConfig.sep_table_header} onChange={(e) => setBillConfig({...billConfig, sep_table_header: e.target.checked})} /> Below Column Names</label>
              <label className="sx-check"><input type="checkbox" checked={billConfig.sep_table_body} onChange={(e) => setBillConfig({...billConfig, sep_table_body: e.target.checked})} /> Below Item List</label>
              <label className="sx-check"><input type="checkbox" checked={billConfig.sep_subtotals} onChange={(e) => setBillConfig({...billConfig, sep_subtotals: e.target.checked})} /> Below Subtotals &amp; GST</label>
              <label className="sx-check"><input type="checkbox" checked={billConfig.sep_grand_total} onChange={(e) => setBillConfig({...billConfig, sep_grand_total: e.target.checked})} /> Below Grand Total</label>
            </div>
          </div>

          {/* Content Visibility */}
          <div className="sx-group">
            <div className="sx-group-head"><Eye size={14} /> Receipt Content Visibility</div>
            <div className="sx-grid cols-3">
              <label className="sx-check"><input type="checkbox" checked={billConfig.show_token} onChange={(e) => setBillConfig({...billConfig, show_token: e.target.checked})} /> Show Token Number</label>
              <label className="sx-check"><input type="checkbox" checked={billConfig.show_gst} onChange={(e) => setBillConfig({...billConfig, show_gst: e.target.checked})} /> Show GSTIN Header</label>
              <label className="sx-check"><input type="checkbox" checked={billConfig.show_fssai} onChange={(e) => setBillConfig({...billConfig, show_fssai: e.target.checked})} /> Show FSSAI Header</label>
              <label className="sx-check"><input type="checkbox" checked={billConfig.show_address} onChange={(e) => setBillConfig({...billConfig, show_address: e.target.checked})} /> Show Address</label>
              <label className="sx-check"><input type="checkbox" checked={billConfig.show_phone} onChange={(e) => setBillConfig({...billConfig, show_phone: e.target.checked})} /> Show Phone</label>
              <label className="sx-check"><input type="checkbox" checked={billConfig.show_cashier_name} onChange={(e) => setBillConfig({...billConfig, show_cashier_name: e.target.checked})} /> Show Cashier</label>
            </div>
          </div>

          {/* UPI QR */}
          <div className="sx-group">
            <div className="sx-group-head"><QrCode size={14} /> UPI QR Printing</div>
            <div className="sx-grid cols-3">
              <label className="sx-check">
                <input type="radio" name="qr_print_type" checked={billConfig.dynamic_upi_qr} onChange={() => setBillConfig({...billConfig, dynamic_upi_qr: true, static_upi_qr: false, no_qr_print: false})} />
                Dynamic UPI QR
                <span className="sx-hint">Amount included</span>
              </label>
              <label className="sx-check">
                <input type="radio" name="qr_print_type" checked={billConfig.static_upi_qr} onChange={() => setBillConfig({...billConfig, dynamic_upi_qr: false, static_upi_qr: true, no_qr_print: false})} />
                Static UPI QR
                <span className="sx-hint">Direct to UPI ID</span>
              </label>
              <label className="sx-check">
                <input type="radio" name="qr_print_type" checked={billConfig.no_qr_print} onChange={() => setBillConfig({...billConfig, dynamic_upi_qr: false, static_upi_qr: false, no_qr_print: true})} />
                No QR Print
              </label>
            </div>
          </div>

          {/* GST */}
          <div className="sx-group">
            <div className="sx-group-head">GST Calculation</div>
            <label className="sx-check" style={{ alignSelf: 'flex-start' }}>
              <input type="checkbox" checked={billConfig.gst_enabled} onChange={(e) => setBillConfig({...billConfig, gst_enabled: e.target.checked})} /> Enable GST
            </label>
            {billConfig.gst_enabled && (
              <div className="sx-grid cols-3">
                <div className="sx-field">
                  <label>GST Type</label>
                  <select value={billConfig.gst_type} onChange={(e) => setBillConfig({ ...billConfig, gst_type: e.target.value })} className="sx-select">
                    <option value="Exclusive">Exclusive (Added to total)</option>
                    <option value="Inclusive">Inclusive (Included in price)</option>
                  </select>
                </div>
                <div className="sx-field">
                  <label>GST %</label>
                  <select value={billConfig.gst_percentage} onChange={(e) => setBillConfig({ ...billConfig, gst_percentage: Number(e.target.value) })} className="sx-select">
                    <option value={5}>5%</option>
                    <option value={12}>12%</option>
                    <option value={18}>18%</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Logo */}
          <div className="sx-group">
            <div className="sx-group-head">Logo</div>
            <div className="sx-grid cols-3">
              <div className="sx-field">
                <label>Position</label>
                <select value={billConfig.logo_position} onChange={(e) => setBillConfig({ ...billConfig, logo_position: e.target.value })} className="sx-select">
                  <option value="none">None</option>
                  <option value="top">Top</option>
                </select>
              </div>
              {billConfig.logo_position !== 'none' && (
                <>
                  <div className="sx-field">
                    <label>Logo Image</label>
                    <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                      <input type="file" accept="image/*" onChange={handleLogoUpload} style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)', flex: 1, minWidth: 0 }} />
                      {billConfig.logo_base64 && (
                        <button type="button" onClick={() => setBillConfig({...billConfig, logo_base64: ''})} className="sx-btn-danger" style={{ padding: '0.4rem 0.65rem', flexShrink: 0 }}>Remove</button>
                      )}
                    </div>
                  </div>
                  <div className="sx-field">
                    <label>Size — {billConfig.logo_size || 50}%</label>
                    <input type="range" min={10} max={100} step={5} value={billConfig.logo_size || 50} onChange={(e) => setBillConfig({ ...billConfig, logo_size: Number(e.target.value) })} style={{ accentColor: 'var(--primary)', width: '100%' }} />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="sx-group">
            <div className="sx-group-head">Footer Message</div>
            <div className="sx-field">
              <textarea value={billConfig.footer_message} onChange={(e) => setBillConfig({ ...billConfig, footer_message: e.target.value })} placeholder="e.g. Thank you! Visit again." rows={2} className="sx-textarea" />
            </div>
          </div>

          {/* KOT Fonts */}
          <div className="sx-group">
            <div className="sx-group-head"><Settings2 size={14} /> KOT — Fonts &amp; Sizes</div>
            <div className="sx-grid cols-3">
              <div className="sx-field">
                <label>Header Font</label>
                <select value={kotConfig.header_font_family} onChange={(e) => setKotConfig({ ...kotConfig, header_font_family: e.target.value })} className="sx-select">{fontFamilies.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}</select>
              </div>
              <div className="sx-field">
                <label>Body Font</label>
                <select value={kotConfig.body_font_family} onChange={(e) => setKotConfig({ ...kotConfig, body_font_family: e.target.value })} className="sx-select">{fontFamilies.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}</select>
              </div>
              <div className="sx-field">
                <label>Row Height</label>
                <select value={kotConfig.row_height} onChange={(e) => setKotConfig({ ...kotConfig, row_height: e.target.value })} className="sx-select">
                  <option value="2px 0">Compact</option>
                  <option value="4px 0">Standard</option>
                  <option value="8px 0">Relaxed</option>
                </select>
              </div>
              <div className="sx-field">
                <label>Header Size (KOT Title)</label>
                <select value={kotConfig.header_font_size} onChange={(e) => setKotConfig({ ...kotConfig, header_font_size: e.target.value })} className="sx-select">{fontSizes.map(s => <option key={s} value={s}>{s}</option>)}</select>
              </div>
              <div className="sx-field">
                <label>Table Items Size</label>
                <select value={kotConfig.table_font_size} onChange={(e) => setKotConfig({ ...kotConfig, table_font_size: e.target.value })} className="sx-select">{fontSizes.map(s => <option key={s} value={s}>{s}</option>)}</select>
              </div>
            </div>
          </div>

          {/* KOT Separators + Visibility */}
          <div className="sx-group">
            <div className="sx-group-head"><Scissors size={14} /> KOT — Line Separators</div>
            <div className="sx-grid cols-3">
              <label className="sx-check"><input type="checkbox" checked={kotConfig.sep_token} onChange={(e) => setKotConfig({...kotConfig, sep_token: e.target.checked})} /> Below Token Number</label>
              <label className="sx-check"><input type="checkbox" checked={kotConfig.sep_header} onChange={(e) => setKotConfig({...kotConfig, sep_header: e.target.checked})} /> Below KOT Title</label>
              <label className="sx-check"><input type="checkbox" checked={kotConfig.sep_meta} onChange={(e) => setKotConfig({...kotConfig, sep_meta: e.target.checked})} /> Below Meta (Date/Table)</label>
              <label className="sx-check"><input type="checkbox" checked={kotConfig.sep_table_header} onChange={(e) => setKotConfig({...kotConfig, sep_table_header: e.target.checked})} /> Below Column Names</label>
              <label className="sx-check"><input type="checkbox" checked={kotConfig.sep_table_body} onChange={(e) => setKotConfig({...kotConfig, sep_table_body: e.target.checked})} /> Below Item List</label>
              <label className="sx-check"><input type="checkbox" checked={kotConfig.show_token} onChange={(e) => setKotConfig({...kotConfig, show_token: e.target.checked})} /> Show Token Number</label>
            </div>
          </div>

          <div className="sx-actions">
            <button type="submit" disabled={saving} className="sx-btn-primary">
              <Save size={16} />
              {saving ? "Saving…" : "Save Settings"}
            </button>
          </div>
        </form>
      </div>

      {/* Preview Panel */}
      <div style={{ flex: '0.7', display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', overflowY: 'auto', paddingRight: '0.5rem', borderLeft: 'var(--border-thin) solid var(--border-subtle)' }}>
        
        <div 
          className="bill-preview" 
          style={{ 
            position: 'relative',
            width: getPreviewWidth(), 
            backgroundColor: '#ffffff', 
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
            padding: '20px',
            color: '#000',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 1,
            marginBottom: '2rem',
            flexShrink: 0,
            fontFamily: billConfig.body_font_family
          }}
        >
          {/* Top Logo */}
          {billConfig.logo_position === 'top' && (
            <div style={{
              width: '100%',
              display: 'flex',
              justifyContent: 'center',
              marginBottom: '10px',
              zIndex: 1
            }}>
              <div style={{ width: `${billConfig.logo_size || 50}%`, opacity: billConfig.logo_opacity || 1, display: 'flex', justifyContent: 'center' }}>
                {billConfig.logo_base64 ? (
                  <img src={billConfig.logo_base64} alt="" style={{ width: '100%', height: 'auto' }} />
                ) : (
                  <UtensilsCrossed size={48} color="#000" />
                )}
              </div>
            </div>
          )}

          {/* Header Section */}
          <div style={{ 
            textAlign: 'center', 
            marginBottom: '10px',
            fontFamily: billConfig.header_font_family,
            zIndex: 1
          }}>
            <div style={{ fontWeight: 'normal', fontSize: billConfig.store_name_size }}>{storeSettings.hotel_name || "YOUR HOTEL NAME"}</div>
            
            <div style={{ fontSize: billConfig.address_size, marginTop: '4px' }}>
              {billConfig.show_address && <div>{storeSettings.address || "123, Street Name, City"}</div>}
              {billConfig.show_phone && <div>Tel: {storeSettings.phone_number || "9876543210"}</div>}
              {billConfig.show_gst && storeSettings.gst_number && <div>GSTIN: {storeSettings.gst_number}</div>}
              {billConfig.show_fssai && storeSettings.fssai_number && <div>FSSAI: {storeSettings.fssai_number}</div>}
            </div>
          </div>

          {billConfig.sep_header && <div style={{ borderTop: '1px dashed #000', margin: '8px 0', zIndex: 1 }}></div>}

          {/* Body Section */}
          <div style={{ 
            fontFamily: billConfig.body_font_family,
            zIndex: 1
          }}>
            <div style={{ fontSize: billConfig.address_size }}>
               <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                 <div>Bill No: 1234</div>
                 <div>Date: 26-Feb-2026</div>
               </div>
               <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                 <div>Time: 12:30 PM</div>
                 {billConfig.show_cashier_name && <div>Cashier: Admin</div>}
               </div>
            </div>
            
            {billConfig.sep_meta && <div style={{ borderTop: '1px dashed #000', margin: '8px 0' }}></div>}

            {billConfig.show_token && (
              <>
                <div style={{ textAlign: 'center', fontWeight: 'bold', marginTop: '8px', marginBottom: '8px', fontSize: '1.2em' }}>
                  TOKEN: 105
                </div>
                {billConfig.sep_token && <div style={{ borderTop: '1px dashed #000', margin: '8px 0' }}></div>}
              </>
            )}

            <table style={{ width: '100%', borderCollapse: 'collapse', margin: '5px 0', fontSize: billConfig.table_font_size }}>
              <thead>
                <tr style={{ borderBottom: billConfig.sep_table_header ? '1px dashed #000' : 'none' }}>
                  <th style={{ textAlign: 'left', padding: billConfig.row_height, fontWeight: 'normal' }}>Item</th>
                  <th style={{ textAlign: 'right', padding: billConfig.row_height, fontWeight: 'normal' }}>Qty</th>
                  <th style={{ textAlign: 'right', padding: billConfig.row_height, fontWeight: 'normal' }}>Price</th>
                  <th style={{ textAlign: 'right', padding: billConfig.row_height, fontWeight: 'normal' }}>Amt</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ padding: billConfig.row_height }}>Paneer Tikka</td>
                  <td style={{ textAlign: 'right', padding: billConfig.row_height }}>1</td>
                  <td style={{ textAlign: 'right', padding: billConfig.row_height }}>250.00</td>
                  <td style={{ textAlign: 'right', padding: billConfig.row_height }}>250.00</td>
                </tr>
                <tr>
                  <td style={{ padding: billConfig.row_height }}>Butter Naan</td>
                  <td style={{ textAlign: 'right', padding: billConfig.row_height }}>2</td>
                  <td style={{ textAlign: 'right', padding: billConfig.row_height }}>40.00</td>
                  <td style={{ textAlign: 'right', padding: billConfig.row_height }}>80.00</td>
                </tr>
                <tr>
                  <td style={{ padding: billConfig.row_height }}>Dal Makhani</td>
                  <td style={{ textAlign: 'right', padding: billConfig.row_height }}>1</td>
                  <td style={{ textAlign: 'right', padding: billConfig.row_height }}>180.00</td>
                  <td style={{ textAlign: 'right', padding: billConfig.row_height }}>180.00</td>
                </tr>
              </tbody>
            </table>

            {billConfig.sep_table_body && <div style={{ borderTop: '1px dashed #000', margin: '8px 0' }}></div>}

            <div style={{ fontSize: billConfig.table_font_size }}>
               <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                 <span>Subtotal:</span>
                 <span>510.00</span>
               </div>
               
               {billConfig.gst_enabled && (
                 <>
                   {billConfig.gst_type === 'Exclusive' ? (
                     <>
                       <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                         <span>CGST ({billConfig.gst_percentage / 2}%):</span>
                         <span>{(510 * (billConfig.gst_percentage / 100) / 2).toFixed(2)}</span>
                       </div>
                       <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                         <span>SGST ({billConfig.gst_percentage / 2}%):</span>
                         <span>{(510 * (billConfig.gst_percentage / 100) / 2).toFixed(2)}</span>
                       </div>
                     </>
                   ) : (
                     <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9em' }}>
                       <span>(Includes Rs. {(510 - (510 / (1 + (billConfig.gst_percentage / 100)))).toFixed(2)} GST)</span>
                     </div>
                   )}
                 </>
               )}
            </div>
            
            {billConfig.sep_subtotals && <div style={{ borderTop: '1px dashed #000', margin: '8px 0' }}></div>}
            
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: billConfig.total_font_size }}>
              <span>GRAND TOTAL:</span>
              <span>{billConfig.gst_enabled && billConfig.gst_type === 'Exclusive' ? `Rs. ${(510 + (510 * (billConfig.gst_percentage / 100))).toFixed(2)}` : 'Rs. 510.00'}</span>
            </div>
            
            {billConfig.sep_grand_total && <div style={{ borderBottom: '1px dashed #000', margin: '8px 0' }}></div>}
          </div>

          {/* Footer Section */}
          <div style={{ 
            textAlign: 'center', 
            marginTop: '10px', 
            fontFamily: billConfig.footer_font_family,
            fontSize: billConfig.footer_font_size,
            zIndex: 1
          }}>
            {billConfig.footer_message || "Thank you! Visit again."}
          </div>
          
          {/* Dummy QR Code Section */}
          {(!billConfig.no_qr_print) && (
            <div style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              marginTop: '15px', 
              paddingTop: '15px',
              fontFamily: billConfig.body_font_family,
              zIndex: 1
            }}>
              <div style={{ fontSize: '0.85em', marginBottom: '5px' }}>Scan to Pay via UPI</div>
              <div style={{ 
                width: '100px', 
                height: '100px', 
                border: '1px solid #000', 
                display: 'flex', 
                justifyContent: 'center', 
                alignItems: 'center',
                background: '#fff' 
              }}>
                <QrCode size={64} color="#000" />
              </div>
            </div>
          )}
        </div>

        {/* KOT Preview */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', alignSelf: 'flex-start', marginBottom: '1rem' }}>
          <Eye size={20} color="var(--text-primary)" />
          <h3 className="panel-title" style={{ margin: 0 }}>KOT Preview</h3>
        </div>
        
        <div 
          className="kot-preview" 
          style={{ 
            position: 'relative',
            width: getPreviewWidth(), 
            backgroundColor: '#ffffff', 
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
            padding: '20px',
            color: '#000',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 1,
            flexShrink: 0
          }}
        >
          {/* Header Section */}
          <div style={{ 
            textAlign: 'center', 
            marginBottom: '10px',
            fontFamily: kotConfig.header_font_family,
            zIndex: 1
          }}>
            {kotConfig.show_token && (
              <>
                <div style={{ marginTop: '8px', marginBottom: '8px', fontWeight: 'bold', fontSize: '1.4em' }}>TOKEN: 105</div>
                {kotConfig.sep_token && <div style={{ borderTop: '1px dashed #000', margin: '10px 0', zIndex: 1 }}></div>}
              </>
            )}
            <div style={{ fontWeight: 'normal', fontSize: kotConfig.header_font_size }}>--- KOT ---</div>
            {kotConfig.sep_header && <div style={{ borderTop: '1px dashed #000', margin: '10px 0', zIndex: 1 }}></div>}
          </div>

          {/* Body Section */}
          <div style={{ 
            fontFamily: kotConfig.body_font_family,
            fontSize: kotConfig.table_font_size,
            zIndex: 1
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div>Bill No: 1234</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div>Order Type: Dining</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div>Table: T2</div>
            </div>
            <div>Date: 26/02/2026, 12:30:00 pm</div>

            {kotConfig.sep_meta && <div style={{ borderTop: '1px dashed #000', margin: '8px 0' }}></div>}

            <table style={{ width: '100%', borderCollapse: 'collapse', margin: '5px 0' }}>
              <thead>
                <tr style={{ borderBottom: kotConfig.sep_table_header ? '1px dashed #000' : 'none' }}>
                  <th style={{ textAlign: 'left', padding: kotConfig.row_height, fontWeight: 'normal' }}>Item</th>
                  <th style={{ textAlign: 'right', padding: kotConfig.row_height, fontWeight: 'normal' }}>Qty</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ padding: kotConfig.row_height }}>Paneer Tikka</td>
                  <td style={{ textAlign: 'right', padding: kotConfig.row_height }}>1</td>
                </tr>
                <tr>
                  <td style={{ padding: kotConfig.row_height }}>Butter Naan</td>
                  <td style={{ textAlign: 'right', padding: kotConfig.row_height }}>2</td>
                </tr>
                <tr>
                  <td style={{ padding: kotConfig.row_height }}>Dal Makhani</td>
                  <td style={{ textAlign: 'right', padding: kotConfig.row_height }}>1</td>
                </tr>
              </tbody>
            </table>

            {kotConfig.sep_table_body && <div style={{ borderTop: '1px dashed #000', margin: '8px 0' }}></div>}
          </div>
        </div>
        
        <p style={{ marginTop: '1rem', fontSize: '0.75rem', color: 'var(--text-secondary)', flexShrink: 0 }}>
          Note: This is a digital preview. Actual print may vary depending on your printer hardware.
        </p>
      </div>
    </div>
  );
}