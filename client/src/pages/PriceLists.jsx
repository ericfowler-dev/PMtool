import { useState } from 'react';
import { DollarSign, Plus, Pencil, Trash2, ChevronRight, AlertTriangle, Search, Check, X, Package, Download } from 'lucide-react';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import FileUpload from '../components/FileUpload';
import { api } from '../api';
import { useApiQuery, useApiMutation } from '../hooks/useApi';

const fmt = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
const fmtDecimal = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

const CATEGORIES = ['filters', 'fluids', 'belts', 'gaskets', 'electrical', 'cooling', 'fuel_system', 'turbo', 'engine_parts', 'consumables', 'other'];

const categoryBadge = {
  filters: 'bg-blue-100 text-blue-800',
  fluids: 'bg-cyan-100 text-cyan-800',
  belts: 'bg-amber-100 text-amber-800',
  gaskets: 'bg-gray-100 text-gray-800',
  electrical: 'bg-yellow-100 text-yellow-800',
  cooling: 'bg-teal-100 text-teal-800',
  fuel_system: 'bg-orange-100 text-orange-800',
  turbo: 'bg-red-100 text-red-800',
  engine_parts: 'bg-indigo-100 text-indigo-800',
  consumables: 'bg-green-100 text-green-800',
  other: 'bg-gray-100 text-gray-700',
};

const emptyItemForm = {
  part_number: '',
  description: '',
  category: 'other',
  unit_price: '',
  unit: 'each',
  applicable_models: '',
};

export default function PriceLists() {
  const [selectedPriceListId, setSelectedPriceListId] = useState(null);
  const [addItemModalOpen, setAddItemModalOpen] = useState(false);
  const [itemForm, setItemForm] = useState(emptyItemForm);
  const [editingItemId, setEditingItemId] = useState(null);
  const [editingPrice, setEditingPrice] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [partSearch, setPartSearch] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const { data: priceLists, isLoading: listsLoading, error: listsError } = useApiQuery('priceLists', () => api.priceLists.list());

  const itemsQuery = useApiQuery(
    ['priceListItems', selectedPriceListId],
    () => api.priceLists.items(selectedPriceListId),
    { enabled: !!selectedPriceListId }
  );

  const uploadMutation = useApiMutation(
    (file) => api.priceLists.upload(file, {}),
    { invalidateKeys: ['priceLists'] }
  );

  const addItemMutation = useApiMutation(
    ({ priceListId, data }) => api.priceLists.addItem(priceListId, data),
    {
      invalidateKeys: [['priceListItems', selectedPriceListId], 'priceLists'],
      onSuccess: () => { setAddItemModalOpen(false); setItemForm(emptyItemForm); },
    }
  );

  const updateItemMutation = useApiMutation(
    ({ priceListId, itemId, data }) => api.priceLists.updateItem(priceListId, itemId, data),
    {
      invalidateKeys: [['priceListItems', selectedPriceListId]],
      onSuccess: () => { setEditingItemId(null); },
    }
  );

  const deletePriceListMutation = useApiMutation(
    (id) => api.priceLists.delete(id),
    {
      invalidateKeys: ['priceLists'],
      onSuccess: () => { setDeleteConfirm(null); setSelectedPriceListId(null); },
    }
  );

  const priceListList = Array.isArray(priceLists) ? priceLists : [];
  const items = Array.isArray(itemsQuery.data) ? itemsQuery.data : (itemsQuery.data?.items || []);

  const filteredItems = items.filter((item) => {
    if (categoryFilter && item.category !== categoryFilter) return false;
    if (partSearch) {
      const q = partSearch.toLowerCase();
      return (item.part_number || '').toLowerCase().includes(q) || (item.description || '').toLowerCase().includes(q);
    }
    return true;
  });

  const selectedPriceList = priceListList.find((pl) => pl.id === selectedPriceListId);

  const handleUpload = async (file) => {
    return await uploadMutation.mutateAsync(file);
  };

  const handleAddItem = (e) => {
    e.preventDefault();
    addItemMutation.mutate({
      priceListId: selectedPriceListId,
      data: {
        ...itemForm,
        unit_price: Number(itemForm.unit_price),
        applicable_models: itemForm.applicable_models ? itemForm.applicable_models.split(',').map((s) => s.trim()) : [],
      },
    });
  };

  const startInlineEdit = (item) => {
    setEditingItemId(item.id);
    setEditingPrice(String(item.unit_price || 0));
  };

  const saveInlineEdit = (item) => {
    updateItemMutation.mutate({
      priceListId: selectedPriceListId,
      itemId: item.id,
      data: { unit_price: Number(editingPrice) },
    });
  };

  const cancelInlineEdit = () => {
    setEditingItemId(null);
    setEditingPrice('');
  };

  const statusBadge = (status) => {
    const map = {
      active: 'bg-green-100 text-green-800',
      draft: 'bg-yellow-100 text-yellow-800',
      archived: 'bg-gray-100 text-gray-600',
    };
    return map[status] || 'bg-gray-100 text-gray-600';
  };

  const itemColumns = [
    { key: 'part_number', header: 'Part Number', accessor: 'part_number' },
    { key: 'description', header: 'Description', accessor: 'description' },
    {
      key: 'category',
      header: 'Category',
      accessor: 'category',
      render: (row) => (
        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${categoryBadge[row.category] || categoryBadge.other}`}>
          {(row.category || 'other').replace('_', ' ')}
        </span>
      ),
    },
    {
      key: 'unit_price',
      header: 'Unit Price',
      accessor: 'unit_price',
      render: (row) =>
        editingItemId === row.id ? (
          <div className="flex items-center gap-1">
            <input
              type="number"
              step="0.01"
              className="input py-1 px-2 w-24 text-sm"
              value={editingPrice}
              onChange={(e) => setEditingPrice(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveInlineEdit(row);
                if (e.key === 'Escape') cancelInlineEdit();
              }}
            />
            <button onClick={() => saveInlineEdit(row)} className="p-1 text-green-600 hover:bg-green-50 rounded">
              <Check size={14} />
            </button>
            <button onClick={cancelInlineEdit} className="p-1 text-gray-400 hover:bg-gray-50 rounded">
              <X size={14} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => startInlineEdit(row)}
            className="text-sm font-mono hover:text-brand-600 hover:underline cursor-pointer"
          >
            {fmtDecimal(row.unit_price || 0)}
          </button>
        ),
    },
    { key: 'unit', header: 'Unit', accessor: 'unit' },
    {
      key: 'applicable_models',
      header: 'Applicable Models',
      accessor: (row) => (row.applicable_models || []).join(', '),
      render: (row) => {
        const models = row.applicable_models || [];
        return models.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {models.slice(0, 3).map((m, i) => (
              <span key={i} className="text-xs bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded">{m}</span>
            ))}
            {models.length > 3 && (
              <span className="text-xs text-gray-400">+{models.length - 3} more</span>
            )}
          </div>
        ) : (
          <span className="text-gray-400 text-xs">All models</span>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <DollarSign size={28} className="text-brand-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Price Lists</h1>
            <p className="text-sm text-gray-500">Manage parts pricing and cost data</p>
          </div>
        </div>
      </div>

      {/* Upload Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-4">
        <FileUpload onUpload={handleUpload} label="Upload Price List (CSV or Excel)" />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-gray-800">Need a starter format?</p>
            <p className="text-xs text-gray-500">Download the sample parts list template and replace with your parts and pricing.</p>
          </div>
          <a
            href="/samples/parts-list-sample.csv"
            download
            className="btn btn-ghost btn-sm inline-flex items-center justify-center"
          >
            <Download size={14} className="mr-1" /> Download Sample CSV
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Price List Cards */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Price Lists</h2>

          {listsLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : listsError ? (
            <div className="text-center py-8 text-red-500">
              <AlertTriangle size={24} className="mx-auto mb-2" />
              <p className="text-sm">{listsError.message}</p>
            </div>
          ) : priceListList.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
              <Package size={40} className="mx-auto mb-3 text-gray-300" />
              <p className="text-sm text-gray-500">No price lists yet.</p>
              <p className="text-xs text-gray-400 mt-1">Upload a CSV or Excel file to create your first price list.</p>
            </div>
          ) : (
            priceListList.map((pl) => (
              <div
                key={pl.id}
                onClick={() => setSelectedPriceListId(pl.id)}
                className={`bg-white rounded-xl border p-4 cursor-pointer transition-all duration-200 ${
                  selectedPriceListId === pl.id
                    ? 'border-brand-500 ring-2 ring-brand-100 shadow-md'
                    : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate text-sm">{pl.name}</h3>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {pl.status && (
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(pl.status)}`}>
                          {pl.status}
                        </span>
                      )}
                      <span className="text-xs text-gray-500">
                        {pl.items_count || pl.item_count || 0} items
                      </span>
                    </div>
                    {pl.created_at && (
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(pl.created_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteConfirm(pl); }}
                      className="p-1 rounded text-gray-400 hover:text-red-600"
                    >
                      <Trash2 size={14} />
                    </button>
                    <ChevronRight size={16} className={`text-gray-400 transition-transform ${selectedPriceListId === pl.id ? 'rotate-90' : ''}`} />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Items Table */}
        <div className="lg:col-span-3">
          {!selectedPriceListId ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <DollarSign size={48} className="mx-auto mb-3 text-gray-300" />
              <h3 className="text-lg font-medium text-gray-500">Select a Price List</h3>
              <p className="text-sm text-gray-400 mt-1">Choose a price list to view and edit its items.</p>
            </div>
          ) : itemsQuery.isLoading ? (
            <div className="bg-white rounded-xl border border-gray-200 flex items-center justify-center py-20">
              <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">{selectedPriceList?.name}</h2>
                  <p className="text-sm text-gray-500">{filteredItems.length} items</p>
                </div>
                <button onClick={() => setAddItemModalOpen(true)} className="btn btn-primary btn-sm">
                  <Plus size={14} className="mr-1" /> Add Item Manually
                </button>
              </div>

              {/* Filters */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="relative flex-1 max-w-xs">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search by part number or description..."
                    className="input pl-9 text-sm"
                    value={partSearch}
                    onChange={(e) => setPartSearch(e.target.value)}
                  />
                </div>
                <select
                  className="input w-auto text-sm"
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                >
                  <option value="">All Categories</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>

              <DataTable
                columns={itemColumns}
                data={filteredItems}
                searchable={false}
                emptyMessage="No items found matching your filters."
              />

              <p className="text-xs text-gray-400">Click any unit price to edit it inline.</p>
            </div>
          )}
        </div>
      </div>

      {/* Add Item Modal */}
      <Modal open={addItemModalOpen} onClose={() => setAddItemModalOpen(false)} title="Add Item Manually" size="md">
        <form onSubmit={handleAddItem} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Part Number *</label>
              <input type="text" className="input" value={itemForm.part_number} onChange={(e) => setItemForm((f) => ({ ...f, part_number: e.target.value }))} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select className="input" value={itemForm.category} onChange={(e) => setItemForm((f) => ({ ...f, category: e.target.value }))}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c.replace('_', ' ')}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <input type="text" className="input" value={itemForm.description} onChange={(e) => setItemForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit Price *</label>
              <input type="number" step="0.01" className="input" value={itemForm.unit_price} onChange={(e) => setItemForm((f) => ({ ...f, unit_price: e.target.value }))} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
              <input type="text" className="input" value={itemForm.unit} onChange={(e) => setItemForm((f) => ({ ...f, unit: e.target.value }))} />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Applicable Models (comma separated)</label>
              <input type="text" className="input" placeholder="e.g. CAT-3516, CAT-3512" value={itemForm.applicable_models} onChange={(e) => setItemForm((f) => ({ ...f, applicable_models: e.target.value }))} />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button type="button" onClick={() => setAddItemModalOpen(false)} className="btn btn-ghost">Cancel</button>
            <button type="submit" disabled={addItemMutation.isPending} className="btn btn-primary">
              {addItemMutation.isPending ? 'Adding...' : 'Add Item'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="Delete Price List" size="sm">
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
              <AlertTriangle size={20} className="text-red-600" />
            </div>
            <p className="text-sm text-gray-700">
              Are you sure you want to delete <strong>{deleteConfirm?.name}</strong>? All items in this price list will be permanently removed.
            </p>
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setDeleteConfirm(null)} className="btn btn-ghost">Cancel</button>
            <button
              onClick={() => deletePriceListMutation.mutate(deleteConfirm.id)}
              disabled={deletePriceListMutation.isPending}
              className="btn bg-red-600 text-white hover:bg-red-700"
            >
              {deletePriceListMutation.isPending ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
