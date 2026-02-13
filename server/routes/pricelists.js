const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const Papa = require('papaparse');
const XLSX = require('xlsx');
const { db } = require('../database');

// Configure multer for file uploads
const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', '..', 'uploads'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// Column name mapping - flexible matching for various common aliases
const COLUMN_ALIASES = {
  part_number: ['part_number', 'part number', 'part#', 'part #', 'partnumber', 'pn', 'part no', 'part_no', 'partno', 'item number', 'item_number', 'item#', 'item #', 'sku'],
  description: ['description', 'desc', 'name', 'part description', 'part_description', 'item description', 'item_description', 'part name', 'part_name'],
  category: ['category', 'cat', 'type', 'part type', 'part_type', 'group', 'part_category'],
  unit_price: ['unit_price', 'unit price', 'price', 'cost', 'unit cost', 'unit_cost', 'list price', 'list_price', 'amount', 'rate'],
  unit: ['unit', 'uom', 'unit of measure', 'unit_of_measure', 'measure'],
  applicable_models: ['applicable_models', 'applicable models', 'models', 'model', 'applies to', 'applies_to', 'applicable', 'for models', 'for_models']
};

function normalizeColumnName(header) {
  const lower = header.trim().toLowerCase().replace(/[^a-z0-9\s#]/g, '').trim();
  for (const [canonical, aliases] of Object.entries(COLUMN_ALIASES)) {
    if (aliases.includes(lower)) {
      return canonical;
    }
  }
  return null; // Unknown column
}

function mapRowToItem(row, columnMap) {
  const item = {};
  for (const [originalHeader, canonicalName] of Object.entries(columnMap)) {
    if (canonicalName && row[originalHeader] !== undefined && row[originalHeader] !== null && row[originalHeader] !== '') {
      item[canonicalName] = row[originalHeader];
    }
  }
  return item;
}

function parseFileData(filePath, originalName) {
  const ext = path.extname(originalName).toLowerCase();

  if (ext === '.csv') {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const parsed = Papa.parse(fileContent, { header: true, skipEmptyLines: true, dynamicTyping: true });
    return parsed.data;
  } else if (ext === '.xlsx' || ext === '.xls') {
    const workbook = XLSX.readFile(filePath);
    const firstSheet = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheet];
    return XLSX.utils.sheet_to_json(worksheet, { defval: '' });
  } else {
    throw new Error(`Unsupported file type: ${ext}. Please upload CSV or Excel files.`);
  }
}

// GET / - List all price lists
router.get('/', (req, res) => {
  try {
    const priceLists = db.prepare(`
      SELECT pl.*,
        (SELECT COUNT(*) FROM price_list_items WHERE price_list_id = pl.id) AS item_count
      FROM price_lists pl
      ORDER BY pl.uploaded_at DESC
    `).all();

    res.json(priceLists);
  } catch (err) {
    console.error('Error listing price lists:', err);
    res.status(500).json({ error: 'Failed to list price lists', details: err.message });
  }
});

// GET /:id - Get price list with its items
router.get('/:id', (req, res) => {
  try {
    const priceList = db.prepare('SELECT * FROM price_lists WHERE id = ?').get(req.params.id);
    if (!priceList) {
      return res.status(404).json({ error: 'Price list not found' });
    }

    const items = db.prepare(
      'SELECT * FROM price_list_items WHERE price_list_id = ? ORDER BY category, part_number'
    ).all(req.params.id);

    // Parse applicable_models JSON for each item
    const parsedItems = items.map(item => ({
      ...item,
      applicable_models: item.applicable_models ? JSON.parse(item.applicable_models) : null
    }));

    res.json({ ...priceList, items: parsedItems });
  } catch (err) {
    console.error('Error getting price list:', err);
    res.status(500).json({ error: 'Failed to get price list', details: err.message });
  }
});

// GET /:id/items - Get items with optional search/filter
router.get('/:id/items', (req, res) => {
  try {
    const priceList = db.prepare('SELECT * FROM price_lists WHERE id = ?').get(req.params.id);
    if (!priceList) {
      return res.status(404).json({ error: 'Price list not found' });
    }

    const { category, search, limit, offset } = req.query;

    let sql = 'SELECT * FROM price_list_items WHERE price_list_id = ?';
    const params = [req.params.id];

    if (category) {
      sql += ' AND category = ?';
      params.push(category);
    }

    if (search) {
      sql += ' AND (part_number LIKE ? OR description LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm);
    }

    sql += ' ORDER BY category, part_number';

    if (limit) {
      sql += ' LIMIT ?';
      params.push(Number(limit));
      if (offset) {
        sql += ' OFFSET ?';
        params.push(Number(offset));
      }
    }

    const items = db.prepare(sql).all(...params);

    const parsedItems = items.map(item => ({
      ...item,
      applicable_models: item.applicable_models ? JSON.parse(item.applicable_models) : null
    }));

    // Get total count for pagination
    let countSql = 'SELECT COUNT(*) as total FROM price_list_items WHERE price_list_id = ?';
    const countParams = [req.params.id];
    if (category) {
      countSql += ' AND category = ?';
      countParams.push(category);
    }
    if (search) {
      countSql += ' AND (part_number LIKE ? OR description LIKE ?)';
      const searchTerm = `%${search}%`;
      countParams.push(searchTerm, searchTerm);
    }
    const { total } = db.prepare(countSql).get(...countParams);

    res.json({ items: parsedItems, total });
  } catch (err) {
    console.error('Error getting price list items:', err);
    res.status(500).json({ error: 'Failed to get price list items', details: err.message });
  }
});

// POST /upload - Upload and parse CSV/Excel file
router.post('/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { name, description, effective_date, expiration_date } = req.body;

    // Parse the uploaded file
    let rows;
    try {
      rows = parseFileData(req.file.path, req.file.originalname);
    } catch (parseErr) {
      // Clean up the uploaded file on parse failure
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Failed to parse file', details: parseErr.message });
    }

    if (!rows || rows.length === 0) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'File contains no data rows' });
    }

    // Build column mapping from headers
    const headers = Object.keys(rows[0]);
    const columnMap = {};
    for (const header of headers) {
      const canonical = normalizeColumnName(header);
      if (canonical) {
        columnMap[header] = canonical;
      }
    }

    // Verify we have at least part_number and unit_price mapped
    const mappedColumns = Object.values(columnMap);
    if (!mappedColumns.includes('part_number')) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
        error: 'Could not identify a part_number column',
        detected_columns: headers,
        mapped: columnMap
      });
    }
    if (!mappedColumns.includes('unit_price')) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
        error: 'Could not identify a unit_price column',
        detected_columns: headers,
        mapped: columnMap
      });
    }

    // Create price list and items in a transaction
    const insertResult = db.transaction(() => {
      // Create the price_list record
      const plResult = db.prepare(`
        INSERT INTO price_lists (name, description, file_name, file_path, effective_date, expiration_date)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        name || req.file.originalname,
        description || null,
        req.file.originalname,
        req.file.path,
        effective_date || null,
        expiration_date || null
      );

      const priceListId = plResult.lastInsertRowid;

      // Insert each row as a price_list_item
      const insertItem = db.prepare(`
        INSERT INTO price_list_items (price_list_id, part_number, description, category, unit_price, unit, applicable_models)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      let inserted = 0;
      let skipped = 0;
      const errors = [];

      for (let i = 0; i < rows.length; i++) {
        const item = mapRowToItem(rows[i], columnMap);

        // Skip rows without required fields
        if (!item.part_number || item.unit_price == null) {
          skipped++;
          continue;
        }

        const unitPrice = typeof item.unit_price === 'string'
          ? parseFloat(item.unit_price.replace(/[$,]/g, ''))
          : Number(item.unit_price);

        if (isNaN(unitPrice)) {
          errors.push({ row: i + 2, part_number: item.part_number, issue: 'Invalid unit_price' });
          skipped++;
          continue;
        }

        // Handle applicable_models - could be comma-separated string or already JSON
        let applicableModels = null;
        if (item.applicable_models) {
          if (typeof item.applicable_models === 'string') {
            try {
              applicableModels = JSON.parse(item.applicable_models);
              applicableModels = JSON.stringify(applicableModels);
            } catch {
              // Treat as comma-separated list
              applicableModels = JSON.stringify(
                item.applicable_models.split(',').map(s => s.trim()).filter(Boolean)
              );
            }
          } else if (Array.isArray(item.applicable_models)) {
            applicableModels = JSON.stringify(item.applicable_models);
          }
        }

        try {
          insertItem.run(
            priceListId,
            String(item.part_number).trim(),
            item.description || null,
            item.category || null,
            unitPrice,
            item.unit || 'each',
            applicableModels
          );
          inserted++;
        } catch (itemErr) {
          if (itemErr.message.includes('UNIQUE constraint')) {
            errors.push({ row: i + 2, part_number: item.part_number, issue: 'Duplicate part_number' });
            skipped++;
          } else {
            throw itemErr;
          }
        }
      }

      return { priceListId, inserted, skipped, errors };
    })();

    const priceList = db.prepare('SELECT * FROM price_lists WHERE id = ?').get(insertResult.priceListId);

    res.status(201).json({
      price_list: priceList,
      import_summary: {
        total_rows: rows.length,
        inserted: insertResult.inserted,
        skipped: insertResult.skipped,
        errors: insertResult.errors,
        column_mapping: columnMap
      }
    });
  } catch (err) {
    console.error('Error uploading price list:', err);
    res.status(500).json({ error: 'Failed to upload price list', details: err.message });
  }
});

// PUT /:id - Update price list metadata
router.put('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM price_lists WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Price list not found' });
    }

    const fields = ['name', 'description', 'effective_date', 'expiration_date', 'status'];
    const updates = [];
    const values = [];

    for (const field of fields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(req.body[field]);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(req.params.id);
    db.prepare(`UPDATE price_lists SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    const updated = db.prepare('SELECT * FROM price_lists WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    console.error('Error updating price list:', err);
    res.status(500).json({ error: 'Failed to update price list', details: err.message });
  }
});

// PUT /:id/items/:itemId - Update individual price list item
router.put('/:id/items/:itemId', (req, res) => {
  try {
    const item = db.prepare(
      'SELECT * FROM price_list_items WHERE id = ? AND price_list_id = ?'
    ).get(req.params.itemId, req.params.id);

    if (!item) {
      return res.status(404).json({ error: 'Price list item not found' });
    }

    const fields = ['part_number', 'description', 'category', 'subcategory', 'unit_price', 'unit', 'applicable_models', 'lead_time_days', 'notes'];
    const updates = [];
    const values = [];

    for (const field of fields) {
      if (req.body[field] !== undefined) {
        let value = req.body[field];
        if (field === 'applicable_models' && Array.isArray(value)) {
          value = JSON.stringify(value);
        }
        updates.push(`${field} = ?`);
        values.push(value);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(req.params.itemId);
    db.prepare(`UPDATE price_list_items SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    const updated = db.prepare('SELECT * FROM price_list_items WHERE id = ?').get(req.params.itemId);
    if (updated.applicable_models) {
      updated.applicable_models = JSON.parse(updated.applicable_models);
    }

    res.json(updated);
  } catch (err) {
    console.error('Error updating price list item:', err);
    res.status(500).json({ error: 'Failed to update price list item', details: err.message });
  }
});

// POST /:id/items - Add item manually
router.post('/:id/items', (req, res) => {
  try {
    const priceList = db.prepare('SELECT * FROM price_lists WHERE id = ?').get(req.params.id);
    if (!priceList) {
      return res.status(404).json({ error: 'Price list not found' });
    }

    const { part_number, description, category, subcategory, unit_price, unit, applicable_models, lead_time_days, notes } = req.body;

    if (!part_number || unit_price == null) {
      return res.status(400).json({ error: 'Missing required fields: part_number, unit_price' });
    }

    let applicableModelsJson = null;
    if (applicable_models) {
      applicableModelsJson = Array.isArray(applicable_models)
        ? JSON.stringify(applicable_models)
        : applicable_models;
    }

    const result = db.prepare(`
      INSERT INTO price_list_items (price_list_id, part_number, description, category, subcategory, unit_price, unit, applicable_models, lead_time_days, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.params.id,
      part_number,
      description || null,
      category || null,
      subcategory || null,
      unit_price,
      unit || 'each',
      applicableModelsJson,
      lead_time_days || null,
      notes || null
    );

    const created = db.prepare('SELECT * FROM price_list_items WHERE id = ?').get(result.lastInsertRowid);
    if (created.applicable_models) {
      created.applicable_models = JSON.parse(created.applicable_models);
    }

    res.status(201).json(created);
  } catch (err) {
    if (err.message.includes('UNIQUE constraint')) {
      return res.status(409).json({ error: 'This part_number already exists in the price list' });
    }
    console.error('Error adding price list item:', err);
    res.status(500).json({ error: 'Failed to add price list item', details: err.message });
  }
});

// DELETE /:id - Delete price list and all items (cascade)
router.delete('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM price_lists WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Price list not found' });
    }

    db.prepare('DELETE FROM price_lists WHERE id = ?').run(req.params.id);

    // Optionally remove the uploaded file
    if (existing.file_path && fs.existsSync(existing.file_path)) {
      try {
        fs.unlinkSync(existing.file_path);
      } catch {
        // Non-critical: file cleanup failure
      }
    }

    res.json({ message: 'Price list deleted', id: Number(req.params.id) });
  } catch (err) {
    console.error('Error deleting price list:', err);
    res.status(500).json({ error: 'Failed to delete price list', details: err.message });
  }
});

module.exports = router;
