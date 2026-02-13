const Papa = require('papaparse');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

// Column name aliases for flexible matching
const COLUMN_ALIASES = {
  part_number: ['part_number', 'part number', 'part #', 'part#', 'partnumber', 'pn', 'item number', 'item #', 'item_number', 'sku', 'catalog number', 'catalog #', 'cat #'],
  description: ['description', 'desc', 'name', 'part name', 'part_name', 'item description', 'item_description', 'part description'],
  category: ['category', 'cat', 'type', 'part type', 'part_type', 'group', 'class', 'classification'],
  subcategory: ['subcategory', 'sub_category', 'sub category', 'subcat', 'sub_type'],
  unit_price: ['unit_price', 'unit price', 'price', 'list price', 'list_price', 'cost', 'unit cost', 'unit_cost', 'amount', 'each', 'ea price', 'dealer price', 'msrp'],
  unit: ['unit', 'uom', 'unit of measure', 'unit_of_measure', 'measure'],
  applicable_models: ['applicable_models', 'applicable models', 'models', 'model', 'equipment', 'applies to', 'applies_to', 'compatibility'],
  lead_time_days: ['lead_time_days', 'lead time', 'lead_time', 'lead time days', 'availability'],
  notes: ['notes', 'note', 'comments', 'remarks'],
};

/**
 * Match incoming column headers to standardized field names.
 */
function mapColumns(headers) {
  const mapping = {};
  const lowerHeaders = headers.map(h => h.toLowerCase().trim());

  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    for (const alias of aliases) {
      const idx = lowerHeaders.indexOf(alias);
      if (idx !== -1) {
        mapping[field] = headers[idx];
        break;
      }
    }
  }

  return mapping;
}

/**
 * Parse a CSV file and return structured price list items.
 */
function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const result = Papa.parse(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  if (result.errors.length > 0) {
    const critical = result.errors.filter(e => e.type === 'Delimiter' || e.type === 'FieldMismatch');
    if (critical.length > 0) {
      throw new Error(`CSV parsing errors: ${critical.map(e => e.message).join('; ')}`);
    }
  }

  return processRows(result.meta.fields, result.data);
}

/**
 * Parse an Excel file and return structured price list items.
 */
function parseExcel(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  if (data.length === 0) {
    throw new Error('Excel file is empty or has no data rows');
  }

  const headers = Object.keys(data[0]);
  return processRows(headers, data);
}

/**
 * Process raw rows into standardized price list items.
 */
function processRows(headers, rows) {
  const colMap = mapColumns(headers);

  if (!colMap.part_number) {
    throw new Error(`Could not find a part number column. Found columns: ${headers.join(', ')}`);
  }
  if (!colMap.unit_price) {
    throw new Error(`Could not find a price column. Found columns: ${headers.join(', ')}`);
  }

  const items = [];
  const errors = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const partNumber = String(row[colMap.part_number] || '').trim();
      if (!partNumber) continue;

      let price = row[colMap.unit_price];
      if (typeof price === 'string') {
        price = parseFloat(price.replace(/[$,]/g, ''));
      }
      if (isNaN(price) || price < 0) {
        errors.push(`Row ${i + 2}: Invalid price for part ${partNumber}`);
        continue;
      }

      const item = {
        part_number: partNumber,
        description: colMap.description ? String(row[colMap.description] || '').trim() : '',
        category: colMap.category ? String(row[colMap.category] || '').trim().toLowerCase().replace(/\s+/g, '_') : '',
        subcategory: colMap.subcategory ? String(row[colMap.subcategory] || '').trim() : '',
        unit_price: price,
        unit: colMap.unit ? String(row[colMap.unit] || 'each').trim() : 'each',
        applicable_models: null,
        lead_time_days: null,
        notes: colMap.notes ? String(row[colMap.notes] || '').trim() : '',
      };

      // Parse applicable models
      if (colMap.applicable_models && row[colMap.applicable_models]) {
        const models = String(row[colMap.applicable_models]).trim();
        if (models.toLowerCase() !== 'all' && models !== '*') {
          item.applicable_models = JSON.stringify(models.split(/[,;|]/).map(m => m.trim()).filter(Boolean));
        }
      }

      // Parse lead time
      if (colMap.lead_time_days && row[colMap.lead_time_days]) {
        const lt = parseInt(row[colMap.lead_time_days]);
        if (!isNaN(lt)) item.lead_time_days = lt;
      }

      items.push(item);
    } catch (e) {
      errors.push(`Row ${i + 2}: ${e.message}`);
    }
  }

  return {
    items,
    errors,
    columns_detected: colMap,
    total_rows: rows.length,
    valid_items: items.length,
    skipped: rows.length - items.length,
  };
}

/**
 * Auto-detect file type and parse accordingly.
 */
function parseFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.csv') {
    return parseCSV(filePath);
  } else if (['.xlsx', '.xls'].includes(ext)) {
    return parseExcel(filePath);
  } else {
    throw new Error(`Unsupported file type: ${ext}. Please upload CSV or Excel files.`);
  }
}

module.exports = { parseFile, parseCSV, parseExcel, mapColumns };
