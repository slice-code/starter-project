// ============================================
// SchemaManager - Database Schema Management
// ============================================
// Handles database schema definitions and migrations
// ============================================

const SchemaManager = (function() {
  
  // Database type adapters
  const adapters = {
    mysql: {
      // Convert schema to MySQL CREATE TABLE
      toSQL(schema) {
        const fields = schema.fields.map(field => {
          let sql = `  ${field.name} ${this.mapType(field)}`;
          
          if (field.required) sql += ' NOT NULL';
          if (field.autoIncrement) sql += ' AUTO_INCREMENT';
          if (field.defaultValue !== undefined) {
            sql += ` DEFAULT ${this.formatDefault(field.defaultValue)}`;
          }
          
          return sql;
        });

        // Add timestamps
        if (schema.timestamps) {
          if (schema.timestamps.createdAt) {
            fields.push(`  ${schema.timestamps.createdAt} TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
          }
          if (schema.timestamps.updatedAt) {
            fields.push(`  ${schema.timestamps.updatedAt} TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`);
          }
        }

        // Add primary key
        const primaryKey = schema.primaryKey || 'id';
        fields.push(`  PRIMARY KEY (\`${primaryKey}\`)`);

        return `CREATE TABLE ${schema.name} (\n${fields.join(',\n')}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`;
      },

      mapType(field) {
        const typeMap = {
          'text': 'VARCHAR(255)',
          'email': 'VARCHAR(255)',
          'password': 'VARCHAR(255)',
          'textarea': 'TEXT',
          'number': field.name.includes('price') || field.name.includes('amount') ? 'DECIMAL(10,2)' : 'INT',
          'boolean': 'TINYINT(1)',
          'date': 'DATE',
          'datetime': 'DATETIME',
          'time': 'TIME',
          'select': 'VARCHAR(255)',
          'radio': 'VARCHAR(50)',
          'checkbox': 'TINYINT(1)',
          'url': 'VARCHAR(500)',
          'file': 'VARCHAR(500)',
          'image': 'VARCHAR(500)',
          'json': 'JSON',
          'enum': `ENUM(${field.options?.map(o => `'${o.value}'`).join(', ') || ''})`
        };
        return typeMap[field.type] || 'VARCHAR(255)';
      },

      formatDefault(value) {
        if (value === null) return 'NULL';
        if (typeof value === 'string') return `'${value}'`;
        return String(value);
      }
    },

    postgresql: {
      toSQL(schema) {
        const fields = schema.fields.map(field => {
          let sql = `  "${field.name}" ${this.mapType(field)}`;
          
          if (field.required) sql += ' NOT NULL';
          if (field.autoIncrement) sql += ' GENERATED ALWAYS AS IDENTITY';
          if (field.defaultValue !== undefined) {
            sql += ` DEFAULT ${this.formatDefault(field.defaultValue)}`;
          }
          
          return sql;
        });

        if (schema.timestamps) {
          if (schema.timestamps.createdAt) {
            fields.push(`  "${schema.timestamps.createdAt}" TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
          }
          if (schema.timestamps.updatedAt) {
            fields.push(`  "${schema.timestamps.updatedAt}" TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
          }
        }

        const primaryKey = schema.primaryKey || 'id';
        fields.push(`  PRIMARY KEY ("${primaryKey}")`);

        return `CREATE TABLE ${schema.name} (\n${fields.join(',\n')}\n);`;
      },

      mapType(field) {
        const typeMap = {
          'text': 'VARCHAR(255)',
          'email': 'VARCHAR(255)',
          'password': 'VARCHAR(255)',
          'textarea': 'TEXT',
          'number': field.name.includes('price') || field.name.includes('amount') ? 'DECIMAL(10,2)' : 'INTEGER',
          'boolean': 'BOOLEAN',
          'date': 'DATE',
          'datetime': 'TIMESTAMP',
          'time': 'TIME',
          'select': 'VARCHAR(255)',
          'radio': 'VARCHAR(50)',
          'checkbox': 'BOOLEAN',
          'url': 'VARCHAR(500)',
          'file': 'VARCHAR(500)',
          'image': 'VARCHAR(500)',
          'json': 'JSONB',
          'enum': `VARCHAR(50)`
        };
        return typeMap[field.type] || 'VARCHAR(255)';
      },

      formatDefault(value) {
        if (value === null) return 'NULL';
        if (typeof value === 'string') return `'${value}'`;
        return String(value);
      }
    },

    sqlite: {
      toSQL(schema) {
        const fields = schema.fields.map(field => {
          let sql = `  ${field.name} ${this.mapType(field)}`;
          
          if (field.required) sql += ' NOT NULL';
          if (field.defaultValue !== undefined) {
            sql += ` DEFAULT ${this.formatDefault(field.defaultValue)}`;
          }
          
          return sql;
        });

        if (schema.timestamps) {
          if (schema.timestamps.createdAt) {
            fields.push(`  ${schema.timestamps.createdAt} DATETIME DEFAULT CURRENT_TIMESTAMP`);
          }
          if (schema.timestamps.updatedAt) {
            fields.push(`  ${schema.timestamps.updatedAt} DATETIME DEFAULT CURRENT_TIMESTAMP`);
          }
        }

        const primaryKey = schema.primaryKey || 'id';
        fields.push(`  PRIMARY KEY ("${primaryKey}")`);

        return `CREATE TABLE ${schema.name} (\n${fields.join(',\n')}\n);`;
      },

      mapType(field) {
        const typeMap = {
          'text': 'TEXT',
          'email': 'TEXT',
          'password': 'TEXT',
          'textarea': 'TEXT',
          'number': field.name.includes('price') || field.name.includes('amount') ? 'REAL' : 'INTEGER',
          'boolean': 'INTEGER',
          'date': 'TEXT',
          'datetime': 'TEXT',
          'time': 'TEXT',
          'select': 'TEXT',
          'radio': 'TEXT',
          'checkbox': 'INTEGER',
          'url': 'TEXT',
          'file': 'TEXT',
          'image': 'TEXT',
          'json': 'TEXT',
          'enum': 'TEXT'
        };
        return typeMap[field.type] || 'TEXT';
      },

      formatDefault(value) {
        if (value === null) return 'NULL';
        if (typeof value === 'string') return `'${value}'`;
        return String(value);
      }
    }
  };

  // Storage for loaded schemas
  let schemas = {};
  let currentAdapter = 'mysql';

  return {
    // Set database adapter
    setAdapter(adapter) {
      if (adapters[adapter]) {
        currentAdapter = adapter;
      } else {
        throw new Error(`Unknown adapter: ${adapter}. Available: ${Object.keys(adapters).join(', ')}`);
      }
    },

    // Get available adapters
    getAdapters() {
      return Object.keys(adapters);
    },

    // Load schema from API
    async loadFromAPI(baseUrl, name) {
      try {
        const response = await fetch(`${baseUrl}/schema/${name}`);
        const result = await response.json();
        
        if (result.success) {
          this.register(result.data);
          return result.data;
        }
        throw new Error(result.error);
      } catch (error) {
        throw new Error(`Failed to load schema '${name}': ${error.message}`);
      }
    },

    // Load all schemas from API
    async loadAllFromAPI(baseUrl) {
      try {
        const response = await fetch(`${baseUrl}/schema`);
        const result = await response.json();
        
        if (result.success) {
          const loadedSchemas = [];
          for (const schemaInfo of result.data) {
            const schema = await this.loadFromAPI(baseUrl, schemaInfo.name);
            loadedSchemas.push(schema);
          }
          return loadedSchemas;
        }
        throw new Error(result.error);
      } catch (error) {
        throw new Error(`Failed to load schemas: ${error.message}`);
      }
    },

    // Register a schema locally
    register(schema) {
      if (!schema.name) {
        throw new Error('Schema must have a name');
      }
      schemas[schema.name] = schema;
    },

    // Get a registered schema
    get(name) {
      return schemas[name];
    },

    // Get all registered schemas
    getAll() {
      return { ...schemas };
    },

    // Check if schema exists
    has(name) {
      return !!schemas[name];
    },

    // Generate SQL for a schema
    toSQL(name) {
      const schema = schemas[name];
      if (!schema) {
        throw new Error(`Schema '${name}' not found`);
      }

      const adapter = adapters[currentAdapter];
      if (!adapter) {
        throw new Error(`Adapter '${currentAdapter}' not found`);
      }

      return adapter.toSQL(schema);
    },

    // Generate SQL for all schemas
    toSQLAll() {
      const results = {};
      for (const name in schemas) {
        results[name] = this.toSQL(name);
      }
      return results;
    },

    // Generate migration file content
    generateMigration(schemaName) {
      const schema = schemas[schemaName];
      if (!schema) {
        throw new Error(`Schema '${schemaName}' not found`);
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const migrationName = `${timestamp}_create_${schema.name}_table`;
      
      const up = this.toSQL(schemaName);
      const down = `DROP TABLE IF EXISTS ${schema.name};`;

      return {
        name: migrationName,
        up,
        down,
        timestamp
      };
    },

    // Generate all migrations
    generateMigrations() {
      const migrations = {};
      for (const name in schemas) {
        migrations[name] = this.generateMigration(name);
      }
      return migrations;
    },

    // Validate schema structure
    validate(schema) {
      const errors = [];

      if (!schema.name) {
        errors.push('Schema must have a name');
      }

      if (!schema.fields || !Array.isArray(schema.fields)) {
        errors.push('Schema must have fields array');
      } else {
        schema.fields.forEach((field, index) => {
          if (!field.name) {
            errors.push(`Field at index ${index} must have a name`);
          }
          if (!field.type) {
            errors.push(`Field '${field.name || index}' must have a type`);
          }
        });
      }

      return {
        valid: errors.length === 0,
        errors
      };
    },

    // Get schema summary
    getSummary(name) {
      const schema = schemas[name];
      if (!schema) return null;

      return {
        name: schema.name,
        label: schema.label,
        icon: schema.icon,
        fieldsCount: schema.fields?.length || 0,
        fields: schema.fields?.map(f => ({
          name: f.name,
          label: f.label,
          type: f.type,
          required: f.required
        })) || []
      };
    },

    // Get all schemas summary
    getAllSummaries() {
      return Object.keys(schemas).map(name => this.getSummary(name));
    }
  };
})();

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SchemaManager;
}