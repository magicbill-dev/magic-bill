import { useState, useEffect } from "react";
import Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";

interface PrinterConfig {
  printer_mode: string;
  default_printer: string;
  kot_printing_style: string;
  token_reset_daily: boolean;
  token_starting_number: number;
  token_current_number?: number;
  token_print_size?: string;
  bill_reset_daily: boolean;
  bill_starting_number: number;
  bill_current_number?: number;
  bill_prefix?: string;
  last_reset_date?: string;
  paper_size: string;
  print_bold: boolean;
  kot_print_confirmation: boolean;
  bill_print_confirmation: boolean;
  disable_kot: boolean;
}

interface Category {
  id: number;
  name: string;
}

interface CategoryPrinterMapping {
  category_id: number;
  printer_name: string;
}

interface PrinterSettingsProps {
  db: Database | null;
  activeTab: string;
}

export default function PrinterSettings({ db, activeTab }: PrinterSettingsProps) {
  const [settings, setSettings] = useState<PrinterConfig>({
    printer_mode: "Single Printer",
    default_printer: "",
    kot_printing_style: "Category-wise KOTs",
    token_reset_daily: true,
    token_starting_number: 100,
    token_current_number: 100,
    token_print_size: "Large",
    bill_reset_daily: false,
    bill_starting_number: 0,
    bill_current_number: 0,
    bill_prefix: "",
    paper_size: "3inch",
    print_bold: false,
    kot_print_confirmation: false,
    bill_print_confirmation: false,
    disable_kot: false,
  });
  
  const [printers, setPrinters] = useState<string[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryPrinters, setCategoryPrinters] = useState<Record<number, string>>({});
  
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  useEffect(() => {
    if (db && activeTab === "Printer") {
      fetchSettings();
    }
  }, [db, activeTab]);

  const fetchSettings = async () => {
    if (!db) return;
    try {
      if (printers.length === 0) {
        setLoading(true);
      }
      
      const result = await db.select<any[]>("SELECT * FROM printer_settings WHERE id = 1");
      const catResult = await db.select<Category[]>("SELECT * FROM categories ORDER BY name");
      const mappingResult = await db.select<CategoryPrinterMapping[]>("SELECT * FROM category_printers");
      
      setCategories(catResult);
      
      const mappings: Record<number, string> = {};
      mappingResult.forEach(m => {
        mappings[m.category_id] = m.printer_name;
      });
      setCategoryPrinters(mappings);
      
      if (result.length > 0) {
        const row = result[0];
        setSettings({
          printer_mode: row.printer_mode || "Single Printer",
          default_printer: row.default_printer || "",
          kot_printing_style: row.kot_printing_style || "Category-wise KOTs",
          token_reset_daily: Boolean(row.token_reset_daily),
          token_starting_number: row.token_starting_number || 100,
          token_current_number: row.token_current_number || 100,
          token_print_size: row.token_print_size || "Large",
          bill_reset_daily: Boolean(row.bill_reset_daily),
          bill_starting_number: row.bill_starting_number || 0,
          bill_current_number: row.bill_current_number || 0,
          bill_prefix: row.bill_prefix || "",
          paper_size: row.paper_size || "3inch",
          print_bold: Boolean(row.print_bold),
          kot_print_confirmation: Boolean(row.kot_print_confirmation),
          bill_print_confirmation: Boolean(row.bill_print_confirmation),
          disable_kot: Boolean(row.disable_kot),
        });
      }
      
      setLoading(false);

      invoke<string[]>("get_printers").then(printerList => {
        setPrinters(printerList);
      }).catch(err => console.error("Failed to fetch printers:", err));
      
    } catch (error) {
      console.error("Failed to fetch printer settings:", error);
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db) return;
    
    try {
      setSaving(true);
      const existing = await db.select<any[]>("SELECT id FROM printer_settings WHERE id = 1");
      
      if (existing.length > 0) {
        await db.execute(
          `UPDATE printer_settings SET 
            printer_mode = $1, 
            default_printer = $2, 
            kot_printing_style = $3, 
            token_reset_daily = $4, 
            token_starting_number = $5, 
            bill_reset_daily = $6, 
            bill_starting_number = $7,
            paper_size = $8,
            print_bold = $9,
            token_print_size = $10,
            bill_prefix = $11,
            token_current_number = $12,
            bill_current_number = $13,
            kot_print_confirmation = $14,
            bill_print_confirmation = $15,
            disable_kot = $16
          WHERE id = 1`,
          [
            settings.printer_mode,
            settings.default_printer,
            settings.kot_printing_style,
            settings.token_reset_daily ? 1 : 0,
            settings.token_starting_number,
            settings.bill_reset_daily ? 1 : 0,
            settings.bill_starting_number,
            settings.paper_size,
            settings.print_bold ? 1 : 0,
            settings.token_print_size,
            settings.bill_prefix,
            settings.token_current_number,
            settings.bill_current_number,
            settings.kot_print_confirmation ? 1 : 0,
            settings.bill_print_confirmation ? 1 : 0,
            settings.disable_kot ? 1 : 0
          ]
        );
      } else {
        await db.execute(
          `INSERT INTO printer_settings (
            id, printer_mode, default_printer, kot_printing_style, 
            token_reset_daily, token_starting_number, bill_reset_daily, bill_starting_number, paper_size, print_bold, token_print_size, bill_prefix, token_current_number, bill_current_number, kot_print_confirmation, bill_print_confirmation, disable_kot
          ) VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
          [
            settings.printer_mode,
            settings.default_printer,
            settings.kot_printing_style,
            settings.token_reset_daily ? 1 : 0,
            settings.token_starting_number,
            settings.bill_reset_daily ? 1 : 0,
            settings.bill_starting_number,
            settings.paper_size,
            settings.print_bold ? 1 : 0,
            settings.token_print_size,
            settings.bill_prefix,
            settings.token_current_number,
            settings.bill_current_number,
            settings.kot_print_confirmation ? 1 : 0,
            settings.bill_print_confirmation ? 1 : 0,
            settings.disable_kot ? 1 : 0
          ]
        );
      }

      // Save category mappings
      if (settings.printer_mode === "Multiple Printers") {
        await db.execute(`DELETE FROM category_printers`);
        for (const [catId, printerName] of Object.entries(categoryPrinters)) {
          if (printerName) {
            await db.execute(
              `INSERT INTO category_printers (category_id, printer_name) VALUES ($1, $2)`,
              [Number(catId), printerName]
            );
          }
        }
      } else {
        // Clear them out if mode is single printer (optional, but good for cleanup)
        await db.execute(`DELETE FROM category_printers`);
      }

      setToastMessage("Printer settings saved successfully!");
    } catch (error) {
      console.error("Failed to save printer settings:", error);
      setToastMessage(`Error saving settings: ${error}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-page-wrapper">
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

      <div className="settings-page-header">
        <h2 className="settings-page-title">Printer Settings</h2>
        <p className="settings-page-subtitle">Manage printing preferences and connections</p>
      </div>

      {loading ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          Loading printer settings...
        </div>
      ) : (
        <form onSubmit={handleSave} style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          
          {/* Main Printer Settings Card */}
          <div className="modern-panel" style={{ flex: '1 1 500px' }}>
            <div className="modern-panel-header">Printer Configuration</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              
              <div className="modern-form-group">
                <label className="modern-label">Printer Mode</label>
                <div style={{ display: 'flex', gap: '1.5rem', background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '0.5rem', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <label className="modern-checkbox-label" style={{ fontWeight: 500 }}>
                    <input
                      type="radio"
                      name="printer_mode"
                      value="Single Printer"
                      checked={settings.printer_mode === "Single Printer"}
                      onChange={(e) => setSettings({ ...settings, printer_mode: e.target.value })}
                    />
                    Single Printer
                  </label>
                  <label className="modern-checkbox-label" style={{ fontWeight: 500 }}>
                    <input
                      type="radio"
                      name="printer_mode"
                      value="Multiple Printers"
                      checked={settings.printer_mode === "Multiple Printers"}
                      onChange={(e) => setSettings({ ...settings, printer_mode: e.target.value })}
                    />
                    Multiple Printers (Category-wise)
                  </label>
                </div>
              </div>

              <div className="modern-form-group">
                <label className="modern-label">Default Printer (Bills & Unassigned KOTs)</label>
                <select
                  value={settings.default_printer}
                  onChange={(e) => setSettings({ ...settings, default_printer: e.target.value })}
                  className="modern-select"
                >
                  <option value="">Select a printer</option>
                  {printers.map((printer, index) => (
                    <option key={index} value={printer}>{printer}</option>
                  ))}
                </select>
              </div>

              {settings.printer_mode === "Multiple Printers" && (
                <div className="modern-form-group" style={{ paddingTop: '1rem', borderTop: '1px dashed rgba(255,255,255,0.1)' }}>
                  <label className="modern-label" style={{ color: 'var(--text-primary)' }}>Category Printer Mapping</label>
                  {categories.length === 0 ? (
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '0.5rem' }}>No categories found. Please add categories first.</p>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1rem', background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '0.5rem', border: '1px solid rgba(255,255,255,0.05)' }}>
                      {categories.map(cat => (
                        <div key={cat.id} className="modern-form-group">
                          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{cat.name}</span>
                          <select
                            value={categoryPrinters[cat.id] || ""}
                            onChange={(e) => setCategoryPrinters({ ...categoryPrinters, [cat.id]: e.target.value })}
                            className="modern-select"
                            style={{ padding: '0.5rem' }}
                          >
                            <option value="">Use Default</option>
                            {printers.map((printer, index) => (
                              <option key={index} value={printer}>{printer}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', paddingTop: '1rem', borderTop: '1px dashed rgba(255,255,255,0.1)' }}>
                <div className="modern-form-group" style={{ flex: 1 }}>
                  <label className="modern-label">Paper Size</label>
                  <select
                    value={settings.paper_size}
                    onChange={(e) => setSettings({ ...settings, paper_size: e.target.value })}
                    className="modern-select"
                  >
                    <option value="2inch">58mm (2 inch)</option>
                    <option value="3inch">80mm (3 inch)</option>
                    <option value="4inch">100mm (4 inch)</option>
                  </select>
                </div>
                
                <div style={{ flex: 1, marginTop: '1.5rem' }}>
                  <label className="modern-checkbox-label" style={{ padding: '0.85rem', background: 'rgba(0,0,0,0.2)', borderRadius: '0.5rem', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <input
                      type="checkbox"
                      checked={settings.print_bold}
                      onChange={(e) => setSettings({ ...settings, print_bold: e.target.checked })}
                    />
                    Print Text Bold & Dark (ESC/POS)
                  </label>
                </div>
              </div>

              <div className="modern-form-group" style={{ paddingTop: '1rem', borderTop: '1px dashed rgba(255,255,255,0.1)' }}>
                <label className="modern-label">Printing Flow & Confirmation</label>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label className="modern-checkbox-label" style={{ padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '0.5rem', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <input
                      type="checkbox"
                      checked={settings.kot_print_confirmation}
                      onChange={(e) => setSettings({ ...settings, kot_print_confirmation: e.target.checked })}
                    />
                    Require Double Confirmation Before Printing KOT
                    <span style={{ fontWeight: 'normal', color: 'var(--text-secondary)', fontSize: '0.75rem', marginLeft: 'auto' }}>(Helps save paper)</span>
                  </label>

                  <label className="modern-checkbox-label" style={{ padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '0.5rem', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <input
                      type="checkbox"
                      checked={settings.bill_print_confirmation}
                      onChange={(e) => setSettings({ ...settings, bill_print_confirmation: e.target.checked })}
                    />
                    Require Double Confirmation Before Printing Bill
                    <span style={{ fontWeight: 'normal', color: 'var(--text-secondary)', fontSize: '0.75rem', marginLeft: 'auto' }}>(Helps prevent accidental finalization)</span>
                  </label>

                  <label className="modern-checkbox-label" style={{ padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '0.5rem', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <input
                      type="checkbox"
                      checked={settings.disable_kot}
                      onChange={(e) => setSettings({ ...settings, disable_kot: e.target.checked })}
                    />
                    Disable KOT Function Entirely
                    <span style={{ fontWeight: 'normal', color: 'var(--text-secondary)', fontSize: '0.75rem', marginLeft: 'auto' }}>(Enter button directly prints Bill)</span>
                  </label>
                </div>
              </div>

              <button 
                type="submit" 
                disabled={saving}
                className="modern-btn-primary"
                style={{ marginTop: '1rem' }}
              >
                {saving ? "Saving..." : "Save Printer Settings"}
              </button>
            </div>
          </div>

          {/* Numbering Rules Card */}
          <div className="modern-panel" style={{ flex: '1 1 400px' }}>
            <div className="modern-panel-header">Numbering Rules</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
              
              {/* Token Configuration */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <h4 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--primary)', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}>Token Configuration</h4>
                
                <label className="modern-checkbox-label">
                  <input
                    type="checkbox"
                    checked={settings.token_reset_daily}
                    onChange={(e) => setSettings({ ...settings, token_reset_daily: e.target.checked })}
                  />
                  Reset Token Number Daily
                </label>
                
                <div className="modern-grid-2">
                    <div className="modern-form-group">
                        <label className="modern-label" style={{textTransform: 'none'}}>Daily Starting Number</label>
                        <input
                            type="number"
                            value={settings.token_starting_number}
                            onChange={(e) => setSettings({ ...settings, token_starting_number: parseInt(e.target.value) || 0 })}
                            className="modern-input"
                        />
                    </div>
                    <div className="modern-form-group">
                        <label className="modern-label" style={{textTransform: 'none'}}>Current Token Number</label>
                        <input
                            type="number"
                            value={settings.token_current_number}
                            onChange={(e) => setSettings({ ...settings, token_current_number: parseInt(e.target.value) || 0 })}
                            className="modern-input"
                        />
                    </div>
                </div>

                <div className="modern-form-group">
                  <label className="modern-label" style={{textTransform: 'none'}}>Token Print Size (on Bill & KOT)</label>
                  <select
                    value={settings.token_print_size}
                    onChange={(e) => setSettings({ ...settings, token_print_size: e.target.value })}
                    className="modern-select"
                  >
                    <option value="Normal">Normal</option>
                    <option value="Large">Large</option>
                    <option value="Extra Large">Extra Large (Huge)</option>
                  </select>
                </div>
              </div>

              {/* Bill Configuration */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <h4 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--primary)', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}>Bill Configuration</h4>
                
                <label className="modern-checkbox-label">
                  <input
                    type="checkbox"
                    checked={settings.bill_reset_daily}
                    onChange={(e) => setSettings({ ...settings, bill_reset_daily: e.target.checked })}
                  />
                  Reset Bill Number Daily
                </label>

                <div className="modern-form-group">
                  <label className="modern-label" style={{textTransform: 'none'}}>Bill Prefix (e.g. BIR/ or #{'{'}YYYY{'}'}/)</label>
                  <input
                    type="text"
                    value={settings.bill_prefix}
                    onChange={(e) => setSettings({ ...settings, bill_prefix: e.target.value })}
                    placeholder="Optional prefix"
                    className="modern-input"
                  />
                </div>
                
                <div className="modern-grid-2">
                    <div className="modern-form-group">
                        <label className="modern-label" style={{textTransform: 'none'}}>Daily Starting Number</label>
                        <input
                            type="number"
                            value={settings.bill_starting_number}
                            onChange={(e) => setSettings({ ...settings, bill_starting_number: parseInt(e.target.value) || 0 })}
                            className="modern-input"
                        />
                    </div>
                    <div className="modern-form-group">
                        <label className="modern-label" style={{textTransform: 'none'}}>Current Bill Number</label>
                        <input
                            type="number"
                            value={settings.bill_current_number}
                            onChange={(e) => setSettings({ ...settings, bill_current_number: parseInt(e.target.value) || 0 })}
                            className="modern-input"
                        />
                    </div>
                </div>
              </div>
              
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '0.5rem', border: '1px dashed rgba(255,255,255,0.1)' }}>
                <strong style={{ display: 'block', marginBottom: '0.25rem' }}>Note on Daily Resets:</strong>
                The application automatically resets these counters to your specified starting numbers on the first order of a new day.
              </div>

            </div>
          </div>

        </form>
      )}
    </div>
  );
}
