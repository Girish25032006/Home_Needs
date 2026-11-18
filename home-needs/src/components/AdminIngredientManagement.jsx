import { useEffect, useMemo, useState } from 'react'
import './AdminIngredientManagement.css'
import API_URL from '../api'

export default function AdminIngredientManagement() {
  const [items, setItems] = useState([])
  const [canonicalName, setCanonicalName] = useState('')
  const [aliasesText, setAliasesText] = useState('')
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function loadItems() {
    setLoading(true); setError('')
    try {
      const response = await fetch(`${API_URL}/admin/ingredient-master`, { credentials: 'include' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || data.message || 'Unable to load ingredients')
      setItems(Array.isArray(data) ? data : [])
    } catch (err) { setError(err.message || 'Unable to load ingredients') }
    finally { setLoading(false) }
  }

  useEffect(() => { loadItems() }, [])

  function resetForm() { setCanonicalName(''); setAliasesText(''); setEditingId(null) }

  async function handleSubmit(event) {
    event.preventDefault(); setSaving(true); setError(''); setMessage('')
    const payload = { canonical_name: canonicalName.trim(), aliases: aliasesText.split(',').map(v => v.trim()).filter(Boolean) }
    try {
      const url = editingId == null ? `${API_URL}/admin/ingredient-master` : `${API_URL}/admin/ingredient-master/${editingId}`
      const response = await fetch(url, { method: editingId == null ? 'POST' : 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || data.message || 'Unable to save ingredient')
      setMessage(data.message || 'Saved successfully'); resetForm(); await loadItems()
    } catch (err) { setError(err.message || 'Unable to save ingredient') }
    finally { setSaving(false) }
  }

  function startEdit(item) { setEditingId(item.id); setCanonicalName(item.canonical_name); setAliasesText((item.aliases || []).join(', ')); setMessage(''); setError(''); window.scrollTo?.({ top: 0, behavior: 'smooth' }) }

  async function deleteItem(item) {
    if (!window.confirm(`Delete ${item.canonical_name} and all its aliases?`)) return
    setError(''); setMessage('')
    try {
      const response = await fetch(`${API_URL}/admin/ingredient-master/${item.id}`, { method: 'DELETE', credentials: 'include' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Unable to delete ingredient')
      if (editingId === item.id) resetForm()
      setMessage(data.message || 'Ingredient deleted'); await loadItems()
    } catch (err) { setError(err.message || 'Unable to delete ingredient') }
  }

  const filteredItems = useMemo(() => items.filter(item => `${item.canonical_name} ${(item.aliases || []).join(' ')}`.toLowerCase().includes(search.toLowerCase())), [items, search])

  return (
    <div className="admin-ingredients-page">
      <header className="admin-ingredients-hero">
        <div><span className="admin-ingredients-eyebrow">ADMIN CONTROL</span><h1>Ingredient Management</h1><p>Manage official ingredient names and their approved alternative names.</p></div>
        <div className="admin-ingredients-count"><strong>{items.length}</strong><span>Ingredients</span></div>
      </header>

      <section className="admin-ingredients-form-card">
        <div className="admin-ingredients-section-heading"><div><h2>{editingId == null ? 'Add New Ingredient' : 'Edit Ingredient'}</h2><p>Aliases should be equivalent names or spelling variants, not substitutes.</p></div></div>
        {message && <div className="admin-ingredients-alert success">{message}</div>}
        {error && <div className="admin-ingredients-alert error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <label>Canonical ingredient name<input value={canonicalName} onChange={e => setCanonicalName(e.target.value)} placeholder="e.g. Cumin Seeds" maxLength={150} required /></label>
          <label>Alternative names <span>(comma separated)</span><textarea value={aliasesText} onChange={e => setAliasesText(e.target.value)} placeholder="e.g. Jeera, Jeera Seeds, Cumin" rows={3} /></label>
          <div className="admin-ingredients-form-actions"><button type="submit" disabled={saving}>{saving ? 'Saving...' : editingId == null ? 'Add Ingredient' : 'Update Ingredient'}</button>{editingId != null && <button type="button" className="secondary" onClick={resetForm}>Cancel</button>}</div>
        </form>
        <div className="admin-ingredients-note">Important: Rice and Basmati Rice, Paneer and Cheese, and fresh chilli and chilli powder must remain separate unless they are genuinely the same ingredient.</div>
      </section>

      <section className="admin-ingredients-list-card">
        <div className="admin-ingredients-list-heading"><div><h2>Ingredient Dictionary</h2><p>{items.length} approved canonical ingredients</p></div><input aria-label="Search ingredients" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search ingredients or aliases..." /></div>
        {loading ? <div className="admin-ingredients-empty">Loading ingredients...</div> : filteredItems.length === 0 ? <div className="admin-ingredients-empty">{items.length ? 'No matching ingredients found.' : 'No ingredients added yet. Add the first ingredient above.'}</div> :
          <div className="admin-ingredients-grid">{filteredItems.map(item => <article className="admin-ingredients-item" key={item.id}><div className="admin-ingredients-item-top"><div><span className="admin-ingredients-small-label">CANONICAL NAME</span><h3>{item.canonical_name}</h3></div><span className="admin-ingredients-alias-count">{(item.aliases || []).length} aliases</span></div><div className="admin-ingredients-aliases">{(item.aliases || []).length ? item.aliases.map(alias => <span key={alias}>{alias}</span>) : <em>No aliases added</em>}</div><div className="admin-ingredients-item-actions"><button type="button" className="secondary" onClick={() => startEdit(item)}>Edit</button><button type="button" className="danger" onClick={() => deleteItem(item)}>Delete</button></div></article>)}</div>}
      </section>
    </div>
  )
}
