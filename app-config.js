/**
 * Konfigurasi branding & identitas instalasi.
 */
require('./load-env').loadLocalEnv();

const companyProfileService = require('./company-profile-service');

const DEFAULT_APP_NAME = 'Admin Starter';
const DEFAULT_LOGIN_SUBTITLE = 'Masuk ke panel administrasi berbasis JSON.';
const DEFAULT_ORG_NAME = 'Your Company';
const DEFAULT_ORG_ADDRESS = 'Jl. Contoh No. 1, Kota Contoh, Indonesia';
const DEFAULT_ORG_EMAIL = 'info@example.com';
const PRINT_SIGNATORY_PLACEHOLDER = '-';

function trimOrEmpty(v) {
  return String(v ?? '').trim();
}

function getAppConfig() {
  const defaults = {
    appName: DEFAULT_APP_NAME,
    appTitle: DEFAULT_APP_NAME,
    orgName: DEFAULT_ORG_NAME,
    orgSignatoryName: '',
    orgSignatoryTitle: '',
    orgAddress: DEFAULT_ORG_ADDRESS,
    orgEmail: DEFAULT_ORG_EMAIL,
    orgPrintLocation: '',
    adminEmail: 'admin@localhost',
    adminName: 'Administrator',
    loginSubtitle: DEFAULT_LOGIN_SUBTITLE
  };
  const overlay = companyProfileService.getProfileOverlay(defaults);
  const appName = overlay.appName || DEFAULT_APP_NAME;
  const showLoginDemo =
    process.env.APP_SHOW_LOGIN_DEMO === 'true'
    || (process.env.NODE_ENV !== 'production' && process.env.APP_SHOW_LOGIN_DEMO !== 'false');

  return {
    appName,
    appTitle: overlay.appTitle || appName,
    orgName: overlay.orgName || DEFAULT_ORG_NAME,
    orgSignatoryName: overlay.orgSignatoryName,
    orgSignatoryTitle: overlay.orgSignatoryTitle,
    orgAddress: overlay.orgAddress || DEFAULT_ORG_ADDRESS,
    orgEmail: overlay.orgEmail || DEFAULT_ORG_EMAIL,
    orgPrintLocation: overlay.orgPrintLocation,
    adminEmail: overlay.adminEmail || defaults.adminEmail,
    adminName: overlay.adminName || defaults.adminName,
    adminPassword: process.env.ADMIN_PASSWORD || '',
    loginSubtitle: overlay.loginSubtitle || DEFAULT_LOGIN_SUBTITLE,
    showLoginDemo
  };
}

function getPublicAppConfig() {
  const c = getAppConfig();
  return {
    appName: c.appName,
    appTitle: c.appTitle,
    orgName: c.orgName,
    orgSignatoryName: c.orgSignatoryName,
    orgSignatoryTitle: c.orgSignatoryTitle,
    orgAddress: c.orgAddress,
    orgEmail: c.orgEmail,
    orgPrintLocation: c.orgPrintLocation,
    loginSubtitle: c.loginSubtitle,
    showLoginDemo: c.showLoginDemo,
    adminEmail: c.showLoginDemo ? c.adminEmail : ''
  };
}

function resolvePrintSignatoryText(value) {
  const s = trimOrEmpty(value);
  return s || PRINT_SIGNATORY_PLACEHOLDER;
}

function getPrintSignatory() {
  const c = getAppConfig();
  const orgAddress = trimOrEmpty(c.orgAddress) || DEFAULT_ORG_ADDRESS;
  const orgEmail = trimOrEmpty(c.orgEmail) || DEFAULT_ORG_EMAIL;
  return {
    orgName: c.orgName || DEFAULT_ORG_NAME,
    pimpinan_nama: resolvePrintSignatoryText(c.orgSignatoryName),
    pimpinan_jabatan: resolvePrintSignatoryText(c.orgSignatoryTitle),
    pimpinan_alamat: orgAddress,
    org_address: orgAddress,
    org_email: orgEmail,
    org_contact: getOrgContactLine(),
    lokasi_cetak: c.orgPrintLocation
  };
}

function getOrgName() {
  return getAppConfig().orgName;
}

function getOrgContactLine() {
  const c = getAppConfig();
  const addr = trimOrEmpty(c.orgAddress) || DEFAULT_ORG_ADDRESS;
  const email = trimOrEmpty(c.orgEmail) || DEFAULT_ORG_EMAIL;
  return email ? `${addr} Email : ${email}` : addr;
}

module.exports = {
  getAppConfig,
  getPublicAppConfig,
  getPrintSignatory,
  getOrgName,
  getOrgContactLine,
  resolvePrintSignatoryText,
  PRINT_SIGNATORY_PLACEHOLDER,
  DEFAULT_ORG_NAME,
  DEFAULT_ORG_ADDRESS,
  DEFAULT_ORG_EMAIL,
  DEFAULT_APP_NAME,
  DEFAULT_LOGIN_SUBTITLE
};
