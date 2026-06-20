import { useState, useEffect, useRef } from "react";
import Database from "@tauri-apps/plugin-sql";
import { Plus, Trash2, Tag, Edit2, X, Check } from "lucide-react";

interface Category {
  id: number;
  name: string;
}

interface Item {
  id: number;
  category_id: number;
  name: string;
  price: number;
}

interface MenuManagementProps {
  db: Database | null;
  activeTab: string;
}

export default function MenuManagement({ db, activeTab }: MenuManagementProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newItemName, setNewItemName] = useState("");
  const [newItemPrice, setNewItemPrice] = useState("");
  const [loading, setLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const itemNameRef = useRef<HTMLInputElement>(null);
  const itemPriceRef = useRef<HTMLInputElement>(null);

  // Category Edit State
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [editCategoryName, setEditCategoryName] = useState("");

  // Delete Confirmation State
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ type: 'category' | 'item', id: number, name: string } | null>(null);

  // Edit State
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editItemName, setEditItemName] = useState("");
  const [editItemPrice, setEditItemPrice] = useState("");
  const [editItemCategoryId, setEditItemCategoryId] = useState<number | null>(null);

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  useEffect(() => {
    if (db && activeTab === "Menu") {
      fetchCategories();
    }
  }, [db, activeTab]);

  useEffect(() => {
    if (db && selectedCategoryId !== null) {
      fetchItems(selectedCategoryId);
      // Cancel edit if changing categories
      cancelEdit();
    } else {
      setItems([]);
    }
  }, [db, selectedCategoryId]);

  const fetchCategories = async () => {
    if (!db) return;
    try {
      setLoading(true);
      const result = await db.select<Category[]>("SELECT * FROM categories ORDER BY name");
      setCategories(result);
      if (result.length > 0 && selectedCategoryId === null) {
        setSelectedCategoryId(result[0].id);
      }
    } catch (error) {
      console.error("Failed to fetch categories:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchItems = async (categoryId: number) => {
    if (!db) return;
    try {
      const result = await db.select<Item[]>("SELECT * FROM items WHERE category_id = ? ORDER BY name", [categoryId]);
      setItems(result);
    } catch (error) {
      console.error("Failed to fetch items:", error);
    }
  };

  const addCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db || !newCategoryName.trim()) return;

    const nameToSave = newCategoryName.trim();
    
    // Duplicate check
    const isDuplicate = categories.some(c => c.name.toLowerCase() === nameToSave.toLowerCase());
    if (isDuplicate) {
        setToastMessage("A category with this name already exists.");
        return;
    }

    setNewCategoryName("");

    const tempId = Date.now();
    const newCat = { id: tempId, name: nameToSave };
    setCategories(prev => [...prev, newCat].sort((a, b) => a.name.localeCompare(b.name)));
    if (selectedCategoryId === null) setSelectedCategoryId(tempId);

    try {
      await db.execute("INSERT INTO categories (name) VALUES (?)", [nameToSave]);
      await fetchCategories();
      setToastMessage("Category added.");
    } catch (error) {
      console.error("Failed to add category:", error);
      setToastMessage("Failed to add category.");
      await fetchCategories();
    }
  };

  const addItem = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!db || !newItemName.trim() || !newItemPrice || selectedCategoryId === null) return;

    const nameToSave = newItemName.trim();
    const priceToSave = parseFloat(newItemPrice);
    
    // Duplicate check
    const isDuplicate = items.some(item => item.name.toLowerCase() === nameToSave.toLowerCase());
    if (isDuplicate) {
        setToastMessage("An item with this name already exists in this category.");
        return;
    }

    setNewItemName("");
    setNewItemPrice("");
    setTimeout(() => itemNameRef.current?.focus(), 0);

    const tempId = Date.now();
    const newItem = {
      id: tempId,
      category_id: selectedCategoryId,
      name: nameToSave,
      price: priceToSave
    };
    setItems(prev => [...prev, newItem].sort((a, b) => a.name.localeCompare(b.name)));

    try {
      await db.execute("INSERT INTO items (category_id, name, price) VALUES (?, ?, ?)", [
        selectedCategoryId,
        nameToSave,
        priceToSave
      ]);
      await fetchItems(selectedCategoryId);
      setToastMessage("Item added.");
    } catch (error) {
      console.error("Failed to add item:", error);
      setToastMessage("Failed to add item.");
      await fetchItems(selectedCategoryId);
    }
  };

  const confirmDelete = (type: 'category' | 'item', id: number, name: string) => {
    setDeleteConfirmation({ type, id, name });
  };

  const executeDelete = async () => {
    if (!deleteConfirmation || !db) return;
    const { type, id } = deleteConfirmation;
    setDeleteConfirmation(null);

    if (type === 'category') {
      setCategories(prev => prev.filter(c => c.id !== id));
      if (selectedCategoryId === id) setSelectedCategoryId(null);

      try {
        await db.execute("DELETE FROM items WHERE category_id = ?", [id]);
        await db.execute("DELETE FROM categories WHERE id = ?", [id]);
        await fetchCategories();
        setToastMessage("Category deleted.");
      } catch (error) {
        console.error("Failed to delete category:", error);
        setToastMessage("Failed to delete category.");
        await fetchCategories();
      }
    } else {
      setItems(prev => prev.filter(item => item.id !== id));

      try {
        await db.execute("DELETE FROM items WHERE id = ?", [id]);
        if (selectedCategoryId) await fetchItems(selectedCategoryId);
        setToastMessage("Item deleted.");
      } catch (error) {
        console.error("Failed to delete item:", error);
        setToastMessage("Failed to delete item.");
        if (selectedCategoryId) await fetchItems(selectedCategoryId);
      }
    }
  };

  const startCategoryEdit = (cat: Category) => {
    setEditingCategoryId(cat.id);
    setEditCategoryName(cat.name);
  };

  const saveCategoryEdit = async (id: number) => {
    if (!db || !editCategoryName.trim()) return;
    const newName = editCategoryName.trim();
    
    // Duplicate check
    const isDuplicate = categories.some(c => c.id !== id && c.name.toLowerCase() === newName.toLowerCase());
    if (isDuplicate) {
        setToastMessage("A category with this name already exists.");
        return;
    }

    setCategories(prev => prev.map(c => c.id === id ? { ...c, name: newName } : c).sort((a, b) => a.name.localeCompare(b.name)));
    setEditingCategoryId(null);
    try {
      await db.execute("UPDATE categories SET name = ? WHERE id = ?", [newName, id]);
      setToastMessage("Category updated.");
    } catch (error) {
      console.error("Failed to update category", error);
      setToastMessage("Failed to update category.");
      fetchCategories();
    }
  };

  // --- Edit Functionality ---
  const startEdit = (item: Item) => {
    setEditingItemId(item.id);
    setEditItemName(item.name);
    setEditItemPrice(item.price.toString());
    setEditItemCategoryId(item.category_id);
  };

  const cancelEdit = () => {
    setEditingItemId(null);
    setEditItemName("");
    setEditItemPrice("");
    setEditItemCategoryId(null);
  };

  const saveEdit = async (id: number) => {
    if (!db || !editItemName.trim() || !editItemPrice || !editItemCategoryId) return;

    const nameToSave = editItemName.trim();
    const priceToSave = parseFloat(editItemPrice);
    const categoryToSave = editItemCategoryId;

    if (categoryToSave === selectedCategoryId) {
       // Duplicate check within current category view
       const isDuplicate = items.some(item => item.id !== id && item.name.toLowerCase() === nameToSave.toLowerCase());
       if (isDuplicate) {
           setToastMessage("An item with this name already exists in this category.");
           return;
       }
    } else {
        // Checking against db if moving to a different category
        try {
            const existing = await db.select<Item[]>("SELECT id FROM items WHERE category_id = $1 AND LOWER(name) = LOWER($2)", [categoryToSave, nameToSave]);
            if (existing && existing.length > 0) {
                 setToastMessage("An item with this name already exists in the target category.");
                 return;
            }
        } catch (err) {
            console.error(err);
        }
    }

    // Optimistic Update
    setItems(prev => prev.map(item => {
      if (item.id === id) {
        return { ...item, name: nameToSave, price: priceToSave, category_id: categoryToSave };
      }
      return item;
    }));
    
    // If it was moved to another category, remove it from the current view locally right away
    if (categoryToSave !== selectedCategoryId) {
       setItems(prev => prev.filter(item => item.id !== id));
    }

    cancelEdit();

    try {
      await db.execute("UPDATE items SET name = ?, price = ?, category_id = ? WHERE id = ?", [
        nameToSave,
        priceToSave,
        categoryToSave,
        id
      ]);
      // Refetch if still on the same category, just to be safe
      if (selectedCategoryId) {
         await fetchItems(selectedCategoryId);
      }
      setToastMessage("Item updated.");
    } catch (error) {
      console.error("Failed to update item:", error);
      setToastMessage("Failed to update item.");
      if (selectedCategoryId) await fetchItems(selectedCategoryId);
    }
  };

  const activeCategory = categories.find(c => c.id === selectedCategoryId);

  return (
    <div className="sx-split">
      {toastMessage && <div className="toast-notification">{toastMessage}</div>}

      {/* LEFT: CATEGORIES */}
      <aside className="sx-split-aside">
        <div className="sx-head">
          <h1 style={{ fontSize: 'var(--text-xl)' }}>Categories</h1>
          <p>Organize your offerings</p>
        </div>

        <form onSubmit={addCategory} style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <input
            type="text"
            placeholder="New category…"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            className="sx-input"
          />
          <button type="submit" disabled={!newCategoryName.trim()} className="sx-btn-primary" style={{ flexShrink: 0, padding: '0.5rem 0.65rem' }}>
            <Plus size={18} />
          </button>
        </form>

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', margin: '0 calc(-1 * var(--space-2))', paddingRight: 'var(--space-1)' }}>
          {loading && categories.length === 0 ? (
            <p className="settings-hint" style={{ padding: 'var(--space-2)' }}>Loading…</p>
          ) : categories.length === 0 ? (
            <p className="settings-hint" style={{ padding: 'var(--space-2)' }}>No categories yet.</p>
          ) : (
            categories.map(cat => {
              const isActive = selectedCategoryId === cat.id;
              return (
                <div
                  key={cat.id}
                  onClick={() => { if (editingCategoryId !== cat.id) setSelectedCategoryId(cat.id); }}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    gap: 'var(--space-2)', padding: '0.5rem 0.65rem', borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    background: isActive ? 'var(--accent-subtle)' : 'transparent',
                    color: isActive ? 'var(--primary)' : 'var(--text-primary)',
                    fontWeight: isActive ? 'var(--font-bold)' : 'var(--font-medium)',
                    fontSize: 'var(--text-sm)',
                    borderLeft: `3px solid ${isActive ? 'var(--primary)' : 'transparent'}`,
                    transition: 'all var(--transition-fast)'
                  }}
                >
                  {editingCategoryId === cat.id ? (
                    <div style={{ display: 'flex', width: '100%', gap: 'var(--space-1)' }} onClick={e => e.stopPropagation()}>
                      <input autoFocus value={editCategoryName} onChange={e => setEditCategoryName(e.target.value)} className="sx-input" style={{ flex: 1, padding: '0.3rem 0.5rem' }} />
                      <button onClick={() => saveCategoryEdit(cat.id)} className="row-action-btn" title="Save"><Check size={16} /></button>
                      <button onClick={() => setEditingCategoryId(null)} className="row-action-btn danger" title="Cancel"><X size={16} /></button>
                    </div>
                  ) : (
                    <>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat.name}</span>
                      <div style={{ display: 'flex', gap: '0.1rem', flexShrink: 0 }}>
                        <button onClick={(e) => { e.stopPropagation(); startCategoryEdit(cat); }} className="row-action-btn" title="Edit category"><Edit2 size={15} /></button>
                        <button onClick={(e) => { e.stopPropagation(); confirmDelete('category', cat.id, cat.name); }} className="row-action-btn danger" title="Delete category"><Trash2 size={15} /></button>
                      </div>
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* RIGHT: ITEMS */}
      <section className="sx-split-main">
        {selectedCategoryId ? (
          <>
            <div className="sx-head">
              <h1 style={{ textTransform: 'capitalize' }}>{activeCategory?.name}</h1>
              <p>{items.length} {items.length === 1 ? 'item' : 'items'} in this category</p>
            </div>

            <form onSubmit={addItem} className="inline-add-bar">
              <input
                ref={itemNameRef}
                placeholder="Item name (e.g. Masala Dosa)"
                value={newItemName}
                onChange={e => setNewItemName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); itemPriceRef.current?.focus(); } }}
                className="sx-input"
                style={{ flex: 2, minWidth: '200px' }}
              />
              <input
                ref={itemPriceRef}
                type="number"
                placeholder="Price (₹)"
                value={newItemPrice}
                onChange={e => setNewItemPrice(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { /* allow submit */ } }}
                step="0.01" min="0"
                className="sx-input"
                style={{ flex: 1, minWidth: '120px' }}
              />
              <button type="submit" disabled={!newItemName.trim() || !newItemPrice} className="sx-btn-primary" style={{ flexShrink: 0 }}>
                <Plus size={16} /> Add Item
              </button>
            </form>

            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
              {items.length === 0 ? (
                <div className="empty-block">
                  <div className="empty-icon"><Tag size={24} /></div>
                  <h3>No items yet</h3>
                  <p>Use the form above to add your first item.</p>
                </div>
              ) : (
                <div className="data-list">
                  <div className="data-list-head" style={{ gridTemplateColumns: '1fr 140px 96px' }}>
                    <div>Name</div>
                    <div style={{ textAlign: 'right' }}>Price</div>
                    <div style={{ textAlign: 'right' }}>Actions</div>
                  </div>
                  {items.map(item => (
                    editingItemId === item.id ? (
                      <div key={item.id} className="data-row" style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                        <input value={editItemName} onChange={e => setEditItemName(e.target.value)} className="sx-input" style={{ flex: 2, minWidth: '120px' }} autoFocus />
                        <select value={editItemCategoryId || ""} onChange={e => setEditItemCategoryId(Number(e.target.value))} className="sx-select" style={{ width: '150px', flexShrink: 0 }}>
                          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        <input type="number" value={editItemPrice} onChange={e => setEditItemPrice(e.target.value)} step="0.01" min="0" className="sx-input" style={{ width: '100px', flexShrink: 0, textAlign: 'right' }} />
                        <button onClick={() => saveEdit(item.id)} className="sx-btn-primary" style={{ padding: '0.45rem', minWidth: '36px', flexShrink: 0 }} title="Save"><Check size={16} /></button>
                        <button onClick={cancelEdit} className="sx-btn-ghost" style={{ padding: '0.45rem', minWidth: '36px', flexShrink: 0 }} title="Cancel"><X size={16} /></button>
                      </div>
                    ) : (
                      <div key={item.id} className="data-row" style={{ gridTemplateColumns: '1fr 140px 96px' }}>
                        <div style={{ fontWeight: 'var(--font-medium)', color: 'var(--text-primary)' }}>{item.name}</div>
                        <div style={{ textAlign: 'right', fontWeight: 'var(--font-bold)', color: 'var(--text-primary)' }}>₹{item.price.toFixed(2)}</div>
                        <div className="data-row-actions">
                          <button onClick={() => startEdit(item)} className="row-action-btn" title="Edit item"><Edit2 size={17} /></button>
                          <button onClick={() => confirmDelete('item', item.id, item.name)} className="row-action-btn danger" title="Delete item"><Trash2 size={17} /></button>
                        </div>
                      </div>
                    )
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="empty-block" style={{ flex: 1, justifyContent: 'center' }}>
            <div className="empty-icon"><Tag size={24} /></div>
            <h3>No category selected</h3>
            <p>Select a category from the left to manage its items.</p>
          </div>
        )}
      </section>

      {/* Delete Confirmation Modal */}
      {deleteConfirmation && (
        <div className="modal-overlay">
          <div style={{ background: 'var(--bg-white)', border: 'var(--border-thin) solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: 'var(--space-6)', width: '420px', maxWidth: '90%', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', boxShadow: 'var(--shadow-xl)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)', color: 'var(--danger)' }}>
              <Trash2 size={18} /> Confirm Deletion
            </div>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', lineHeight: '1.5' }}>
              Are you sure you want to delete the {deleteConfirmation.type} <strong style={{ color: 'var(--text-primary)' }}>"{deleteConfirmation.name}"</strong>?
              {deleteConfirmation.type === 'category' && <><br /><br /><span style={{ color: 'var(--danger)', fontWeight: 'var(--font-medium)' }}>Warning: All items in this category will also be permanently deleted.</span></>}
            </p>
            <div className="sx-actions">
              <button onClick={() => setDeleteConfirmation(null)} className="sx-btn-ghost">Cancel</button>
              <button onClick={executeDelete} className="sx-btn-danger">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
