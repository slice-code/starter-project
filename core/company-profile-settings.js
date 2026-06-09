/**
 * Pengaturan profil perusahaan — hanya Owner (super_admin).
 * Simpan ke config/company-profile.json via API.
 */
function initCompanyProfileSettings(container) {
  if (!container) return;

  const FIELDS = [
    {
      key: 'appName',
      label: 'Nama aplikasi',
      hint: 'Tampil di navbar dan sidebar',
      required: true
    },
    {
      key: 'appTitle',
      label: 'Judul halaman browser',
      hint: 'Kosongkan untuk mengikuti nama aplikasi'
    },
    {
      key: 'orgName',
      label: 'Nama perusahaan (PT)',
      hint: 'Digunakan di header cetak surat',
      required: true
    },
    {
      key: 'orgSignatoryName',
      label: 'Nama direktur',
      hint: 'Digunakan di blok tanda tangan cetak surat. Kosong = "-"'
    },
    {
      key: 'orgSignatoryTitle',
      label: 'Jabatan direktur',
      hint: 'Contoh: Direktur. Kosong = "-"'
    },
    {
      key: 'orgAddress',
      label: 'Alamat perusahaan',
      type: 'textarea',
      hint: 'Header biodata & blok tanda tangan cetak. Contoh: Jl. Contoh No. 1 … Kode pos 12345'
    },
    {
      key: 'orgEmail',
      label: 'Email perusahaan',
      hint: 'Email kontak di header biodata/cetak. Contoh: info@contoh-pjtki.co.id'
    },
    {
      key: 'orgPrintLocation',
      label: 'Lokasi cetak surat',
      hint: 'Contoh: Kota Contoh, Provinsi Contoh'
    },
    {
      key: 'loginSubtitle',
      label: 'Subtitle halaman login',
      type: 'textarea'
    },
    {
      key: 'adminEmail',
      label: 'Email admin utama',
      hint: 'Untuk demo login (bukan password)'
    },
    {
      key: 'adminName',
      label: 'Nama admin utama'
    }
  ];

  let profile = {};
  let loading = true;
  let saving = false;
  let message = '';
  let messageType = 'info';

  function injectStyles() {
    if (document.getElementById('company-profile-settings-styles')) return;
    const style = document.createElement('style');
    style.id = 'company-profile-settings-styles';
    style.textContent = `
      .company-profile-settings { font-family: inherit; color: #1e293b; }
      .company-profile-settings .settings-header { margin-bottom: 1.5rem; }
      .company-profile-settings .settings-header h2 { margin: 0 0 0.25rem; font-size: 1.5rem; }
      .company-profile-settings .subtitle { margin: 0; color: #64748b; font-size: 0.9rem; }
      .company-profile-settings .settings-card {
        background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 1.25rem;
      }
      .company-profile-settings .form-grid {
        display: grid; gap: 1rem;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      }
      .company-profile-settings .form-field { display: flex; flex-direction: column; gap: 0.35rem; }
      .company-profile-settings .form-field.full { grid-column: 1 / -1; }
      .company-profile-settings label { font-size: 0.875rem; font-weight: 600; color: #334155; }
      .company-profile-settings input,
      .company-profile-settings textarea {
        width: 100%; padding: 0.55rem 0.65rem; border: 1px solid #cbd5e1;
        border-radius: 8px; font-size: 0.875rem; font-family: inherit;
      }
      .company-profile-settings textarea { min-height: 88px; resize: vertical; }
      .company-profile-settings .field-hint { font-size: 0.75rem; color: #94a3b8; margin: 0; }
      .company-profile-settings .actions {
        margin-top: 1.25rem; display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center;
      }
      .company-profile-settings .btn {
        padding: 0.55rem 1.1rem; border-radius: 8px; border: none; cursor: pointer; font-size: 0.875rem;
      }
      .company-profile-settings .btn-primary { background: #2563eb; color: #fff; }
      .company-profile-settings .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
      .company-profile-settings .owner-hint {
        margin-top: 1rem; padding: 0.75rem 1rem; background: #f8fafc;
        border: 1px dashed #cbd5e1; border-radius: 8px; font-size: 0.8rem; color: #64748b;
      }
      .company-profile-settings .message {
        margin-top: 0.75rem; padding: 0.65rem 0.85rem; border-radius: 8px; font-size: 0.85rem;
      }
      .company-profile-settings .message.success { background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; }
      .company-profile-settings .message.error { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }
      .company-profile-settings .loading { color: #64748b; padding: 2rem; text-align: center; }
    `;
    document.head.appendChild(style);
  }

  function setMessage(text, type = 'info') {
    message = text;
    messageType = type;
    render();
  }

  async function loadProfile() {
    loading = true;
    render();
    try {
      const res = await fetch('/api/company-profile', { credentials: 'include' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Gagal memuat profil');
      profile = json.data || {};
    } catch (err) {
      setMessage(err.message || 'Gagal memuat profil perusahaan', 'error');
    } finally {
      loading = false;
      render();
    }
  }

  async function saveProfile() {
    if (saving) return;
    saving = true;
    message = '';
    render();
    try {
      const res = await fetch('/api/company-profile', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile)
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Gagal menyimpan profil');
      profile = json.data || profile;
      setMessage('Profil perusahaan berhasil disimpan.', 'success');

      if (json.data?.appTitle) {
        document.title = json.data.appTitle;
      } else if (json.data?.appName) {
        document.title = json.data.appName;
      }
      const title = json.data?.appName || json.data?.appTitle;
      if (title && typeof layout !== 'undefined' && layout.setNavbarTitle) {
        layout.setNavbarTitle(title);
      }
    } catch (err) {
      setMessage(err.message || 'Gagal menyimpan profil', 'error');
    } finally {
      saving = false;
      render();
    }
  }

  function onInput(key, value) {
    profile = { ...profile, [key]: value };
  }

  function renderField(field) {
    const wrap = document.createElement('div');
    wrap.className = `form-field${field.type === 'textarea' ? ' full' : ''}`;

    const label = document.createElement('label');
    label.textContent = field.label;
    label.setAttribute('for', `cp-${field.key}`);
    wrap.appendChild(label);

    let input;
    if (field.type === 'textarea') {
      input = document.createElement('textarea');
      input.rows = 3;
    } else {
      input = document.createElement('input');
      input.type = 'text';
    }
    input.id = `cp-${field.key}`;
    input.value = profile[field.key] || '';
    input.disabled = loading || saving;
    input.addEventListener('input', (e) => onInput(field.key, e.target.value));
    wrap.appendChild(input);

    if (field.hint) {
      const hint = document.createElement('p');
      hint.className = 'field-hint';
      hint.textContent = field.hint;
      wrap.appendChild(hint);
    }

    return wrap;
  }

  function render() {
    container.innerHTML = '';
    injectStyles();

    const root = document.createElement('div');
    root.className = 'company-profile-settings';

    const header = document.createElement('div');
    header.className = 'settings-header';
    header.innerHTML = `
      <h2>Profil Perusahaan</h2>
      <p class="subtitle">Branding aplikasi, identitas PT, dan data penandatangan cetak surat.</p>
    `;
    root.appendChild(header);

    if (loading) {
      const loadEl = document.createElement('div');
      loadEl.className = 'loading';
      loadEl.textContent = 'Memuat profil perusahaan…';
      root.appendChild(loadEl);
      container.appendChild(root);
      return;
    }

    const card = document.createElement('div');
    card.className = 'settings-card';

    const grid = document.createElement('div');
    grid.className = 'form-grid';
    FIELDS.forEach((field) => grid.appendChild(renderField(field)));
    card.appendChild(grid);

    const actions = document.createElement('div');
    actions.className = 'actions';
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'btn btn-primary';
    saveBtn.textContent = saving ? 'Menyimpan…' : 'Simpan perubahan';
    saveBtn.disabled = saving;
    saveBtn.addEventListener('click', saveProfile);
    actions.appendChild(saveBtn);
    card.appendChild(actions);

    if (message) {
      const msg = document.createElement('div');
      msg.className = `message ${messageType === 'error' ? 'error' : 'success'}`;
      msg.textContent = message;
      card.appendChild(msg);
    }

    const hint = document.createElement('div');
    hint.className = 'owner-hint';
    hint.innerHTML =
      'Pengaturan ini hanya untuk <strong>Owner</strong>. Data disimpan di ' +
      '<code>config/company-profile.json</code>. Password admin tidak diubah dari halaman ini.';
    card.appendChild(hint);

    root.appendChild(card);
    container.appendChild(root);
  }

  loadProfile();
}
