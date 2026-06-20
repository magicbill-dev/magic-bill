import { useState, useEffect } from "react";
import Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";
import { Printer, Hash } from "lucide-react";

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
  setUnsavedChanges?: (unsaved: boolean) => void;
  setTriggerSave?: (saveFn: () => Promise<boolean>) => void;
}

export default function PrinterSettings({ db, activeTab, setUnsavedChanges, setTriggerSave }: PrinterSettingsProps) {
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

  const [initialSettings, setInitialSettings] = useState<PrinterConfig | null>(null);
  const [initialCategoryPrinters, setInitialCategoryPrinters] = useState<Record<number, string>>({});

  useEffect(() => {
    if (setUnsavedChanges && initialSettings) {
      const isUnsaved = 
        JSON.stringify(settings) !== JSON.stringify(initialSettings) ||
        JSON.stringify(categoryPrinters) !== JSON.stringify(initialCategoryPrinters);
      setUnsavedChanges(isUnsaved);
    }
  }, [settings, categoryPrinters, initialSettings, initialCategoryPrinters, setUnsavedChanges]);

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
      setInitialCategoryPrinters(mappings);
      
      if (result.length > 0) {
        const row = result[0];
        const s = {
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
        };
        setSettings(s);
        setInitialSettings(s);
      } else {
        setInitialSettings(settings);
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

  const doSave = async () => {
    if (!db) return false;
    
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

      setInitialSettings(settings);
      setInitialCategoryPrinters(categoryPrinters);
      setToastMessage("Printer settings saved successfully!");
      return true;
    } catch (error) {
      console.error("Failed to save printer settings:", error);
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
  }, [settings, categoryPrinters, db, setTriggerSave]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await doSave();
  };

  // Sends a small ESC/POS test slip to the selected printer using the exact
  // same path the Billing page uses (print_receipt_raw), and surfaces the
  // real hardware error so connection problems can be diagnosed.
  const [testing, setTesting] = useState(false);
  const handleTestPrint = async () => {
    if (!settings.default_printer) {
      setToastMessage("Select a default printer first (and Save).");
      return;
    }
    setTesting(true);
    try {
      const enc = new TextEncoder();
      const body =
        "\n" +
        "    *** TEST PRINT ***\n" +
        "         Magic Bill\n\n" +
        `  Printer: ${settings.default_printer}\n` +
        `  ${new Date().toLocaleString()}\n` +
        "  Connection OK!\n\n\n\n";
      // ESC @ (init) ... text ... GS V A 16 (partial cut)
      const data = [0x1b, 0x40, ...Array.from(enc.encode(body)), 0x1d, 0x56, 0x41, 0x10];
      await invoke("print_receipt_raw", { printerName: settings.default_printer, data });
      setToastMessage(`Test sent to "${settings.default_printer}" successfully.`);
    } catch (err) {
      setToastMessage(`Test print FAILED: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setTesting(false);
    }
  };

  // Re-scan connected printers on demand (in case the device was just plugged in).
  const refreshPrinters = async () => {
    try {
      const list = await invoke<string[]>("get_printers");
      setPrinters(list);
      setToastMessage(`Found ${list.length} printer(s).`);
    } catch (err) {
      setToastMessage(`Could not read printers: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <div className="sx-page">
      {toastMessage && <div className="toast-notification">{toastMessage}</div>}

      <div className="sx-head">
        <h1>Printer Settings</h1>
        <p>Manage printing preferences and connections</p>
      </div>

      {loading ? (
        <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-secondary)' }}>
          Loading printer settings…
        </div>
      ) : (
        <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>

          {/* Printer Configuration */}
          <div className="sx-group">
            <div className="sx-group-head"><Printer size={14} /> Printer Configuration</div>

            <div className="sx-field">
              <label>Printer Mode</label>
              <div className="sx-grid cols-2">
                <label className="sx-check">
                  <input type="radio" name="printer_mode" value="Single Printer" checked={settings.printer_mode === "Single Printer"} onChange={(e) => setSettings({ ...settings, printer_mode: e.target.value })} />
                  Single Printer
                </label>
                <label className="sx-check">
                  <input type="radio" name="printer_mode" value="Multiple Printers" checked={settings.printer_mode === "Multiple Printers"} onChange={(e) => setSettings({ ...settings, printer_mode: e.target.value })} />
                  Multiple Printers (Category-wise)
                </label>
              </div>
            </div>

            {settings.printer_mode === "Single Printer" && (
              <div className="sx-field">
                <label>KOT Printing Style</label>
                <div className="sx-grid cols-2">
                  <label className="sx-check">
                    <input type="radio" name="kot_printing_style" value="Single KOT" checked={settings.kot_printing_style === "Single KOT"} onChange={(e) => setSettings({ ...settings, kot_printing_style: e.target.value })} />
                    Single KOT (All items in one ticket)
                  </label>
                  <label className="sx-check">
                    <input type="radio" name="kot_printing_style" value="Category-wise KOTs" checked={settings.kot_printing_style === "Category-wise KOTs"} onChange={(e) => setSettings({ ...settings, kot_printing_style: e.target.value })} />
                    Category-wise KOTs (Separate per category)
                  </label>
                </div>
              </div>
            )}

            <div className="sx-grid cols-3">
              <div className="sx-field">
                <label>Default Printer (Bills &amp; Unassigned KOTs)</label>
                <select value={settings.default_printer} onChange={(e) => setSettings({ ...settings, default_printer: e.target.value })} className="sx-select">
                  <option value="">Select a printer</option>
                  {printers.map((printer, index) => (
                    <option key={index} value={printer}>{printer}</option>
                  ))}
                </select>
                <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-1)' }}>
                  <button type="button" onClick={handleTestPrint} disabled={testing || !settings.default_printer} className="sx-btn-ghost" style={{ padding: '0.4rem 0.7rem' }}>
                    <Printer size={14} /> {testing ? "Testing…" : "Test Print"}
                  </button>
                  <button type="button" onClick={refreshPrinters} className="sx-btn-ghost" style={{ padding: '0.4rem 0.7rem' }}>
                    Refresh List
                  </button>
                </div>
              </div>
              <div className="sx-field">
                <label>Paper Size</label>
                <select value={settings.paper_size} onChange={(e) => setSettings({ ...settings, paper_size: e.target.value })} className="sx-select">
                  <option value="2inch">58mm (2 inch)</option>
                  <option value="3inch">80mm (3 inch)</option>
                  <option value="4inch">100mm (4 inch)</option>
                </select>
              </div>
              <div className="sx-field">
                <label>Print Options</label>
                <label className="sx-check">
                  <input type="checkbox" checked={settings.print_bold} onChange={(e) => setSettings({ ...settings, print_bold: e.target.checked })} />
                  Bold &amp; Dark (ESC/POS)
                </label>
              </div>
            </div>

            {settings.printer_mode === "Multiple Printers" && (
              <div className="sx-field">
                <label>Category Printer Mapping</label>
                {categories.length === 0 ? (
                  <p className="settings-hint">No categories found. Please add categories first.</p>
                ) : (
                  <div className="sx-grid cols-3">
                    {categories.map(cat => (
                      <div key={cat.id} className="sx-field">
                        <label style={{ textTransform: 'none' }}>{cat.name}</label>
                        <select value={categoryPrinters[cat.id] || ""} onChange={(e) => setCategoryPrinters({ ...categoryPrinters, [cat.id]: e.target.value })} className="sx-select">
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

            <div className="sx-field">
              <label>Printing Flow &amp; Confirmation</label>
              <div className="sx-grid cols-3">
                <label className="sx-check">
                  <input type="checkbox" checked={settings.kot_print_confirmation} onChange={(e) => setSettings({ ...settings, kot_print_confirmation: e.target.checked })} />
                  Confirm before printing KOT
                  <span className="sx-hint">Saves paper</span>
                </label>
                <label className="sx-check">
                  <input type="checkbox" checked={settings.bill_print_confirmation} onChange={(e) => setSettings({ ...settings, bill_print_confirmation: e.target.checked })} />
                  Confirm before printing Bill
                  <span className="sx-hint">Prevents accidents</span>
                </label>
                <label className="sx-check">
                  <input type="checkbox" checked={settings.disable_kot} onChange={(e) => setSettings({ ...settings, disable_kot: e.target.checked })} />
                  Disable KOT entirely
                  <span className="sx-hint">Direct to Processing</span>
                </label>
              </div>
            </div>
          </div>

          {/* Token Numbering */}
          <div className="sx-group">
            <div className="sx-group-head"><Hash size={14} /> Token Numbering</div>
            <label className="sx-check" style={{ alignSelf: 'flex-start' }}>
              <input type="checkbox" checked={settings.token_reset_daily} onChange={(e) => setSettings({ ...settings, token_reset_daily: e.target.checked })} />
              Reset Token Number Daily
            </label>
            <div className="sx-grid cols-3">
              <div className="sx-field">
                <label>Daily Starting Number</label>
                <input type="number" value={settings.token_starting_number} onChange={(e) => setSettings({ ...settings, token_starting_number: parseInt(e.target.value) || 0 })} className="sx-input" />
              </div>
              <div className="sx-field">
                <label>Current Token Number</label>
                <input type="number" value={settings.token_current_number} onChange={(e) => setSettings({ ...settings, token_current_number: parseInt(e.target.value) || 0 })} className="sx-input" />
              </div>
              <div className="sx-field">
                <label>Token Print Size (Bill &amp; KOT)</label>
                <select value={settings.token_print_size} onChange={(e) => setSettings({ ...settings, token_print_size: e.target.value })} className="sx-select">
                  <option value="Normal">Normal</option>
                  <option value="Large">Large</option>
                  <option value="Extra Large">Extra Large (Huge)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Bill Numbering */}
          <div className="sx-group">
            <div className="sx-group-head"><Hash size={14} /> Bill Numbering</div>
            <label className="sx-check" style={{ alignSelf: 'flex-start' }}>
              <input type="checkbox" checked={settings.bill_reset_daily} onChange={(e) => setSettings({ ...settings, bill_reset_daily: e.target.checked })} />
              Reset Bill Number Daily
            </label>
            <div className="sx-grid cols-3">
              <div className="sx-field">
                <label>Bill Prefix</label>
                <input type="text" value={settings.bill_prefix} onChange={(e) => setSettings({ ...settings, bill_prefix: e.target.value })} placeholder="e.g. BIR/ (optional)" className="sx-input" />
              </div>
              <div className="sx-field">
                <label>Daily Starting Number</label>
                <input type="number" value={settings.bill_starting_number} onChange={(e) => setSettings({ ...settings, bill_starting_number: parseInt(e.target.value) || 0 })} className="sx-input" />
              </div>
              <div className="sx-field">
                <label>Current Bill Number</label>
                <input type="number" value={settings.bill_current_number} onChange={(e) => setSettings({ ...settings, bill_current_number: parseInt(e.target.value) || 0 })} className="sx-input" />
              </div>
            </div>
            <p className="settings-hint">Counters reset to the starting numbers on the first order of a new day.</p>
          </div>

          <div className="sx-actions">
            <button type="submit" disabled={saving} className="sx-btn-primary">
              {saving ? "Saving…" : "Save Printer Settings"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
