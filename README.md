# Magic Bill - Restaurant Management System


A lightweight, fast desktop application for restaurant management, built with **Tauri (Rust)** and **React**.

## 🚀 Features

*   **Dashboard:** Real-time overview of revenue, orders, and active tables.
*   **Menu Management:** 
    *   Create, update, and delete categories.
    *   Add items with prices to specific categories.
*   **Billing:** (Coming Soon) Interface for generating bills.
*   **Local Database:** Uses **SQLite** for fast, offline-first data storage.
*   **Native Performance:** extremely lightweight (<10MB installer) compared to Electron apps.

## 🛠️ Tech Stack

*   **Frontend:** React 19, TypeScript, Vite
*   **Styling:** Vanilla CSS (Modular & Fast)
*   **Backend/Core:** Tauri v2 (Rust)
*   **Database:** SQLite (via `@tauri-apps/plugin-sql`)
*   **Icons:** Lucide React

## 📦 Installation & Setup

### Prerequisites
*   **Node.js** (v18 or later)
*   **Rust** (via `rustup`)
*   **Visual Studio C++ Build Tools** (for Windows)

### 1. Clone & Install
```bash
# Clone the repository
git clone <your-repo-url>
cd magic-bill

# Install dependencies
npm install
```

### 2. Run in Development Mode
This starts the React dev server and the Tauri window.
```bash
npm run tauri dev
```
*The app will launch in a maximized window.*

### 3. Build for Production
To create the standalone `.exe` installer:
```bash
npm run tauri build
```
The output files will be located in:
*   `src-tauri/target/release/bundle/nsis/` (Setup .exe)
*   `src-tauri/target/release/bundle/msi/` (MSI Installer)
*   `src-tauri/target/release/` (Standalone .exe)

## 🗄️ Database

The application uses a local SQLite database named `restaurant.db`.

### Location
*   **Windows:** `%APPDATA%\com.sanat.magicbill\restaurant.db`
    *   Example: `C:\Users\YourName\AppData\Roaming\com.sanat.magicbill\restaurant.db`

### Schema
The app automatically initializes the following tables on startup:

**1. Categories**
```sql
CREATE TABLE categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);
```

**2. Items**
```sql
CREATE TABLE items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER,
  name TEXT NOT NULL,
  price REAL NOT NULL,
  FOREIGN KEY (category_id) REFERENCES categories(id)
);
```

## 📂 Project Structure

```
├── src/
│   ├── components/       # React Components (MenuManagement, etc.)
│   ├── App.tsx           # Main Application Layout & Logic
│   ├── App.css           # Global Styles
│   └── main.tsx          # Entry Point
├── src-tauri/
│   ├── capabilities/     # App Permissions (Database access, etc.)
│   ├── src/              # Rust Backend Code
│   ├── tauri.conf.json   # Tauri Configuration (Window size, etc.)
│   └── Cargo.toml        # Rust Dependencies
└── package.json          # Node.js Dependencies & Scripts
```

## 🔧 Troubleshooting

### Database Permissions Error
If you see `sql.execute not allowed`, it means the capability permissions are missing.
Ensure `src-tauri/capabilities/default.json` includes:
```json
"permissions": [
  "sql:default",
  "sql:allow-load",
  "sql:allow-execute",
  "sql:allow-select"
]
```

### Build Fails?
If the build process fails or hangs:
1.  Delete the `src-tauri/target` folder (it can get very large).
2.  Run `npm run tauri build` again.

## 📝 License
Proprietary / Private use.
