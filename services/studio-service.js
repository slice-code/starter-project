// ============================================
// Studio Service - Backend API for CRUD Builder
// ============================================
// Handles file I/O, validation, and deployment
// ============================================

const path = require('path');
const fs = require('fs').promises;
const CrudBuilderEngine = require('../core/crud-builder-engine');

let _dbApi = null;
function getDbApi() {
  if (!_dbApi) {
    try {
      _dbApi = require('../database');
    } catch (_) {
      _dbApi = null;
    }
  }
  return _dbApi;
}

const StudioService = {
  /**
   * List all CRUD configurations
   */
  async listCrudConfigs() {
    try {
      const configs = await CrudBuilderEngine.listCrudConfigs();
      return {
        success: true,
        data: configs,
        total: configs.length
      };
    } catch (error) {
      console.error('StudioService.listCrudConfigs error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  /**
   * Get single CRUD configuration
   */
  async getCrudConfig(resourceName) {
    try {
      const result = await CrudBuilderEngine.getCrudConfig(resourceName);
      return result;
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  },

  /**
   * Create or update CRUD configuration
   */
  async saveCrudConfig(config, user = null) {
    try {
      // Validate
      const validation = CrudBuilderEngine.validate(config);
      if (!validation.valid) {
        return {
          success: false,
          errors: validation.errors
        };
      }

      // Check if exists (update vs create)
      const existing = await CrudBuilderEngine.getCrudConfig(config.resource);
      const isUpdate = existing.success;

      // Deploy
      const result = await CrudBuilderEngine.deploy(config, {
        backup: true,
        user: user
      });

      let migrationPreview = null;
      if (result.success && !isUpdate) {
        try {
          const built = CrudBuilderEngine.buildCrudDefinition(config);
          if (built.success) {
            migrationPreview = CrudBuilderEngine.generateMigrationSQL(built.schema, 'postgresql');
          }
        } catch (_) { /* ignore */ }
      }

      return {
        ...result,
        isUpdate,
        migrationPreview
      };
    } catch (error) {
      console.error('StudioService.saveCrudConfig error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  /**
   * Delete CRUD configuration
   */
  async deleteCrudConfig(resourceName, user = null) {
    try {
      const result = await CrudBuilderEngine.deleteCrud(resourceName, {
        backup: true,
        user
      });

      return result;
    } catch (error) {
      console.error('StudioService.deleteCrudConfig error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  /**
   * Generate migration SQL
   */
  async generateMigration(resourceName, dbType = 'postgresql') {
    try {
      const result = await CrudBuilderEngine.getCrudConfig(resourceName);
      if (!result.success) {
        return result;
      }

      const sql = CrudBuilderEngine.generateMigrationSQL(result.schema, dbType);

      return {
        success: true,
        sql,
        schema: result.schema,
        dbType
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  },

  /**
   * Get deploy history
   */
  async getDeployHistory() {
    const historyPath = path.join(process.cwd(), 'data', 'studio-deploy-history.json');

    try {
      const content = await fs.readFile(historyPath, 'utf8');
      const history = JSON.parse(content);

      return {
        success: true,
        data: history,
        total: history.length
      };
    } catch (error) {
      return {
        success: true,
        data: [],
        total: 0
      };
    }
  },

  /**
   * Validate CRUD configuration without saving
   */
  async validateConfig(config) {
    const validation = CrudBuilderEngine.validate(config);
    return {
      success: true,
      validation
    };
  },

  /**
   * Preview CRUD (generate schema + appjson without saving)
   */
  async previewConfig(config) {
    const result = CrudBuilderEngine.buildCrudDefinition(config);
    if (result.success && result.schema) {
      result.migrationSql = CrudBuilderEngine.generateMigrationSQL(result.schema, 'postgresql');
    }
    return result;
  },

  /**
   * Import CRUD from JSON
   */
  async importCrud(schemaJson, appjsonJson, user = null) {
    try {
      const resourceName = schemaJson.name || appjsonJson.config?.resource;
      if (!resourceName) {
        return {
          success: false,
          error: 'Missing resource name in schema or appjson'
        };
      }

      // Validate both
      const schemaValidation = CrudBuilderEngine.validate({
        resource: resourceName,
        title: schemaJson.label || appjsonJson.config?.title,
        fields: schemaJson.fields || []
      });

      if (!schemaValidation.valid) {
        return {
          success: false,
          errors: schemaValidation.errors
        };
      }

      // Save files
      const baseDir = process.cwd();
      const schemaPath = path.join(baseDir, 'schema', `${resourceName}.json`);
      const appjsonPath = path.join(baseDir, 'appjson', `${resourceName}.json`);

      await fs.writeFile(schemaPath, JSON.stringify(schemaJson, null, 2), 'utf8');
      await fs.writeFile(appjsonPath, JSON.stringify(appjsonJson, null, 2), 'utf8');

      // Log
      await CrudBuilderEngine.logDeploy('import', {
        resource: resourceName,
        title: schemaJson.label,
        fields: schemaJson.fields
      }, user);

      return {
        success: true,
        message: `CRUD "${resourceName}" imported successfully`,
        resource: resourceName
      };
    } catch (error) {
      console.error('StudioService.importCrud error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  /**
   * Export CRUD as JSON
   */
  async exportCrud(resourceName) {
    try {
      const result = await CrudBuilderEngine.getCrudConfig(resourceName);
      if (!result.success) {
        return result;
      }

      return {
        success: true,
        data: {
          schema: result.schema,
          appjson: result.appjson
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  },

  /**
   * Clone existing CRUD
   */
  async cloneCrud(resourceName, newResourceName, user = null) {
    try {
      // Get existing
      const existing = await CrudBuilderEngine.getCrudConfig(resourceName);
      if (!existing.success) {
        return existing;
      }

      // Update resource name
      const schema = {
        ...existing.schema,
        name: newResourceName,
        label: existing.schema.label + ' (Clone)'
      };

      const appjson = {
        ...existing.appjson,
        path: '/' + newResourceName.replace(/_/g, '-'),
        config: {
          ...existing.appjson.config,
          resource: newResourceName,
          title: existing.appjson.config.title + ' (Clone)'
        }
      };

      // Import as new
      return await this.importCrud(schema, appjson, user);
    } catch (error) {
      console.error('StudioService.cloneCrud error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  /** List all schema/*.json definitions */
  async listSchemas() {
    try {
      const data = await CrudBuilderEngine.listAllSchemas();
      return { success: true, data, total: data.length };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  /** Get schema JSON + optional DB status */
  async getSchemaDetail(resourceName, withDb = true) {
    try {
      const result = await CrudBuilderEngine.getSchemaOnly(resourceName);
      if (!result.success) return result;

      const out = { success: true, schema: result.schema, hasCrud: false };
      const crud = await CrudBuilderEngine.getCrudConfig(resourceName);
      out.hasCrud = crud.success;

      if (withDb) {
        const db = getDbApi();
        if (db?.getSchemaDbStatus) {
          out.dbStatus = await db.getSchemaDbStatus(resourceName);
        }
      }
      return out;
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  /** Save schema JSON file (schema/ only) */
  async saveSchema(schemaJson, user = null) {
    try {
      if (!schemaJson?.name) {
        return { success: false, error: 'Schema name is required' };
      }
      const result = await CrudBuilderEngine.saveSchemaFile(schemaJson, { backup: true });
      if (result.success) {
        await CrudBuilderEngine.logDeploy('schema_save', {
          resource: schemaJson.name,
          title: schemaJson.label,
          fields: schemaJson.fields
        }, user);
      }
      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  /** Compare schema JSON vs live DB columns */
  async compareSchemaDb(resourceName) {
    const db = getDbApi();
    if (!db?.getSchemaDbStatus) {
      return { success: false, error: 'Database module not available' };
    }
    return db.getSchemaDbStatus(resourceName);
  },

  /** Generate CREATE/ALTER SQL from schema vs DB */
  async generateSchemaSyncSql(resourceName) {
    const db = getDbApi();
    if (!db?.getSchemaDbStatus) {
      return { success: false, error: 'Database module not available' };
    }
    const status = await db.getSchemaDbStatus(resourceName);
    if (!status.success) return status;
    return {
      success: true,
      sql: status.syncSql,
      dbStatus: status
    };
  },

  /** Apply schema to DB (CREATE + ADD missing columns) */
  async applySchemaSync(resourceName, user = null) {
    const db = getDbApi();
    if (!db?.syncSingleSchemaTable) {
      return { success: false, error: 'Database module not available' };
    }
    try {
      const result = await db.syncSingleSchemaTable(resourceName);
      if (result.success) {
        await CrudBuilderEngine.logDeploy('schema_sync', {
          resource: resourceName,
          title: resourceName,
          fields: result.addedColumns || []
        }, user);
      }
      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};

module.exports = StudioService;
