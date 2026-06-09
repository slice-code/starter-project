// ============================================
// CRUD Builder Engine - Odoo-style CRUD Generator
// ============================================
// Generate complete CRUD (schema + appjson) from UI configuration
// ============================================

const path = require('path');
const fs = require('fs').promises;

let menuConfigService = null;
try {
  menuConfigService = require('../menu-config-service');
} catch (_) {
  /* optional in tests */
}

// Type mapping: UI type → Schema type → Form field type
const TYPE_MAP = {
  'text': { schema: 'text', form: 'text', db: 'VARCHAR(255)' },
  'long_text': { schema: 'textarea', form: 'textarea', db: 'TEXT' },
  'number': { schema: 'number', form: 'number', db: 'INTEGER' },
  'decimal': { schema: 'number', form: 'number', db: 'DECIMAL(10,2)' },
  'email': { schema: 'email', form: 'email', db: 'VARCHAR(255)' },
  'date': { schema: 'date', form: 'date', db: 'DATE' },
  'datetime': { schema: 'datetime', form: 'datetime', db: 'TIMESTAMP' },
  'boolean': { schema: 'boolean', form: 'checkbox', db: 'BOOLEAN' },
  'select': { schema: 'select', form: 'select', db: 'VARCHAR(255)' },
  'password': { schema: 'password', form: 'password', db: 'TEXT' },
  'foreign_key': { schema: 'text', form: 'select', db: 'VARCHAR(255)' },
  'url': { schema: 'url', form: 'url', db: 'VARCHAR(500)' },
  'file': { schema: 'file', form: 'file', db: 'VARCHAR(500)' },
  'image': { schema: 'image', form: 'image', db: 'VARCHAR(500)' }
};

// Default icon mapping
const DEFAULT_ICONS = {
  'text': 'fas fa-font',
  'number': 'fas fa-hashtag',
  'email': 'fas fa-envelope',
  'date': 'fas fa-calendar',
  'boolean': 'fas fa-check-square',
  'select': 'fas fa-list',
  'foreign_key': 'fas fa-link',
  'textarea': 'fas fa-align-left'
};

const CrudBuilderEngine = {
  /**
   * Generate complete CRUD definition from config
   * @param {Object} config - CRUD configuration
   * @returns {Object} { schema, appjson, validation }
   */
  buildCrudDefinition(config) {
    // Validate first
    const validation = this.validate(config);
    if (!validation.valid) {
      return { success: false, errors: validation.errors };
    }

    const schema = this.generateSchema(config);
    const appjson = this.generateAppJson(config);

    return {
      success: true,
      schema,
      appjson,
      validation
    };
  },

  /**
   * Generate database schema JSON
   */
  generateSchema(config) {
    const fields = config.fields.map((f) => {
      const typeInfo = TYPE_MAP[f.type] || TYPE_MAP.text;
      let schemaType = typeInfo.schema;
      if (f.type === 'select' && Array.isArray(f.selectOptions) && f.selectOptions.length) {
        schemaType = 'enum';
      }

      const field = {
        name: f.name,
        type: schemaType
      };

      if (f.label) field.label = f.label;
      if (f.required) field.required = true;
      if (f.defaultValue !== undefined && f.defaultValue !== '') {
        field.defaultValue = f.defaultValue;
      }
      if (f.type === 'select' && Array.isArray(f.selectOptions) && f.selectOptions.length) {
        field.options = f.selectOptions.map((o) => ({
          value: o.value,
          label: o.label || o.value
        }));
      }
      if (f.foreignKey) {
        field.foreignKey = f.foreignKey;
      }

      return field;
    });

    // Auto-add id field if not present
    if (!fields.find((f) => f.name === 'id')) {
      fields.unshift({
        name: 'id',
        type: 'number',
        autoIncrement: true
      });
    }

    const schema = {
      name: config.resource,
      label: config.title,
      icon: config.icon || 'fas fa-table',
      primaryKey: 'id',
      timestamps: {
        createdAt: 'created_at',
        updatedAt: 'updated_at'
      },
      fields
    };

    return schema;
  },

  /**
   * Generate appjson configuration
   */
  generateAppJson(config) {
    const pathName = '/' + config.resource.replace(/_/g, '-');

    // Generate table columns from fields
    const columns = config.fields
      .filter((f) => f.showInList !== false)
      .map((f) => this.getDefaultColumnConfig(f));

    // Add actions column
    columns.push({
      key: 'actions',
      type: 'actions',
      actions: config.actions || ['edit', 'delete'],
      fixed: 'right'
    });

    // Generate form block
    const formFields = config.fields
      .filter((f) => f.showInForm !== false)
      .map((f) => this.getDefaultFormFieldConfig(f));

    let formBlock;
    if (config.formLayout === 'sections' && Array.isArray(config.sections) && config.sections.length) {
      formBlock = {
        columns: config.formColumns || 2,
        gap: config.formGap || '1rem',
        ...(config.formIntro ? { intro: config.formIntro } : {}),
        ...(config.formGridLayout ? { layout: config.formGridLayout } : {}),
        ...(config.formSubmitText ? { submitText: config.formSubmitText } : {}),
        ...(config.formCancelText ? { cancelText: config.formCancelText } : {}),
        sections: config.sections.map((section, si) => ({
          title: section.title || `Section ${si + 1}`,
          ...(section.icon ? { icon: section.icon } : {}),
          fields: config.fields
            .filter((f) => f.showInForm !== false && (f.sectionIndex ?? 0) === si)
            .map((f) => this.getDefaultFormFieldConfig(f))
        }))
      };
    } else {
      formBlock = {
        columns: config.formColumns || 2,
        gap: config.formGap || '1rem',
        ...(config.formSubmitText ? { submitText: config.formSubmitText } : {}),
        ...(config.formCancelText ? { cancelText: config.formCancelText } : {}),
        fields: formFields
      };
    }

    const appjson = {
      path: pathName,
      type: 'crud',
      config: {
        resource: config.resource,
        title: config.title,
        icon: config.icon || 'fas fa-table',
        formDisplay: config.formDisplay || 'modal',
        modalSize: config.modalSize || 'large',
        table: {
          columns,
          features: {
            search: config.tableSearch !== false,
            pagination: config.tablePagination !== false,
            perPage: config.perPage || 25,
            perPageOptions: config.perPageOptions || [10, 25, 50, 100]
          }
        },
        form: formBlock
      },
      options: {
        permissions: config.permissions || ['super_admin', 'admin']
      }
    };

    return appjson;
  },

  /**
   * Get default column config based on field type
   */
  getDefaultColumnConfig(field) {
    const base = {
      key: field.name,
      label: field.label || field.name,
      sortable: field.sortable !== false,
      searchable: field.searchable === true
        || (field.searchable !== false && ['text', 'email', 'number', 'select'].includes(field.type))
    };

    if (field.columnWidth) base.width = field.columnWidth;
    else if (field.type === 'date') base.width = '120px';
    else if (field.type === 'boolean') base.width = '100px';

    if (field.columnType === 'badge' || field.type === 'select' || field.type === 'boolean') {
      base.type = 'badge';
      base.badgeMap = field.badgeMap && typeof field.badgeMap === 'object' ? field.badgeMap : {};
    }

    return base;
  },

  buildOptionsFrom(field) {
    if (field.optionsFrom?.resource) {
      const of = { ...field.optionsFrom };
      if (field.formSearchable === true) of.searchable = true;
      if (field.remoteSearch) of.remoteSearch = true;
      if (field.minSearchLength) of.minSearchLength = field.minSearchLength;
      return of;
    }
    const fk = field.foreignKey;
    if (!fk?.table) return null;
    const of = { resource: fk.table, value: fk.valueField || 'id' };
    if (fk.labelFormat) of.labelFormat = fk.labelFormat;
    if (field.formSearchable === true) of.searchable = true;
    return of;
  },

  applyFormPreserve(base, field) {
    if (!field._formPreserve || typeof field._formPreserve !== 'object') return base;
    const merged = { ...base, ...field._formPreserve };
    merged.name = base.name;
    merged.label = base.label || merged.label;
    merged.type = base.type;
    if (base.options) merged.options = base.options;
    if (base.optionsFrom) merged.optionsFrom = base.optionsFrom;
    if (base.required !== undefined) merged.required = base.required;
    return merged;
  },

  /**
   * Get default form field config
   */
  getDefaultFormFieldConfig(field) {
    const typeInfo = TYPE_MAP[field.type] || TYPE_MAP.text;
    const base = {
      name: field.name,
      label: field.label || field.name,
      type: field.customFormType || typeInfo.form
    };

    if (field.presetId) base.preset = field.presetId;

    if (field.required) base.required = true;
    if (field.defaultValue !== undefined && field.defaultValue !== '') base.default = field.defaultValue;
    if (field.helpText) base.helpText = field.helpText;
    if (field.placeholder) base.placeholder = field.placeholder;

    if (field.colspan && Number(field.colspan) > 1) base.colspan = Number(field.colspan);
    else if (field.type === 'long_text' || field.type === 'textarea') base.colspan = 2;

    if (field.type === 'long_text' && field.rows) base.rows = Number(field.rows) || 3;

    if (field.type === 'select' && Array.isArray(field.selectOptions) && field.selectOptions.length) {
      base.options = field.selectOptions.map((o) => ({
        value: o.value,
        label: o.label || o.value
      }));
    }

    if (field.type === 'foreign_key') {
      base.type = 'select';
      const of = this.buildOptionsFrom(field);
      if (of) base.optionsFrom = of;
    }

    return this.applyFormPreserve(base, field);
  },

  /**
   * Validate CRUD configuration
   */
  validate(config) {
    const errors = [];

    // Required fields
    if (!config.resource) {
      errors.push('Resource name is required');
    } else {
      // Validate resource name format
      if (!/^[a-z][a-z0-9_]*$/.test(config.resource)) {
        errors.push('Resource name must start with lowercase letter and contain only lowercase letters, numbers, and underscores');
      }
    }

    if (!config.title) {
      errors.push('Title is required');
    }

    if (!config.fields || !Array.isArray(config.fields)) {
      errors.push('Fields array is required');
    } else if (config.fields.length === 0) {
      errors.push('At least one field is required');
    } else {
      // Validate each field
      const fieldNames = new Set();
      config.fields.forEach((field, idx) => {
        if (!field.name) {
          errors.push(`Field at index ${idx} must have a name`);
        } else {
          // Check for duplicates
          if (fieldNames.has(field.name)) {
            errors.push(`Duplicate field name: ${field.name}`);
          }
          fieldNames.add(field.name);

          // Validate field name format
          if (!/^[a-z][a-z0-9_]*$/.test(field.name)) {
            errors.push(`Field "${field.name}" must start with lowercase letter and contain only lowercase letters, numbers, and underscores`);
          }
        }

        if (!field.type) {
          errors.push(`Field "${field.name || idx}" must have a type`);
        } else if (!TYPE_MAP[field.type]) {
          errors.push(`Field "${field.name || idx}" has invalid type: ${field.type}`);
        }

        if (field.type === 'select' && (!field.selectOptions || !field.selectOptions.length)) {
          errors.push(`Field "${field.name}" is select but has no options`);
        }

        if (field.type === 'foreign_key' && !field.foreignKey && !field.optionsFrom) {
          errors.push(`Field "${field.name}" is foreign_key but missing lookup configuration`);
        }
      });
    }

    return {
      valid: errors.length === 0,
      errors
    };
  },

  /**
   * Deploy CRUD configuration to filesystem
   */
  async deploy(config, options = {}) {
    const { baseDir = process.cwd(), backup = true } = options;

    // Build definitions
    const result = this.buildCrudDefinition(config);
    if (!result.success) {
      return { success: false, errors: result.errors };
    }

    const schemaPath = path.join(baseDir, 'schema', `${config.resource}.json`);
    const appjsonPath = path.join(baseDir, 'appjson', `${config.resource}.json`);

    try {
      // Backup existing files if they exist
      if (backup) {
        await this.backupFile(schemaPath);
        await this.backupFile(appjsonPath);
      }

      // Write schema file
      await fs.writeFile(schemaPath, JSON.stringify(result.schema, null, 2), 'utf8');

      // Write appjson file
      await fs.writeFile(appjsonPath, JSON.stringify(result.appjson, null, 2), 'utf8');

      // Log deployment
      await this.logDeploy('create', config, options.user);

      if (menuConfigService?.clearResourcePathMapCache) {
        menuConfigService.clearResourcePathMapCache();
      }

      let menuRegistration = null;
      if (config.menuRegister?.enabled && menuConfigService?.registerCrudMenuPath) {
        try {
          menuRegistration = menuConfigService.registerCrudMenuPath({
            resource: config.resource,
            path: config.pagePath || ('/' + config.resource.replace(/_/g, '-')),
            title: config.title,
            icon: config.icon,
            groupName: config.menuRegister.groupName || 'Data Master',
            roles: config.menuRegister.menuRoles || config.permissions || []
          });
        } catch (menuErr) {
          console.warn('[Studio] Menu registration failed:', menuErr.message);
          menuRegistration = { success: false, error: menuErr.message };
        }
      }

      return {
        success: true,
        message: `CRUD "${config.title}" deployed successfully`,
        files: {
          schema: schemaPath,
          appjson: appjsonPath
        },
        menuRegistration
      };
    } catch (error) {
      console.error('Deploy error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  /**
   * Update existing CRUD configuration
   */
  async update(config, options = {}) {
    const { baseDir = process.cwd(), backup = true } = options;

    const schemaPath = path.join(baseDir, 'schema', `${config.resource}.json`);
    const appjsonPath = path.join(baseDir, 'appjson', `${config.resource}.json`);

    // Check if files exist
    try {
      await fs.access(schemaPath);
      await fs.access(appjsonPath);
    } catch {
      return {
        success: false,
        error: `CRUD "${config.resource}" not found. Use deploy() to create new.`
      };
    }

    return this.deploy(config, { ...options, backup: true });
  },

  /**
   * Delete CRUD configuration
   */
  async deleteCrud(resourceName, options = {}) {
    const { baseDir = process.cwd(), backup = true } = options;

    const schemaPath = path.join(baseDir, 'schema', `${resourceName}.json`);
    const appjsonPath = path.join(baseDir, 'appjson', `${resourceName}.json`);

    try {
      // Backup before delete
      if (backup) {
        await this.backupFile(schemaPath);
        await this.backupFile(appjsonPath);
      }

      // Delete files
      await fs.unlink(schemaPath);
      await fs.unlink(appjsonPath);

      // Log deletion
      await this.logDeploy('delete', { resource: resourceName }, options.user);

      return {
        success: true,
        message: `CRUD "${resourceName}" deleted successfully`
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  },

  /**
   * Backup file before modification
   */
  async backupFile(filePath) {
    try {
      await fs.access(filePath);
      const backupPath = `${filePath}.backup-${Date.now()}`;
      await fs.copyFile(filePath, backupPath);
      return backupPath;
    } catch {
      // File doesn't exist, no backup needed
      return null;
    }
  },

  /**
   * Log deployment action
   */
  async logDeploy(action, config, user = null) {
    const historyPath = path.join(process.cwd(), 'data', 'studio-deploy-history.json');
    let history = [];

    try {
      const content = await fs.readFile(historyPath, 'utf8');
      history = JSON.parse(content);
    } catch {
      // File doesn't exist yet
    }

    history.push({
      action,
      resource: config.resource,
      title: config.title,
      timestamp: new Date().toISOString(),
      user: user || 'system',
      fields: config.fields ? config.fields.length : 0
    });

    // Keep last 100 entries
    if (history.length > 100) {
      history = history.slice(-100);
    }

    await fs.writeFile(historyPath, JSON.stringify(history, null, 2), 'utf8');
  },

  /**
   * List all schema JSON files (database definitions)
   */
  async listAllSchemas(options = {}) {
    const { baseDir = process.cwd() } = options;
    const schemaDir = path.join(baseDir, 'schema');
    const appjsonDir = path.join(baseDir, 'appjson');

    try {
      const files = await fs.readdir(schemaDir);
      const schemaFiles = files.filter((f) => f.endsWith('.json'));

      let appjsonSet = new Set();
      try {
        const appFiles = await fs.readdir(appjsonDir);
        appjsonSet = new Set(
          appFiles.filter((f) => f.endsWith('.json') && f !== 'form-field-presets.json').map((f) => f.replace('.json', ''))
        );
      } catch (_) { /* ignore */ }

      const items = await Promise.all(
        schemaFiles.map(async (file) => {
          const name = file.replace('.json', '');
          try {
            const content = await fs.readFile(path.join(schemaDir, file), 'utf8');
            const schema = JSON.parse(content);
            return {
              name: schema.name || name,
              label: schema.label || name,
              fieldCount: (schema.fields || []).length,
              primaryKey: schema.primaryKey || 'id',
              hasCrud: appjsonSet.has(name) || appjsonSet.has(schema.name),
              icon: schema.icon || 'fas fa-database'
            };
          } catch {
            return { name, label: name, fieldCount: 0, hasCrud: false, error: true };
          }
        })
      );

      return items
        .filter((i) => !i.error)
        .sort((a, b) => (a.label || a.name).localeCompare(b.label || b.name));
    } catch (error) {
      console.error('Error listing schemas:', error);
      return [];
    }
  },

  /**
   * Get schema JSON only
   */
  async getSchemaOnly(resourceName, options = {}) {
    const { baseDir = process.cwd() } = options;
    const schemaPath = path.join(baseDir, 'schema', `${resourceName}.json`);
    try {
      const content = await fs.readFile(schemaPath, 'utf8');
      return { success: true, schema: JSON.parse(content) };
    } catch (_) {
      /* cari by schema.name di folder */
    }
    try {
      const schemaDir = path.join(baseDir, 'schema');
      const files = await fs.readdir(schemaDir);
      for (const file of files.filter((f) => f.endsWith('.json'))) {
        const content = await fs.readFile(path.join(schemaDir, file), 'utf8');
        const schema = JSON.parse(content);
        if (schema.name === resourceName) {
          return { success: true, schema };
        }
      }
    } catch (_) { /* ignore */ }
    return { success: false, error: `Schema "${resourceName}" not found` };
  },

  /**
   * Save schema JSON file only
   */
  async saveSchemaFile(schemaJson, options = {}) {
    const { baseDir = process.cwd(), backup = true } = options;
    const name = schemaJson?.name;
    if (!name) {
      return { success: false, error: 'Schema must have a name property' };
    }
    const schemaPath = path.join(baseDir, 'schema', `${name}.json`);
    try {
      if (backup) {
        try {
          const existing = await fs.readFile(schemaPath, 'utf8');
          const backupDir = path.join(baseDir, 'data', 'studio-backups');
          await fs.mkdir(backupDir, { recursive: true });
          const ts = new Date().toISOString().replace(/[:.]/g, '-');
          await fs.writeFile(path.join(backupDir, `${name}.schema.${ts}.json`), existing, 'utf8');
        } catch (_) { /* new file */ }
      }
      await fs.writeFile(schemaPath, JSON.stringify(schemaJson, null, 2), 'utf8');
      return { success: true, message: `Schema "${name}" saved`, path: schemaPath };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  /**
   * List all CRUD configurations
   */
  async listCrudConfigs(options = {}) {
    const { baseDir = process.cwd() } = options;
    const appjsonDir = path.join(baseDir, 'appjson');

    try {
      const files = await fs.readdir(appjsonDir);
      const crudFiles = files.filter((f) => f.endsWith('.json') && f !== 'form-field-presets.json');

      const configs = await Promise.all(
        crudFiles.map(async (file) => {
          const filePath = path.join(appjsonDir, file);
          const content = await fs.readFile(filePath, 'utf8');
          const config = JSON.parse(content);

          return {
            name: file.replace('.json', ''),
            path: config.path,
            title: config.config?.title || 'Untitled',
            icon: config.config?.icon || 'fas fa-table',
            resource: config.config?.resource,
            fieldsCount: config.config?.form?.fields?.length || 0,
            formDisplay: config.config?.formDisplay,
            permissions: config.options?.permissions || []
          };
        })
      );

      return configs.sort((a, b) => a.title.localeCompare(b.title));
    } catch (error) {
      console.error('Error listing CRUD configs:', error);
      return [];
    }
  },

  /**
   * Get single CRUD configuration
   */
  async getCrudConfig(resourceName, options = {}) {
    const { baseDir = process.cwd() } = options;

    const schemaPath = path.join(baseDir, 'schema', `${resourceName}.json`);
    const appjsonPath = path.join(baseDir, 'appjson', `${resourceName}.json`);

    try {
      const [schemaContent, appjsonContent] = await Promise.all([
        fs.readFile(schemaPath, 'utf8'),
        fs.readFile(appjsonPath, 'utf8')
      ]);

      return {
        success: true,
        schema: JSON.parse(schemaContent),
        appjson: JSON.parse(appjsonContent)
      };
    } catch (error) {
      return {
        success: false,
        error: `CRUD "${resourceName}" not found`
      };
    }
  },

  /**
   * Generate migration SQL for a schema
   */
  generateMigrationSQL(schema, dbType = 'postgresql') {
    const adapters = {
      postgresql: {
        mapType: (field) => {
          const typeMap = {
            text: 'VARCHAR(255)',
            textarea: 'TEXT',
            number: field.name.includes('price') || field.name.includes('amount') ? 'DECIMAL(10,2)' : 'INTEGER',
            email: 'VARCHAR(255)',
            date: 'DATE',
            datetime: 'TIMESTAMP',
            boolean: 'BOOLEAN',
            select: 'VARCHAR(255)',
            url: 'VARCHAR(500)',
            file: 'VARCHAR(500)',
            image: 'VARCHAR(500)'
          };
          return typeMap[field.type] || 'VARCHAR(255)';
        }
      },
      sqlite: {
        mapType: (field) => {
          const typeMap = {
            text: 'TEXT',
            textarea: 'TEXT',
            number: 'INTEGER',
            email: 'TEXT',
            date: 'TEXT',
            datetime: 'TEXT',
            boolean: 'INTEGER',
            select: 'TEXT',
            url: 'TEXT',
            file: 'TEXT',
            image: 'TEXT'
          };
          return typeMap[field.type] || 'TEXT';
        }
      }
    };

    const adapter = adapters[dbType] || adapters.postgresql;

    const fields = schema.fields.map((field) => {
      let sql = `  "${field.name}" ${adapter.mapType(field)}`;

      if (field.required) sql += ' NOT NULL';
      if (field.autoIncrement) sql += ' GENERATED ALWAYS AS IDENTITY';
      if (field.defaultValue !== undefined) {
        const val = typeof field.defaultValue === 'string' ? `'${field.defaultValue}'` : field.defaultValue;
        sql += ` DEFAULT ${val}`;
      }

      return sql;
    });

    // Add timestamps
    fields.push('  "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
    fields.push('  "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP');

    // Add primary key
    fields.push(`  PRIMARY KEY ("${schema.primaryKey || 'id'}")`);

    return `CREATE TABLE ${schema.name} (\n${fields.join(',\n')}\n);`;
  }
};

module.exports = CrudBuilderEngine;
