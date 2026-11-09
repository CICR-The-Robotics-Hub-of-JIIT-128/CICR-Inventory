const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { createClient } = require('@supabase/supabase-js');
const { loadEnv } = require('./loadEnv.cjs');

const { supabaseUrl, serviceRoleKey } = loadEnv();
const neonDatabaseUrl = process.env.NEON_DATABASE_URL;
const supabaseDatabaseUrl = process.env.SUPABASE_DB_URL;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
}

if (!neonDatabaseUrl) {
  throw new Error('NEON_DATABASE_URL is required.');
}

if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = class DummyWebSocket {};
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const neon = new Client({
  connectionString: neonDatabaseUrl,
  ssl: { rejectUnauthorized: true },
});
const supabaseDatabase = supabaseDatabaseUrl
  ? new Client({ connectionString: supabaseDatabaseUrl, ssl: { rejectUnauthorized: true } })
  : null;

const sourceTables = [
  { name: 'profiles', updatedColumn: 'updated_at' },
  { name: 'inventory_items', updatedColumn: 'updated_at' },
  { name: 'borrow_requests', updatedColumn: 'updated_at' },
  { name: 'activity_logs', updatedColumn: 'created_at' },
];

const schemaPath = path.resolve(__dirname, '../neon_backup_schema.sql');
const operationalSchemaPath = path.resolve(__dirname, '../neon_schema.sql');

function sanitizeBackupRecord(tableName, record) {
  if (tableName !== 'activity_logs' || typeof record.details !== 'string') return record;

  try {
    const details = JSON.parse(record.details);
    if (!details || typeof details !== 'object' || !Object.hasOwn(details, 'password')) return record;

    const { password, ...safeDetails } = details;
    return { ...record, details: JSON.stringify(safeDetails) };
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return {
      ...record,
      details: record.details.replace(
        /(["']password["']\s*:\s*)(["'][^"']*["'])/gi,
        '$1"[REDACTED]"'
      ),
    };
  }
}

async function fetchTable(tableName) {
  const { data, error } = await supabase.from(tableName).select('*');
  if (error) {
    throw new Error(`Failed to read ${tableName}: ${error.message}`);
  }
  return (data || []).map((record) => sanitizeBackupRecord(tableName, record));
}

async function fetchAuthUsers() {
  const users = [];
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(`Failed to read auth users: ${error.message}`);
    }

    users.push(...(data.users || []));
    if (!data.users || data.users.length < perPage) break;
    page += 1;
  }

  const hashes = new Map();
  if (supabaseDatabase) {
    const result = await supabaseDatabase.query(
      'SELECT id, encrypted_password FROM auth.users WHERE encrypted_password IS NOT NULL'
    );
    for (const row of result.rows) hashes.set(row.id, row.encrypted_password);
  } else {
    console.warn('SUPABASE_DB_URL is not configured; password hashes cannot be mirrored from auth.users.');
  }

  return users.map((user) => {
    const passwordHash = [hashes.get(user.id), user.password_hash, user.encrypted_password]
      .find((value) => typeof value === 'string' && /^\$(2[aby]?|argon2(?:id)?|7)\$/.test(value));

    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      created_at: user.created_at,
      updated_at: user.updated_at,
      last_sign_in_at: user.last_sign_in_at,
      user_metadata: user.user_metadata,
      app_metadata: user.app_metadata,
      confirmed_at: user.confirmed_at,
      ...(passwordHash ? { password_hash: passwordHash } : {}),
      password_reset_required: !passwordHash,
    };
  });
}

async function ensureSchema() {
  const schema = fs.readFileSync(schemaPath, 'utf8');
  await neon.query(schema);
  const operationalSchema = fs.readFileSync(operationalSchemaPath, 'utf8');
  await neon.query(operationalSchema);
}

async function syncRecords(tableName, updatedColumn, records) {
  try {
    await neon.query('BEGIN');
    await neon.query('DELETE FROM backup_records WHERE table_name = $1', [tableName]);

    for (const record of records) {
      const recordId = record.id;
      if (!recordId) {
        throw new Error(`A row in ${tableName} is missing its id.`);
      }

      const updatedAt = record[updatedColumn] || null;
      await neon.query(
        `INSERT INTO backup_records
          (table_name, record_id, record, source_updated_at, synced_at)
         VALUES ($1, $2, $3::jsonb, $4, NOW())
         ON CONFLICT (table_name, record_id) DO UPDATE SET
           record = EXCLUDED.record,
           source_updated_at = EXCLUDED.source_updated_at,
           synced_at = EXCLUDED.synced_at`,
        [tableName, String(recordId), JSON.stringify(record), updatedAt]
      );
    }

    await neon.query('COMMIT');
  } catch (error) {
    await neon.query('ROLLBACK');
    throw error;
  }
}

async function syncOperationalTables(tables, authUsers) {
  const rows = {
    profiles: tables.profiles,
    inventory_items: tables.inventory_items,
    borrow_requests: tables.borrow_requests,
    activity_logs: tables.activity_logs,
    auth_users: authUsers,
  };
  const definitions = [
    {
      name: 'profiles',
      columns: ['id', 'full_name', 'email', 'roll_number', 'role', 'phone', 'avatar_url', 'created_at', 'updated_at'],
    },
    {
      name: 'inventory_items',
      columns: ['id', 'name', 'category', 'sku', 'description', 'location', 'total_qty', 'available_qty', 'min_threshold', 'condition', 'status', 'image_url', 'datasheet_url', 'created_at', 'updated_at'],
    },
    {
      name: 'borrow_requests',
      columns: ['id', 'item_id', 'user_id', 'user_name', 'user_email', 'item_name', 'quantity', 'project_name', 'purpose', 'status', 'borrow_date', 'expected_return_date', 'actual_return_date', 'approved_by', 'admin_notes', 'created_at', 'updated_at'],
    },
    {
      name: 'activity_logs',
      columns: ['id', 'user_id', 'user_name', 'action', 'details', 'item_id', 'created_at'],
    },
    {
      name: 'auth_users',
      columns: ['id', 'email', 'password_hash', 'password_reset_required', 'created_at', 'updated_at'],
    },
  ];

  await neon.query('BEGIN');
  try {
    await neon.query('DELETE FROM borrow_requests');
    await neon.query('DELETE FROM activity_logs');
    await neon.query('DELETE FROM auth_users');
    await neon.query('DELETE FROM profiles');
    await neon.query('DELETE FROM inventory_items');

    for (const definition of definitions) {
      const sourceRows = rows[definition.name].filter((row) =>
        definition.name !== 'auth_users' || tables.profiles.some((profile) => profile.id === row.id)
      );
      for (const row of sourceRows) {
        const values = definition.columns.map((column) => row[column] ?? null);
        const placeholders = values.map((_, index) => `$${index + 1}`).join(', ');
        await neon.query(
          `INSERT INTO ${definition.name} (${definition.columns.join(', ')})
           VALUES (${placeholders})`,
          values
        );
      }
    }

    await neon.query('COMMIT');
  } catch (error) {
    await neon.query('ROLLBACK');
    throw error;
  }
}

async function backup() {
  await neon.connect();
  if (supabaseDatabase) await supabaseDatabase.connect();
  await ensureSchema();

  const run = await neon.query(
    `INSERT INTO backup_runs (status) VALUES ('running') RETURNING id`
  );
  const runId = run.rows[0].id;
  let totalRows = 0;

  try {
    const tableData = {};
    for (const table of sourceTables) {
      const records = await fetchTable(table.name);
      tableData[table.name] = records;
      await syncRecords(table.name, table.updatedColumn, records);
      totalRows += records.length;
      console.log(`Backed up ${records.length} ${table.name} rows.`);
    }

    const authUsers = await fetchAuthUsers();
    await syncRecords('auth_users', 'updated_at', authUsers);
    totalRows += authUsers.length;
    const hashedUsers = authUsers.filter((user) => user.password_hash).length;
    console.log(`Backed up ${authUsers.length} auth user records (${hashedUsers} password hashes mirrored).`);

    await syncOperationalTables(tableData, authUsers);
    console.log('Mirrored records into Neon operational tables.');

    await neon.query(
      `UPDATE backup_runs
       SET status = 'completed', completed_at = NOW(), row_count = $2
       WHERE id = $1`,
      [runId, totalRows]
    );
    console.log(`Neon backup completed: ${totalRows} total rows.`);
  } catch (error) {
    await neon.query(
      `UPDATE backup_runs
       SET status = 'failed', completed_at = NOW(), error = $2
       WHERE id = $1`,
      [runId, error instanceof Error ? error.message : String(error)]
    );
    throw error;
  } finally {
    await neon.end();
    if (supabaseDatabase) await supabaseDatabase.end();
  }
}

backup().catch((error) => {
  console.error('Neon backup failed:', error.message);
  process.exitCode = 1;
});
