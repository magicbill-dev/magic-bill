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
    <div className="settings-page-wrapper" style={{ flexDirection: 'row', padding: 0, overflow: 'hidden', position: 'relative' }}>
      
      {/* Toast Notification */}
      {toastMessage && (
        <div style={{
          position: 'absolute', top: '20px', right: '20px', backgroundColor: 'var(--primary)', color: 'var(--primary-fg)',
          padding: '0.75rem 1.25rem', borderRadius: '0.5rem', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)', zIndex: 2000, fontWeight: 600, fontSize: '0.875rem'
        }}>
          {toastMessage}
        </div>
      )}

      {/* LEFT COLUMN: CATEGORIES */}
      <div style={{ 
        width: '350px', 
        borderRight: '1px solid rgba(255,255,255,0.05)', 
        display: 'flex', 
        flexDirection: 'column',
        padding: '2rem',
        backgroundColor: 'var(--bg-light)'
      }}>
        {/* Header */}
        <div className="settings-page-header" style={{ marginBottom: '2rem' }}>
          <h2 className="settings-page-title" style={{ fontSize: '1.5rem' }}>Menu Categories</h2>
          <p className="settings-page-subtitle">Organize your offerings</p>
        </div>

        {/* Category Form */}
        <form onSubmit={addCategory} style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem' }}>
          <input 
            type="text" 
            placeholder="New category..." 
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            className="modern-input"
            style={{ padding: '0.75rem 1rem' }}
          />
          <button 
            type="submit"
            disabled={!newCategoryName.trim()}
            className="modern-btn-primary"
            style={{ padding: '0 1rem' }}
          >
            <Plus size={20} />
          </button>
        </form>

        {/* Category List */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem', paddingRight: '0.5rem' }}>
          {loading && categories.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>
          ) : categories.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>No categories yet.</p>
          ) : (
            categories.map(cat => (
              <div
                key={cat.id}
                onClick={() => { if (editingCategoryId !== cat.id) setSelectedCategoryId(cat.id); }}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '1rem',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                  backgroundColor: selectedCategoryId === cat.id ? 'var(--active-bg)' : 'rgba(0,0,0,0.2)',
                  color: selectedCategoryId === cat.id ? 'var(--primary)' : 'var(--text-primary)',
                  fontWeight: selectedCategoryId === cat.id ? 600 : 500,
                  border: '1px solid rgba(255,255,255,0.05)',
                  transition: 'all 0.2s'
                }}
              >
                {editingCategoryId === cat.id ? (
                   <div style={{ display: 'flex', width: '100%', gap: '0.5rem' }} onClick={e => e.stopPropagation()}>
                     <input
                       autoFocus
                       value={editCategoryName}
                       onChange={e => setEditCategoryName(e.target.value)}
                       className="modern-input"
                       style={{ flex: 1, padding: '0.4rem 0.75rem', height: 'auto' }}
                     />
                     <button onClick={() => saveCategoryEdit(cat.id)} style={{ background: 'var(--success, #10b981)', border: 'none', color: 'white', cursor: 'pointer', padding: '0.4rem', borderRadius: '4px', display: 'flex', alignItems: 'center' }} title="Save"><Check size={16}/></button>
                     <button onClick={() => setEditingCategoryId(null)} style={{ background: 'var(--danger, #ef4444)', border: 'none', color: 'white', cursor: 'pointer', padding: '0.4rem', borderRadius: '4px', display: 'flex', alignItems: 'center' }} title="Cancel"><X size={16}/></button>
                   </div>
                ) : (
                  <>
                    <span>{cat.name}</span>
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); startCategoryEdit(cat); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', display: 'flex', alignItems: 'center', color: selectedCategoryId === cat.id ? 'var(--text-primary)' : 'var(--text-secondary)', transition: 'color 0.2s' }}
                        title="Edit category"
                        onMouseOver={e => { e.currentTarget.style.color = 'var(--primary)'; }}
                        onMouseOut={e => { e.currentTarget.style.color = selectedCategoryId === cat.id ? 'var(--text-primary)' : 'var(--text-secondary)'; }}
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); confirmDelete('category', cat.id, cat.name); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', display: 'flex', alignItems: 'center', color: selectedCategoryId === cat.id ? 'var(--text-primary)' : 'var(--danger)', transition: 'color 0.2s' }}
                        title="Delete category"
                        onMouseOver={e => { e.currentTarget.style.color = '#cc0000'; }}
                        onMouseOut={e => { e.currentTarget.style.color = selectedCategoryId === cat.id ? 'var(--text-primary)' : 'var(--danger)'; }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* RIGHT COLUMN: ITEMS */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '2rem 3rem', backgroundColor: 'var(--bg-white)', overflowY: 'auto' }}>
        {selectedCategoryId ? (
          <>
            {/* Header */}
            <div className="settings-page-header" style={{ marginBottom: '2rem' }}>
                <h2 className="settings-page-title">{activeCategory?.name}</h2>
                <p className="settings-page-subtitle">
                  {items.length} {items.length === 1 ? 'item' : 'items'} in this category
                </p>
            </div>

            {/* Add Item Row */}
            <form onSubmit={addItem} className="modern-panel" style={{ flexDirection: 'row', gap: '1rem', padding: '1.5rem', marginBottom: '2rem', alignItems: 'center' }}>
              <div style={{ flex: 2 }}>
                <input 
                  ref={itemNameRef}
                  placeholder="Item name (e.g. Masala Dosa)" 
                  value={newItemName}
                  onChange={e => setNewItemName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      itemPriceRef.current?.focus();
                    }
                  }}
                  className="modern-input"
                />
              </div>
              <div style={{ flex: 1 }}>
                <input 
                  ref={itemPriceRef}
                  type="number" 
                  placeholder="Price (₹)" 
                  value={newItemPrice}
                  onChange={e => setNewItemPrice(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      // Note: Do not preventDefault here, so the form submits.
                      // The form's onSubmit handler (addItem) will run.
                    }
                  }}
                  step="0.01" min="0"
                  className="modern-input"
                />
              </div>
              <button 
                type="submit"
                disabled={!newItemName.trim() || !newItemPrice}
                className="modern-btn-primary"
              >
                <Plus size={18} /> Add Item
              </button>
            </form>

            {/* Item List Header */}
            {items.length > 0 && (
              <div style={{ display: 'flex', padding: '1rem 0.5rem 0.5rem 0.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ flex: 2 }}>Name</div>
                <div style={{ flex: 1, textAlign: 'right', paddingRight: '2rem' }}>Price</div>
                <div style={{ width: '100px', textAlign: 'right' }}>Actions</div>
              </div>
            )}

            {/* Item List */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              {items.length === 0 ? (
                <div style={{ padding: '3rem 0', color: 'var(--text-secondary)', textAlign: 'center' }}>
                  <p style={{ margin: 0, fontSize: '1.1rem' }}>No items added yet.</p>
                  <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9rem' }}>Use the form above to add your first item.</p>
                </div>
              ) : (
                items.map(item => (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', padding: '1rem 0.5rem', borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                    {editingItemId === item.id ? (
                      // Edit Mode
                      <>
                        <div style={{ flex: 2, paddingRight: '1rem', display: 'flex', gap: '0.5rem' }}>
                          <input 
                            value={editItemName} 
                            onChange={e => setEditItemName(e.target.value)} 
                            className="modern-input"
                            autoFocus 
                          />
                          <select 
                            value={editItemCategoryId || ""} 
                            onChange={e => setEditItemCategoryId(Number(e.target.value))}
                            className="modern-select"
                            style={{ width: '180px' }}
                          >
                            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        </div>
                        <div style={{ flex: 1, paddingRight: '1rem' }}>
                          <input 
                            type="number" 
                            value={editItemPrice} 
                            onChange={e => setEditItemPrice(e.target.value)} 
                            step="0.01" min="0"
                            className="modern-input"
                            style={{ textAlign: 'right' }} 
                          />
                        </div>
                        <div style={{ width: '100px', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                          <button onClick={() => saveEdit(item.id)} className="modern-btn-primary" style={{ padding: '0.4rem', minWidth: '40px' }} title="Save">
                            <Check size={18} />
                          </button>
                          <button onClick={cancelEdit} className="modern-btn-primary" style={{ padding: '0.4rem', minWidth: '40px', backgroundColor: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', boxShadow: 'none' }} title="Cancel">
                            <X size={18} />
                          </button>
                        </div>
                      </>
                    ) : (
                      // View Mode
                      <>
                        <div style={{ flex: 2, fontSize: '1.05rem', fontWeight: 500, color: 'var(--text-primary)' }}>{item.name}</div>
                        <div style={{ flex: 1, textAlign: 'right', fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)', paddingRight: '2rem' }}>₹{item.price.toFixed(2)}</div>
                        <div style={{ width: '100px', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                          <button 
                            onClick={() => startEdit(item)} 
                            style={{ padding: '0.4rem', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', transition: 'color 0.2s' }}
                            title="Edit item"
                            onMouseOver={e => e.currentTarget.style.color = 'var(--primary)'}
                            onMouseOut={e => e.currentTarget.style.color = 'var(--text-secondary)'}
                          >
                            <Edit2 size={18} />
                          </button>
                          <button 
                            onClick={() => confirmDelete('item', item.id, item.name)} 
                            style={{ padding: '0.4rem', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', transition: 'color 0.2s' }}
                            title="Delete item"
                            onMouseOver={e => e.currentTarget.style.color = 'var(--danger)'}
                            onMouseOut={e => e.currentTarget.style.color = 'var(--text-secondary)'}
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)' }}>
            <Tag size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.25rem', color: 'var(--text-primary)' }}>No Category Selected</h3>
            <p style={{ margin: 0, textAlign: 'center', maxWidth: '300px' }}>Select a category from the left panel to manage its items.</p>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmation && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(2px)' }}>
          <div className="modern-panel" style={{ width: '400px', maxWidth: '90%' }}>
            <h3 style={{ margin: '0 0 1rem 0', color: 'var(--text-primary)', fontSize: '1.25rem', fontWeight: 600 }}>Confirm Deletion</h3>
            <p style={{ margin: '0 0 2rem 0', color: 'var(--text-secondary)', fontSize: '1rem', lineHeight: '1.5' }}>
              Are you sure you want to delete the {deleteConfirmation.type} <strong>"{deleteConfirmation.name}"</strong>?
              {deleteConfirmation.type === 'category' && <><br/><br/><span style={{ color: 'var(--danger)', fontWeight: 500 }}>Warning: All items in this category will also be permanently deleted.</span></>}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button 
                onClick={() => setDeleteConfirmation(null)}
                className="modern-btn-primary"
                style={{ backgroundColor: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-primary)', boxShadow: 'none' }}
              >
                Cancel
              </button>
              <button 
                onClick={executeDelete}
                className="modern-btn-primary"
                style={{ backgroundColor: 'var(--danger)' }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
