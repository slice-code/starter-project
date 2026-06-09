require("./load-env").loadLocalEnv();

const http = require("http");
const fs = require("fs");
const path = require("path");
const database = require("./database");
const auth = require("./auth");
const uploadService = require("./upload-service");
const { HUB_TYPES } = require("./upload-types");
const imageCompress = require("./services/image-compress");
const appConfig = require("./app-config");
const rolePermissions = require("./role-permissions");
const menuConfigService = require("./menu-config-service");

// Inline stubs for legacy services from biodata project
const letterService = {
  buildMergeContext: () => ({}),
  resolveTemplateFile: (p) => p,
  mergeDocxFileToPdf: async () => Buffer.from([]),
  pickBiodataDocKode: () => 'default',
  pickBiodataTemplateKode: () => 'default',
  mergeHtmlTemplate: () => '',
  convertDocxBufferToPdf: async () => Buffer.from([]),
  resolveAutoBiodataKode: () => 'default',
  mergeDocxFileAsync: async () => Buffer.from([]),
  FILES_DIR: path.join(__dirname, 'files')
};

const biodataPdf = {
  isBiodataTemplate: () => false,
  generateBiodataPdf: async () => Buffer.from([])
};

const geminiOcr = {
  runOcr: async () => { throw new Error('OCR tidak tersedia di starter template'); }
};

const blkPersonalService = {
  findPersonalblkByBiodata: async () => null,
  sanitizePersonalblkPayload: (data) => data,
  prepareBlkIzinPulangPayload: async (db, data) => data,
  prepareBlkIzinPayload: async (db, data) => data,
  sanitizeBlkAnakPayload: (data) => data,
  notifyBlkIzinPulangChange: async () => {},
  notifyBlkIzinChange: async () => {},
  listPersonalCandidates: async () => ({ data: [] }),
  importPersonalblkFromPersonalBatch: async () => ({ imported: 0, errors: [] }),
  buildPersonalblkFromPersonal: async () => ({})
};

const blkUjkService = {
  UJK_RESOURCE_SET: new Set(),
  prepareResource: async (db, res, data) => data,
  afterUjkMutation: async () => {},
  notifyUjkChange: async () => {}
};

const printSuratService = {
  loadConfig: () => ({ templates: [], ijinBatch: {} }),
  listTemplateFilesOnDisk: () => [],
  syncProductionTemplates: () => {},
  ensureRecordPrintTemplates: () => {},
  buildBatchPdfPayload: async () => ({}),
  buildPapBatchPdfPayload: async () => ({}),
  resolveKodeForBatch: () => 'default',
  buildBatchMergeContextAsync: async () => ({}),
  mergeTemplate: () => '',
  buildRekomTabunganPdfPayload: async () => ({}),
  buildRekomIjinBatchPdfPayload: async () => ({}),
  buildRecordPdfPayload: async () => ({}),
  streamStaticTemplate: () => '',
  exportSuratPengajuanExcel: async () => Buffer.from([]),
  resolveKodeForRecordAsync: async () => 'default',
  buildRecordContext: async () => ({}),
  buildRekomIjinBatchContextAsync: async () => ({})
};
const StudioService = require("./services/studio-service");

const PORT = parseInt(process.env.PORT || "3004", 10);

// Request size limits
const MAX_REQUEST_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_JSON_SIZE = 1 * 1024 * 1024; // 1MB for JSON body

function readJsonBody(req, maxSize = MAX_JSON_SIZE) {
  return new Promise((resolve, reject) => {
    let body = "";
    let totalSize = 0;

    req.on("data", (chunk) => {
      totalSize += chunk.length;
      if (totalSize > maxSize) {
        reject(
          new Error(
            `Request body too large. Maximum size is ${maxSize / 1024 / 1024}MB`,
          ),
        );
        req.destroy(); // Abort the request
        return;
      }
      body += chunk.toString();
    });

    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error("Invalid JSON body"));
      }
    });

    req.on("error", reject);
  });
}

// Rate limiting for login attempts
const loginAttempts = new Map();
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes

function checkLoginRateLimit(ip) {
  const now = Date.now();
  const attempts = loginAttempts.get(ip) || [];

  // Remove old attempts outside lockout window
  const recentAttempts = attempts.filter(
    (t) => now - t < LOGIN_LOCKOUT_DURATION,
  );

  if (recentAttempts.length >= MAX_LOGIN_ATTEMPTS) {
    const oldestAttempt = recentAttempts[0];
    const timeRemaining = Math.ceil(
      (LOGIN_LOCKOUT_DURATION - (now - oldestAttempt)) / 60000,
    );
    return {
      allowed: false,
      retryAfterMinutes: timeRemaining,
    };
  }

  // Record this attempt
  recentAttempts.push(now);
  loginAttempts.set(ip, recentAttempts);

  return { allowed: true };
}

function cleanupOldAttempts() {
  // Run cleanup every hour to prevent memory leaks
  const now = Date.now();
  for (const [ip, attempts] of loginAttempts.entries()) {
    const recentAttempts = attempts.filter(
      (t) => now - t < LOGIN_LOCKOUT_DURATION,
    );
    if (recentAttempts.length === 0) {
      loginAttempts.delete(ip);
    } else {
      loginAttempts.set(ip, recentAttempts);
    }
  }
}

// Cleanup every hour
setInterval(cleanupOldAttempts, 60 * 60 * 1000);

// Sanitize error messages for production (prevent info leakage)
function sanitizeError(
  error,
  isProduction = process.env.NODE_ENV === "production",
) {
  if (!isProduction) {
    // In development, show full error for debugging
    return error.message || "Unknown error";
  }

  // In production, sanitize sensitive information
  const message = error.message || "Internal server error";

  // Remove SQL/database details
  if (
    message.includes("SQLITE") ||
    message.includes("SQL") ||
    message.includes("database")
  ) {
    return "Database error occurred";
  }

  // Remove file paths
  if (message.includes("/") || message.includes("\\")) {
    return "Internal server error";
  }

  // Remove stack traces
  if (message.includes("at ") || message.includes("Stack")) {
    return "Internal server error";
  }

  // Generic message for unknown errors
  return "An unexpected error occurred";
}

// Security headers middleware
function addSecurityHeaders(req, res) {
  res.setHeader("X-Content-Type-Options", "nosniff"); // Prevent MIME sniffing
  res.setHeader("X-Frame-Options", "DENY"); // Prevent clickjacking
  res.setHeader("X-XSS-Protection", "1; mode=block"); // XSS filter
  res.setHeader(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains",
  ); // Force HTTPS
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com; font-src 'self' https://cdnjs.cloudflare.com https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'",
  ); // CSP
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin"); // Control referrer
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  ); // Restrict browser features
}

/** Path respons privat — jangan di-cache browser maupun CDN (Cloudflare). */
function isPrivateResponsePath(pathname) {
  return (
    pathname.startsWith("/uploads/") ||
    pathname.startsWith("/data/uploads/") ||
    pathname.startsWith("/api/")
  );
}

/** Shell SPA (HTML/JS/CSS app) — jangan di-cache CDN agar deploy langsung terlihat. */
function isAppShellAsset(pathname) {
  if (!pathname || pathname === "/") return true;
  if (
    pathname === "/index.html" ||
    pathname === "/index.js" ||
    pathname === "/el.js"
  )
    return true;
  if (pathname.startsWith("/core/")) return true;
  if (pathname.startsWith("/layouting/layout.js")) return true;
  return false;
}

/** Header anti-cache untuk dokumen privat & API terautentikasi. */
function setPrivateNoCacheHeaders(res) {
  res.setHeader(
    "Cache-Control",
    "private, no-store, no-cache, must-revalidate, max-age=0",
  );
  res.setHeader("CDN-Cache-Control", "no-store");
  res.setHeader("Cloudflare-CDN-Cache-Control", "no-store");
  res.setHeader("Surrogate-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Vary", "Cookie, Authorization");
}

/** Normalisasi URL upload lama (/data/uploads/...) ke /uploads/... */
function normalizeUploadRequestPath(pathname) {
  if (pathname.startsWith("/data/uploads/")) {
    return `/uploads/${pathname.slice("/data/uploads/".length)}`;
  }
  return pathname;
}

const mimeTypes = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".pdf": "application/pdf",
  ".webp": "image/webp",
  ".doc": "application/msword",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

// ============================================
// Auth API — JWT di HttpOnly cookie
// POST /api/auth/login | POST /api/auth/logout | GET /api/auth/me
// ============================================

async function handleAuthRoutes(req, res) {
  const apiPath = req.url.split("?")[0];

  const json = (statusCode, data, extraHeaders = {}) => {
    res.writeHead(statusCode, {
      "Content-Type": "application/json",
      ...extraHeaders,
    });
    res.end(JSON.stringify(data));
  };

  // POST /api/auth/login
  if (apiPath === "/api/auth/login" && req.method === "POST") {
    readJsonBody(req)
      .then(async (payload) => {
        // Get client IP for rate limiting
        const clientIP =
          req.headers["x-forwarded-for"] ||
          req.socket.remoteAddress ||
          "unknown";

        // Check rate limit
        const rateLimit = checkLoginRateLimit(clientIP);
        if (!rateLimit.allowed) {
          json(429, {
            success: false,
            error: `Terlalu banyak percobaan login. Silakan coba lagi dalam ${rateLimit.retryAfterMinutes} menit.`,
          });
          return;
        }

        // Sanitize and validate input
        const email = auth.sanitizeInput(payload.email, 255);
        const password = payload.password || "";

        // Validate email format
        if (!email || !auth.validateEmail(email)) {
          json(400, { success: false, error: "Format email tidak valid" });
          return;
        }

        // Validate password
        const passwordValidation = auth.validatePassword(password);
        if (!passwordValidation.isValid) {
          json(400, { success: false, error: passwordValidation.errors[0] });
          return;
        }

        const user = await database.findUserByEmail(email);
        if (!user || user.status === "inactive") {
          json(401, { success: false, error: "Email atau password salah" });
          return;
        }

        const valid = await auth.verifyPassword(password, user.password);
        if (!valid) {
          json(401, { success: false, error: "Email atau password salah" });
          return;
        }

        // Upgrade password plain-text ke bcrypt (DB lama)
        if (user.password && !user.password.startsWith("$2")) {
          await database.updateUserPassword(
            user.id,
            auth.hashPassword(password),
          );
        }

        const token = auth.signToken(user);
        auth.setAuthCookie(res, token);
        json(200, { success: true, data: auth.toPublicUser(user) });
      })
      .catch((err) => {
        json(400, { success: false, error: err.message });
      });
    return true;
  }

  // POST /api/auth/logout
  if (apiPath === "/api/auth/logout" && req.method === "POST") {
    auth.clearAuthCookie(res);
    json(200, { success: true, message: "Logged out" });
    return true;
  }

  // GET /api/auth/me
  if (apiPath === "/api/auth/me" && req.method === "GET") {
    try {
      const payload = auth.getUserFromRequest(req);
      if (!payload) {
        json(401, { success: false, error: "Not authenticated" });
        return true;
      }
      const user = await database.getById("users", payload.sub);
      if (!user || user.status === "inactive") {
        auth.clearAuthCookie(res);
        json(401, { success: false, error: "Not authenticated" });
        return true;
      }
      json(200, { success: true, data: auth.toPublicUser(user) });
    } catch (err) {
      json(500, { success: false, error: err.message });
    }
    return true;
  }

  // GET /api/menu - Get menu configuration (with role-based filtering)
  if (apiPath === "/api/menu" && req.method === "GET") {
    try {
      const user = auth.getUserFromRequest(req);
      if (!user) {
        json(401, { success: false, error: "Unauthorized" });
        return true;
      }

      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.searchParams.get("master") === "1") {
        const menuRole = rolePermissions.normalizeRole(user.role);
        if (menuRole !== "super_admin" && menuRole !== "studio_admin") {
          json(403, {
            success: false,
            error: "Hanya Owner atau Developer yang boleh melihat menu master",
          });
          return true;
        }
        if (menuConfigService.isConfigAvailable()) {
          const masterSideMenu = menuConfigService.getMasterSideMenu();
          json(200, {
            success: true,
            data: {
              sideMenu: masterSideMenu,
              theme: "teal",
              navbarTitle: appConfig.getAppConfig().appName,
            },
          });
          return true;
        }
        const menuFile = path.join(__dirname, "appjson", "menu.json");
        const masterMenu = JSON.parse(fs.readFileSync(menuFile, "utf8"));
        json(200, { success: true, data: masterMenu });
        return true;
      }

      const menuFile = path.join(__dirname, "appjson", "menu.json");
      const menuConfig = JSON.parse(fs.readFileSync(menuFile, "utf8"));

      const menuRole = rolePermissions.normalizeRole(user.role);
      if (menuRole) {
        try {
          if (rolePermissions.isOwnerRole(menuRole)) {
            menuConfig.sideMenu = database.ensureOwnerSettingsInSideMenu(
              database.ensureDashboardInSideMenu(menuConfig.sideMenu, menuRole),
              menuRole,
            );
            menuConfig.menuPermissions = null;
            console.log("[Menu] Owner: menu lengkap + Pengaturan Menu");
          } else if (rolePermissions.isAdminCabangRole(menuRole)) {
            menuConfig.sideMenu = database.stripOwnerOnlyFromSideMenu(
              database.ensureDashboardInSideMenu(menuConfig.sideMenu, menuRole),
            );
            menuConfig.menuPermissions = null;
            console.log(
              "[Menu] Admin cabang: menu operasional penuh, tanpa Pengaturan Menu/users/cabang",
            );
          } else if (menuConfigService.isConfigAvailable()) {
            const mappedMenu = menuConfigService.getSideMenuForRole(menuRole);
            if (mappedMenu?.length) {
              menuConfig.sideMenu = database.ensureDashboardInSideMenu(
                mappedMenu,
                menuRole,
              );
              menuConfig.menuPermissions =
                menuConfigService.getMenuPermissionsForRole(menuRole);
              console.log(
                `[Menu] Loaded from menu-config.json for role=${menuRole}`,
              );
            } else {
              console.warn(
                `[Menu] No menu paths in menu-config.json for role=${menuRole}, pakai menu.json`,
              );
              menuConfig.sideMenu = database.ensureDashboardInSideMenu(
                menuConfig.sideMenu,
                menuRole,
              );
            }
          } else {
            const mappedMenu = await database.loadSideMenuForRole(menuRole);
            let sideMenu = mappedMenu || menuConfig.sideMenu;
            if (!mappedMenu) {
              console.warn(
                `[Menu] No menu mappings for role=${menuRole}, pakai menu.json`,
              );
            } else {
              console.log(
                `[Menu] Loaded ${mappedMenu.length} top menus from DB for role=${menuRole}`,
              );
            }
            sideMenu = database.ensureDashboardInSideMenu(sideMenu, menuRole);
            menuConfig.sideMenu = sideMenu;
            menuConfig.menuPermissions =
              await database.loadMenuPermissionsForRole(menuRole);
          }
        } catch (dbError) {
          console.warn(
            "[Menu] Failed to filter by role, using full menu:",
            dbError.message,
          );
          let side = database.ensureDashboardInSideMenu(
            menuConfig.sideMenu,
            menuRole,
          );
          if (rolePermissions.isOwnerRole(menuRole)) {
            side = database.ensureOwnerSettingsInSideMenu(side, menuRole);
          } else if (rolePermissions.isAdminCabangRole(menuRole)) {
            side = database.stripOwnerOnlyFromSideMenu(side);
          }
          menuConfig.sideMenu = side;
          if (
            rolePermissions.isOwnerRole(menuRole) ||
            rolePermissions.isAdminCabangRole(menuRole)
          ) {
            menuConfig.menuPermissions = null;
          }
        }
      }

      if (menuConfig.sideMenu) {
        const cfg = menuConfigService.loadConfig();
        const roleCfg = cfg?.roles?.[menuRole];
        const allowedFilter = rolePermissions.hasFullOperationalAccess(menuRole)
          ? null
          : menuConfigService.expandPrintSuratMenuAccess(
              roleCfg && !roleCfg.canAccessAllMenus && roleCfg.menuPaths?.length
                ? new Set(roleCfg.menuPaths)
                : null,
            );
        menuConfig.sideMenu = menuConfigService.ensurePrintSuratMenuGroup(
          menuConfig.sideMenu,
          allowedFilter,
        );
      }

      res.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify({ success: true, data: menuConfig }));
      return true;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // GET /api/pages - Get pages manifest (list of all available pages)
  if (apiPath === "/api/pages" && req.method === "GET") {
    try {
      const user = auth.getUserFromRequest(req);
      if (!user) {
        json(401, { success: false, error: "Unauthorized" });
        return true;
      }

      const { list } = buildPagesIndex();
      const pages = list.map((entry) => ({
        name: entry.name,
        path: entry.path,
        type: entry.type || "crud",
        title: entry.title,
      }));

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, data: pages }));
      return true;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // POST /api/pages/bulk - Bulk fetch page configurations
  if (apiPath === "/api/pages/bulk" && req.method === "POST") {
    readJsonBody(req)
      .then(async (payload) => {
        try {
          const user = auth.getUserFromRequest(req);
          if (!user) {
            json(401, { success: false, error: "Unauthorized" });
            return;
          }

          const paths = Array.isArray(payload.paths) ? payload.paths : [];
          const index = buildPagesIndex();
          const results = [];
          for (const pagePath of paths) {
            const pageName = index.byPath[pagePath];
            if (!pageName) continue;
            const content = readPageConfigFile(pageName);
            if (content) results.push(content);
          }

          json(200, { success: true, data: results });
        } catch (error) {
          json(500, { success: false, error: error.message });
        }
      })
      .catch((err) => {
        json(400, { success: false, error: err.message });
      });
    return true;
  }

  // GET /api/pages/by-path - Get single page configuration
  if (apiPath === "/api/pages/by-path" && req.method === "GET") {
    try {
      const user = auth.getUserFromRequest(req);
      if (!user) {
        json(401, { success: false, error: "Unauthorized" });
        return true;
      }

      const url = new URL(req.url, `http://${req.headers.host}`);
      const pagePath = url.searchParams.get("path");

      if (!pagePath) {
        json(400, { success: false, error: "Missing path parameter" });
        return true;
      }

      const index = buildPagesIndex();
      const pageName = index.byPath[pagePath];
      if (!pageName) {
        json(404, { success: false, error: "Page not found" });
        return true;
      }

      const content = readPageConfigFile(pageName);
      if (!content) {
        json(404, { success: false, error: "Page not found" });
        return true;
      }

      json(200, { success: true, data: content });
      return true;
    } catch (error) {
      json(500, { success: false, error: error.message });
      return true;
    }
  }

  return false;
}

// Cek JWT cookie untuk API yang dilindungi
function isPublicApiRoute(pathname, method) {
  if (pathname === "/api/auth/login" && method === "POST") return true;
  return false;
}

const {
  checkApiPermission,
  BRANCH_RESTRICTED_ROLES,
  BRANCH_AWARE_TABLES,
  ROLES_CAN_CREATE_TKI,
  assertBranchRecordAccess,
} = rolePermissions;

function dbAuditOptsFromReq(req) {
  const user = auth.getUserFromRequest(req);
  const role = String(user?.role || "").toLowerCase();
  return {
    userId: user?.id || 1,
    changedBy: user?.email || user?.name || "",
    isAdmin: role === "admin",
    kodeCabang: user?.kode_cabang || null, // Include cabang from JWT token
  };
}

function requireApiAuth(req, res) {
  if (!req.url.startsWith("/api/")) return true;
  const pathname = req.url.split("?")[0];
  if (isPublicApiRoute(pathname, req.method)) return true;

  const user = auth.getUserFromRequest(req);
  if (!user) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: false, error: "Unauthorized" }));
    return false;
  }

  req.authUser = user;

  // Studio API — akses via canAccessStudio, bukan resource CRUD biasa
  if (pathname.startsWith("/api/studio/")) {
    if (!canAccessStudio(user)) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: "Access denied." }));
      return false;
    }
    return true;
  }

  // Schema metadata API — studio roles + super_admin
  if (pathname === "/api/schema" || pathname.startsWith("/api/schema/")) {
    const role = rolePermissions.normalizeRole(user.role);
    if (role !== "super_admin" && role !== "studio_admin") {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: "Access denied." }));
      return false;
    }
    return true;
  }

  // Check RBAC permissions for CRUD operations
  const match = pathname.match(
    /^\/api\/([a-zA-Z_][a-zA-Z0-9_]*)(?:\/([^/]+))?$/,
  );
  if (match) {
    const resource = match[1];
    const subPath = match[2] || "";
    let method = req.method;

    // Upsert detail pekerjaan — izin update (bukan create) untuk role Marketing
    if (
      resource === "majikan_kriteria_pekerjaan" &&
      subPath === "sync" &&
      method === "POST"
    ) {
      method = "PATCH";
    }

    if (!checkApiPermission(user, resource, method)) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          success: false,
          error: "Forbidden: You do not have permission to perform this action",
        }),
      );
      return false;
    }
  }

  req.authUser = user;
  return true;
}

// ============================================
// API Routes for appjson (Private - Not Public)
// ============================================
const appjsonDir = path.join(__dirname, "appjson");

let pagesIndexCache = null;

function invalidatePagesIndex() {
  pagesIndexCache = null;
}

function buildPagesIndex() {
  if (pagesIndexCache) return pagesIndexCache;
  const byPath = {};
  const list = [];
  const files = fs
    .readdirSync(appjsonDir)
    .filter((f) => f.endsWith(".json") && f !== "menu.json");
  for (const file of files) {
    const name = file.replace(".json", "");
    const content = JSON.parse(
      fs.readFileSync(path.join(appjsonDir, file), "utf8"),
    );
    const entry = {
      name,
      path: content.path,
      type: content.type,
      title: content.config?.title || "Untitled",
    };
    list.push(entry);
    if (content.path) byPath[content.path] = name;
  }
  pagesIndexCache = { list, byPath };
  return pagesIndexCache;
}

function readPageConfigFile(pageName) {
  const filePath = path.join(appjsonDir, `${pageName}.json`);
  if (!filePath.startsWith(appjsonDir) || !fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

// ============================================
// API Routes for schema (Private - Not Public)
// ============================================
const schemaDir = path.join(__dirname, "schema");

function canAccessStudio(user) {
  const role = rolePermissions.normalizeRole(user?.role);
  return role === "super_admin" || role === "studio_admin";
}

async function handleApiRoutes(req, res) {
  const urlPath = (req.url || '').split('?')[0];

  // GET /api/schema - List all available schemas
  if (urlPath === "/api/schema" && req.method === "GET") {
    try {
      const appjsonDir = path.join(__dirname, "appjson");
      let appjsonSet = new Set();
      try {
        appjsonSet = new Set(
          fs.readdirSync(appjsonDir)
            .filter((f) => f.endsWith(".json") && f !== "form-field-presets.json")
            .map((f) => f.replace(".json", "")),
        );
      } catch (_) { /* ignore */ }

      const files = fs
        .readdirSync(schemaDir)
        .filter((f) => f.endsWith(".json"));
      const schemas = files.map((file) => {
        const fileKey = file.replace(".json", "");
        const content = JSON.parse(
          fs.readFileSync(path.join(schemaDir, file), "utf8"),
        );
        const name = content.name || fileKey;
        return {
          name,
          label: content.label || name,
          icon: content.icon,
          fieldsCount: content.fields?.length || 0,
          fieldCount: content.fields?.length || 0,
          primaryKey: content.primaryKey || "id",
          hasCrud: appjsonSet.has(name) || appjsonSet.has(fileKey),
        };
      }).sort((a, b) => (a.label || a.name).localeCompare(b.label || b.name));

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, data: schemas, total: schemas.length }));
      return true;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // GET /api/schema/:schemaName - Get specific schema
  if (req.url.startsWith("/api/schema/") && req.method === "GET") {
    try {
      const schemaName = req.url.split("/api/schema/")[1].split("?")[0];
      const filePath = path.join(schemaDir, `${schemaName}.json`);

      // Security: Prevent directory traversal
      if (!filePath.startsWith(schemaDir)) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "Access denied" }));
        return true;
      }

      if (!fs.existsSync(filePath)) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "Schema not found" }));
        return true;
      }

      const content = JSON.parse(fs.readFileSync(filePath, "utf8"));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, data: content }));
      return true;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // POST /api/schema - Create new schema
  if (req.url === "/api/schema" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        const data = JSON.parse(body);
        const fileName = data.name || "schema";
        const filePath = path.join(schemaDir, `${fileName}.json`);

        // Security: Prevent directory traversal
        if (!filePath.startsWith(schemaDir)) {
          res.writeHead(403, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "Access denied" }));
          return true;
        }

        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: true,
            message: "Schema created",
            file: `${fileName}.json`,
          }),
        );
        return true;
      } catch (error) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: error.message }));
        return true;
      }
    });
    return true;
  }

  // PUT /api/schema/:schemaName - Update schema
  if (req.url.startsWith("/api/schema/") && req.method === "PUT") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        const schemaName = req.url.split("/api/schema/")[1].split("?")[0];
        const filePath = path.join(schemaDir, `${schemaName}.json`);

        // Security: Prevent directory traversal
        if (!filePath.startsWith(schemaDir)) {
          res.writeHead(403, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "Access denied" }));
          return true;
        }

        const data = JSON.parse(body);
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, message: "Schema updated" }));
        return true;
      } catch (error) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: error.message }));
        return true;
      }
    });
    return true;
  }

  // DELETE /api/schema/:schemaName - Delete schema
  if (req.url.startsWith("/api/schema/") && req.method === "DELETE") {
    try {
      const schemaName = req.url.split("/api/schema/")[1].split("?")[0];
      const filePath = path.join(schemaDir, `${schemaName}.json`);

      // Security: Prevent directory traversal
      if (!filePath.startsWith(schemaDir)) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "Access denied" }));
        return true;
      }

      if (!fs.existsSync(filePath)) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "Schema not found" }));
        return true;
      }

      fs.unlinkSync(filePath);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, message: "Schema deleted" }));
      return true;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // ============================================
  // Studio API Routes - CRUD Builder
  // ============================================

  // GET /api/studio/crud-list - List all CRUD configs
  if (req.url === "/api/studio/crud-list" && req.method === "GET") {
    try {
      const authUser = auth.getUserFromRequest(req);
      if (!authUser || !canAccessStudio(authUser)) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "Access denied. Studio admin role required." }));
        return true;
      }

      const result = await StudioService.listCrudConfigs();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
      return true;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // GET /api/studio/crud/:name - Get single CRUD config
  if (req.url.startsWith("/api/studio/crud/") && req.method === "GET") {
    try {
      const authUser = auth.getUserFromRequest(req);
      if (!authUser || !canAccessStudio(authUser)) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "Access denied. Studio admin role required." }));
        return true;
      }

      const resourceName = req.url.split("/api/studio/crud/")[1].split("?")[0];
      const result = await StudioService.getCrudConfig(resourceName);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
      return true;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // POST /api/studio/crud - Create/Update CRUD
  if (req.url === "/api/studio/crud" && req.method === "POST") {
    try {
      const authUser = auth.getUserFromRequest(req);
      if (!authUser || !canAccessStudio(authUser)) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "Access denied. Studio admin role required." }));
        return true;
      }

      let body = "";
      req.on("data", (chunk) => {
        body += chunk.toString();
      });
      req.on("end", async () => {
        try {
          const config = JSON.parse(body);
          const result = await StudioService.saveCrudConfig(config, authUser.username || authUser.email);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(result));
        } catch (error) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: error.message }));
        }
      });
      return true;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // DELETE /api/studio/crud/:name - Delete CRUD
  if (req.url.startsWith("/api/studio/crud/") && req.method === "DELETE") {
    try {
      const authUser = auth.getUserFromRequest(req);
      if (!authUser || !canAccessStudio(authUser)) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "Access denied. Studio admin role required." }));
        return true;
      }

      const resourceName = req.url.split("/api/studio/crud/")[1].split("?")[0];
      const result = await StudioService.deleteCrudConfig(resourceName, authUser.username || authUser.email);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
      return true;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // POST /api/studio/generate-migration - Generate SQL migration
  if (req.url === "/api/studio/generate-migration" && req.method === "POST") {
    try {
      const authUser = auth.getUserFromRequest(req);
      if (!authUser || !canAccessStudio(authUser)) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "Access denied. Studio admin role required." }));
        return true;
      }

      let body = "";
      req.on("data", (chunk) => {
        body += chunk.toString();
      });
      req.on("end", async () => {
        try {
          const { resourceName, dbType } = JSON.parse(body);
          const result = await StudioService.generateMigration(resourceName, dbType || 'postgresql');
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(result));
        } catch (error) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: error.message }));
        }
      });
      return true;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // GET /api/studio/deploy-history - Get deployment history
  if (req.url === "/api/studio/deploy-history" && req.method === "GET") {
    try {
      const authUser = auth.getUserFromRequest(req);
      if (!authUser || !canAccessStudio(authUser)) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "Access denied. Studio admin role required." }));
        return true;
      }

      const result = await StudioService.getDeployHistory();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
      return true;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // POST /api/studio/validate - Validate CRUD config
  if (req.url === "/api/studio/validate" && req.method === "POST") {
    try {
      const authUser = auth.getUserFromRequest(req);
      if (!authUser || !canAccessStudio(authUser)) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "Access denied. Studio admin role required." }));
        return true;
      }

      let body = "";
      req.on("data", (chunk) => {
        body += chunk.toString();
      });
      req.on("end", async () => {
        try {
          const config = JSON.parse(body);
          const result = await StudioService.validateConfig(config);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(result));
        } catch (error) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: error.message }));
        }
      });
      return true;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // POST /api/studio/preview - Preview CRUD without saving
  if (req.url === "/api/studio/preview" && req.method === "POST") {
    try {
      const authUser = auth.getUserFromRequest(req);
      if (!authUser || !canAccessStudio(authUser)) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "Access denied. Studio admin role required." }));
        return true;
      }

      let body = "";
      req.on("data", (chunk) => {
        body += chunk.toString();
      });
      req.on("end", async () => {
        try {
          const config = JSON.parse(body);
          const result = await StudioService.previewConfig(config);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(result));
        } catch (error) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: error.message }));
        }
      });
      return true;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // POST /api/studio/import - Import CRUD from JSON
  if (req.url === "/api/studio/import" && req.method === "POST") {
    try {
      const authUser = auth.getUserFromRequest(req);
      if (!authUser || authUser.role !== 'super_admin') {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "Access denied. Super admin role required." }));
        return true;
      }

      let body = "";
      req.on("data", (chunk) => {
        body += chunk.toString();
      });
      req.on("end", async () => {
        try {
          const { schema, appjson } = JSON.parse(body);
          const result = await StudioService.importCrud(schema, appjson, authUser.username || authUser.email);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(result));
        } catch (error) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: error.message }));
        }
      });
      return true;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // POST /api/studio/clone/:name - Clone existing CRUD
  if (req.url.startsWith("/api/studio/clone/") && req.method === "POST") {
    try {
      const authUser = auth.getUserFromRequest(req);
      if (!authUser || !canAccessStudio(authUser)) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "Access denied. Studio admin role required." }));
        return true;
      }

      const resourceName = req.url.split("/api/studio/clone/")[1].split("?")[0];
      let body = "";
      req.on("data", (chunk) => {
        body += chunk.toString();
      });
      req.on("end", async () => {
        try {
          const { newResourceName } = JSON.parse(body);
          const result = await StudioService.cloneCrud(resourceName, newResourceName, authUser.username || authUser.email);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(result));
        } catch (error) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: error.message }));
        }
      });
      return true;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // GET /api/studio/schema-list - List all schema/*.json
  if (urlPath === "/api/studio/schema-list" && req.method === "GET") {
    try {
      const authUser = auth.getUserFromRequest(req);
      if (!authUser || !canAccessStudio(authUser)) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "Access denied." }));
        return true;
      }
      const result = await StudioService.listSchemas();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
      return true;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // GET/POST /api/studio/schema/:name
  if (req.url.startsWith("/api/studio/schema/") && !req.url.includes("/sync-") && !req.url.includes("/db-status")) {
    const parts = req.url.split("/api/studio/schema/")[1].split("?")[0].split("/");
    const resourceName = parts[0];
    if (resourceName && req.method === "GET" && parts.length === 1) {
      try {
        const authUser = auth.getUserFromRequest(req);
        if (!authUser || !canAccessStudio(authUser)) {
          res.writeHead(403, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "Access denied." }));
          return true;
        }
        const result = await StudioService.getSchemaDetail(resourceName, true);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
        return true;
      } catch (error) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: error.message }));
        return true;
      }
    }
    if (resourceName && req.method === "POST" && parts.length === 1) {
      try {
        const authUser = auth.getUserFromRequest(req);
        if (!authUser || authUser.role !== 'super_admin') {
          res.writeHead(403, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "Super admin required." }));
          return true;
        }
        let body = "";
        req.on("data", (chunk) => { body += chunk.toString(); });
        req.on("end", async () => {
          try {
            const schemaJson = JSON.parse(body);
            const result = await StudioService.saveSchema(schemaJson, authUser.username || authUser.email);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(result));
          } catch (error) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: error.message }));
          }
        });
        return true;
      } catch (error) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: error.message }));
        return true;
      }
    }
  }

  // GET /api/studio/schema/:name/db-status
  if (req.url.match(/^\/api\/studio\/schema\/[^/]+\/db-status/) && req.method === "GET") {
    try {
      const authUser = auth.getUserFromRequest(req);
      if (!authUser || !canAccessStudio(authUser)) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "Access denied." }));
        return true;
      }
      const resourceName = req.url.split("/api/studio/schema/")[1].split("/db-status")[0];
      const result = await StudioService.compareSchemaDb(resourceName);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
      return true;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // GET /api/studio/schema/:name/sync-sql
  if (req.url.match(/^\/api\/studio\/schema\/[^/]+\/sync-sql/) && req.method === "GET") {
    try {
      const authUser = auth.getUserFromRequest(req);
      if (!authUser || !canAccessStudio(authUser)) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "Access denied." }));
        return true;
      }
      const resourceName = req.url.split("/api/studio/schema/")[1].split("/sync-sql")[0];
      const result = await StudioService.generateSchemaSyncSql(resourceName);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
      return true;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // POST /api/studio/schema/:name/sync-db
  if (req.url.match(/^\/api\/studio\/schema\/[^/]+\/sync-db/) && req.method === "POST") {
    try {
      const authUser = auth.getUserFromRequest(req);
      if (!authUser || authUser.role !== 'super_admin') {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "Super admin required." }));
        return true;
      }
      const resourceName = req.url.split("/api/studio/schema/")[1].split("/sync-db")[0];
      const result = await StudioService.applySchemaSync(resourceName, authUser.username || authUser.email);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
      return true;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // GET /api/pages - Daftar halaman (ringan, dari cache indeks)
  if (req.url === "/api/pages" && req.method === "GET") {
    try {
      const { list } = buildPagesIndex();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, data: list }));
      return true;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  const pagesApiPath = req.url.split("?")[0];

  function resolveBulkPaths(paths) {
    const index = buildPagesIndex();
    const data = [];
    for (const pagePath of paths) {
      const pageName = index.byPath[pagePath];
      if (!pageName) continue;
      const content = readPageConfigFile(pageName);
      if (content) data.push(content);
    }
    return data;
  }

  // POST /api/pages/bulk — body: { paths: ["/", "/personal", ...] }
  if (pagesApiPath === "/api/pages/bulk" && req.method === "POST") {
    readJsonBody(req)
      .then((body) => {
        try {
          const paths = Array.isArray(body.paths) ? body.paths : [];
          const data = resolveBulkPaths(paths);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true, data }));
        } catch (error) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: error.message }));
        }
      })
      .catch((err) => {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: err.message }));
      });
    return true;
  }

  // GET /api/pages/bulk?paths=... (legacy)
  if (pagesApiPath === "/api/pages/bulk" && req.method === "GET") {
    try {
      const q = req.url.includes("?") ? req.url.split("?")[1] : "";
      const params = new URLSearchParams(q);
      const pathsParam = params.get("paths") || "";
      const paths = pathsParam
        .split(",")
        .map((p) => decodeURIComponent(p.trim()))
        .filter(Boolean);
      const data = resolveBulkPaths(paths);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, data }));
      return true;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // GET /api/pages/by-path?path=/dataagama
  if (pagesApiPath === "/api/pages/by-path" && req.method === "GET") {
    try {
      const q = req.url.includes("?") ? req.url.split("?")[1] : "";
      const params = new URLSearchParams(q);
      const pagePath = decodeURIComponent(params.get("path") || "");
      if (!pagePath) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "path wajib" }));
        return true;
      }
      const index = buildPagesIndex();
      const pageName = index.byPath[pagePath];
      if (!pageName) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "Page not found" }));
        return true;
      }
      const content = readPageConfigFile(pageName);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, data: content }));
      return true;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  const apiPath = req.url.split("?")[0];
  const apiQuery = req.url.includes("?") ? req.url.split("?")[1] : "";
  const parseQuery = () => {
    const q = {};
    apiQuery.split("&").forEach((pair) => {
      const [k, v] = pair.split("=");
      if (k) q[decodeURIComponent(k)] = decodeURIComponent(v || "");
    });
    return q;
  };

  const json = (statusCode, data, extraHeaders = {}) => {
    res.writeHead(statusCode, {
      "Content-Type": "application/json",
      ...extraHeaders,
    });
    res.end(JSON.stringify(data));
  };

  const jurnalService = () => require("./services/jurnal-keuangan-service");

  // GET /api/coa/options
  if (apiPath === "/api/coa/options" && req.method === "GET") {
    try {
      const q = parseQuery();
      const data = await jurnalService().listCoaOptions(database, {
        tipe: q.tipe || null,
        kasOnly: q.kas_only === "1",
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, data }));
      return true;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // POST /api/jurnal-keuangan
  if (apiPath === "/api/jurnal-keuangan" && req.method === "POST") {
    readJsonBody(req, MAX_JSON_SIZE)
      .then(async (payload) => {
        try {
          const authUser = req.authUser || {};
          const userRole = String(authUser.role || "").toLowerCase();
          if (!["keuangan", "admin", "super_admin"].includes(userRole)) {
            res.writeHead(403, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: "Akses ditolak" }));
            return;
          }
          if (
            rolePermissions.BRANCH_RESTRICTED_ROLES.includes(userRole) &&
            authUser.kode_cabang
          ) {
            payload.kode_cabang = authUser.kode_cabang;
          } else if (!payload.kode_cabang && authUser.kode_cabang) {
            payload.kode_cabang = authUser.kode_cabang;
          }
          const created = await jurnalService().handleCreatePayload(
            database,
            payload,
            authUser,
          );
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true, data: created }));
        } catch (error) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: error.message }));
        }
      })
      .catch((err) => {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: err.message }));
      });
    return true;
  }

  // GET /api/jurnal-keuangan/:id/details
  const jurnalDetailMatch = apiPath.match(
    /^\/api\/jurnal-keuangan\/(\d+)\/details$/,
  );
  if (jurnalDetailMatch && req.method === "GET") {
    try {
      const data = await jurnalService().getJurnalWithDetails(
        database,
        jurnalDetailMatch[1],
      );
      if (!data) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({ success: false, error: "Jurnal tidak ditemukan" }),
        );
        return true;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, data }));
      return true;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // GET /api/laporan-akuntansi/:report
  const lapAkunMatch = apiPath.match(
    /^\/api\/laporan-akuntansi\/(buku-besar|neraca|laba-rugi|arus-kas)$/,
  );
  if (lapAkunMatch && req.method === "GET") {
    try {
      const authUser = req.authUser || {};
      const userRole = String(authUser.role || "").toLowerCase();
      let kodeCabang = null;
      if (
        rolePermissions.BRANCH_RESTRICTED_ROLES.includes(userRole) &&
        authUser.kode_cabang
      ) {
        kodeCabang = authUser.kode_cabang;
      }
      const q = parseQuery();
      const opts = {
        kodeCabang,
        kodeAkun: q.kode_akun || q.kodeAkun || "",
        dateFrom: q.date_from || q.dateFrom || "",
        dateTo: q.date_to || q.dateTo || "",
        asOf: q.as_of || q.asOf || "",
      };
      const key = lapAkunMatch[1];
      let data;
      if (key === "buku-besar")
        data = await jurnalService().getBukuBesar(database, opts);
      else if (key === "neraca")
        data = await jurnalService().getNeraca(database, opts);
      else if (key === "arus-kas")
        data = await jurnalService().getArusKas(database, opts);
      else data = await jurnalService().getLabaRugi(database, opts);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, data }));
      return true;
    } catch (error) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // POST /api/pembayaran-tki/bukti — unggah bukti potongan gaji bulanan
  if (apiPath === "/api/pembayaran-tki/bukti" && req.method === "POST") {
    try {
      const userRole = String(req.authUser?.role || "").toLowerCase();
      if (!["super_admin", "admin", "keuangan"].includes(userRole)) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "Akses ditolak." }));
        return true;
      }
      uploadService.ensureUploadRoot();
      const { fields, file } = await uploadService.parseMultipart(req);
      const idTki = String(fields.id_tki || "")
        .trim()
        .toUpperCase();
      if (!idTki) throw new Error("id_tki wajib");
      const tki = await database.getByField("datatki", "id_tki", idTki);
      if (!tki) throw new Error("ID TKI tidak ditemukan.");
      const saved = uploadService.savePembayaranBuktiFile(idTki, file);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, data: saved }));
      return true;
    } catch (error) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // GET /api/pembayaran-tki/default-nominal?id_tki=...&jenis_biaya=...
  if (apiPath === "/api/pembayaran-tki/default-nominal" && req.method === "GET") {
    try {
      const q = parseQuery();
      const idTki = String(q.id_tki || "").trim();
      const jenisBiaya = String(q.jenis_biaya || "").trim();
      if (!idTki || !jenisBiaya) {
        json(400, { success: false, error: "id_tki dan jenis_biaya wajib diisi" });
        return true;
      }
      const pembayaranService = require("./services/pembayaran-tki-service");
      const data = await pembayaranService.getDefaultNominalSuggestion(
        database,
        idTki,
        jenisBiaya,
      );
      json(200, { success: true, data });
    } catch (error) {
      json(500, { success: false, error: error.message });
    }
    return true;
  }

  // GET /api/pembayaran-tki/spbg-summary?id_tki=...
  if (apiPath === "/api/pembayaran-tki/spbg-summary" && req.method === "GET") {
    try {
      const q = parseQuery();
      const idTki = String(q.id_tki || "").trim();
      if (!idTki) {
        json(400, { success: false, error: "id_tki wajib diisi" });
        return true;
      }
      const pembayaranService = require("./services/pembayaran-tki-service");
      const data = await pembayaranService.summarizeSpbgPackage(database, idTki);
      json(200, { success: true, data });
    } catch (error) {
      json(500, { success: false, error: error.message });
    }
    return true;
  }

  // POST /api/spbg-keuangan/approve
  if (apiPath === '/api/spbg-keuangan/approve' && req.method === 'POST') {
    try {
      const authUser = req.authUser || {};
      const userRole = String(authUser.role || '').toLowerCase();
      if (!['keuangan', 'admin', 'super_admin'].includes(userRole)) {
        json(403, { success: false, error: 'Akses ditolak. Hanya keuangan.' }); return true;
      }
      const body = await readJsonBody(req);
      if (!body?.id) { json(400, { success: false, error: 'ID request wajib.' }); return true; }
      const svc = require('./services/spbg-keuangan-service');
      const result = await svc.approveSpbgRequest(database, body.id, authUser);
      json(200, { success: true, data: result });
      return true;
    } catch (error) {
      json(500, { success: false, error: error.message });
      return true;
    }
  }

  // POST /api/spbg-keuangan/reject
  if (apiPath === '/api/spbg-keuangan/reject' && req.method === 'POST') {
    try {
      const authUser = req.authUser || {};
      const userRole = String(authUser.role || '').toLowerCase();
      if (!['keuangan', 'admin', 'super_admin'].includes(userRole)) {
        json(403, { success: false, error: 'Akses ditolak. Hanya keuangan.' }); return true;
      }
      const body = await readJsonBody(req);
      if (!body?.id) { json(400, { success: false, error: 'ID request wajib.' }); return true; }
      const svc = require('./services/spbg-keuangan-service');
      const result = await svc.rejectSpbgRequest(database, body.id, authUser);
      json(200, { success: true, data: result });
      return true;
    } catch (error) {
      json(500, { success: false, error: error.message });
      return true;
    }
  }

  // POST /api/inventaris-aset/:id/penyusutan
  const inventarisPenyusutanMatch = apiPath.match(/^\/api\/inventaris-aset\/(\d+)\/penyusutan$/);
  if (inventarisPenyusutanMatch && req.method === 'POST') {
    try {
      const authUser = req.authUser || {};
      const userRole = String(authUser.role || '').toLowerCase();
      if (!['keuangan', 'admin', 'super_admin'].includes(userRole)) {
        json(403, { success: false, error: 'Akses ditolak.' }); return true;
      }
      const asetId = inventarisPenyusutanMatch[1];
      const body = await readJsonBody(req);
      const svc = require('./services/inventaris-service');
      const result = await svc.catatPenyusutanBulanan(database, asetId, authUser, { tanggal: body.tanggal });
      json(200, { success: true, data: result });
      return true;
    } catch (error) {
      json(500, { success: false, error: error.message });
      return true;
    }
  }

  // GET /api/inventaris-aset/:id/jadwal-penyusutan
  const inventarisJadwalMatch = apiPath.match(/^\/api\/inventaris-aset\/(\d+)\/jadwal-penyusutan$/);
  if (inventarisJadwalMatch && req.method === 'GET') {
    try {
      const authUser = req.authUser || {};
      const userRole = String(authUser.role || '').toLowerCase();
      if (!['keuangan', 'admin', 'super_admin'].includes(userRole)) {
        json(403, { success: false, error: 'Akses ditolak.' }); return true;
      }
      const asetId = inventarisJadwalMatch[1];
      const svc = require('./services/inventaris-service');
      const result = await svc.getSchedulePenyusutan(database, asetId);
      json(200, { success: true, data: result });
      return true;
    } catch (error) {
      json(500, { success: false, error: error.message });
      return true;
    }
  }

  // GET /api/inventaris-aset/ringkasan
  if (apiPath === '/api/inventaris-aset/ringkasan' && req.method === 'GET') {
    try {
      const authUser = req.authUser || {};
      const userRole = String(authUser.role || '').toLowerCase();
      if (!['keuangan', 'admin', 'super_admin'].includes(userRole)) {
        json(403, { success: false, error: 'Akses ditolak.' }); return true;
      }
      const kodeCabang = rolePermissions.BRANCH_RESTRICTED_ROLES.includes(userRole) ? (authUser.kode_cabang || null) : null;
      const svc = require('./services/inventaris-service');
      const result = await svc.getRingkasanInventaris(database, kodeCabang);
      json(200, { success: true, data: result });
      return true;
    } catch (error) {
      json(500, { success: false, error: error.message });
      return true;
    }
  }

  // GET /api/laporan-keuangan/ringkasan-pembayaran
  if (
    apiPath === "/api/laporan-keuangan/ringkasan-pembayaran" &&
    req.method === "GET"
  ) {
    try {
      const authUser = req.authUser || {};
      const userRole = String(authUser.role || "").toLowerCase();
      let kodeCabang = null;
      if (
        rolePermissions.BRANCH_RESTRICTED_ROLES.includes(userRole) &&
        authUser.kode_cabang
      ) {
        kodeCabang = authUser.kode_cabang;
      }
      const tables = database.getTableNames();
      if (!tables.includes("pembayaran_tki")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: true,
            data: {
              total_lunas: 0,
              total_cicilan: 0,
              total_potongan: 0,
              total_transaksi: 0,
            },
          }),
        );
        return true;
      }
      let where = "status != 'void'";
      const params = [];
      if (kodeCabang) {
        where += " AND kode_cabang = ?";
        params.push(kodeCabang);
      }
      const rows = await database.queryAll(
        `
        SELECT
          SUM(CASE WHEN status = 'lunas' THEN nominal ELSE 0 END) as total_lunas,
          SUM(CASE WHEN status IN ('cicilan', 'belum_lunas') THEN nominal ELSE 0 END) as total_cicilan,
          SUM(CASE WHEN metode_bayar = 'potongan_gaji' THEN nominal ELSE 0 END) as total_potongan,
          COUNT(*) as total_transaksi
        FROM pembayaran_tki WHERE ${where}`,
        ...params,
      );
      const summary = rows[0] || {};
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          success: true,
          data: {
            total_lunas: Number(summary.total_lunas) || 0,
            total_cicilan: Number(summary.total_cicilan) || 0,
            total_potongan: Number(summary.total_potongan) || 0,
            total_transaksi: Number(summary.total_transaksi) || 0,
          },
        }),
      );
      return true;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // GET /api/timeline?entity_type=customers&entity_id=1
  if (apiPath === "/api/timeline" && req.method === "GET") {
    try {
      const q = parseQuery();
      const entityType = q.entity_type;
      const entityId = parseInt(q.entity_id, 10);
      if (!entityType || !entityId) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: false,
            error: "entity_type dan entity_id wajib",
          }),
        );
        return true;
      }
      const data = await database.getEntityTimeline(
        entityType,
        entityId,
        parseInt(q.limit, 10) || 40,
      );
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, data }));
      return true;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // GET /api/calendar?year=2026&month=5
  if (apiPath === "/api/calendar" && req.method === "GET") {
    try {
      const q = parseQuery();
      const now = new Date();
      const year = parseInt(q.year, 10) || now.getFullYear();
      const month = parseInt(q.month, 10) || now.getMonth() + 1;
      const data = await database.getCalendarEvents(year, month);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, data, year, month }));
      return true;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // GET /api/reports/tki/:reportKey — datatable laporan TKI
  const tkiReportMatch = apiPath.match(
    /^\/api\/reports\/tki\/([a-z0-9-]+)(?:\/chart)?$/,
  );
  if (tkiReportMatch && req.method === "GET") {
    try {
      const reportKey = tkiReportMatch[1];
      const isChart = apiPath.endsWith("/chart");
      const authUser = req.authUser || auth.getUserFromRequest(req) || {};
      const userRole = authUser.role;
      const userKodeCabang = authUser.kode_cabang;
      let kodeCabang = null;
      if (
        rolePermissions.BRANCH_RESTRICTED_ROLES.includes(
          String(userRole || "").toLowerCase(),
        ) &&
        userKodeCabang
      ) {
        kodeCabang = userKodeCabang;
      }
      const q = parseQuery();
      const opts = {
        page: parseInt(q.page, 10) || 1,
        perPage: parseInt(q.perPage, 10) || parseInt(q.per_page, 10) || 10,
        search: q.search || "",
        sort: q.sort || "",
        order: q.order || "asc",
        sektorPrefix: q.sektor_prefix || q.id_biodata_prefix || "",
        sektorPrefixes: q.sektor_prefixes || "",
        stageKey: q.stage_filter || q.tahap_filter || "",
        stageKeys: q.stage_filters || "",
        jeniskelamin: q.jeniskelamin || "",
        statusaktif: q.statusaktif || "",
        kodeCabang,
      };
      if (isChart) {
        const data = await database.getTkiReportChart(reportKey, opts);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, data }));
      } else {
        const result = await database.listTkiReport(reportKey, opts);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, ...result }));
      }
      return true;
    } catch (error) {
      const status =
        error.message === "Jenis laporan tidak dikenal" ? 404 : 500;
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // GET /api/reports/blk/:reportKey — datatable laporan BLK
  const blkReportMatch = apiPath.match(
    /^\/api\/reports\/blk\/([a-z0-9-]+)(?:\/chart)?$/,
  );
  if (blkReportMatch && req.method === "GET") {
    try {
      const reportKey = blkReportMatch[1];
      const isChart = apiPath.endsWith("/chart");
      const authUser = req.authUser || auth.getUserFromRequest(req) || {};
      const userRole = authUser.role;
      const userKodeCabang = authUser.kode_cabang;
      let kodeCabang = null;
      if (
        rolePermissions.BRANCH_RESTRICTED_ROLES.includes(
          String(userRole || "").toLowerCase(),
        ) &&
        userKodeCabang
      ) {
        kodeCabang = userKodeCabang;
      }
      const q = parseQuery();
      const opts = {
        page: parseInt(q.page, 10) || 1,
        perPage: parseInt(q.perPage, 10) || parseInt(q.per_page, 10) || 10,
        search: q.search || "",
        sort: q.sort || "",
        order: q.order || "asc",
        sektorPrefix: q.sektor_prefix || q.id_biodata_prefix || "",
        sektorPrefixes: q.sektor_prefixes || "",
        statusFilter: q.status_filter || "",
        statusFilters: q.status_filters || "",
        jenisIzin: q.jenis_izin || "",
        statujkFilter: q.statujk_filter || "",
        statujkFilters: q.statujk_filters || "",
        jeniskelamin: q.jeniskelamin || "",
        quickFilter: q.quick_filter || "",
        kodeCabang,
      };
      if (isChart) {
        const data = await database.getBlkReportChart(reportKey, opts);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, data }));
      } else {
        const result = await database.listBlkReport(reportKey, opts);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, ...result }));
      }
      return true;
    } catch (error) {
      const status =
        error.message === "Jenis laporan tidak dikenal" ? 404 : 500;
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // GET /api/reports/blk/absensi-harian — Laporan Absensi Harian BLK
  const absensiHarianMatch = apiPath.match(
    /^\/api\/reports\/blk\/absensi-harian$/,
  );
  if (absensiHarianMatch && req.method === "GET") {
    try {
      const authUser = req.authUser || auth.getUserFromRequest(req) || {};
      const q = parseQuery();
      const tanggal = q.tanggal || new Date().toISOString().slice(0, 10);
      const sektor = q.sektor_prefix || "";
      const status = q.status_filter || "";
      const search = q.search || "";

      let where = `tanggal = '${tanggal}'`;
      if (sektor) where += ` AND id_biodata LIKE '${sektor}%'`;
      if (status) where += ` AND status = '${status}'`;
      if (search) {
        where += ` AND (nama ILIKE '%${search}%' OR id_biodata ILIKE '%${search}%')`;
      }

      const sql = `
        SELECT 
          id_tki, id_biodata, nama, sektor, 
          jam_masuk, jam_pulang, status, keterangan
        FROM blk_absensi
        WHERE ${where}
        ORDER BY jam_masuk NULLS LAST, id_biodata
        LIMIT 200
      `;

      const rows = await database.queryAll(sql);

      // Summary
      const summarySql = `
        SELECT status, COUNT(*) as jumlah 
        FROM blk_absensi 
        WHERE tanggal = '${tanggal}'
        GROUP BY status
      `;
      const summaryRows = await database.queryAll(summarySql);
      const summary = { total: 0 };
      summaryRows.forEach((r) => {
        summary[r.status] = parseInt(r.jumlah);
        summary.total += parseInt(r.jumlah);
      });

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          success: true,
          data: rows,
          summary,
        }),
      );
      return true;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // GET /api/reports/keuangan/:reportKey — datatable laporan keuangan
  const keuanganReportMatch = apiPath.match(
    /^\/api\/reports\/keuangan\/([a-z0-9-]+)(?:\/chart)?$/,
  );
  if (keuanganReportMatch && req.method === "GET") {
    try {
      const reportKey = keuanganReportMatch[1];
      const isChart = apiPath.endsWith("/chart");
      const authUser = req.authUser || auth.getUserFromRequest(req) || {};
      const userRole = authUser.role;
      const userKodeCabang = authUser.kode_cabang;
      let kodeCabang = null;
      if (
        rolePermissions.BRANCH_RESTRICTED_ROLES.includes(
          String(userRole || "").toLowerCase(),
        ) &&
        userKodeCabang
      ) {
        kodeCabang = userKodeCabang;
      }
      const q = parseQuery();
      const opts = {
        page: parseInt(q.page, 10) || 1,
        perPage: parseInt(q.perPage, 10) || parseInt(q.per_page, 10) || 10,
        search: q.search || "",
        sort: q.sort || "",
        order: q.order || "asc",
        dateFrom: q.date_from || q.dateFrom || "",
        dateTo: q.date_to || q.dateTo || "",
        statusFilter: q.status_filter || q.statusFilter || "",
        kodeCabang,
      };
      if (isChart) {
        const data = await database.getKeuanganReportChart(reportKey, opts);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, data }));
      } else {
        const result = await database.listKeuanganReport(reportKey, opts);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, ...result }));
      }
      return true;
    } catch (error) {
      const status =
        error.message === "Jenis laporan tidak dikenal" ? 404 : 500;
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // GET /api/reports/sales
  if (apiPath === "/api/reports/sales" && req.method === "GET") {
    try {
      const data = await database.getSalesReport();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, data }));
      return true;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // GET /api/export/:table — unduh CSV
  const exportMatch = apiPath.match(
    /^\/api\/export\/([a-zA-Z_][a-zA-Z0-9_]*)$/,
  );
  if (exportMatch && req.method === "GET") {
    const table = exportMatch[1];
    if (!database.getTableNames().includes(table)) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: "Table not found" }));
      return true;
    }
    try {
      const q = parseQuery();
      const csv = await database.exportTableCsv(table, {
        search: q.search || "",
        sort: q.sort || "",
        order: q.order || "asc",
      });
      res.writeHead(200, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${table}-export.csv"`,
      });
      res.end("\uFEFF" + csv);
      return true;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // GET /api/dashboard - Ringkasan TKI untuk halaman dashboard
  if (req.url === "/api/dashboard" && req.method === "GET") {
    try {
      const authUser = req.authUser || auth.getUserFromRequest(req) || {};
      const kodeCabang =
        rolePermissions.isBranchRestricted(authUser.role) &&
        authUser.kode_cabang
          ? authUser.kode_cabang
          : null;
      const data = await database.getDashboardStats(kodeCabang);
      const view = rolePermissions.getDashboardViewConfig(
        authUser.role,
        authUser,
      );
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, data: { ...data, view } }));
      return true;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // GET /api/notifications — alert operasional TKI untuk navbar
  if (apiPath === "/api/notifications" && req.method === "GET") {
    try {
      const authUser = req.authUser || auth.getUserFromRequest(req) || {};
      if (!authUser.sub && !authUser.id) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({ success: false, error: "Authentication required" }),
        );
        return true;
      }
      const qstr = req.url.split("?")[1] || "";
      const limit = Math.min(
        parseInt(new URLSearchParams(qstr).get("limit") || "15", 10) || 15,
        30,
      );
      const kodeCabang =
        rolePermissions.isBranchRestricted(authUser.role) &&
        authUser.kode_cabang
          ? authUser.kode_cabang
          : null;
      const data = await database.getUserNotifications(kodeCabang, limit);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, data }));
      return true;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // POST /api/menu-mapping/reset-from-config — reset tab sektor dari config JSON
  if (
    req.url.startsWith("/api/menu-mapping/reset-from-config") &&
    req.method === "POST"
  ) {
    try {
      const authUser = auth.getUserFromRequest(req);
      if (!authUser) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({ success: false, error: "Authentication required" }),
        );
        return true;
      }
      const userRole = rolePermissions.normalizeRole(authUser.role);
      const allowed = ["super_admin", "admin", "data_master", "bagian_bio"];
      if (!allowed.includes(userRole)) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: false,
            error: "Role tidak diizinkan reset menu sektor",
          }),
        );
        return true;
      }
      const body = await readJsonBody(req);
      const sektor = String(body?.sektor || "")
        .trim()
        .toUpperCase();
      if (!sektor) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: false,
            error: "Field sektor wajib (mis. FF)",
          }),
        );
        return true;
      }
      const result = await database.resetMenuMappingFromConfig(sektor);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, data: result }));
      return true;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // GET /api/menu-mapping?sektor=FF — tab menudalam per sektor
  if (req.url.startsWith("/api/menu-mapping") && req.method === "GET") {
    try {
      const qstr = req.url.split("?")[1] || "";
      const sektor = new URLSearchParams(qstr).get("sektor") || "";
      const data = await database.getMenuMappingBySektor(sektor);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, data }));
      return true;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // POST /api/tki/create — buat TKI baru (tambahbio)
  if (req.url === "/api/tki/create" && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const authUser = auth.getUserFromRequest(req);
      if (!authUser) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({ success: false, error: "Authentication required" }),
        );
        return true;
      }

      const userRole = rolePermissions.normalizeRole(authUser.role);
      if (!ROLES_CAN_CREATE_TKI.includes(userRole)) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: false,
            error: "Role Anda tidak diizinkan membuat biodata TKI",
          }),
        );
        return true;
      }

      const userRecord = await database.getById("users", authUser.sub);

      if (userRole === "super_admin") {
        body.kode_cabang = String(
          body.kode_cabang || userRecord?.kode_cabang || "",
        ).trim();
        if (!body.kode_cabang) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              success: false,
              error: "Kode cabang wajib diisi untuk biodata baru",
            }),
          );
          return true;
        }
      } else {
        if (!userRecord?.kode_cabang) {
          res.writeHead(403, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              success: false,
              error: "User tidak memiliki kode_cabang. Hubungi super admin.",
            }),
          );
          return true;
        }
        body.kode_cabang = userRecord.kode_cabang;
      }

      const data = await database.createTkiBiodata(body);
      res.writeHead(201, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, data }));
      return true;
    } catch (error) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  const personalEpisodesMatch = req.url.match(
    /^\/api\/personal\/([^/]+)\/episodes(?:\?.*)?$/,
  );
  if (personalEpisodesMatch && req.method === "GET") {
    try {
      const idTki = decodeURIComponent(personalEpisodesMatch[1]);
      const episodes = await database.findAllEpisodesByIdTki(idTki);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, data: episodes }));
      return true;
    } catch (error) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  const personalPindahMatch = req.url.match(
    /^\/api\/personal\/([^/]+)\/pindah-sektor(?:\?.*)?$/,
  );
  if (personalPindahMatch && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const authUser = auth.getUserFromRequest(req);
      if (!authUser) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({ success: false, error: "Authentication required" }),
        );
        return true;
      }
      const idTki = decodeURIComponent(personalPindahMatch[1]);
      const data = await database.pindahSektorTki(idTki, {
        ...body,
        userId: authUser.sub || authUser.email || "",
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, data }));
      return true;
    } catch (error) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // GET /api/biodata/:id/fiskal — rekap administrasi read-only
  const biodataFiskalMatch = req.url.match(
    /^\/api\/biodata\/([^/]+)\/fiskal(?:\?.*)?$/,
  );
  if (biodataFiskalMatch && req.method === "GET") {
    try {
      const idBiodata = decodeURIComponent(biodataFiskalMatch[1]);
      const fiskal = await database.getBiodataFiskal(idBiodata);
      if (!fiskal) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({ success: false, error: "Biodata tidak ditemukan" }),
        );
      } else {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, data: fiskal }));
      }
      return true;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // —— Cetak / export dokumen (plan §11 — template files/*.docx) ——
  const lettersPath = req.url.split("?")[0];

  if (lettersPath === "/api/letters/print-data-stats" && req.method === "GET") {
    try {
      const stats = await database.getPrintDataStats();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, data: stats }));
      return true;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  if (
    lettersPath === "/api/letters/reports/medical-belum-terbang" &&
    req.method === "GET"
  ) {
    try {
      const rows = await database.getMedicalBelumTerbangReport();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, data: rows }));
      return true;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  if (
    lettersPath === "/api/letters/reports/expire-tgl-online" &&
    req.method === "GET"
  ) {
    try {
      const q = new URLSearchParams(req.url.split("?")[1] || "");
      const days = Math.min(
        365,
        Math.max(1, parseInt(q.get("days") || "30", 10) || 30),
      );
      const rows = await database.getExpireTglOnlineReport(days);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, data: rows }));
      return true;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // —— Print batch generik (KTKLN, DIS, laporan, …) ——
  const batchMatch = lettersPath.match(
    /^\/api\/print\/batch\/([a-z0-9_]+)(?:\/(\d+))?(?:\/(details|pdf|docx))?(?:\/(\d+))?$/i,
  );
  if (batchMatch) {
    const batchKey = batchMatch[1];
    const batchId = batchMatch[2] || null;
    const batchSub = batchMatch[3] || null;
    const batchDetailId = batchMatch[4] || null;

    try {
      const keys = database.getPrintBatchKeys();
      if (!keys.includes(batchKey)) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: false,
            error: `Modul batch tidak dikenal: ${batchKey}`,
          }),
        );
        return true;
      }

      if (!batchId && req.method === "GET" && !batchSub) {
        const q = new URLSearchParams(req.url.split("?")[1] || "");
        const result = await database.listPrintBatches(batchKey, {
          page: parseInt(q.get("page") || "1", 10),
          perPage: parseInt(q.get("perPage") || "25", 10),
          search: q.get("search") || "",
          idBiodata: q.get("id_biodata") || "",
        });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, ...result }));
        return true;
      }

      if (!batchId && req.method === "POST") {
        const body = await readJsonBody(req);
        const data = await database.createPrintBatch(batchKey, body);
        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, data }));
        return true;
      }

      if (batchId && !batchSub && req.method === "GET") {
        const data = await database.getPrintBatch(batchKey, batchId);
        if (!data) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({ success: false, error: "Data tidak ditemukan" }),
          );
        } else {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true, data }));
        }
        return true;
      }

      if (batchId && !batchSub && req.method === "PUT") {
        const body = await readJsonBody(req);
        const data = await database.updatePrintBatch(batchKey, batchId, body);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, data }));
        return true;
      }

      if (batchId && !batchSub && req.method === "DELETE") {
        await database.deletePrintBatch(batchKey, batchId);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true }));
        return true;
      }

      if (batchId && batchSub === "details" && req.method === "GET") {
        const rows = await database.listPrintBatchDetails(batchKey, batchId);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, data: rows }));
        return true;
      }

      if (batchId && batchSub === "details" && req.method === "POST") {
        const body = await readJsonBody(req);
        const row = await database.addPrintBatchDetail(batchKey, batchId, body);
        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, data: row }));
        return true;
      }

      if (
        batchId &&
        batchSub === "details" &&
        batchDetailId &&
        req.method === "PUT"
      ) {
        const body = await readJsonBody(req);
        const row = await database.updatePrintBatchDetail(
          batchKey,
          batchDetailId,
          body.id_biodata,
        );
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, data: row }));
        return true;
      }

      if (
        batchId &&
        batchSub === "details" &&
        batchDetailId &&
        req.method === "DELETE"
      ) {
        await database.deletePrintBatchDetail(batchKey, batchDetailId);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true }));
        return true;
      }

      if (batchId && batchSub === "pdf" && req.method === "GET") {
        const q = new URLSearchParams(req.url.split("?")[1] || "");
        const type = q.get("type") || "default";
        const payload = await printSuratService.buildBatchPdfPayload(
          database,
          batchKey,
          batchId,
          type,
        );
        if (!payload) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({ success: false, error: "Data tidak ditemukan" }),
          );
        } else {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true, data: payload }));
        }
        return true;
      }

      if (
        batchId &&
        batchSub === "docx" &&
        req.method === "GET" &&
        batchKey === "majikan_spbg"
      ) {
        const spbgService = require("./services/spbg-service");
        const result = batchDetailId
          ? await spbgService.renderSpbgDetailDocx(
              database,
              batchId,
              batchDetailId,
            )
          : await spbgService.renderSpbgBatchZip(database, batchId);
        res.writeHead(200, {
          "Content-Type": result.mime,
          "Content-Disposition": `attachment; filename="${result.filename}"`,
        });
        res.end(result.buffer);
        return true;
      }

      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: "Method not allowed" }));
      return true;
    } catch (error) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // —— PAP batch (surat_rekom_tabelpap) ——
  const papMatch = lettersPath.match(
    /^\/api\/print\/pap(?:\/(\d+))?(?:\/(details|pdf|namapap))?(?:\/(\d+))?$/,
  );
  if (papMatch) {
    const papId = papMatch[1] || null;
    const papSub = papMatch[2] || null;
    const papDetailId = papMatch[3] || null;

    try {
      if (!papId && req.method === "GET" && !papSub) {
        const q = new URLSearchParams(req.url.split("?")[1] || "");
        const result = await database.listPapBatches({
          page: parseInt(q.get("page") || "1", 10),
          perPage: parseInt(q.get("perPage") || "25", 10),
          search: q.get("search") || "",
          idBiodata: q.get("id_biodata") || "",
        });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, ...result }));
        return true;
      }

      if (papSub === "namapap" && req.method === "GET") {
        const rows = await database.listNamapapOptions();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, data: rows }));
        return true;
      }

      if (!papId && req.method === "POST") {
        const body = await readJsonBody(req);
        const data = await database.createPapBatch(body);
        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, data }));
        return true;
      }

      if (papId && !papSub && req.method === "GET") {
        const data = await database.getPapBatch(papId);
        if (!data) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              success: false,
              error: "Data PAP tidak ditemukan",
            }),
          );
        } else {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true, data }));
        }
        return true;
      }

      if (papId && !papSub && req.method === "PUT") {
        const body = await readJsonBody(req);
        const data = await database.updatePapBatch(papId, body);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, data }));
        return true;
      }

      if (papId && !papSub && req.method === "DELETE") {
        await database.deletePapBatch(papId);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true }));
        return true;
      }

      if (papId && papSub === "details" && req.method === "GET") {
        const rows = await database.listPapDetails(papId);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, data: rows }));
        return true;
      }

      if (papId && papSub === "details" && req.method === "POST") {
        const body = await readJsonBody(req);
        const row = await database.addPapDetail(papId, body.id_biodata);
        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, data: row }));
        return true;
      }

      if (
        papId &&
        papSub === "details" &&
        papDetailId &&
        req.method === "PUT"
      ) {
        const body = await readJsonBody(req);
        const row = await database.updatePapDetail(
          papDetailId,
          body.id_biodata,
        );
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, data: row }));
        return true;
      }

      if (
        papId &&
        papSub === "details" &&
        papDetailId &&
        req.method === "DELETE"
      ) {
        await database.deletePapDetail(papDetailId);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true }));
        return true;
      }

      if (papId && papSub === "pdf" && req.method === "GET") {
        const q = new URLSearchParams(req.url.split("?")[1] || "");
        const type = q.get("type") || "ppad";
        const payload = await printSuratService.buildPapBatchPdfPayload(
          database,
          papId,
          type,
        );
        if (!payload) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              success: false,
              error: "Data PAP tidak ditemukan",
            }),
          );
        } else {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true, data: payload }));
        }
        return true;
      }
    } catch (error) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  if (lettersPath === "/api/letters/templates" && req.method === "GET") {
    try {
      const q = new URLSearchParams(req.url.split("?")[1] || "");
      const rows = await database.listLetterTemplates({
        kategori: q.get("kategori") || "",
        sektor: q.get("sektor") || "",
      });
      const enriched = rows.map((t) => {
        let fileOk = false;
        try {
          letterService.resolveTemplateFile(t.file_path);
          fileOk = true;
        } catch {
          fileOk = false;
        }
        return { ...t, file_ok: fileOk };
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, data: enriched }));
      return true;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  if (lettersPath === "/api/letters/html-templates" && req.method === "GET") {
    try {
      const q = new URLSearchParams(req.url.split("?")[1] || "");
      const rows = await database.listHtmlDocumentTemplates({
        template_type: q.get("template_type") || "",
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, data: rows }));
      return true;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  if (lettersPath === "/api/letters/suggest-biodata" && req.method === "GET") {
    try {
      const q = new URLSearchParams(req.url.split("?")[1] || "");
      const idBiodata = q.get("id_biodata") || "";
      const sektor = database.getKodeSektorFromBiodataId
        ? database.getKodeSektorFromBiodataId(idBiodata)
        : idBiodata.slice(0, 2);
      const sektorRow = database.getDatasektorByBiodataId
        ? await database.getDatasektorByBiodataId(idBiodata)
        : null;
      const jenisSektor = String(sektorRow?.jenis_sektor || "").toLowerCase();
      const kode = letterService.pickBiodataDocKode
        ? letterService.pickBiodataDocKode(sektor, jenisSektor)
        : letterService.pickBiodataTemplateKode(sektor, jenisSektor);
      const tpl = await database.getLetterTemplateByKode(kode);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, data: { kode, template: tpl } }));
      return true;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  if (lettersPath === "/api/letters/html-render" && req.method === "GET") {
    try {
      const q = new URLSearchParams(req.url.split("?")[1] || "");
      const templateId = q.get("id");
      const idBiodata = q.get("id_biodata") || "";
      if (!templateId || !idBiodata) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: false,
            error: "Parameter id dan id_biodata wajib",
          }),
        );
        return true;
      }
      const tpl = await database.getHtmlDocumentTemplate(templateId);
      if (!tpl) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: false,
            error: "Template HTML tidak ditemukan",
          }),
        );
        return true;
      }
      const detail = await database.getBiodataDetail(idBiodata);
      if (!detail) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({ success: false, error: "Biodata tidak ditemukan" }),
        );
        return true;
      }
      const fiskal = await database.getBiodataFiskal(idBiodata);
      const ctx = letterService.buildMergeContext(detail, fiskal, {
        kode: templateId,
      });
      const html = letterService.mergeHtmlTemplate(tpl.content, ctx);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          success: true,
          data: {
            html,
            template: {
              id: tpl.id,
              name: tpl.name,
              template_type: tpl.template_type,
            },
          },
        }),
      );
      return true;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  if (lettersPath === "/api/letters/files-list" && req.method === "GET") {
    try {
      const files = printSuratService.listTemplateFilesOnDisk();
      const catalog = (printSuratService.loadConfig().templates || []).map(
        (t) => ({
          ...t,
          exists: files.some(
            (f) =>
              f === t.file_path || f.endsWith("/" + path.basename(t.file_path)),
          ),
        }),
      );
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, data: { files, catalog } }));
      return true;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  if (lettersPath === "/api/letters/generate-batch" && req.method === "GET") {
    try {
      const q = new URLSearchParams(req.url.split("?")[1] || "");
      const batchKey = q.get("batchKey") || "";
      const id = q.get("id") || "";
      const type = q.get("type") || "default";
      if (!batchKey || !id) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({ success: false, error: "batchKey dan id wajib" }),
        );
        return true;
      }
      const payload = await database.getPrintBatchPayload(batchKey, id, type);
      if (!payload?.header) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: false,
            error: "Data batch tidak ditemukan",
          }),
        );
        return true;
      }
      const kode = printSuratService.resolveKodeForBatch(batchKey, type);
      const ctx = await printSuratService.buildBatchMergeContextAsync(
        database,
        batchKey,
        payload.header,
        payload.details,
        { title: batchKey },
      );
      const merged = printSuratService.mergeTemplate(kode, ctx);
      const safeName = `${batchKey}_${id}.${merged.ext}`;
      res.writeHead(200, {
        "Content-Type": merged.mime,
        "Content-Disposition": `attachment; filename="${safeName}"`,
      });
      res.end(merged.buffer);
      return true;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  const rekomTabunganPdfMatch = lettersPath.match(
    /^\/api\/letters\/rekom-pdf\/tabungan\/([^/]+)$/,
  );
  if (rekomTabunganPdfMatch && req.method === "GET") {
    try {
      const id = decodeURIComponent(rekomTabunganPdfMatch[1]);
      const data = await printSuratService.buildRekomTabunganPdfPayload(
        database,
        id,
      );
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, data }));
      return true;
    } catch (error) {
      res.writeHead(error.message?.includes("tidak ditemukan") ? 404 : 500, {
        "Content-Type": "application/json",
      });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  const rekomIjinPdfMatch = lettersPath.match(
    /^\/api\/letters\/rekom-pdf\/ijin-batch\/([^/]+)$/,
  );
  if (rekomIjinPdfMatch && req.method === "GET") {
    try {
      const id = decodeURIComponent(rekomIjinPdfMatch[1]);
      const data = await printSuratService.buildRekomIjinBatchPdfPayload(
        database,
        id,
      );
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, data }));
      return true;
    } catch (error) {
      res.writeHead(error.message?.includes("tidak ditemukan") ? 404 : 500, {
        "Content-Type": "application/json",
      });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  if (lettersPath === "/api/letters/record-pdf" && req.method === "GET") {
    try {
      const q = new URLSearchParams(req.url.split("?")[1] || "");
      const resource = q.get("resource") || "";
      const id = q.get("id") || "";
      if (!resource || !id) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({ success: false, error: "resource dan id wajib" }),
        );
        return true;
      }
      const data = await printSuratService.buildRecordPdfPayload(
        database,
        resource,
        id,
      );
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, data }));
      return true;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  const staticTplMatch = lettersPath.match(
    /^\/api\/letters\/template\/([a-z0-9_]+)$/i,
  );
  if (staticTplMatch && req.method === "GET") {
    try {
      const key = staticTplMatch[1];
      const cfg = printSuratService.loadConfig();
      const kode = cfg.staticTemplates?.[key] || key;
      const merged = printSuratService.streamStaticTemplate(kode);
      res.writeHead(200, {
        "Content-Type": merged.mime,
        "Content-Disposition": `attachment; filename="${merged.filename}"`,
      });
      res.end(merged.buffer);
      return true;
    } catch (error) {
      res.writeHead(error.message?.includes("tidak") ? 404 : 500, {
        "Content-Type": "application/json",
      });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  const suratPengajuanXlsMatch = lettersPath.match(
    /^\/api\/letters\/surat-pengajuan\/([^/]+)\/export-xlsx$/,
  );
  if (suratPengajuanXlsMatch && req.method === "GET") {
    try {
      const id = decodeURIComponent(suratPengajuanXlsMatch[1]);
      const merged = await printSuratService.exportSuratPengajuanExcel(
        database,
        id,
      );
      res.writeHead(200, {
        "Content-Type": merged.mime,
        "Content-Disposition": `attachment; filename="${merged.filename}"`,
      });
      res.end(merged.buffer);
      return true;
    } catch (error) {
      res.writeHead(error.message?.includes("tidak ditemukan") ? 404 : 500, {
        "Content-Type": "application/json",
      });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  if (
    lettersPath === "/api/letters/wintrust-template" &&
    req.method === "GET"
  ) {
    try {
      printSuratService.syncProductionTemplates();
      const filePath = path.join(
        letterService.FILES_DIR,
        "formulir_wintrust.xlsx",
      );
      if (!fs.existsSync(filePath)) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: false,
            error: "Template Wintrust tidak ada",
          }),
        );
        return true;
      }
      const buffer = fs.readFileSync(filePath);
      res.writeHead(200, {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="formulir_wintrust.xlsx"',
      });
      res.end(buffer);
      return true;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  if (lettersPath === "/api/letters/generate-record" && req.method === "GET") {
    try {
      const q = new URLSearchParams(req.url.split("?")[1] || "");
      const resource = q.get("resource") || "";
      const id = q.get("id") || "";
      if (!resource || !id) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({ success: false, error: "resource dan id wajib" }),
        );
        return true;
      }
      const kode = await printSuratService.resolveKodeForRecordAsync(
        database,
        resource,
        id,
      );
      const ctx = await printSuratService.buildRecordContext(
        database,
        resource,
        id,
      );
      let merged = printSuratService.mergeTemplate(kode, ctx);
      if (resource === "blk_sertifikat") {
        const lpksBlkSettingsService = require("./services/lpks-blk-settings-service");
        const {
          compactBlkSertifikatDocxBuffer,
        } = require("./services/blk-sertifikat-docx");
        let buf = lpksBlkSettingsService.applyLogoToDocxBuffer(merged.buffer);
        buf = compactBlkSertifikatDocxBuffer(buf);
        merged = { ...merged, buffer: buf };
      }
      const format = String(q.get("format") || "docx")
        .trim()
        .toLowerCase();
      if (format === "pdf") {
        let pdfBuffer;
        if (resource === "blk_sertifikat") {
          const {
            generateBlkSertifikatPdf,
          } = require("./services/blk-sertifikat-pdf");
          pdfBuffer = await generateBlkSertifikatPdf(ctx);
        } else {
          pdfBuffer = await letterService.convertDocxBufferToPdf(merged.buffer);
        }
        const safeName = `${resource}_${id}.pdf`;
        res.writeHead(200, {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${safeName}"`,
        });
        res.end(pdfBuffer);
        return true;
      }
      const safeName = `${resource}_${id}.${merged.ext}`;
      res.writeHead(200, {
        "Content-Type": merged.mime,
        "Content-Disposition": `attachment; filename="${safeName}"`,
      });
      res.end(merged.buffer);
      return true;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  const ijinBatchMatch = lettersPath.match(
    /^\/api\/letters\/ijin-batch(?:\/(\d+))?(?:\/(print|details)(?:\/([^/]+))?)?$/,
  );
  if (ijinBatchMatch) {
    const batchId = ijinBatchMatch[1] || null;
    const sub = ijinBatchMatch[2] || null;
    const detailBioId = ijinBatchMatch[3] || null;
    try {
      if (!batchId && req.method === "GET" && !sub) {
        const q = new URLSearchParams(req.url.split("?")[1] || "");
        const result = await database.listIjinBatches({
          page: parseInt(q.get("page") || "1", 10),
          perPage: parseInt(q.get("perPage") || "25", 10),
          search: q.get("search") || "",
        });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, ...result }));
        return true;
      }
      if (!batchId && req.method === "POST") {
        const body = await readJsonBody(req);
        const data = await database.createIjinBatch(body);
        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, data }));
        return true;
      }
      if (batchId && !sub && req.method === "GET") {
        const data = await database.getIjinBatch(batchId);
        if (!data) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({ success: false, error: "Data tidak ditemukan" }),
          );
        } else {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true, data }));
        }
        return true;
      }
      if (batchId && !sub && req.method === "PUT") {
        const body = await readJsonBody(req);
        const data = await database.updateIjinBatch(batchId, body);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, data }));
        return true;
      }
      if (batchId && !sub && req.method === "DELETE") {
        await database.deleteIjinBatch(batchId);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true }));
        return true;
      }
      if (
        batchId &&
        sub === "details" &&
        !detailBioId &&
        req.method === "GET"
      ) {
        const payload = await database.listIjinBatchDetails(batchId);
        if (!payload) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({ success: false, error: "Data tidak ditemukan" }),
          );
        } else {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              success: true,
              data: payload.details,
              batch: payload.batch,
            }),
          );
        }
        return true;
      }
      if (
        batchId &&
        sub === "details" &&
        !detailBioId &&
        req.method === "POST"
      ) {
        const body = await readJsonBody(req);
        const payload = await database.addIjinBatchDetail(
          batchId,
          body.id_biodata,
        );
        if (!payload) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({ success: false, error: "Data tidak ditemukan" }),
          );
        } else {
          res.writeHead(201, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              success: true,
              data: payload.details,
              batch: payload.batch,
            }),
          );
        }
        return true;
      }
      if (
        batchId &&
        sub === "details" &&
        detailBioId &&
        req.method === "DELETE"
      ) {
        const payload = await database.removeIjinBatchDetail(
          batchId,
          detailBioId,
        );
        if (!payload) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({ success: false, error: "Data tidak ditemukan" }),
          );
        } else {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              success: true,
              data: payload.details,
              batch: payload.batch,
            }),
          );
        }
        return true;
      }
      if (batchId && sub === "print" && req.method === "GET") {
        const row = await database.getIjinBatch(batchId);
        if (!row) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({ success: false, error: "Data tidak ditemukan" }),
          );
          return true;
        }
        const kode =
          printSuratService.loadConfig().ijinBatch?.templateKode ||
          "print_rekom_ijin_batch";
        const ctx = await printSuratService.buildRekomIjinBatchContextAsync(
          database,
          row,
        );
        const merged = printSuratService.mergeTemplate(kode, ctx);
        res.writeHead(200, {
          "Content-Type": merged.mime,
          "Content-Disposition": `attachment; filename="ijin_batch_${batchId}.${merged.ext}"`,
        });
        res.end(merged.buffer);
        return true;
      }
    } catch (error) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  if (lettersPath === "/api/letters/generate" && req.method === "GET") {
    try {
      const q = new URLSearchParams(req.url.split("?")[1] || "");
      let kode = q.get("kode") || "";
      const idBiodata = q.get("id_biodata") || "";
      if (!kode || !idBiodata) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: false,
            error: "Parameter kode dan id_biodata wajib",
          }),
        );
        return true;
      }
      const detail = await database.getBiodataDetail(idBiodata);
      if (!detail) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({ success: false, error: "Biodata tidak ditemukan" }),
        );
        return true;
      }
      if (kode === "_auto") {
        kode = letterService.resolveAutoBiodataKode(idBiodata, detail);
      }
      const tpl = await database.getLetterTemplateByKode(kode);
      if (!tpl) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({ success: false, error: "Template tidak ditemukan" }),
        );
        return true;
      }
      const fiskal = await database.getBiodataFiskal(idBiodata);
      const ctx = letterService.buildMergeContext(detail, fiskal, { kode });
      const filePath = letterService.resolveTemplateFile(tpl.file_path);
      const outBuf = await letterService.mergeDocxFileAsync(filePath, ctx);
      const safeName = `${kode}_${idBiodata.replace(/[^a-zA-Z0-9_-]/g, "_")}.docx`;
      res.writeHead(200, {
        "Content-Type": mimeTypes[".docx"],
        "Content-Disposition": `attachment; filename="${safeName}"`,
      });
      res.end(outBuf);
      return true;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  if (lettersPath === "/api/letters/generate-pdf" && req.method === "GET") {
    try {
      const q = new URLSearchParams(req.url.split("?")[1] || "");
      let kode = q.get("kode") || "";
      const idBiodata = q.get("id_biodata") || "";
      if (!kode || !idBiodata) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: false,
            error: "Parameter kode dan id_biodata wajib",
          }),
        );
        return true;
      }
      const detail = await database.getBiodataDetail(idBiodata);
      if (!detail) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({ success: false, error: "Biodata tidak ditemukan" }),
        );
        return true;
      }
      if (kode === "_auto") {
        kode = letterService.resolveAutoBiodataKode(idBiodata, detail);
      }
      if (kode === "biodata_cong_yi") {
        const chongyiOk = database.isChongyiMajikanForBiodata
          ? await database.isChongyiMajikanForBiodata(detail)
          : false;
        if (!chongyiOk) {
          res.writeHead(403, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              success: false,
              error:
                "Biodata Chongyi hanya untuk TKI dengan majikan bertanda Chongyi di Master Majikan.",
            }),
          );
          return true;
        }
      }
      const tpl = await database.getLetterTemplateByKode(kode);
      if (!tpl) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({ success: false, error: "Template tidak ditemukan" }),
        );
        return true;
      }
      const fiskal = await database.getBiodataFiskal(idBiodata);
      const ctx = letterService.buildMergeContext(detail, fiskal, { kode });
      let pdfBuf;
      if (biodataPdf.isBiodataTemplate(kode, tpl)) {
        pdfBuf = await biodataPdf.generateBiodataPdf(detail, fiskal, { kode });
      } else {
        const filePath = letterService.resolveTemplateFile(tpl.file_path);
        pdfBuf = await letterService.mergeDocxFileToPdf(filePath, ctx);
      }
      const safeName = `${kode}_${idBiodata.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`;
      res.writeHead(200, {
        "Content-Type": mimeTypes[".pdf"] || "application/pdf",
        "Content-Disposition": `attachment; filename="${safeName}"`,
      });
      res.end(pdfBuf);
      return true;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // POST /api/biodata/:id/biodata-status — transisi workflow status biodata
  const biodataWfStatusMatch = req.url.match(
    /^\/api\/biodata\/([^/]+)\/biodata-status(?:\?.*)?$/,
  );
  if (biodataWfStatusMatch && req.method === "POST") {
    try {
      const idBiodata = decodeURIComponent(biodataWfStatusMatch[1]);
      const body = await readJsonBody(req);
      const audit = dbAuditOptsFromReq(req);
      const authUser = req.authUser || {};
      const result = await database.setBiodataWorkflowStatus(
        idBiodata,
        body.biodata_status,
        {
          role: authUser.role || "",
          changedBy: audit.changedBy,
          userId: audit.userId,
          note: body.note || "",
        },
      );
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, data: result }));
      return true;
    } catch (error) {
      const status = /tidak diizinkan/i.test(error.message) ? 403 : 400;
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // GET /api/biodata/:id/readiness — ringkasan kesiapan biodata
  const biodataReadinessMatch = req.url.match(
    /^\/api\/biodata\/([^/]+)\/readiness(?:\?.*)?$/,
  );
  if (biodataReadinessMatch && req.method === "GET") {
    try {
      const idBiodata = decodeURIComponent(biodataReadinessMatch[1]);
      const data = await database.getBiodataReadinessSummary(idBiodata);
      if (!data) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({ success: false, error: "Biodata tidak ditemukan" }),
        );
      } else {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, data }));
      }
      return true;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // GET /api/biodata/:id/status-context — aturan transisi status (plan4)
  const biodataStatusCtxMatch = req.url.match(
    /^\/api\/biodata\/([^/]+)\/status-context(?:\?.*)?$/,
  );
  if (biodataStatusCtxMatch && req.method === "GET") {
    try {
      const idBiodata = decodeURIComponent(biodataStatusCtxMatch[1]);
      const audit = dbAuditOptsFromReq(req);
      const data = await database.getPersonalStatusContext(idBiodata, {
        isAdmin: audit.isAdmin,
      });
      if (!data) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({ success: false, error: "Biodata tidak ditemukan" }),
        );
      } else {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, data }));
      }
      return true;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // GET /api/biodata/:id/status-history
  const biodataStatusHistMatch = req.url.match(
    /^\/api\/biodata\/([^/]+)\/status-history(?:\?.*)?$/,
  );
  if (biodataStatusHistMatch && req.method === "GET") {
    try {
      const idBiodata = decodeURIComponent(biodataStatusHistMatch[1]);
      const data = await database.listPersonalStatusHistory(idBiodata);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, data }));
      return true;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // POST /api/biodata/:id/sync-status — sinkron otomatis dari data majikan/visa
  const biodataSyncMatch = req.url.match(
    /^\/api\/biodata\/([^/]+)\/sync-status(?:\?.*)?$/,
  );
  if (biodataSyncMatch && req.method === "POST") {
    try {
      const idBiodata = decodeURIComponent(biodataSyncMatch[1]);
      const audit = dbAuditOptsFromReq(req);
      const result = await database.reconcilePersonalStatus(idBiodata, {
        changedBy: audit.changedBy,
        alasan: "Otomatis: sinkron status",
      });
      const resolvedId = await database.resolveBiodataInputId(idBiodata);
      const personal = resolvedId
        ? await database.getByField("personal", "id_biodata", resolvedId)
        : null;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, data: { ...result, personal } }));
      return true;
    } catch (error) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // POST /api/biodata/:id/status — ubah status manual (hanya Pending / pulih)
  const biodataStatusPostMatch = req.url.match(
    /^\/api\/biodata\/([^/]+)\/status(?:\?.*)?$/,
  );
  if (biodataStatusPostMatch && req.method === "POST") {
    try {
      const idBiodata = decodeURIComponent(biodataStatusPostMatch[1]);
      const body = await readJsonBody(req);
      const audit = dbAuditOptsFromReq(req);
      const updated = await database.changePersonalStatus(
        idBiodata,
        body.statusaktif,
        {
          alasan: body.alasan,
          force: Boolean(body.force),
          isAdmin: audit.isAdmin,
          changedBy: audit.changedBy,
          userId: audit.userId,
        },
      );
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, data: updated }));
      return true;
    } catch (error) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // GET /api/biodata/:id/section/:section?scope=marketing|biodata|admin — lazy load tab
  const biodataSectionMatch = req.url.match(
    /^\/api\/biodata\/([^/]+)\/section\/([^/?]+)(?:\?.*)?$/,
  );
  if (biodataSectionMatch && req.method === "GET") {
    try {
      const idBiodata = decodeURIComponent(biodataSectionMatch[1]);
      const section = decodeURIComponent(biodataSectionMatch[2]);
      const scope =
        new URL(req.url, "http://localhost").searchParams.get("scope") ||
        "marketing";
      const data = await database.getBiodataSection(idBiodata, scope, section);
      if (!data) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({ success: false, error: "Biodata tidak ditemukan" }),
        );
      } else {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, data }));
      }
      return true;
    } catch (error) {
      res.writeHead(error.message?.includes("tidak dikenali") ? 400 : 500, {
        "Content-Type": "application/json",
      });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // GET /api/biodata/:id_biodata - Detail TKI (?view=marketing|biodata|admin = shell ringan)
  const biodataMatch = req.url.match(/^\/api\/biodata\/([^/?]+)(?:\?.*)?$/);
  if (biodataMatch && req.method === "GET") {
    try {
      const idBiodata = decodeURIComponent(biodataMatch[1]);
      const view = new URL(req.url, "http://localhost").searchParams.get(
        "view",
      );
      let data;
      if (view === "marketing") {
        data = await database.getBiodataMarketingShell(idBiodata);
      } else if (view === "biodata") {
        data = await database.getBiodataBiodataShell(idBiodata);
      } else if (view === "admin") {
        data = await database.getBiodataAdminShell(idBiodata);
      } else {
        data = await database.getBiodataDetail(idBiodata);
      }
      if (!data) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({ success: false, error: "Biodata tidak ditemukan" }),
        );
      } else {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, data }));
      }
      return true;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // POST /api/visa/depart — catat TKI terbang (Fase 1)
  if (req.url.split("?")[0] === "/api/visa/depart" && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const audit = dbAuditOptsFromReq(req);
      const data = await database.recordVisaDeparture({
        ...body,
        changedBy: audit.changedBy,
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, data }));
      return true;
    } catch (error) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // —— OCR Gemini (KTP) ——
  const ocrPath = apiPathname(req);

  if (ocrPath === "/api/ocr/status" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        success: true,
        data: {
          configured: geminiOcr.isConfigured(),
          model: geminiOcr.DEFAULT_MODEL,
          recommended: geminiOcr.getRecommendedOcrModels(),
        },
      }),
    );
    return true;
  }

  if (ocrPath === "/api/ocr/models" && req.method === "GET") {
    try {
      if (!geminiOcr.isConfigured()) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: false,
            error: "GOOGLE_API_KEY belum dikonfigurasi.",
          }),
        );
        return true;
      }
      const models = await geminiOcr.listAvailableModels();
      const recommended = new Set(geminiOcr.getRecommendedOcrModels());
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          success: true,
          data: {
            current: geminiOcr.DEFAULT_MODEL,
            recommended: geminiOcr.getRecommendedOcrModels(),
            models: models.map((m) => ({
              ...m,
              recommended: recommended.has(m.id),
            })),
          },
        }),
      );
      return true;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  if (ocrPath === "/api/ocr/ktp" && req.method === "POST") {
    try {
      if (!geminiOcr.isConfigured()) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: false,
            error:
              "GOOGLE_API_KEY belum dikonfigurasi (env.local / .env.local).",
          }),
        );
        return true;
      }
      const { file } = await uploadService.parseMultipart(req);
      if (!file?.buffer?.length) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: false,
            error: "File gambar wajib (field: image)",
          }),
        );
        return true;
      }
      const maxBytes = 8 * 1024 * 1024;
      if (file.buffer.length > maxBytes) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: false,
            error: "Ukuran file maksimal 8 MB",
          }),
        );
        return true;
      }
      const mime = String(file.mime || "").toLowerCase();
      const allowed = [
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp",
        "image/gif",
      ];
      if (!allowed.includes(mime)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: false,
            error: "Format tidak didukung. Gunakan JPEG, PNG, atau WebP.",
          }),
        );
        return true;
      }
      const mimeNorm = mime === "image/jpg" ? "image/jpeg" : mime;
      const prepared = await imageCompress.compressForOcr(
        file.buffer,
        mimeNorm,
      );
      const result = await geminiOcr.ocrKtpFromImage({
        buffer: prepared.buffer,
        mimeType: prepared.mimeType,
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      const parsedOk = !result.fields?.parse_error;
      res.end(
        JSON.stringify({
          success: true,
          data: result.fields,
          meta: {
            model: result.modelUsed || geminiOcr.DEFAULT_MODEL,
            raw_length: (result.raw || "").length,
            parsed: parsedOk,
            usage: result.usage || null,
            image: {
              original_bytes: prepared.originalSize,
              compressed_bytes: prepared.compressedSize,
              original_label: imageCompress.formatBytes(prepared.originalSize),
              compressed_label: imageCompress.formatBytes(
                prepared.compressedSize,
              ),
              width: prepared.width,
              height: prepared.height,
              format: "webp",
              skipped_reencode: !!prepared.skipped,
            },
          },
        }),
      );
      return true;
    } catch (error) {
      const msg = error.message || String(error);
      const isQuota = /kuota|rate limit|429|quota/i.test(msg);
      res.writeHead(isQuota ? 429 : 500, {
        "Content-Type": "application/json",
      });
      res.end(
        JSON.stringify({
          success: false,
          error: msg,
          code: isQuota ? "GEMINI_QUOTA" : "OCR_ERROR",
        }),
      );
      return true;
    }
  }

  // —— OCR Gemini (KK) ——
  if (ocrPath === "/api/ocr/kk" && req.method === "POST") {
    try {
      if (!geminiOcr.isConfigured()) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: false,
            error:
              "GOOGLE_API_KEY belum dikonfigurasi (env.local / .env.local).",
          }),
        );
        return true;
      }
      const { file } = await uploadService.parseMultipart(req);
      if (!file?.buffer?.length) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: false,
            error: "File gambar wajib (field: image)",
          }),
        );
        return true;
      }
      const maxBytes = 8 * 1024 * 1024;
      if (file.buffer.length > maxBytes) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: false,
            error: "Ukuran file maksimal 8 MB",
          }),
        );
        return true;
      }
      const mime = String(file.mime || "").toLowerCase();
      const allowed = [
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp",
        "image/gif",
      ];
      if (!allowed.includes(mime)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: false,
            error: "Format tidak didukung. Gunakan JPEG, PNG, atau WebP.",
          }),
        );
        return true;
      }
      const mimeNorm = mime === "image/jpg" ? "image/jpeg" : mime;
      const prepared = await imageCompress.compressForOcr(
        file.buffer,
        mimeNorm,
      );
      const result = await geminiOcr.ocrKkFromImage({
        buffer: prepared.buffer,
        mimeType: prepared.mimeType,
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      const parsedOk = !result.fields?.parse_error;
      res.end(
        JSON.stringify({
          success: true,
          data: result.fields,
          meta: {
            model: result.modelUsed || geminiOcr.DEFAULT_MODEL,
            raw_length: (result.raw || "").length,
            parsed: parsedOk,
            usage: result.usage || null,
            image: {
              original_bytes: prepared.originalSize,
              compressed_bytes: prepared.compressedSize,
              original_label: imageCompress.formatBytes(prepared.originalSize),
              compressed_label: imageCompress.formatBytes(
                prepared.compressedSize,
              ),
              width: prepared.width,
              height: prepared.height,
              format: "webp",
              skipped_reencode: !!prepared.skipped,
            },
          },
        }),
      );
      return true;
    } catch (error) {
      const msg = error.message || String(error);
      const isQuota = /kuota|rate limit|429|quota/i.test(msg);
      res.writeHead(isQuota ? 429 : 500, {
        "Content-Type": "application/json",
      });
      res.end(
        JSON.stringify({
          success: false,
          error: msg,
          code: isQuota ? "GEMINI_QUOTA" : "OCR_ERROR",
        }),
      );
      return true;
    }
  }

  // GET /api/documents/types — daftar jenis upload hub
  if (
    req.url.split("?")[0] === "/api/documents/types" &&
    req.method === "GET"
  ) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, data: HUB_TYPES }));
    return true;
  }

  // GET /api/documents/summary?id_biodata=FF-0001
  if (req.url.startsWith("/api/documents/summary") && req.method === "GET") {
    try {
      const qstr = req.url.split("?")[1] || "";
      const idBiodata = new URLSearchParams(qstr).get("id_biodata") || "";
      const data = await database.getUploadSummaryForBiodata(idBiodata);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, data }));
      return true;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // POST /api/documents/upload — multipart (Fase 1)
  if (
    req.url.split("?")[0] === "/api/documents/upload" &&
    req.method === "POST"
  ) {
    try {
      uploadService.ensureUploadRoot();
      const { fields, file } = await uploadService.parseMultipart(req);
      const idBiodata = String(fields.id_biodata || "").trim();
      const docType = String(fields.doc_type || fields.docType || "").trim();

      if (!uploadService.isAllowed(docType)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: false,
            error: "Jenis dokumen tidak dikenali",
          }),
        );
        return true;
      }
      if (!idBiodata) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "id_biodata wajib" }));
        return true;
      }
      if (!file) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({ success: false, error: "File wajib diunggah" }),
        );
        return true;
      }

      // SECURITY: Validate file size (max 10MB for documents)
      const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
      if (file.buffer.length > MAX_FILE_SIZE) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: false,
            error: `Ukuran file terlalu besar. Maksimal ${MAX_FILE_SIZE / 1024 / 1024}MB`,
          }),
        );
        return true;
      }

      // SECURITY: Validate file type (allow only images and PDF)
      const allowedMimes = [
        "image/jpeg",
        "image/png",
        "image/webp",
        "application/pdf",
      ];
      if (!allowedMimes.includes(file.mime)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: false,
            error: "Jenis file tidak diizinkan. Hanya JPG, PNG, WebP, dan PDF",
          }),
        );
        return true;
      }

      // SECURITY: Validate file extension
      const allowedExts = [".jpg", ".jpeg", ".png", ".webp", ".pdf"];
      const fileExt = path.extname(file.filename).toLowerCase();
      if (!allowedExts.includes(fileExt)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: false,
            error: "Ekstensi file tidak diizinkan",
          }),
        );
        return true;
      }

      // Log upload
      console.log(
        `[UPLOAD] User: ${req.authUser?.email}, Type: ${docType}, Size: ${file.buffer.length} bytes`,
      );

      const publicPath = uploadService.saveUploadFile(idBiodata, docType, file);
      const row = await database.create(docType, {
        id_biodata: idBiodata,
        namadok: fields.namadok || file.filename || docType,
        penting: fields.penting || "",
        cekdokumen: fields.cekdokumen || "",
        tglterima: fields.tglterima || new Date().toISOString().slice(0, 10),
        keterangan: fields.keterangan || "",
        file: publicPath,
      });

      // Jika upload KK dan OCR tersedia, jalankan OCR KK + auto-save family
      let ocrResult = null;
      if (
        docType === "upload_kk" &&
        geminiOcr.isConfigured() &&
        file.mime.startsWith("image/")
      ) {
        try {
          console.log(`[OCR KK] Running OCR for ${idBiodata}...`);
          const mimeNorm = file.mime === "image/jpg" ? "image/jpeg" : file.mime;
          const prepared = await imageCompress.compressForOcr(
            file.buffer,
            mimeNorm,
          );
          const ocrResponse = await geminiOcr.ocrKkFromImage({
            buffer: prepared.buffer,
            mimeType: prepared.mimeType,
          });

          ocrResult = ocrResponse.fields;

          // Auto-save ke tabel family
          await database.saveFamilyFromKkOcr(idBiodata, ocrResult);

          console.log(`[OCR KK] Success for ${idBiodata}`);
        } catch (ocrError) {
          console.warn(`[OCR KK] Failed for ${idBiodata}:`, ocrError.message);
          // Don't fail the upload if OCR fails
        }
      }

      res.writeHead(201, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          success: true,
          data: row,
          ocr_data: ocrResult, // Return OCR data untuk UI update
        }),
      );
      return true;
    } catch (error) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // POST /api/documents/dokumen-identitas — upload ke kolom dokumen.ktp, dokumen.kk, ...
  if (
    req.url.split("?")[0] === "/api/documents/dokumen-identitas" &&
    req.method === "POST"
  ) {
    try {
      uploadService.ensureUploadRoot();
      const { fields, file } = await uploadService.parseMultipart(req);
      const idBiodata = String(fields.id_biodata || "").trim();
      const field = String(fields.field || fields.kolom || "").trim();
      const allowed = database.DOKUMEN_IDENTITAS_FIELDS || [];
      if (!allowed.includes(field)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: false,
            error: "Jenis dokumen identitas tidak valid",
          }),
        );
        return true;
      }
      if (!idBiodata) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "id_biodata wajib" }));
        return true;
      }
      if (!file) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({ success: false, error: "File wajib diunggah" }),
        );
        return true;
      }

      // SECURITY: Validate file size (max 10MB)
      const MAX_FILE_SIZE = 10 * 1024 * 1024;
      if (file.buffer.length > MAX_FILE_SIZE) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: false,
            error: `Ukuran file terlalu besar. Max ${MAX_FILE_SIZE / 1024 / 1024}MB`,
          }),
        );
        return true;
      }

      // SECURITY: Validate file type
      const allowedMimes = [
        "image/jpeg",
        "image/png",
        "image/webp",
        "application/pdf",
      ];
      if (!allowedMimes.includes(file.mime)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: false,
            error: "Jenis file tidak diizinkan",
          }),
        );
        return true;
      }

      console.log(
        `[UPLOAD ID] User: ${req.authUser?.email}, Field: ${field}, Size: ${file.buffer.length}`,
      );

      const publicPath = uploadService.saveDokumenIdentitasFile(
        idBiodata,
        field,
        file,
      );
      const row = await database.updateDokumenIdentitasFile(
        idBiodata,
        field,
        publicPath,
      );
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          success: true,
          data: { dokumen: row, field, file: publicPath },
        }),
      );
      return true;
    } catch (error) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // POST /api/documents/personal-foto — foto profil (kolom personal.foto)
  if (
    apiPathname(req) === "/api/documents/personal-foto" &&
    req.method === "POST"
  ) {
    try {
      uploadService.ensureUploadRoot();
      const { fields, file } = await uploadService.parseMultipart(req);
      const idBiodata = String(fields.id_biodata || "").trim();
      if (!idBiodata) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "id_biodata wajib" }));
        return true;
      }
      if (!file) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({ success: false, error: "File foto wajib diunggah" }),
        );
        return true;
      }
      const mime = String(file.mime || "").toLowerCase();
      if (!mime.startsWith("image/")) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: false,
            error: "Hanya file gambar (JPG, PNG, WebP) yang diizinkan",
          }),
        );
        return true;
      }

      const publicPath = uploadService.savePersonalFotoFile(idBiodata, file);
      const row = await database.updatePersonalFoto(idBiodata, publicPath);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          success: true,
          data: { personal: row, foto: publicPath },
        }),
      );
      return true;
    } catch (error) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // DELETE /api/documents/personal-foto
  if (
    apiPathname(req) === "/api/documents/personal-foto" &&
    req.method === "DELETE"
  ) {
    try {
      const body = await readJsonBody(req);
      const idBiodata = String(body.id_biodata || "").trim();
      const row = await database.updatePersonalFoto(idBiodata, "");
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, data: row }));
      return true;
    } catch (error) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // DELETE /api/documents/dokumen-identitas — hapus referensi file (kolom dikosongkan)
  if (
    req.url.split("?")[0] === "/api/documents/dokumen-identitas" &&
    req.method === "DELETE"
  ) {
    try {
      const body = await readJsonBody(req);
      const idBiodata = String(body.id_biodata || "").trim();
      const field = String(body.field || "").trim();
      const row = await database.clearDokumenIdentitasFile(idBiodata, field);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, data: row }));
      return true;
    } catch (error) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // GET /api/app-config — branding publik (tanpa rahasia)
  if (req.url === "/api/app-config" && req.method === "GET") {
    try {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({ success: true, data: appConfig.getPublicAppConfig() }),
      );
      return true;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // GET/PUT /api/lpks-blk-settings — identitas LPKS untuk cetak sertifikat BLK
  if (
    req.url.split("?")[0] === "/api/lpks-blk-settings" &&
    (req.method === "GET" || req.method === "PUT")
  ) {
    try {
      const authUser = auth.getUserFromRequest(req);
      if (!authUser) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({ success: false, error: "Authentication required" }),
        );
        return true;
      }
      const role = rolePermissions.normalizeRole(authUser.role);
      const allowed = ["super_admin", "admin", "blk"].includes(role);
      if (!allowed) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: false,
            error: "Akses pengaturan LPKS BLK ditolak",
          }),
        );
        return true;
      }

      const lpksBlkSettingsService = require("./services/lpks-blk-settings-service");
      if (req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: true,
            data: lpksBlkSettingsService.getSettings(),
          }),
        );
        return true;
      }

      const body = await readJsonBody(req);
      const saved = lpksBlkSettingsService.saveSettings(body);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          success: true,
          data: saved,
          message: "Pengaturan LPKS BLK disimpan",
        }),
      );
      return true;
    } catch (error) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // POST/DELETE /api/lpks-blk-settings/logo — upload/hapus logo LPKS
  if (
    req.url.split("?")[0] === "/api/lpks-blk-settings/logo" &&
    (req.method === "POST" || req.method === "DELETE")
  ) {
    try {
      const authUser = auth.getUserFromRequest(req);
      if (!authUser) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({ success: false, error: "Authentication required" }),
        );
        return true;
      }
      const role = rolePermissions.normalizeRole(authUser.role);
      const allowed = ["super_admin", "admin", "blk"].includes(role);
      if (!allowed) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: false,
            error: "Akses pengaturan LPKS BLK ditolak",
          }),
        );
        return true;
      }

      const lpksBlkSettingsService = require("./services/lpks-blk-settings-service");
      if (req.method === "DELETE") {
        const saved = lpksBlkSettingsService.removeLogo();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: true,
            data: saved,
            message: "Logo LPKS dihapus",
          }),
        );
        return true;
      }

      uploadService.ensureUploadRoot();
      const { file } = await uploadService.parseMultipart(req);
      const saved = await lpksBlkSettingsService.saveLogo(file);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          success: true,
          data: saved,
          message: "Logo LPKS berhasil diunggah",
        }),
      );
      return true;
    } catch (error) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // GET/PUT /api/blk-sertifikat-sektor-settings — modul pelatihan per sektor sertifikat BLK
  if (
    req.url.split("?")[0] === "/api/blk-sertifikat-sektor-settings" &&
    (req.method === "GET" || req.method === "PUT")
  ) {
    try {
      const authUser = auth.getUserFromRequest(req);
      if (!authUser) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({ success: false, error: "Authentication required" }),
        );
        return true;
      }
      const role = rolePermissions.normalizeRole(authUser.role);
      const allowed = ["super_admin", "admin", "blk"].includes(role);
      if (!allowed) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: false,
            error: "Akses pengaturan sektor sertifikat ditolak",
          }),
        );
        return true;
      }

      const blkSertifikatSektorSettingsService = require("./services/blk-sertifikat-sektor-settings-service");
      if (req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: true,
            data: blkSertifikatSektorSettingsService.getSettings(),
          }),
        );
        return true;
      }

      const body = await readJsonBody(req);
      const saved = blkSertifikatSektorSettingsService.saveSettings(body);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          success: true,
          data: saved,
          message: "Pengaturan sektor sertifikat disimpan",
        }),
      );
      return true;
    } catch (error) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // GET/PUT /api/company-profile — profil perusahaan (Owner only)
  if (
    req.url === "/api/company-profile" &&
    (req.method === "GET" || req.method === "PUT")
  ) {
    try {
      const authUser = auth.getUserFromRequest(req);
      if (!authUser) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({ success: false, error: "Authentication required" }),
        );
        return true;
      }
      if (!rolePermissions.isOwnerRole(authUser.role)) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: false,
            error: "Hanya Owner yang boleh mengelola profil perusahaan",
          }),
        );
        return true;
      }

      if (req.method === "GET") {
        const cfg = appConfig.getAppConfig();
        const data = {
          appName: cfg.appName,
          appTitle: cfg.appTitle,
          orgName: cfg.orgName,
          orgSignatoryName: cfg.orgSignatoryName,
          orgSignatoryTitle: cfg.orgSignatoryTitle,
          orgAddress: cfg.orgAddress,
          orgEmail: cfg.orgEmail,
          orgPrintLocation: cfg.orgPrintLocation,
          loginSubtitle: cfg.loginSubtitle,
          adminEmail: cfg.adminEmail,
          adminName: cfg.adminName,
        };
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, data }));
        return true;
      }

      const body = await readJsonBody(req);
      const companyProfileService = require("./company-profile-service");
      companyProfileService.saveProfile(body);
      const saved = appConfig.getPublicAppConfig();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          success: true,
          data: saved,
          message: "Profil perusahaan disimpan",
        }),
      );
      return true;
    } catch (error) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // GET /api/menu/role-mapping - Get menu configuration for current user's role
  if (req.url.startsWith("/api/menu/role-mapping") && req.method === "GET") {
    try {
      const authUser = auth.getUserFromRequest(req);
      if (!authUser) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({ success: false, error: "Authentication required" }),
        );
        return true;
      }

      const qstr = req.url.split("?")[1] || "";
      const roleParam = new URLSearchParams(qstr).get("role");
      const authRole = rolePermissions.normalizeRole(authUser.role);
      const userRole =
        authRole === "super_admin" && roleParam
          ? rolePermissions.normalizeRole(roleParam)
          : authRole || "admin";

      // Sumber: config/menu-config.json (read-only di UI Pengaturan Menu)
      if (menuConfigService.isConfigAvailable()) {
        const view = menuConfigService.getRoleViewPayload(userRole);
        if (view) {
          res.writeHead(200, {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          });
          res.end(
            JSON.stringify({
              success: true,
              data: {
                sideMenu: view.sideMenu || [],
                menuPermissions: view.menuPermissions || {},
                readOnly: true,
                fullAccess: !!view.fullAccess,
                source: view.source,
                description: view.description || null,
                note: view.note || null,
                theme: "teal",
                navbarTitle: appConfig.getAppConfig().appName,
              },
            }),
          );
          return true;
        }
      }

      // Fallback: database menu_role_mapping
      const tableNames = database.getTableNames();
      if (tableNames.includes("menu_role_mapping")) {
        // Get menu mapping from database
        const menuStructure = await database.loadSideMenuForRole(userRole);
        const menuPermissions = await database.loadMenuPermissionsForRole(
          userRole,
          {
            fromDbOnly: true,
          },
        );
        if (
          menuStructure ||
          (menuPermissions && Object.keys(menuPermissions).length)
        ) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              success: true,
              data: {
                sideMenu: menuStructure || [],
                menuPermissions: menuPermissions || {},
                theme: "teal",
                navbarTitle: appConfig.getAppConfig().appName,
              },
            }),
          );
          return true;
        }
      }

      // Fallback: return default menu.json (with role filtering)
      const menuPath = path.join(appjsonDir, "menu.json");
      const content = JSON.parse(fs.readFileSync(menuPath, "utf8"));

      // Filter menu by role
      const filterByRole = (item) => {
        if (!item.roles || !item.roles.length) return true;
        return item.roles.includes(userRole);
      };

      content.sideMenu = content.sideMenu
        .map((item) => {
          if (item.children) {
            return { ...item, children: item.children.filter(filterByRole) };
          }
          return item;
        })
        .filter(filterByRole);

      const branding = appConfig.getAppConfig();
      content.navbarTitle = branding.appName;
      content.app = appConfig.getPublicAppConfig();

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, data: content }));
      return true;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // POST /api/menu/role-mapping - Save menu mapping for a role
  if (req.url === "/api/menu/role-mapping" && req.method === "POST") {
    try {
      const authUser = auth.getUserFromRequest(req);
      if (
        !authUser ||
        rolePermissions.normalizeRole(authUser.role) !== "super_admin"
      ) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: false,
            error: "Only super_admin can manage menu mappings",
          }),
        );
        return true;
      }

      const body = await readJsonBody(req);
      const { role, menus } = body;

      if (menuConfigService.isConfigAvailable()) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: false,
            error:
              "Pengaturan menu disimpan lewat config/menu-config.json (read-only di UI). Edit file JSON lalu restart dev server.",
          }),
        );
        return true;
      }

      if (!role || (!menus && !Array.isArray(body.entries))) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: false,
            error: "role and menus or entries required",
          }),
        );
        return true;
      }

      const flatRows = [];
      const seenPaths = new Set();

      function collectMenuRows(items, parentKey = null) {
        for (const menu of items || []) {
          const path = menu.page || menu.path;
          const children = menu.children || [];
          if (children.length) {
            const groupKey = path || menu.name;
            if (path && !seenPaths.has(path)) {
              seenPaths.add(path);
              flatRows.push({
                menu_path: path,
                menu_name: menu.name,
                parent_path: parentKey,
                can_create: !!menu.can_create,
                can_update: !!menu.can_update,
                can_delete: !!menu.can_delete,
              });
            }
            collectMenuRows(children, groupKey || parentKey);
          } else if (path && !seenPaths.has(path)) {
            seenPaths.add(path);
            flatRows.push({
              menu_path: path,
              menu_name: menu.name,
              parent_path: parentKey,
              can_create: !!menu.can_create,
              can_update: !!menu.can_update,
              can_delete: !!menu.can_delete,
            });
          }
        }
      }

      if (Array.isArray(menus)) collectMenuRows(menus);

      if (Array.isArray(body.entries) && body.entries.length) {
        for (const ent of body.entries) {
          const p = ent.menu_path || ent.path;
          if (!p || seenPaths.has(p)) continue;
          seenPaths.add(p);
          flatRows.push({
            menu_path: p,
            menu_name: ent.menu_name || ent.name || p,
            parent_path: ent.parent_path || null,
            can_create: !!ent.can_create,
            can_update: !!ent.can_update,
            can_delete: !!ent.can_delete,
          });
        }
      }

      if (!flatRows.length) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: false,
            error: "Tidak ada menu yang disimpan",
          }),
        );
        return true;
      }

      // Simpan ke config/menu-config.json (prioritas dev)
      if (menuConfigService.isConfigAvailable()) {
        const saved = menuConfigService.saveRoleFromEntries(role, flatRows);
        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: true,
            message: `Menu mapping disimpan ke menu-config.json untuk role: ${saved.role} (${saved.count} menu)`,
          }),
        );
        return true;
      }

      // Fallback: PostgreSQL (legacy)
      const existingMappings = await database.list("menu_role_mapping", {
        filters: { role },
        perPage: 1000,
      });

      for (const mapping of existingMappings.data) {
        await database.remove("menu_role_mapping", mapping.id);
      }

      const toFlag = (v) =>
        v === true ||
        v === 1 ||
        String(v).toLowerCase() === "true" ||
        String(v) === "1"
          ? 1
          : 0;

      let sortOrder = 0;
      for (const row of flatRows) {
        await database.create("menu_role_mapping", {
          role: String(role).trim(),
          menu_path: String(row.menu_path || "").trim(),
          menu_name: String(row.menu_name || row.menu_path || "").trim(),
          parent_path: row.parent_path ? String(row.parent_path).trim() : null,
          is_active: 1,
          can_create: toFlag(row.can_create),
          can_update: toFlag(row.can_update),
          can_delete: toFlag(row.can_delete),
          sort_order: sortOrder++,
        });
      }

      res.writeHead(201, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          success: true,
          message: `Menu mapping saved for role: ${role}`,
        }),
      );
      return true;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // GET /api/pages/:pageName - Get specific page config
  if (pagesApiPath.startsWith("/api/pages/") && req.method === "GET") {
    const pageName = pagesApiPath.slice("/api/pages/".length);
    if (pageName === "bulk" || pageName === "by-path") {
      return false;
    }
    try {
      const filePath = path.join(appjsonDir, `${pageName}.json`);

      // Security: Prevent directory traversal
      if (!filePath.startsWith(appjsonDir)) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "Access denied" }));
        return true;
      }

      if (!fs.existsSync(filePath)) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "Page not found" }));
        return true;
      }

      const content = JSON.parse(fs.readFileSync(filePath, "utf8"));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, data: content }));
      return true;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // POST /api/pages - Create new page config
  if (req.url === "/api/pages" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        const data = JSON.parse(body);
        const fileName =
          data.path.replace(/^\//, "").replace(/\//g, "-") || "page";
        const filePath = path.join(appjsonDir, `${fileName}.json`);

        // Security: Prevent directory traversal
        if (!filePath.startsWith(appjsonDir)) {
          res.writeHead(403, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "Access denied" }));
          return true;
        }

        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        invalidatePagesIndex();
        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: true,
            message: "Page created",
            file: `${fileName}.json`,
          }),
        );
        return true;
      } catch (error) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: error.message }));
        return true;
      }
    });
    return true;
  }

  // PUT /api/pages/:pageName - Update page config
  if (req.url.startsWith("/api/pages/") && req.method === "PUT") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        const pageName = req.url.split("/api/pages/")[1].split("?")[0];
        const filePath = path.join(appjsonDir, `${pageName}.json`);

        // Security: Prevent directory traversal
        if (!filePath.startsWith(appjsonDir)) {
          res.writeHead(403, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "Access denied" }));
          return true;
        }

        const data = JSON.parse(body);
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        invalidatePagesIndex();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, message: "Page updated" }));
        return true;
      } catch (error) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: error.message }));
        return true;
      }
    });
    return true;
  }

  // DELETE /api/pages/:pageName - Delete page config
  if (req.url.startsWith("/api/pages/") && req.method === "DELETE") {
    try {
      const pageName = req.url.split("/api/pages/")[1].split("?")[0];
      const filePath = path.join(appjsonDir, `${pageName}.json`);

      // Security: Prevent directory traversal
      if (!filePath.startsWith(appjsonDir)) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "Access denied" }));
        return true;
      }

      if (!fs.existsSync(filePath)) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "Page not found" }));
        return true;
      }

      fs.unlinkSync(filePath);
      invalidatePagesIndex();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, message: "Page deleted" }));
      return true;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  return false; // Not an API route
}

// Konfigurasi Kanban per resource CRM
const KANBAN_RESOURCES = {
  deals: {
    groupField: "stage",
    valueField: "value",
    columns: [
      "prospecting",
      "qualification",
      "proposal",
      "negotiation",
      "closed_won",
      "closed_lost",
    ],
    patchPath: "stage",
  },
  leads: {
    groupField: "status",
    valueField: "estimated_value",
    columns: ["new", "contacted", "qualified", "proposal_sent", "won", "lost"],
    patchPath: "status",
  },
};

// ============================================
// Kanban API Routes
// GET  /api/:resource/kanban
// PATCH /api/:resource/:id/stage|status
// POST /api/:resource/reorder
// ============================================
async function handleKanbanRoutes(req, res) {
  const urlParts = req.url.split("?");
  const pathname = urlParts[0];

  const json = (statusCode, data) => {
    res.writeHead(statusCode, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  };

  // GET /api/deals/kanban
  const kanbanListMatch = pathname.match(/^\/api\/(deals|leads)\/kanban$/);
  if (kanbanListMatch && req.method === "GET") {
    const resource = kanbanListMatch[1];
    const cfg = KANBAN_RESOURCES[resource];
    if (!cfg || !database.getTableNames().includes(resource)) {
      json(404, { success: false, error: "Kanban resource not found" });
      return true;
    }
    try {
      const result = await database.listKanban(resource, cfg.groupField, {
        valueField: cfg.valueField,
        columnKeys: cfg.columns,
      });
      json(200, { success: true, data: result.data, totals: result.totals });
    } catch (error) {
      json(500, { success: false, error: error.message });
    }
    return true;
  }

  // POST /api/deals/reorder
  const reorderMatch = pathname.match(/^\/api\/(deals|leads)\/reorder$/);
  if (reorderMatch && req.method === "POST") {
    const resource = reorderMatch[1];
    const cfg = KANBAN_RESOURCES[resource];
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", async () => {
      try {
        const payload = JSON.parse(body || "{}");
        const ids = payload.ids || [];
        const stage =
          payload.stage || payload.status || payload[cfg.groupField];
        const result = await database.reorderInStage(
          resource,
          ids,
          cfg.groupField,
          stage,
        );
        json(200, result);
      } catch (error) {
        json(400, { success: false, error: error.message });
      }
    });
    return true;
  }

  // POST /api/leads/:id/convert — konversi lead ke customer (+ deal)
  const convertMatch = pathname.match(/^\/api\/leads\/([^/]+)\/convert$/);
  if (convertMatch && req.method === "POST") {
    const leadId = convertMatch[1];
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", async () => {
      try {
        const payload = JSON.parse(body || "{}");
        const result = await database.convertLead(leadId, payload);
        if (!result) {
          json(404, { success: false, error: "Lead not found" });
        } else {
          json(200, {
            success: true,
            data: result,
            message: "Lead berhasil dikonversi",
          });
        }
      } catch (error) {
        json(400, { success: false, error: error.message });
      }
    });
    return true;
  }

  // PATCH /api/deals/:id/stage
  const stageMatch = pathname.match(
    /^\/api\/(deals|leads)\/([^/]+)\/(stage|status)$/,
  );
  if (stageMatch && req.method === "PATCH") {
    const resource = stageMatch[1];
    const id = stageMatch[2];
    const cfg = KANBAN_RESOURCES[resource];
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", async () => {
      try {
        const payload = JSON.parse(body || "{}");
        const value =
          payload[cfg.groupField] || payload.stage || payload.status;
        if (!value) {
          json(400, { success: false, error: "Missing stage/status value" });
          return;
        }
        const updated = await database.updatePipelineField(
          resource,
          id,
          cfg.groupField,
          value,
        );
        if (!updated) {
          json(404, { success: false, error: `${resource} not found` });
        } else {
          json(200, { success: true, data: updated });
        }
      } catch (error) {
        json(400, { success: false, error: error.message });
      }
    });
    return true;
  }

  return false;
}

/** Flags enrichment datatki — default ringan (personal + keuangan) */
function parseDatatkiEnrichFlags(query) {
  const raw = String(
    query.enrich_datatki || query.enrich_datatki_flags || "",
  ).trim();
  if (raw === "1" || raw === "true" || raw === "all") {
    return new Set(["personal", "keuangan", "alur", "piutang", "rekening", "spbg"]);
  }
  if (!raw) return new Set(["personal", "keuangan"]);
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

// ============================================
// Dynamic CRUD API Routes (from database)
// /api/:resource - list, create
// /api/:resource/:id - get, update, delete
// ============================================
async function handleCrudRoutes(req, res) {
  const urlParts = req.url.split("?");
  const pathname = urlParts[0];
  const queryString = urlParts[1] || "";

  // Parse query params
  const query = {};
  queryString.split("&").forEach((pair) => {
    const [k, v] = pair.split("=");
    if (k) query[decodeURIComponent(k)] = decodeURIComponent(v || "");
  });

  // Match /api/:resource or /api/:resource/:id
  const match = pathname.match(
    /^\/api\/([a-zA-Z_][a-zA-Z0-9_]*)(?:\/([^/]+))?$/,
  );
  if (!match) return false;

  const resource = match[1];
  const id = match[2] || null;

  // Skip reserved API paths (schema, pages, auth, calendar, reports, export, timeline, dashboard, menu)
  // 'visa' tidak di-reserve — CRUD tabel visa; POST /api/visa/depart ditangani di handleApiRoutes lebih dulu
  const reserved = [
    "schema",
    "pages",
    "auth",
    "calendar",
    "timeline",
    "dashboard",
    "menu",
    "reports",
    "export",
    "biodata",
    "documents",
    "letters",
  ];
  if (reserved.includes(resource)) return false;

  if (resource === "visa" && id === "depart") return false;

  // Check if this resource has a schema/table
  const tableNames = database.getTableNames();
  if (!tableNames.includes(resource)) return false;

  // Set JSON header helper
  const json = (statusCode, data) => {
    res.writeHead(statusCode, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  };

  // GET /api/personalblk/personal-candidates — calon peserta dari biodata personal
  if (
    resource === "personalblk" &&
    id === "personal-candidates" &&
    req.method === "GET"
  ) {
    try {
      const result = await blkPersonalService.listPersonalCandidates(
        database,
        req.authUser || {},
        query,
      );
      json(200, { success: true, ...result });
    } catch (error) {
      json(error.statusCode || 500, { success: false, error: error.message });
    }
    return true;
  }

  // POST /api/personalblk/from-personal — import peserta BLK (single atau batch)
  if (
    resource === "personalblk" &&
    id === "from-personal" &&
    req.method === "POST"
  ) {
    readJsonBody(req, MAX_JSON_SIZE)
      .then(async (body) => {
        try {
          const authUser = req.authUser || {};
          const batchIds = Array.isArray(body?.id_biodata_list)
            ? body.id_biodata_list
            : Array.isArray(body?.ids)
              ? body.ids
              : null;

          const importOptions = { tgltibatki: body?.tgltibatki || "" };

          if (batchIds && batchIds.length) {
            const result =
              await blkPersonalService.importPersonalblkFromPersonalBatch(
                database,
                batchIds,
                authUser,
                importOptions,
              );
            if (!result.imported && result.errors.length) {
              json(400, {
                success: false,
                error:
                  result.errors[0]?.message || "Gagal mengimpor peserta BLK",
                ...result,
              });
              return;
            }
            json(result.imported ? 201 : 200, { success: true, ...result });
            return;
          }

          const payload = await blkPersonalService.buildPersonalblkFromPersonal(
            database,
            body?.id_biodata,
            authUser,
            importOptions,
          );
          if (
            BRANCH_RESTRICTED_ROLES.includes(
              String(authUser.role || "").toLowerCase(),
            ) &&
            authUser.kode_cabang &&
            !payload.kode_cabang
          ) {
            payload.kode_cabang = authUser.kode_cabang;
          }
          const created = await database.create("personalblk", payload);
          json(201, {
            success: true,
            data: created,
            imported: 1,
            created: [created],
            skipped: [],
            errors: [],
          });
        } catch (error) {
          json(error.statusCode || 400, {
            success: false,
            error: error.message,
          });
        }
      })
      .catch((err) => {
        json(400, { success: false, error: err.message });
      });
    return true;
  }

  // POST /api/majikan_kriteria_pekerjaan/sync — pekerjaan + detail kriteria multi-select
  if (
    resource === "majikan_kriteria_pekerjaan" &&
    id === "sync" &&
    req.method === "POST"
  ) {
    readJsonBody(req, MAX_JSON_SIZE)
      .then(async (data) => {
        try {
          const audit = dbAuditOptsFromReq(req);
          const result = await database.syncDetailPekerjaanForBiodata(
            data?.id_biodata,
            data?.pekerjaan,
            data?.kriteria,
            audit,
          );
          json(200, { success: true, data: result });
        } catch (error) {
          json(400, { success: false, error: error.message });
        }
      })
      .catch((err) => {
        json(400, { success: false, error: err.message });
      });
    return true;
  }

  // GET /api/:resource - List with pagination & search
  if (!id && req.method === "GET") {
    try {
      const schema = database.getSchema(resource);
      const searchFields = schema
        ? schema.fields
            .filter((f) =>
              ["text", "email", "textarea", "url", "enum", "number"].includes(
                f.type,
              ),
            )
            .map((f) => f.name)
        : [];

      const filters = {};
      const reservedQueryKeys = new Set([
        "page",
        "perPage",
        "per_page",
        "search",
        "sort",
        "order",
        "id_biodata",
        "filter_id_biodata",
        "sektor_prefix",
        "id_biodata_prefix",
        "sektor_prefixes",
        "id_biodata_prefixes",
        "stage_filter",
        "stage_filters",
        "tahap_filter",
        "enrich_dokumen",
        "enrich_detail_pekerjaan",
        "enrich_datatki",
        "enrich_datatki_flags",
      ]);
      if (query.id_biodata || query.filter_id_biodata) {
        filters.id_biodata = query.id_biodata || query.filter_id_biodata;
      }
      if (query.sektor_prefix || query.id_biodata_prefix) {
        filters.id_biodata_prefix =
          query.sektor_prefix || query.id_biodata_prefix;
      }
      if (query.sektor_prefixes || query.id_biodata_prefixes) {
        filters.sektor_prefixes =
          query.sektor_prefixes || query.id_biodata_prefixes;
      }
      if (query.stage_filters || query.stage_filter || query.tahap_filter) {
        filters.stage_filters =
          query.stage_filters || query.stage_filter || query.tahap_filter;
      }
      if (schema && schema.fields) {
        const schemaFieldNames = new Set(schema.fields.map((f) => f.name));
        for (const [key, val] of Object.entries(query)) {
          if (reservedQueryKeys.has(key)) continue;
          if (!schemaFieldNames.has(key)) continue;
          if (val == null || String(val).trim() === "") continue;
          filters[key] = val;
        }
      }

      // BRANCH FILTERING: Auto-filter by kode_cabang untuk branch-restricted roles
      const authUser = req.authUser || {};
      const userRole = authUser.role;
      const userKodeCabang = authUser.kode_cabang;

      // Role yang harus difilter by cabang (bukan super_admin & data_master)
      if (BRANCH_RESTRICTED_ROLES.includes(userRole) && userKodeCabang) {
        if (BRANCH_AWARE_TABLES.includes(resource)) {
          filters.kode_cabang = userKodeCabang;
          console.log(
            `[Branch Filter] ${resource} filtered by kode_cabang=${userKodeCabang} for user=${authUser.email} (role=${userRole})`,
          );
        }
        if (resource === "blk_anak") {
          const parentRows = await database.list("personalblk", {
            page: 1,
            perPage: 5000,
            filters: { kode_cabang: userKodeCabang },
          });
          const biodataIds = (parentRows.data || [])
            .map((row) => String(row.id_biodata || "").trim())
            .filter(Boolean);
          if (!biodataIds.length) {
            json(200, {
              success: true,
              data: [],
              page: parseInt(query.page) || 1,
              perPage:
                parseInt(query.perPage) || parseInt(query.per_page) || 10,
              total: 0,
              hasMore: false,
            });
            return true;
          }
          filters.id_biodata = biodataIds.join(",");
        }
      }
      // super_admin & data_master bisa lihat semua data (tidak ada filter branch)
      // data_master: akses semua master data (shared across branches)
      // super_admin: akses semua operational data (full access)

      const result = await database.list(resource, {
        page: parseInt(query.page) || 1,
        perPage: parseInt(query.perPage) || parseInt(query.per_page) || 10,
        search: query.search || "",
        searchFields,
        sort: query.sort || "",
        order: query.order || "asc",
        filters,
      });

      if (
        (resource === "personal" || resource === "datatki") &&
        (query.enrich_dokumen === "1" || query.enrich_dokumen === "true") &&
        Array.isArray(result.data)
      ) {
        result.data = await database.enrichPersonalListDocStatus(result.data);
      }

      if (resource === "datatki" && Array.isArray(result.data)) {
        const enrichFlags = parseDatatkiEnrichFlags(query);
        if (enrichFlags.has("personal")) {
          result.data = await database.enrichDatatkiListFromPersonal(
            result.data,
          );
        }
        if (enrichFlags.has("keuangan")) {
          result.data =
            await require("./services/tki-keuangan-summary-service").enrichDatatkiKeuanganRows(
              database,
              result.data,
            );
        }
        if (enrichFlags.has("alur")) {
          result.data =
            await require("./services/pembayaran-tki-service").enrichDatatkiAlurRows(
              database,
              result.data,
            );
        }
        if (enrichFlags.has("piutang")) {
          result.data =
            await require("./services/piutang-tki-service").enrichDatatkiPiutangRows(
              database,
              result.data,
            );
        }
        if (enrichFlags.has("rekening")) {
          result.data =
            await require("./services/buka-rekening-tki-service").enrichDatatkiRekeningRows(
              database,
              result.data,
            );
        }
        if (enrichFlags.has("spbg")) {
          result.data =
            await require("./services/spbg-marketing-service").enrichDatatkiSpbgRows(
              database,
              result.data,
            );
        }
      }

      if (resource === "pembayaran_tki" && Array.isArray(result.data)) {
        const pembayaranService = require("./services/pembayaran-tki-service");
        result.data = await pembayaranService.enrichRows(
          { getByField: database.getByField.bind(database) },
          result.data,
        );
      }

      if (resource === "piutang_tki" && Array.isArray(result.data)) {
        const piutangService = require("./services/piutang-tki-service");
        result.data = await piutangService.enrichRows(database, result.data);
      }

      if (resource === "pembayaran_fee_agen" && Array.isArray(result.data)) {
        const feeService = require("./services/fee-agen-service");
        result.data = await feeService.enrichRows(database, result.data);
      }

      if (resource === "gaji_tki" && Array.isArray(result.data)) {
        const gajiService = require("./services/gaji-tki-service");
        result.data = await gajiService.enrichRows(database, result.data);
      }

      if (resource === "jurnal_keuangan" && Array.isArray(result.data)) {
        const jurnalSvc = require("./services/jurnal-keuangan-service");
        result.data = await jurnalSvc.enrichJurnalRows(database, result.data);
      }

      if (
        (resource === "personal" || resource === "datatki") &&
        (query.enrich_detail_pekerjaan === "1" ||
          query.enrich_detail_pekerjaan === "true") &&
        Array.isArray(result.data)
      ) {
        result.data = await database.enrichPersonalListDetailPekerjaan(
          result.data,
        );
      }

      json(200, { success: true, ...result });
    } catch (error) {
      json(500, { success: false, error: error.message });
    }
    return true;
  }

  // GET /api/:resource/:id - Get single record
  if (id && req.method === "GET") {
    try {
      const row = await database.getById(resource, id);
      if (!row) {
        json(404, { success: false, error: `${resource} not found` });
      } else {
        if (resource === "blk_anak" && row.id_biodata && !row.kode_cabang) {
          const parentBlk = await blkPersonalService.findPersonalblkByBiodata(
            database,
            row.id_biodata,
          );
          if (parentBlk?.kode_cabang) row.kode_cabang = parentBlk.kode_cabang;
        }
        // BRANCH FILTERING: Cek akses untuk branch-restricted roles
        const authUser = req.authUser || {};
        const userRole = authUser.role;
        const userKodeCabang = authUser.kode_cabang;
        if (!assertBranchRecordAccess(authUser, row)) {
          console.log(
            `[Branch Access Denied] User=${authUser.email} (role=${userRole}) ${resource}/${id}`,
          );
          json(403, {
            success: false,
            error: "Akses ditolak: data bukan dari cabang Anda",
          });
          return true;
        }

        json(200, { success: true, data: row });
      }
    } catch (error) {
      json(500, { success: false, error: error.message });
    }
    return true;
  }

  // POST /api/:resource - Create new record
  if (!id && req.method === "POST") {
    readJsonBody(req, MAX_JSON_SIZE)
      .then(async (data) => {
        try {
          // Bulk delete action
          if (data._action === "bulkDelete" && Array.isArray(data.ids)) {
            const deleted = await database.bulkDelete(resource, data.ids);
            json(200, { success: true, deleted });
            return;
          }

          // BRANCH FILTERING: Auto-inject kode_cabang untuk branch-restricted roles
          const authUser = req.authUser || {};
          const userRole = authUser.role;
          const userKodeCabang = authUser.kode_cabang;
          if (BRANCH_RESTRICTED_ROLES.includes(userRole) && userKodeCabang) {
            if (BRANCH_AWARE_TABLES.includes(resource)) {
              // Jangan override jika user coba set kode_cabang manual
              if (!data.kode_cabang) {
                data.kode_cabang = userKodeCabang;
                console.log(
                  `[Branch Auto-Fill] ${resource} created with kode_cabang=${userKodeCabang} by user=${authUser.email} (role=${userRole})`,
                );
              }
            }
          }

          if (resource === "spbg_keuangan_request") {
            const idTki = String(data.id_tki || "").trim().toUpperCase();
            if (!idTki) throw new Error("ID TKI wajib diisi untuk request SPBG.");
            const tki = await database.getByField("datatki", "id_tki", idTki).catch(() => null);
            const pembayaranService = require("./services/pembayaran-tki-service");
            const existingReq =
              typeof database.queryAll === "function"
                ? await database.queryAll(
                    `SELECT id, status_request FROM spbg_keuangan_request
                     WHERE id_tki = ? AND COALESCE(status_request, '') IN ('menunggu', 'disetujui')
                     ORDER BY created_at DESC NULLS LAST, id DESC LIMIT 1`,
                    idTki,
                  )
                : [];
            if ((existingReq || [])[0]?.status_request === "menunggu") {
              throw new Error("Masih ada request SPBG yang menunggu approval untuk TKI ini.");
            }
            const summary = await pembayaranService.summarizeSpbgPackage(database, idTki, {
              id_biodata: data.id_biodata || tki?.id_biodata || ""
            });
            if (summary.need_reconcile) {
              throw new Error("Ada komponen SPBG yang dibayar setelah pelunasan sebelumnya. Rekonsiliasi dulu sebelum membuat request baru.");
            }
            if (summary.sisa <= 0) {
              throw new Error("Sisa paket SPBG sudah 0. Tidak perlu membuat request pelunasan baru.");
            }
            data.id_tki = idTki;
            data.id_biodata = data.id_biodata || tki?.id_biodata || null;
            data.kode_cabang = data.kode_cabang || tki?.kode_cabang || userKodeCabang || authUser.kode_cabang;
            data.total_spbg_master = summary.total;
            data.total_terbayar = summary.terbayar;
            data.total_biaya = summary.sisa;
            data.status_request = "menunggu";
            data.approved_by = null;
            data.approved_at = null;
            data.id_pembayaran = null;
            data.no_jurnal = null;
            data.created_by = authUser.email || authUser.sub || "marketing";
          }

          if (resource === "personalblk") {
            data = blkPersonalService.sanitizePersonalblkPayload(data);
          }
          if (resource === "blk_izin_pulang") {
            data = await blkPersonalService.prepareBlkIzinPulangPayload(
              database,
              data,
              authUser,
            );
          }
          if (resource === "blk_izin") {
            data = await blkPersonalService.prepareBlkIzinPayload(
              database,
              data,
              authUser,
            );
          }
          if (blkUjkService.UJK_RESOURCE_SET.has(resource)) {
            data = await blkUjkService.prepareResource(
              database,
              resource,
              data,
              authUser,
            );
          }
          if (resource === "blk_anak") {
            data = blkPersonalService.sanitizeBlkAnakPayload(data);
            if (data.id_biodata && !data.nodaftar) {
              const parentBlk =
                await blkPersonalService.findPersonalblkByBiodata(
                  database,
                  data.id_biodata,
                );
              if (parentBlk) {
                data.nodaftar = parentBlk.nodaftar || parentBlk.id_biodata;
              }
            }
          }

          const audit =
            resource === "personal" ||
            resource === "majikan" ||
            resource === "pembayaran_tki" ||
            resource === "piutang_tki" ||
            resource === "pembayaran_fee_agen" ||
            resource === "gaji_tki"
              ? dbAuditOptsFromReq(req)
              : {};
          const created = await database.create(resource, data, audit);
          if (resource === "blk_izin_pulang") {
            try {
              await blkPersonalService.notifyBlkIzinPulangChange(database, {
                action: "create",
                after: created,
                user: authUser,
              });
            } catch (notifErr) {
              console.warn("[Notif] blk_izin_pulang create:", notifErr.message);
            }
          }
          if (resource === "blk_izin") {
            try {
              await blkPersonalService.notifyBlkIzinChange(database, {
                action: "create",
                after: created,
                user: authUser,
              });
            } catch (notifErr) {
              console.warn("[Notif] blk_izin create:", notifErr.message);
            }
          }
          if (blkUjkService.UJK_RESOURCE_SET.has(resource)) {
            try {
              await blkUjkService.afterUjkMutation(database, resource, {
                after: created,
              });
            } catch (ujkErr) {
              console.warn("[UJK] create side-effect:", ujkErr.message);
            }
            if (
              [
                "blk_detail_formulir",
                "blk_pengajuan_ujk",
                "blk_sertifikat",
              ].includes(resource)
            ) {
              try {
                await blkUjkService.notifyUjkChange(database, {
                  resource,
                  action: "create",
                  after: created,
                  user: authUser,
                });
              } catch (notifErr) {
                console.warn("[Notif] UJK create:", notifErr.message);
              }
            }
          }
          json(201, { success: true, data: created });
        } catch (error) {
          json(error.statusCode || 400, {
            success: false,
            error: error.message,
          });
        }
      })
      .catch((err) => {
        json(400, { success: false, error: err.message });
      });
    return true;
  }

  // PATCH /api/:resource/:id - Partial update
  if (id && req.method === "PATCH") {
    readJsonBody(req, MAX_JSON_SIZE)
      .then(async (data) => {
        try {
          const existing = await database.getById(resource, id);
          if (!existing) {
            json(404, { success: false, error: `${resource} not found` });
            return;
          }
          if (
            resource === "blk_anak" &&
            existing.id_biodata &&
            !existing.kode_cabang
          ) {
            const parentBlkPatch =
              await blkPersonalService.findPersonalblkByBiodata(
                database,
                existing.id_biodata,
              );
            if (parentBlkPatch?.kode_cabang)
              existing.kode_cabang = parentBlkPatch.kode_cabang;
          }
          if (!assertBranchRecordAccess(req.authUser, existing)) {
            json(403, {
              success: false,
              error: "Akses ditolak: data bukan dari cabang Anda",
            });
            return;
          }
          const authUser = req.authUser || {};
          if (
            BRANCH_RESTRICTED_ROLES.includes(
              String(authUser.role || "").toLowerCase(),
            ) &&
            data.kode_cabang &&
            data.kode_cabang !== authUser.kode_cabang
          ) {
            delete data.kode_cabang;
          }
          if (resource === "personalblk") {
            data = blkPersonalService.sanitizePersonalblkPayload(data);
          }
          if (resource === "blk_izin_pulang") {
            data = await blkPersonalService.prepareBlkIzinPulangPayload(
              database,
              data,
              authUser,
              existing,
            );
          }
          if (resource === "blk_izin") {
            data = await blkPersonalService.prepareBlkIzinPayload(
              database,
              data,
              authUser,
              existing,
            );
          }
          if (blkUjkService.UJK_RESOURCE_SET.has(resource)) {
            data = await blkUjkService.prepareResource(
              database,
              resource,
              data,
              authUser,
              existing,
            );
          }
          if (resource === "blk_anak") {
            data = blkPersonalService.sanitizeBlkAnakPayload(data);
            if (data.id_biodata && !data.nodaftar) {
              const parentBlk =
                await blkPersonalService.findPersonalblkByBiodata(
                  database,
                  data.id_biodata,
                );
              if (parentBlk) {
                data.nodaftar = parentBlk.nodaftar || parentBlk.id_biodata;
              }
            }
          }
          const audit =
            resource === "personal" ||
            resource === "majikan" ||
            resource === "pembayaran_tki" ||
            resource === "piutang_tki" ||
            resource === "pembayaran_fee_agen" ||
            resource === "gaji_tki"
              ? dbAuditOptsFromReq(req)
              : {};
          if (resource === "personal" && data.statusaktif !== undefined) {
            audit.statusAlasan = data.alasan;
          }
          const updated = await database.update(resource, id, data, audit);
          if (!updated) {
            json(404, { success: false, error: `${resource} not found` });
          } else {
            if (resource === "blk_izin_pulang") {
              try {
                await blkPersonalService.notifyBlkIzinPulangChange(database, {
                  action: "update",
                  before: existing,
                  after: updated,
                  user: authUser,
                });
              } catch (notifErr) {
                console.warn(
                  "[Notif] blk_izin_pulang patch:",
                  notifErr.message,
                );
              }
            }
            if (resource === "blk_izin") {
              try {
                await blkPersonalService.notifyBlkIzinChange(database, {
                  action: "update",
                  before: existing,
                  after: updated,
                  user: authUser,
                });
              } catch (notifErr) {
                console.warn("[Notif] blk_izin patch:", notifErr.message);
              }
            }
            if (blkUjkService.UJK_RESOURCE_SET.has(resource)) {
              try {
                await blkUjkService.afterUjkMutation(database, resource, {
                  before: existing,
                  after: updated,
                });
              } catch (ujkErr) {
                console.warn("[UJK] patch side-effect:", ujkErr.message);
              }
              if (
                [
                  "blk_detail_formulir",
                  "blk_pengajuan_ujk",
                  "blk_sertifikat",
                ].includes(resource)
              ) {
                try {
                  await blkUjkService.notifyUjkChange(database, {
                    resource,
                    action: "update",
                    before: existing,
                    after: updated,
                    user: authUser,
                  });
                } catch (notifErr) {
                  console.warn("[Notif] UJK patch:", notifErr.message);
                }
              }
            }
            json(200, { success: true, data: updated });
          }
        } catch (error) {
          json(error.statusCode || 400, {
            success: false,
            error: error.message,
          });
        }
      })
      .catch((err) => {
        json(400, { success: false, error: err.message });
      });
    return true;
  }

  // PUT /api/:resource/:id - Update record
  if (id && req.method === "PUT") {
    readJsonBody(req, MAX_JSON_SIZE)
      .then(async (data) => {
        try {
          const existing = await database.getById(resource, id);
          if (!existing) {
            json(404, { success: false, error: `${resource} not found` });
            return;
          }
          if (
            resource === "blk_anak" &&
            existing.id_biodata &&
            !existing.kode_cabang
          ) {
            const parentBlk = await blkPersonalService.findPersonalblkByBiodata(
              database,
              existing.id_biodata,
            );
            if (parentBlk?.kode_cabang)
              existing.kode_cabang = parentBlk.kode_cabang;
          }
          if (!assertBranchRecordAccess(req.authUser, existing)) {
            json(403, {
              success: false,
              error: "Akses ditolak: data bukan dari cabang Anda",
            });
            return;
          }
          const authUserPut = req.authUser || {};
          if (
            BRANCH_RESTRICTED_ROLES.includes(
              String(authUserPut.role || "").toLowerCase(),
            ) &&
            data.kode_cabang &&
            data.kode_cabang !== authUserPut.kode_cabang
          ) {
            delete data.kode_cabang;
          }
          if (resource === "personalblk") {
            data = blkPersonalService.sanitizePersonalblkPayload(data);
          }
          if (resource === "blk_izin_pulang") {
            data = await blkPersonalService.prepareBlkIzinPulangPayload(
              database,
              data,
              authUserPut,
              existing,
            );
          }
          if (resource === "blk_izin") {
            data = await blkPersonalService.prepareBlkIzinPayload(
              database,
              data,
              authUserPut,
              existing,
            );
          }
          if (blkUjkService.UJK_RESOURCE_SET.has(resource)) {
            data = await blkUjkService.prepareResource(
              database,
              resource,
              data,
              authUserPut,
              existing,
            );
          }
          if (resource === "blk_anak") {
            data = blkPersonalService.sanitizeBlkAnakPayload(data);
            if (data.id_biodata && !data.nodaftar) {
              const parentBlk =
                await blkPersonalService.findPersonalblkByBiodata(
                  database,
                  data.id_biodata,
                );
              if (parentBlk) {
                data.nodaftar = parentBlk.nodaftar || parentBlk.id_biodata;
              }
            }
          }
          const audit =
            resource === "personal" ||
            resource === "majikan" ||
            resource === "pembayaran_tki" ||
            resource === "piutang_tki" ||
            resource === "pembayaran_fee_agen" ||
            resource === "gaji_tki"
              ? dbAuditOptsFromReq(req)
              : {};
          if (resource === "personal" && data.statusaktif !== undefined) {
            audit.statusAlasan = data.alasan;
          }
          const updated = await database.update(resource, id, data, audit);
          if (!updated) {
            json(404, { success: false, error: `${resource} not found` });
          } else {
            if (resource === "blk_izin_pulang") {
              try {
                await blkPersonalService.notifyBlkIzinPulangChange(database, {
                  action: "update",
                  before: existing,
                  after: updated,
                  user: authUserPut,
                });
              } catch (notifErr) {
                console.warn("[Notif] blk_izin_pulang put:", notifErr.message);
              }
            }
            if (resource === "blk_izin") {
              try {
                await blkPersonalService.notifyBlkIzinChange(database, {
                  action: "update",
                  before: existing,
                  after: updated,
                  user: authUserPut,
                });
              } catch (notifErr) {
                console.warn("[Notif] blk_izin put:", notifErr.message);
              }
            }
            if (blkUjkService.UJK_RESOURCE_SET.has(resource)) {
              try {
                await blkUjkService.afterUjkMutation(database, resource, {
                  before: existing,
                  after: updated,
                });
              } catch (ujkErr) {
                console.warn("[UJK] put side-effect:", ujkErr.message);
              }
              if (
                [
                  "blk_detail_formulir",
                  "blk_pengajuan_ujk",
                  "blk_sertifikat",
                ].includes(resource)
              ) {
                try {
                  await blkUjkService.notifyUjkChange(database, {
                    resource,
                    action: "update",
                    before: existing,
                    after: updated,
                    user: authUserPut,
                  });
                } catch (notifErr) {
                  console.warn("[Notif] UJK put:", notifErr.message);
                }
              }
            }
            json(200, { success: true, data: updated });
          }
        } catch (error) {
          json(error.statusCode || 400, {
            success: false,
            error: error.message,
          });
        }
      })
      .catch((err) => {
        json(400, { success: false, error: err.message });
      });
    return true;
  }

  // DELETE /api/:resource/:id - Delete record
  if (id && req.method === "DELETE") {
    try {
      const existing = await database.getById(resource, id);
      if (!existing) {
        json(404, { success: false, error: `${resource} not found` });
        return true;
      }
      if (!assertBranchRecordAccess(req.authUser, existing)) {
        json(403, {
          success: false,
          error: "Akses ditolak: data bukan dari cabang Anda",
        });
        return true;
      }

      if (resource === "personal") {
        const role = String(req.authUser?.role || "").toLowerCase();
        const isAdmin = role === "super_admin" || role === "admin";
        const idBiodata = existing.id_biodata;
        const auditOpts = dbAuditOptsFromReq(req);

        if (!isAdmin) {
          const eligibility =
            await database.getPersonalDeleteEligibility(idBiodata);
          if (!eligibility.allowed) {
            json(403, {
              success: false,
              error: eligibility.message,
              bindings: eligibility.bindings,
              isNew: eligibility.isNew,
            });
            return true;
          }
        }

        const deleted = await database.removePersonalCascade(
          idBiodata,
          auditOpts,
        );
        if (!deleted) {
          json(404, { success: false, error: "personal not found" });
        } else {
          json(200, {
            success: true,
            message: isAdmin
              ? "Biodata dan data terkait berhasil dihapus (administrator)."
              : "Biodata baru berhasil dihapus.",
          });
        }
        return true;
      }

      const deleted = await database.remove(resource, id);
      if (!deleted) {
        json(404, { success: false, error: `${resource} not found` });
      } else {
        if (resource === "blk_izin_pulang") {
          try {
            await blkPersonalService.notifyBlkIzinPulangChange(database, {
              action: "delete",
              before: existing,
              user: req.authUser || {},
            });
          } catch (notifErr) {
            console.warn("[Notif] blk_izin_pulang delete:", notifErr.message);
          }
        }
        if (resource === "blk_izin") {
          try {
            await blkPersonalService.notifyBlkIzinChange(database, {
              action: "delete",
              before: existing,
              user: req.authUser || {},
            });
          } catch (notifErr) {
            console.warn("[Notif] blk_izin delete:", notifErr.message);
          }
        }
        if (blkUjkService.UJK_RESOURCE_SET.has(resource)) {
          if (
            [
              "blk_detail_formulir",
              "blk_pengajuan_ujk",
              "blk_sertifikat",
            ].includes(resource)
          ) {
            try {
              await blkUjkService.notifyUjkChange(database, {
                resource,
                action: "delete",
                before: existing,
                user: req.authUser || {},
              });
            } catch (notifErr) {
              console.warn("[Notif] UJK delete:", notifErr.message);
            }
          }
        }
        json(200, { success: true, message: `${resource} deleted` });
      }
    } catch (error) {
      json(500, { success: false, error: error.message });
    }
    return true;
  }

  return false;
}

const server = http.createServer((req, res) => {
  (async () => {
    // Add security headers to ALL responses
    addSecurityHeaders(req, res);

    const requestPath = req.url.split("?")[0];
    if (isPrivateResponsePath(requestPath) || isAppShellAsset(requestPath)) {
      setPrivateNoCacheHeaders(res);
    }

    // Log request
    console.log(`${req.method} ${req.url}`);

    if (await handleAuthRoutes(req, res)) {
      return;
    }

    let uploadPath = normalizeUploadRequestPath(req.url.split("?")[0]);
    if (uploadPath.startsWith("/uploads/")) {
      if (req.method !== "GET" && req.method !== "HEAD") {
        res.writeHead(405, { "Content-Type": "text/html" });
        res.end("<h1>405 Method Not Allowed</h1>");
        return;
      }
      serveUploadedFile(req, res, uploadPath);
      return;
    }

    if (!requireApiAuth(req, res)) {
      return;
    }

    if (await handleApiRoutes(req, res)) {
      return;
    }

    if (await handleKanbanRoutes(req, res)) {
      return;
    }

    if (await handleCrudRoutes(req, res)) {
      return;
    }

    if (handleUnmatchedApi(req, res)) {
      return;
    }

    serveStaticOrSpa(req, res);
  })().catch((err) => {
    console.error("[Server]", err);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: sanitizeError(err) }));
    }
  });
});

const INDEX_HTML = path.join(__dirname, "index.html");

function sendIndexHtml(res) {
  fs.readFile(INDEX_HTML, (err, content) => {
    if (err) {
      res.writeHead(500, { "Content-Type": "text/html" });
      res.end("<h1>500 Server Error</h1>");
      return;
    }
    setPrivateNoCacheHeaders(res);
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(content);
  });
}

/** Cegah Cloudflare/CDN cache file upload (respons auth bisa bocor ke user logout). */
function serveUploadedFile(req, res, urlPath) {
  // SECURITY: Require authentication for ALL uploaded files
  const user = auth.getUserFromRequest(req);
  if (!user) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        success: false,
        error: "Authentication required to access files",
      }),
    );
    return true;
  }

  const rel = urlPath.replace(/^\/uploads\//, "");
  const abs = uploadService.resolveUploadAbsolute(`/uploads/${rel}`);

  if (!abs || !fs.existsSync(abs)) {
    res.writeHead(404, { "Content-Type": "text/html" });
    res.end("<h1>404 Not Found</h1>");
    return true;
  }

  // SECURITY: Extract id_biodata from path and check authorization
  const pathParts = rel.split("/");
  const fileIdBiodata = pathParts[0]; // First part is id_biodata

  // Admin can access all files
  if (user.role !== "admin") {
    // Non-admin users: verify they have permission to access this biodata
    // Check if user has access to this specific biodata
    // For now, allow all authenticated users (can be enhanced with ownership check)
    // TODO: Add ownership verification based on your business logic
  }

  // Log file access
  console.log(
    `[FILE ACCESS] User: ${user.email}, File: ${urlPath}, IP: ${req.socket.remoteAddress}`,
  );

  const ext = path.extname(abs).toLowerCase();
  const contentType = mimeTypes[ext] || "application/octet-stream";

  // Add security headers for file responses
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Disposition", `inline; filename="file${ext}"`);

  fs.readFile(abs, (err, content) => {
    if (err) {
      res.writeHead(500, { "Content-Type": "text/html" });
      res.end("<h1>500 Server Error</h1>");
      return;
    }
    res.writeHead(200, { "Content-Type": contentType });
    if (req.method === "HEAD") res.end();
    else res.end(content);
  });
  return true;
}

/** Path API tanpa query; trailing slash dihapus agar route cocok */
function apiPathname(req) {
  const p = req.url.split("?")[0];
  if (p.length > 1 && p.endsWith("/")) return p.replace(/\/+$/, "");
  return p;
}

/** API tidak dikenali — jangan jatuh ke static (HTML 405) */
function handleUnmatchedApi(req, res) {
  const pathname = apiPathname(req);
  if (!pathname.startsWith("/api/")) return false;

  if (req.method === "OPTIONS") {
    const origin = req.headers.origin || "*";
    res.writeHead(204, {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Max-Age": "86400",
    });
    res.end();
    return true;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      success: false,
      error: `Endpoint API tidak ditemukan: ${req.method} ${pathname}. Pastikan server di-restart setelah update (npm start).`,
    }),
  );
  return true;
}

function serveStaticOrSpa(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { "Content-Type": "text/html" });
    res.end("<h1>405 Method Not Allowed</h1>");
    return;
  }

  let urlPath = req.url.split("?")[0];
  if (urlPath === "/") urlPath = "/index.html";

  // SECURITY: folder data/ (DB, upload fisik) tidak boleh diakses langsung
  if (urlPath.startsWith("/data/")) {
    res.writeHead(403, { "Content-Type": "text/html" });
    res.end("<h1>403 Forbidden</h1>");
    return;
  }

  // SECURITY: Handle /uploads/* BEFORE public static files
  if (urlPath.startsWith("/uploads/")) {
    // Files are now served without requireApiAuth check
    // Authentication is handled inside serveUploadedFile
    serveUploadedFile(req, res, urlPath);
    return;
  }

  const resolved = path.resolve(path.join(__dirname, urlPath));
  const root = path.resolve(__dirname);
  if (!resolved.startsWith(root)) {
    res.writeHead(403, { "Content-Type": "text/html" });
    res.end("<h1>403 Forbidden</h1>");
    return;
  }

  fs.stat(resolved, (statErr, stat) => {
    if (!statErr && stat.isDirectory()) {
      sendIndexHtml(res);
      return;
    }

    fs.readFile(resolved, (readErr, content) => {
      if (readErr) {
        if (readErr.code === "ENOENT") {
          // Route client-side (#/login, /dashboard, dll.) → kembalikan shell SPA
          const ext = path.extname(urlPath);
          if (!ext || ext === ".html") {
            sendIndexHtml(res);
            return;
          }
          res.writeHead(404, { "Content-Type": "text/html" });
          res.end("<h1>404 Not Found</h1>");
          return;
        }
        res.writeHead(500, { "Content-Type": "text/html" });
        res.end("<h1>500 Server Error</h1>");
        return;
      }

      const ext = path.extname(resolved).toLowerCase();
      const contentType = mimeTypes[ext] || "application/octet-stream";
      res.writeHead(200, { "Content-Type": contentType });
      if (req.method === "HEAD") {
        res.end();
      } else {
        res.end(content);
      }
    });
  });
}

// Initialize database before starting server (sql.js — async)
(async () => {
  await database.init();
  uploadService.ensureUploadRoot();
  try {
    printSuratService.syncProductionTemplates();
    printSuratService.ensureRecordPrintTemplates();
  } catch (e) {
    console.warn("[print-surat] sync template:", e.message);
  }
  buildPagesIndex();

  // Seed initial admin account if enabled
  if (process.env.SEED_ADMIN !== "false") {
    const bcrypt = require("bcryptjs");
    const branding = appConfig.getAppConfig();
    const adminEmail = branding.adminEmail;
    const adminPassword = branding.adminPassword || "admin123";
    const adminRole = process.env.ADMIN_ROLE || "admin";

    try {
      // Check if admin exists
      const existingUsers = await database.list("users", {
        filters: { email: adminEmail },
        limit: 1,
      });

      if (!existingUsers || existingUsers.length === 0) {
        // Create admin account
        const hashedPassword = await bcrypt.hash(adminPassword, 10);
        await database.create("users", {
          name: branding.adminName,
          email: adminEmail,
          password: hashedPassword,
          role: adminRole,
          status: "active",
          phone: "",
        });

        console.log("");
        console.log("╔════════════════════════════════════════╗");
        console.log("║   Admin Account Created               ║");
        console.log("╚════════════════════════════════════════╝");
        console.log(`   Email:    ${adminEmail}`);
        console.log(`   Password: ${adminPassword}`);
        console.log(`   Role:     ${adminRole}`);
        console.log("");
        console.log("⚠️  IMPORTANT: Change password after first login!");
        console.log("");
      } else {
        console.log("✔ Admin account already exists");
      }
    } catch (err) {
      console.error("✖ Failed to seed admin account:", err.message);
    }
  }

  server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`API endpoints:`);
    console.log(`  GET    /api/schema         - List all schemas`);
    console.log(`  GET    /api/schema/:name   - Get schema config`);
    console.log(`  POST   /api/schema         - Create schema`);
    console.log(`  PUT    /api/schema/:name   - Update schema`);
    console.log(`  DELETE /api/schema/:name   - Delete schema`);
    console.log(`  GET    /api/pages          - List all pages`);
    console.log(`  GET    /api/pages/:name    - Get page config`);
    console.log(`  POST   /api/pages          - Create page`);
    console.log(`  PUT    /api/pages/:name    - Update page`);
    console.log(`  DELETE /api/pages/:name    - Delete page`);
    console.log(`  --- Auth (JWT cookie) ---`);
    console.log(`  POST   /api/auth/login     - Login`);
    console.log(`  POST   /api/auth/logout    - Logout`);
    console.log(`  GET    /api/auth/me        - Session saat ini`);
    console.log(`  --- Dynamic CRUD (from schema) ---`);
    const tables = database.getTableNames();
    tables.forEach((t) => {
      console.log(
        `  CRUD   /api/${t}           - ${t} (list, create, get, update, delete)`,
      );
    });
    console.log(`  --- OCR Gemini ---`);
    console.log(
      `  GET    /api/ocr/status       - Cek GOOGLE_API_KEY + model aktif`,
    );
    console.log(
      `  GET    /api/ocr/models       - Daftar model Gemini (API key ini)`,
    );
    console.log(
      `  POST   /api/ocr/ktp          - OCR e-KTP (multipart field: image)`,
    );
    console.log(
      `  POST   /api/ocr/kk           - OCR Kartu Keluarga (multipart field: image)`,
    );
    console.log(`  --- Dokumen & biodata ---`);
    console.log(
      `  POST   /api/documents/personal-foto      - Upload foto personal`,
    );
    console.log(
      `  DELETE /api/documents/personal-foto      - Hapus foto personal`,
    );
    console.log(
      `  POST   /api/documents/dokumen-identitas  - Upload dokumen identitas`,
    );
    console.log(
      `  POST   /api/documents/upload             - Upload hub (42 jenis)`,
    );
    console.log(
      `  GET    /api/biodata/:id_biodata          - Detail biodata TKI`,
    );
    console.log(`  --- Kanban ---`);
    console.log(`  GET    /api/deals/kanban     - Deals pipeline`);
    console.log(`  PATCH  /api/deals/:id/stage  - Move deal stage`);
    console.log(`  GET    /api/leads/kanban     - Leads pipeline`);
    console.log(`  PATCH  /api/leads/:id/status - Move lead status`);
  });
})().catch((err) => {
  console.error("[DB] Failed to initialize:", err);
  process.exit(1);
});
