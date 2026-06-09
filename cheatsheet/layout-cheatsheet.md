# Layout.js Cheatsheet — Admin Starter

Shell UI: sidebar, navbar, routing, tema, notifikasi. Branding dari `app-config.js` / `layout.setNavbarTitle()`.

## Quick Start

```html
<!-- Load dependencies -->
<script src="https://unpkg.com/@slice-code/el.js@1.0.6/el.js"></script>
<script src="layouting/layout.js"></script>

<!-- App container -->
<div id="app"></div>

<script>
  // Add pages
  layout.addPage({
    path: '/',
    component: () => el('div').text('Home Page')
  });

  // Add sidebar menu
  layout.addSideMenu([
    { name: 'Home', icon: 'fas fa-home', page: '/' }
  ]);

  // Render layout
  layout.render();
</script>
```

---

## Routing API

### Add Page
```javascript
layout.addPage({
  path: '/dashboard',           // Route path
  component: () => el('div'),   // Component function
  roles: ['admin', 'manager'],  // Optional: RBAC
  hideLayout: false,            // Optional: hide navbar/sidebar
  fullWidthDesktop: false,      // Optional: hide sidebar on desktop
  pageContentPadding: '10px'    // Optional: override padding
});
```

### Dynamic Routes
```javascript
layout.addPage({
  path: '/users/:id',
  component: () => {
    const hash = window.location.hash; // /users/123
    // Parse ID from hash
  }
});
```

### CRUD Dynamic Routes
```javascript
// Pola otomatis: /resource/create dan /resource/edit/:id
// Tidak perlu layout.addPage() — trigger global function

// Contoh URL:
// /categories/create
// /categories/edit/5
// /products/create?kode=CAT-001

// Register handler global:
window.triggerCrudCreate = function(resource, prefill) {
  // resource: 'categories', 'products', dll
  // prefill: { kode: 'CAT-001' } dari query params
  console.log('Create', resource, prefill);
};

window.triggerCrudEdit = function(resource, id) {
  console.log('Edit', resource, id);
};

// Check route type:
layout.isValidRoute('/categories');
layout.isCrudDynamicRoute('/categories/create');
layout.isCrudDynamicRoute('/categories/edit/5');
```

### Navigation
```javascript
layout.navigate('/dashboard');     // Navigate to page
layout.navigate('/users/123');     // Navigate with params
```

### Hash Change Listener
```javascript
// Automatically handled
// Browser back/forward buttons work
// URL format: #/path
```

---

## Role-Based Access Control (RBAC)

### Set User Role
```javascript
layout.setRole('admin');    // Set current user role
layout.getRole();           // Get current role
layout.setRole(null);       // Clear role (logout)
```

### RBAC Role Normalization
```javascript
// Role 'owner' otomatis dinormalisasi ke 'super_admin'
layout.setRole('owner');     // internally: 'super_admin'
layout.setRole('Owner');     // internally: 'super_admin' (case-insensitive)
layout.setRole('admin');     // internally: 'admin'
layout.getRole();            // returns raw role (before normalization)
```

### Owner-Only Menu Paths
```javascript
// Menu ini HANYA muncul untuk super_admin/owner:
const OWNER_ONLY_MENU_PATHS = [
  '/users',              // User management
  '/datacabang',         // Cabang management
  '/profil-perusahaan',  // Company profile
  '/menu-role-manager'   // Menu role configuration
];

// Administrator cabang TIDAK bisa melihat menu ini
```

### Page-Level RBAC
```javascript
layout.addPage({
  path: '/admin',
  component: () => el('div').text('Admin Panel'),
  roles: ['admin']          // Only admin can access
});
```

### RBAC Fallback Logic
```javascript
// Jika user tidak punya akses ke halaman:
// 1. Cari halaman /kasir (khusus role 'cashier')
// 2. Atau cari halaman pertama yang accessible
// 3. Redirect otomatis ke halaman tersebut

// Contoh: user 'cashier' akses '/dashboard' → redirect ke '/kasir'
```

### Menu-Level RBAC
```javascript
layout.addSideMenu([
  {
    name: 'Admin Panel',
    icon: 'fas fa-shield-alt',
    page: '/admin',
    roles: ['admin']        // Only visible to admin
  },
  {
    name: 'Dashboard',
    icon: 'fas fa-chart-line',
    page: '/dashboard'      // No roles = visible to all
  }
]);
```

---

## Middleware

### Add Middleware
```javascript
layout.middleware((path, pageConfig) => {
  // Run before each page render
  // Return { allowed: false, redirect: '/login' } to block
  
  const isLoggedIn = checkAuth();
  if (!isLoggedIn && path !== '/login') {
    return { allowed: false, redirect: '/login' };
  }
  
  return { allowed: true };
});
```

### Async Middleware
```javascript
layout.middleware(async (path, pageConfig) => {
  const user = await fetch('/api/user');
  if (!user) {
    return { allowed: false, redirect: '/login' };
  }
  return { allowed: true };
});
```

### Multiple Middleware
```javascript
// Middleware dijalankan berurutan (sequentially)
// Jika satu middleware block, yang berikutnya tidak jalan

layout.middleware(async (path, pageConfig) => {
  // 1. Auth check
  const token = localStorage.getItem('token');
  if (!token) return { allowed: false, redirect: '/login' };
  return { allowed: true };
});

layout.middleware(async (path, pageConfig) => {
  // 2. Permission check
  const user = await fetch('/api/user');
  if (!user.permissions.includes(path)) {
    return { allowed: false, redirect: '/unauthorized' };
  }
  return { allowed: true };
});
```

### Middleware + Loader Flow

**Penting**: Loader muncul SEBELUM middleware dijalankan dan hilang SETELAH komponen selesai render.

```
User clicks link
    ↓
layout.navigate('/dashboard')
    ↓
showLoader()  ← Spinner muncul
    ↓
Run middleware 1 (async)
    ↓
Run middleware 2 (async)
    ↓
Check RBAC roles
    ↓
Load component()
    ↓
┌─ If Sync Component ──────────────┐
│ Render component                  │
│ hideLoader()  ← Spinner hilang   │
└───────────────────────────────────┘

┌─ If Async Component (Promise) ───┐
│ Wait for Promise resolve          │
│ Render component                  │
│ hideLoader()  ← Spinner hilang   │
└───────────────────────────────────┘

┌─ If Middleware Redirect ─────────┐
│ layout.navigate('/login')         │
│ Trigger renderPage baru           │
│ Loader otomatis handle            │
└───────────────────────────────────┘
```

### Loader Behavior Details

**Kapan Loader Muncul:**
- ✅ Saat `renderPage()` dipanggil
- ✅ Saat `layout.navigate()` dengan hash change
- ✅ Sebelum middleware dijalankan
- ✅ Sebelum komponen load

**Kapan Loader Hilang:**
- ✅ Setelah sync component di-render
- ✅ Setelah async component (Promise) resolve
- ✅ Setelah error saat load async component
- ✅ Saat middleware redirect (trigger renderPage baru)

### Loader Implementation

```javascript
// Default loader: spinner biru 40px berputar
// Auto-centered di page content
// Minimal height: 200px

// Spinner style:
// - Border: 4px solid #f3f3f3 (abu-abu)
// - Top border: 4px solid #3498db (biru)
// - Animation: spin 1s linear infinite
// - Size: 40px x 40px
```

### Custom Loading with Middleware

```javascript
// Contoh: Tampilkan custom message saat loading
layout.middleware(async (path, pageConfig) => {
  // Loader sudah muncul otomatis
  
  // Bisa show toast notification
  layout.toast('Loading page...', { type: 'info', duration: 1000 });
  
  const token = localStorage.getItem('token');
  if (!token) {
    return { allowed: false, redirect: '/login' };
  }
  
  return { allowed: true };
});
```

### Async Component with Loader

```javascript
// Component yang return Promise akan membuat loader muncul lebih lama
layout.addPage({
  path: '/dashboard',
  component: async () => {
    // Loader masih berputar saat fetch ini jalan
    const data = await fetch('/api/dashboard').then(r => r.json());
    
    // Loader hilang setelah ini return
    return el('div').child([
      el('h1').text('Dashboard'),
      el('p').text(`Total users: ${data.totalUsers}`)
    ]);
  }
});

// Error handling - loader tetap hilang meski error
layout.addPage({
  path: '/reports',
  component: async () => {
    try {
      const data = await fetch('/api/reports');
      return el('div').text(JSON.stringify(data));
    } catch (error) {
      // Loader akan hilang, error message ditampilkan
      throw error; // atau return custom error component
    }
  }
});
```

### Manual Loader Control

```javascript
// Bisa juga kontrol loader manual di component
layout.addPage({
  path: '/custom-load',
  component: () => {
    const container = el('div');
    
    // Hide loader dulu
    layout.hideLoader();
    
    // Custom loading state
    container.child(el('p').text('Loading...'));
    
    // Fetch data
    fetch('/api/data').then(data => {
      container.empty().child(
        el('div').text(JSON.stringify(data))
      );
    });
    
    return container;
  }
});
```

---

## Auth Bootstrap Loader

Loader full-screen yang muncul saat bootstrap sesi login (sebelum sidebar ditampilkan).

### Usage
```javascript
// Tampilkan saat mulai bootstrap
layout.showAuthBootstrapLoader('Memuat menu dan halaman...', {
  untilPageReady: true  // Loader tetap sampai halaman selesai render
});

// Sembunyikan setelah bootstrap selesai
layout.hideAuthBootstrapLoader();
```

### Visual
```
┌─────────────────────────────────┐
│                                 │
│      [spinner berputar]         │
│                                 │
│      Admin Starter              │
│      Memuat aplikasi...         │
│                                 │
└─────────────────────────────────┘

Background: linear-gradient(155deg, #164e63 → #155e75 → #0e7490)
Spinner: 46px, putih, border-top accent
z-index: 99999 (di atas semua elemen)
```

### Ketika `untilPageReady: true`
```javascript
// Flow:
showAuthBootstrapLoader('Loading...', { untilPageReady: true })
    ↓
Bootstrap pages, menus, themes
    ↓
layout.render()
    ↓
Page component di-render
    ↓
hideLoader() otomatis memanggil hideAuthBootstrapLoader()
```

### Integrasi dengan Page Loader
- Auth bootstrap: muncul SEBELUM sidebar (saat login)
- Page loader: muncul SETELAH sidebar (saat navigasi)
- Jika `untilPageReady: true`, auth bootstrap hilang bersamaan dengan page loader

---

## Menus

### Sidebar Menu
```javascript
layout.addSideMenu([
  // Simple item
  {
    name: 'Dashboard',
    icon: 'fas fa-home',
    page: '/dashboard'
  },
  
  // Dropdown with children
  {
    name: 'Users',
    icon: 'fas fa-users',
    children: [
      { name: 'All Users', icon: 'fas fa-list', page: '/users' },
      { name: 'Add User', icon: 'fas fa-plus', page: '/users/add' }
    ]
  },
  
  // Nested dropdown (multi-level)
  {
    name: 'Settings',
    icon: 'fas fa-cog',
    children: [
      { name: 'General', page: '/settings/general' },
      {
        name: 'Advanced',
        icon: 'fas fa-sliders-h',
        children: [
          { name: 'Security', page: '/settings/security' },
          { name: 'Privacy', page: '/settings/privacy' }
        ]
      }
    ]
  },
  
  // With i18n
  {
    nameKey: 'sidebar.dashboard',  // Uses window.i18n.t()
    name: 'Dashboard',             // Fallback
    icon: 'fas fa-home',
    page: '/'
  },
  
  // With RBAC
  {
    name: 'Admin Panel',
    icon: 'fas fa-shield-alt',
    page: '/admin',
    roles: ['admin', 'super_admin']  // Hanya muncul untuk role ini
  }
]);
```

### Menu Search Scoring
```javascript
// Saat user mengetik di Quick Open (Ctrl+K):
// Scoring algorithm:
// - Label starts with term:  120 points (highest)
// - Label includes term:      90 points
// - Group starts with term:   70 points
// - Group includes term:      50 points
// - No match:                  0 points (filtered out)

// Contoh:
// Search: "user"
// "Users" (label start)          → 120 pts → rank #1
// "All Users" (label includes)   →  90 pts → rank #2
// "Settings > Users" (group)     →  70 pts → rank #3

// Max results: 50 items
```

### i18n Integration Details
```javascript
// Menu name resolution:
function resolveMenuName(item) {
  // 1. Cek apakah item punya nameKey
  // 2. Cek apakah window.i18n.t() tersedia
  // 3. Jika ya: return window.i18n.t(item.nameKey)
  // 4. Jika tidak: return item.name (fallback)
}

// Contoh setup i18n:
window.i18n = {
  t: (key) => {
    const translations = {
      'sidebar.dashboard': 'Dasbor',
      'sidebar.profile': 'Profil',
      'profile.logout': 'Keluar'
    };
    return translations[key] || key;
  }
};

layout.addSideMenu([
  { nameKey: 'sidebar.dashboard', name: 'Dashboard', page: '/' }
]);
// Jika i18n ada: tampil "Dasbor"
// Jika i18n tidak ada: tampil "Dashboard"
```

### Navbar Menu
```javascript
layout.addNavbar([
  { name: 'Dashboard', page: '/' },
  { name: 'Settings', page: '/settings' }
]);
```

Navbar kanan (setelah login) berisi:
- **Ikon notifikasi** (bell) + badge unread
- **Ikon user** + dropdown (menu navbar, Profile, Logout)

---

## Sidebar (UI profesional)

Sidebar dirender otomatis oleh `layout.addSideMenu()` + `renderSideMenu()`.

### Struktur visual
```
┌─────────────────────────┐
│ [icon] Admin Starter    │  ← brand (navbarTitle dari app-config)
│      PANEL ADMIN        │
├─────────────────────────┤
│ 🔍 Cari menu…    Ctrl+K │
├─────────────────────────┤
│ NAVIGASI                │
│ [icon] Dashboard        │  ← item aktif: accent bar kiri
│ [icon] Data          ▾  │  ← dropdown + sub-item indent
│   · Sub menu            │
└─────────────────────────┘
```

### CSS class penting
| Class | Fungsi |
|-------|--------|
| `.layout-sidebar` | Container flex column sidebar |
| `.sidebar-brand` | Header brand |
| `.sidebar-search-btn` | Tombol cari menu |
| `.sidebar-nav` | Area scroll menu |
| `.sidebar-item` | Item menu / toggle dropdown |
| `.sidebar-item.active` | Halaman aktif (`box-shadow` accent kiri) |
| `.sidebar-icon-wrap` | Kotak ikon rounded |
| `.sidebar-dropdown-menu` | Submenu (class `.open` saat expanded) |
| `.sidebar-dropdown-item` | Item anak dropdown |

Accent aktif memakai CSS variable **`--sidebar-accent`** (diset saat `setTheme()` / `setCustomTheme()`).

### Lebar & layout
- Desktop: **268px**, border kanan tipis, flex column
- Mobile: overlay full-screen di bawah navbar (≤768px)
- `pageContentPadding: '0'` → area konten `overflow: hidden` (cocok untuk datatable full height)

### Brand title
```javascript
layout.setNavbarTitle('My Company');  // Update navbar + sidebar brand
```

---

## Cari Menu (Quick Open)

Pola mirip VS Code Command Palette — tema gelap, navigasi keyboard.

### Buka
- Tombol **Cari menu…** di atas sidebar
- **`Ctrl+K`** (Windows/Linux) / **`⌘K`** (Mac)
- `layout.openMenuSearch()`

> **Firefox:** `Ctrl+Shift+P` tidak bisa dipakai (reserved: Private Window). Gunakan `Ctrl+K`.

### Keyboard di panel
| Key | Aksi |
|-----|------|
| `↑` / `↓` | Pilih baris |
| `Enter` | Buka menu |
| `Esc` | Tutup |

### Modal variant palette
```javascript
layout.modal({
  variant: 'palette',   // Tanpa header X default; panel gelap; posisi atas tengah
  content: el('div'),   // el.js wrapper
  footer: el('div'),    // Bar hint keyboard (opsional)
  dismissible: true
});
```

Saat buka modal apapun, layout memanggil `FormBuilder.closeAllSearchSelects()` jika tersedia.

---

## Notifikasi Navbar

Notifikasi aplikasi — ikon **bell** di sebelah kiri ikon user. Data dari tabel `app_notifications` via API.

### Inisialisasi (setelah login)
```javascript
layout.initNotifications();   // Fetch + polling setiap 90 detik
layout.fetchNotifications();    // Refresh manual
layout.stopNotifications();     // Hentikan polling (logout)
```

### API backend
```
GET /api/notifications?limit=15
```

Response item:
```javascript
{
  id: '1',
  type: 'info',           // info | warning | success
  title: 'Selamat datang',
  message: 'Admin Starter siap digunakan.',
  link: '/dashboard',
  createdAt: '2026-06-09'
}
```

Sumber data starter:
- Baris aktif di `app_notifications` (filter cabang jika user punya `kode_cabang`)
- Ringkasan dashboard opsional dari `GET /api/dashboard`

### Status dibaca
- Disimpan di **`localStorage`** key `pjtki-notif-read` (legacy key — array id notifikasi)
- Klik item → tandai dibaca + `layout.navigate(link)`
- Tombol **Tandai dibaca** → mark all read

### Notifikasi Navbar
- Ikon bell + badge unread count
- Dropdown panel (max 15 items preview)
- Mark as read (individual + mark all)
- Polling setiap 90 detik

### Notifikasi History Page
```javascript
// Route otomatis terdaftar: /notifications
// Akses via:
layout.openNotificationsHistory();  // Navigate ke /notifications
layout.navigate('/notifications');  // Manual navigate

// Fitur halaman history:
// - Tampilkan semua notifikasi (max 30 items dari API)
// - Badge "X belum dibaca"
// - Tombol "Tandai dibaca" (mark all)
// - Tombol "Refresh" (fetch ulang)
// - Full timestamp (tanggal + jam)
```

### CSS navbar notifikasi
| Class | Fungsi |
|-------|--------|
| `.navbar-notif-wrap` | Wrapper bell + panel |
| `.navbar-notif-btn` | Tombol bell |
| `.navbar-notif-badge` | Badge merah jumlah unread |
| `.navbar-notif-panel` | Dropdown panel (`.open`) |
| `.navbar-notif-item.unread` | Item belum dibaca (background teal muda) |

---

## Themes

### Built-in Themes
```javascript
layout.setTheme('default');   // Dark slate (#0f172a)
layout.setTheme('blue');      // Blue (#1e40af)
layout.setTheme('dark');      // Black
layout.setTheme('light');     // White/light gray
layout.setTheme('purple');    // Purple
layout.setTheme('green');     // Green
layout.setTheme('red');       // Red
layout.setTheme('orange');    // Orange
layout.setTheme('teal');      // Teal — default starter (index.js)
layout.setTheme('pink');      // Pink
layout.setTheme('gray');      // Gray
```

### Tema default starter (teal)
```javascript
// Default di index.js: theme: 'teal'
layout.setTheme('teal');
// Navbar: #0e7490 (cyan-700)
// Sidebar: #155e75 (cyan-800)
// Accent sidebar/menu aktif: #22d3ee (--sidebar-accent)
```

Aksen tombol/form di halaman (mis. `#2563eb`) tetap biru — jangan samakan dengan navbar kecuali refactor global.

### Custom Theme
```javascript
layout.setCustomTheme({
  navbarBg: '#1a202c',
  navbarColor: '#fff',
  sidebarBg: '#2d3748',
  sidebarColor: '#fff'
});
// Juga memanggil syncSidebarAccentVar() internal
```

---

## Desktop Hide Mode

### Toggle Sidebar Hide
- Switch in navbar (desktop only)
- Collapses sidebar to 4px strip
- Hover to expand as floating overlay
- State saved in localStorage

### Programmatic Control
```javascript
// Access via layout internals
// Note: desktopHideMode is internal state
```

---

## UI Components

### Toast Notifications
```javascript
// Simple toast
layout.toast('Operation successful');

// With options
layout.toast('Data saved', {
  type: 'success',          // success | error | warning | info
  title: 'Success',
  duration: 3000            // Auto-close in ms
});

// Toast types
layout.toast('Success message', { type: 'success' });
layout.toast('Error message', { type: 'error' });
layout.toast('Warning message', { type: 'warning' });
layout.toast('Info message', { type: 'info' });
```

### Notify (Alias)
```javascript
layout.notify('Simple notification');

layout.notify({
  message: 'Detailed notification',
  title: 'Title',
  type: 'info'
});
```

### Confirm Dialog
```javascript
layout.confirm({
  title: 'Delete Item',
  message: 'Are you sure you want to delete this item?',
  confirmText: 'Delete',
  cancelText: 'Cancel',
  dismissible: true,        // Click outside to close
  onConfirm: () => {
    console.log('Confirmed');
  },
  onCancel: () => {
    console.log('Cancelled');
  }
});

// Close programmatically
layout.closeConfirm();
```

### Custom Modal
```javascript
layout.modal({
  title: 'Custom Modal',
  content: 'Modal content here',
  size: 'medium',           // small | medium | wide | large | full | palette (via variant)
  variant: 'default',       // 'palette' = Quick Open style (gelap, tanpa header default)
  dismissible: true,
  buttons: [
    {
      text: 'Cancel',
      variant: 'outline',   // outline | secondary | primary
      onClick: () => console.log('Cancel clicked')
    },
    {
      text: 'Save',
      variant: 'primary',
      onClick: () => console.log('Save clicked'),
      closeOnClick: true    // Default: true
    }
  ]
});

// Modal Size Configuration
const sizeConfig = {
  small:   { width: 'min(95%, 420px)',  maxHeight: '70vh' },
  medium:  { width: 'min(95%, 600px)',  maxHeight: '80vh' },
  wide:    { width: 'min(95%, 720px)',  maxHeight: '82vh' },
  large:   { width: 'min(95%, 900px)',  maxHeight: '85vh' },
  full:    { width: 'min(95%, 1200px)', maxHeight: '90vh' },
  palette: { width: 'min(95%, 640px)',  maxHeight: 'min(70vh, 420px)' }
};

// Footer custom (ganti tombol default)
layout.modal({
  title: 'Form',
  content: formEl,
  footer: el('div').child([saveBtn, cancelBtn])
});

// With el.js component as content
layout.modal({
  title: 'Form Modal',
  content: el('form').child([
    el('input').attr('type', 'text').placeholder('Enter name')
  ]),
  buttons: [
    { text: 'Submit', onClick: handleSubmit }
  ]
});

// Close programmatically
layout.closeModal();
```

`closeModal()` juga mereset style overlay (align, padding, backdrop) setelah variant `palette`.

### Page Loader

**Basic Usage:**
```javascript
layout.showLoader();   // Show spinner
layout.hideLoader();   // Hide spinner
```

**Loader Features:**
- 🔄 Auto-show saat navigasi page
- 🔄 Auto-hide setelah component render
- 🔄 Works dengan sync & async components
- 🔄 Handles error gracefully
- 🔄 Spinner animation (blue, 40px, centered)

**Manual Control (Rare Cases):**
```javascript
// Biasanya otomatis, tapi bisa manual
function customOperation() {
  layout.showLoader();
  
  doSomethingAsync().then(() => {
    layout.hideLoader();
  });
}
```

**Loader Timing:**
```
navigate('/page')
  → showLoader() (immediate)
  → run middleware
  → load component
  → render component
  → hideLoader() (auto)
```

---

## Page Configuration Options

```javascript
layout.addPage({
  path: '/example',
  component: () => el('div'),
  
  // RBAC
  roles: ['admin', 'manager'],
  
  // Layout visibility
  hideLayout: true,          // Hide navbar + sidebar (e.g., login page)
  fullWidthDesktop: true,    // Hide sidebar on desktop only
  
  // Custom padding
  pageContentPadding: '0',   // Override default 10px; '0' → overflow hidden (datatable penuh)
});
```

### Route helpers
```javascript
layout.isValidRoute('/categories');
layout.isCrudDynamicRoute('/categories/create');
layout.resetPageScroll();                   // Scroll window + pagecontent ke atas
```

---

## Initialize Layout

### Basic Setup
```javascript
// 1. Add pages
layout.addPage({ path: '/', component: () => el('div').text('Home') });

// 2. Add menus
layout.addSideMenu([
  { name: 'Home', icon: 'fas fa-home', page: '/' }
]);

layout.addNavbar([
  { name: 'Profile', page: '/profile' }
]);

// 3. Set theme (default starter: 'teal')
layout.setTheme('teal');

// 4. Set role (optional)
layout.setRole('admin');

// 5. Add middleware (optional)
layout.middleware(authMiddleware);

// 6. Render
layout.render();

// 7. Setelah login — notifikasi navbar
layout.initNotifications();
```

### Bootstrap Admin Starter (pola index.js)
```javascript
async function bootstrapAuthenticatedApp(core, user) {
  layout.setRole(user.role);
  layout.addSideMenu(core.layoutConfig.sideMenu);
  layout.addNavbar(core.layoutConfig.navbar);
  layout.setTheme(core.layoutConfig.theme || 'teal');
  if (core.layoutConfig.navbarTitle) {
    layout.setNavbarTitle(core.layoutConfig.navbarTitle);
  }
  await PageLoader.bootstrap(core);
  layout.initNotifications();
}
// Global: window.adminApp.bootstrapAuthenticatedApp
```

### Complete Example
```javascript
// Authentication middleware
layout.middleware(async (path, pageConfig) => {
  const publicPages = ['/login', '/register'];
  if (publicPages.includes(path)) return { allowed: true };
  
  const token = localStorage.getItem('token');
  if (!token) {
    return { allowed: false, redirect: '/login' };
  }
  
  return { allowed: true };
});

// Pages
layout.addPage({
  path: '/login',
  hideLayout: true,
  component: () => el('div').text('Login Page')
});

layout.addPage({
  path: '/dashboard',
  roles: ['admin', 'user'],
  component: () => el('div').text('Dashboard')
});

layout.addPage({
  path: '/admin',
  roles: ['admin'],
  component: () => el('div').text('Admin Panel')
});

// Sidebar
layout.addSideMenu([
  {
    name: 'Dashboard',
    icon: 'fas fa-chart-line',
    page: '/dashboard'
  },
  {
    name: 'Admin',
    icon: 'fas fa-shield-alt',
    page: '/admin',
    roles: ['admin']
  }
]);

// Set role after login
layout.setRole('admin');

// Render
layout.render();
```

---

## Responsive Behavior

### Desktop (>768px)
- Sidebar: **268px** width, flex column, always visible
- Content: flex row (sidebar + page), `minHeight: 0` untuk scroll anak
- Hide mode: collapsible to 4px strip + hover expand

### Mobile (≤768px)
- Sidebar: full-screen overlay (di bawah navbar 50px)
- Hamburger menu: toggles sidebar (`display: flex` saat open)
- Content: flex column
- Hide mode switch: hidden
- Shortcut cari menu: nonaktif jika `fullWidthDesktop` / `hideLayout`

---

## Global Functions (Legacy)

```javascript
window.addNavbar(menus);          // Same as layout.addNavbar()
window.setLayoutTheme(themeName); // Same as layout.setTheme()
window.setCustomTheme(config);    // Same as layout.setCustomTheme()
```

### Layout API lengkap (referensi)
```javascript
// Routing & pages
layout.addPage(config)
layout.navigate(path, replace?)
layout.render()
layout.middleware(fn)
layout.isValidRoute(path)
layout.isCrudDynamicRoute(path)
layout.resetPageScroll()

// Menu & chrome
layout.addSideMenu(menus)
layout.addNavbar(menus)
layout.setNavbarTitle(title)
layout.openMenuSearch()

// Auth / theme / role
layout.setRole(role)
layout.getRole()
layout.setTheme(name)
layout.setCustomTheme(config)
layout.showAuthBootstrapLoader(message, options?)
layout.hideAuthBootstrapLoader()

// Feedback
layout.toast(message, options?)
layout.notify(options?)
layout.confirm(options?)
layout.closeConfirm()
layout.modal(options?) / layout.customModal
layout.closeModal()
layout.showLoader() / layout.hideLoader()

// Notifikasi operasional
layout.initNotifications()
layout.fetchNotifications()
layout.stopNotifications()
layout.openNotificationsHistory()
```

---

## Tips & Best Practices

### 1. Page Components
```javascript
// Return el.js element
component: () => el('div').text('Page')

// Return Promise for async loading
component: () => import('./pages/Dashboard.js')

// Return complex component
component: () => {
  return el('div').child([
    el('h1').text('Dashboard'),
    el('p').text('Welcome!')
  ]);
}
```

### 2. i18n Integration
```javascript
// Requires window.i18n.t() function
layout.addSideMenu([
  {
    nameKey: 'menu.dashboard',
    name: 'Dashboard',  // Fallback if i18n not available
    icon: 'fas fa-home',
    page: '/'
  }
]);
```

### 3. Prevent Flash on Load
```css
/* Add to your CSS */
#layout-container {
  visibility: hidden;
}
```
Layout automatically sets `visibility: visible` after rendering.

### 4. Custom Logout
```javascript
// Logout built-in flow:
// 1. POST /api/auth/logout
// 2. CrmAuth.logout() (jika tersedia)
// 3. layout.stopNotifications()
// 4. layout.addSideMenu([]) — clear menus
// 5. layout.setRole(null) — clear role
// 6. window.location.hash = '#/login'

// Override dengan middleware atau custom navbar jika perlu
```

### 5. Page Scroll Reset
```javascript
// Reset scroll position ke atas
layout.resetPageScroll();

// Reset elements:
// 1. window.scrollTo(0, 0)
// 2. document.documentElement.scrollTop = 0
// 3. document.body.scrollTop = 0
// 4. connector.content.scrollTop = 0
// 5. connector.pagecontent.scrollTop = 0

// Auto-dipanggil:
// - Saat showLoader() (sebelum navigasi)
// - Setelah component render (via resetPageScrollAfterPaint)
// - resetPageScrollAfterPaint() menggunakan requestAnimationFrame
//   untuk memastikan scroll reset setelah browser paint

// Manual usage (rare):
function customNavigation() {
  // Custom logic
  layout.resetPageScroll();  // Force scroll to top
}
```

### 6. Layout Visibility Control
```javascript
// Centralized function: updateLayoutVisibility()
// Mengontrol visibility navbar, sidebar, back button

// Logic:
const hideLayout = pageConfig?.hideLayout || authBootstrapActive;
const hideSidebar = pageConfig?.fullWidthDesktop || pageConfig?.hideLayout || authBootstrapActive;

// Navbar:
// - hideLayout = true → display: none
// - hideLayout = false → normal display

// Sidebar:
// - hideSidebar = true → display: none
// - desktopHideMode = true → 4px strip atau hover overlay
// - normal → 268px width

// Back Button:
// - Muncul jika: !isMobile && hideSidebar && !hideLayout
// - Navigate ke '/' (home)
```

### 7. Theme Accent Colors
```javascript
// Setiap theme punya accent color untuk sidebar active state:
const accents = {
  teal:     '#41c38c',  // Hijau teal (default starter)
  blue:     '#93c5fd',  // Biru muda
  green:    '#86efac',  // Hijau muda
  purple:   '#d8b4fe',  // Ungu muda
  orange:   '#fdba74',  // Oranye muda
  red:      '#fca5a5',  // Merah muda
  pink:     '#f9a8d4',  // Pink muda
  default:  '#94a3b8',  // Abu-abu slate
  dark:     '#cbd5e1',  // Abu-abu terang
  gray:     '#e2e8f0',  // Abu-abu sangat terang
  light:    '#0d9488'   // Teal gelap (untuk light theme)
};

// CSS variable: --sidebar-accent
// Digunakan di: .sidebar-item.active, .sidebar-dropdown-item.active

// Custom theme juga sync variable:
layout.setCustomTheme({
  navbarBg: '#1a202c',
  navbarColor: '#fff',
  sidebarBg: '#2d3748',
  sidebarColor: '#fff'
});
// Otomatis memanggil syncSidebarAccentVar()
```

### 8. Event Listeners & Global Handlers
```javascript
// Window Resize (mobile/desktop switch)
// - Threshold: 768px
// - Auto-switch cssLayouting.desktop ↔ cssLayouting.mobile
// - Re-render navbar, sidebar, pagecontent
// - Hide/show hamburger menu

// Click Outside (close dropdowns)
// - Klik di luar notification panel → close panel
// - Klik di luar user dropdown → close dropdown

// Global Keyboard Shortcut (Ctrl+K / ⌘K)
// - Event listener dengan capture phase (useCapture: true)
// - Tidak aktif jika: typing di input/textarea/select/contentEditable
// - Tidak aktif jika: fullWidthDesktop atau hideLayout
// - Mac: ⌘K, Windows/Linux: Ctrl+K

// Hash Change Handler
// - Listen: window.addEventListener('hashchange')
// - Normalize path: remove query params
// - Resolve dynamic routes
// - Check CRUD dynamic routes (/resource/create, /resource/edit/:id)
// - Auto-trigger renderPage, syncSidebarDropdowns, renderSideMenu, renderNavbar
```

### 9. Page Content Padding Edge Case
```javascript
// pageContentPadding: '0' → overflow: hidden
// Digunakan untuk datatable full-height tanpa scroll ganda

layout.addPage({
  path: '/datatable',
  component: () => el('div').text('Full height table'),
  pageContentPadding: '0'  // overflow hidden, datatable handle scroll
});

// Logic internal:
if (padding === '0' || padding === 0) {
  style.overflow = 'hidden';  // Override default overflow: auto
}
```

### 10. el.js + update dinamis
Saat rebuild sidebar/menu/modal setelah elemen sudah di-mount:
- Pakai `.empty()` → `.child()` → **`.get()`**
- Jangan hanya `.child()` tanpa flush DOM

Lihat **`cheatsheet/eljs-cheatsheet.md`** → section *Memory leaks & dynamic updates*.

---

## Common Patterns

### Login Page (No Layout)
```javascript
layout.addPage({
  path: '/login',
  hideLayout: true,
  component: () => el('div').css({
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh'
  }).child([
    el('form').child([
      el('input').attr('type', 'email').placeholder('Email'),
      el('input').attr('type', 'password').placeholder('Password'),
      el('button').text('Login').click(handleLogin)
    ])
  ])
});
```

### Full-Width Page (No Sidebar)
```javascript
layout.addPage({
  path: '/reports',
  fullWidthDesktop: true,
  component: () => el('div').text('Full-width report')
});
```

### Async Page Component
```javascript
layout.addPage({
  path: '/dashboard',
  component: async () => {
    const data = await fetch('/api/dashboard');
    return el('div').text(JSON.stringify(data));
  }
});
```

---

## Troubleshooting

### "App element not found"
- Ensure `<div id="app"></div>` exists before loading layout.js

### "el.js not load"
- Load el.js before layout.js
- Check network tab for failed requests

### Page not rendering
- Verify `layout.render()` is called
- Check page path matches navigation
- Check RBAC role restrictions

### Sidebar not showing
- Check `hideLayout` or `fullWidthDesktop` page config
- Verify `addSideMenu()` is called before `render()`

### Theme not applying
- Call `setTheme()` before or after `render()` (keduanya OK jika sebelum user navigasi)
- Check theme name is valid
- Sidebar accent: `--sidebar-accent` di `:root`

### Notifikasi tidak muncul
- Pastikan `layout.initNotifications()` dipanggil **setelah login**
- Cek `GET /api/notifications` (butuh sesi cookie)
- Badge hilang jika semua id ada di `localStorage` key `pjtki-notif-read`

### Cari menu tidak jalan di Firefox
- Gunakan **`Ctrl+K`**, bukan `Ctrl+Shift+P` (diblokir browser)

### Dropdown notifikasi / user saling tumpang
- Hanya satu terbuka; klik di luar menutup keduanya

---

## Related

| File | Isi |
|------|-----|
| `cheatsheet/eljs-cheatsheet.md` | `.get()`, memory leak, `appendToEl`, modal palette |
| `layouting/layout.js` | Implementasi layout engine |
| `index.js` | Theme teal, `initNotifications()` setelah bootstrap |

---

## Version

Built for el.js v1.0.6  
Layout Engine — Admin Starter (teal sidebar, notifikasi, Quick Open menu)
