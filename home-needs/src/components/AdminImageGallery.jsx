import { useCallback, useEffect, useMemo, useState } from 'react'
import API_URL from '../api'
import './AdminImageGallery.css'

const CATEGORIES = ['Groceries', 'Grains & Staples', 'Cooking Essentials', 'Dairy & Eggs', 'Fruits', 'Vegetables', 'Cleaning & Household', 'Personal Care', 'Beverages', 'Other']

export default function AdminImageGallery() {
  const [gallery, setGallery] = useState([])
  const [productName, setProductName] = useState('')
  const [category, setCategory] = useState('Groceries')
  const [imageUrl, setImageUrl] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const loadGallery = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`${API_URL}/product-image-gallery`, { credentials: 'include' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || 'Unable to load gallery')
      setGallery(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error('Load gallery error:', err)
      setError(err.message || 'Unable to connect to backend.')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { loadGallery() }, [loadGallery])

  const filteredGallery = useMemo(() => {
    const term = search.trim().toLowerCase()
    return term ? gallery.filter(item => `${item.product_name || ''} ${item.category || ''}`.toLowerCase().includes(term)) : gallery
  }, [gallery, search])

  async function handleAddImage(event) {
    event.preventDefault(); setError(''); setMessage('')
    const name = productName.trim(); const url = imageUrl.trim()
    if (!name || !url) return setError('Product name and image URL are required.')
    if (!/^https:\/\/\S+/i.test(url)) return setError('Please enter a direct HTTPS image URL.')
    setSaving(true)
    try {
      const response = await fetch(`${API_URL}/product-image-gallery`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_name: name, category, image_url: url })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || 'Failed to add image')
      setProductName(''); setImageUrl(''); setCategory('Groceries')
      setMessage('Image added to the gallery successfully.')
      await loadGallery()
    } catch (err) { console.error(err); setError(err.message || 'Unable to add image.') }
    finally { setSaving(false) }
  }

  async function handleDeleteImage(item) {
    const confirmed = window.confirm(`Delete the gallery image for "${item.product_name}"?\n\nThis removes it from the shared gallery and clears saved selections using this exact URL. Household products will not be deleted.`)
    if (!confirmed) return
    setDeletingId(item.id); setError(''); setMessage('')
    try {
      const response = await fetch(`${API_URL}/product-image-gallery/${item.id}`, { method: 'DELETE', credentials: 'include' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || 'Failed to delete image')
      setGallery(current => current.filter(image => image.id !== item.id))
      setMessage(`"${item.product_name}" image deleted from the gallery.`)
      window.dispatchEvent(new CustomEvent('productImagesUpdated'))
    } catch (err) {
      console.error(err); setError(err.message || 'Unable to delete image.'); await loadGallery()
    } finally { setDeletingId(null) }
  }

  return <div className="admin-gallery-page">
    <section className="admin-gallery-hero">
      <div className="admin-gallery-hero-icon">🛡️</div>
      <div className="admin-gallery-hero-copy"><span className="admin-gallery-eyebrow">HOME NEEDS · ADMIN</span><h1>Product Image Gallery</h1><p>Manage approved images for all Home Needs users.</p></div>
      <div className="admin-gallery-count"><strong>{gallery.length}</strong><span>Approved images</span></div>
    </section>

    <section className="admin-gallery-form-card">
      <div className="admin-gallery-section-heading"><div><h2>Add a product image</h2><p>Add an approved image that users can select in Products.</p></div><span className="admin-gallery-admin-pill">🔒 Admin only</span></div>
      <form onSubmit={handleAddImage} className="admin-gallery-form">
        <div className="admin-gallery-field"><label htmlFor="gallery-product-name">Product name *</label><input id="gallery-product-name" value={productName} onChange={e => setProductName(e.target.value)} placeholder="e.g. Basmati Rice" maxLength={150} required /></div>
        <div className="admin-gallery-field"><label htmlFor="gallery-category">Category *</label><select id="gallery-category" value={category} onChange={e => setCategory(e.target.value)}>{CATEGORIES.map(item => <option key={item}>{item}</option>)}</select></div>
        <div className="admin-gallery-field"><label htmlFor="gallery-image-url">Image URL *</label><input id="gallery-image-url" type="url" value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://example.com/rice.jpg" required /><small>Use a direct HTTPS image link you have permission to use.</small></div>
        {imageUrl.trim() && <div className="admin-gallery-url-preview"><img src={imageUrl.trim()} alt="Image preview" onError={e => { e.currentTarget.style.display = 'none' }} onLoad={e => { e.currentTarget.style.display = 'block' }} /></div>}
        <div className="admin-gallery-form-actions"><button type="button" className="admin-gallery-button secondary" disabled={saving} onClick={() => { setProductName(''); setCategory('Groceries'); setImageUrl(''); setError(''); setMessage('') }}>Clear</button><button type="submit" className="admin-gallery-button primary" disabled={saving}>{saving ? 'Adding…' : '+ Add to gallery'}</button></div>
      </form>
    </section>

    {error && <div className="admin-gallery-alert error" role="alert">{error}</div>}
    {message && <div className="admin-gallery-alert success" role="status">{message}</div>}

    <section className="admin-gallery-list-card">
      <div className="admin-gallery-section-heading"><div><h2>Approved images</h2><p>Images currently available for users to select.</p></div><button className="admin-gallery-button secondary" type="button" onClick={loadGallery} disabled={loading}>{loading ? 'Loading…' : '↻ Refresh'}</button></div>
      <div className="admin-gallery-search-wrap"><input type="search" aria-label="Search approved images" placeholder="Search product or category…" value={search} onChange={e => setSearch(e.target.value)} /></div>
      {loading ? <div className="admin-gallery-empty">Loading approved images…</div> : filteredGallery.length === 0 ? <div className="admin-gallery-empty"><strong>{gallery.length ? 'No matching images' : 'No approved images yet'}</strong><p>{gallery.length ? 'Try another search.' : 'Add an image using the form above.'}</p></div> : <div className="admin-gallery-grid">
        {filteredGallery.map(item => <article className="admin-gallery-card" key={item.id}>
          <div className="admin-gallery-image-frame"><img src={item.image_url} alt={item.product_name} loading="lazy" onError={e => { e.currentTarget.style.display = 'none'; e.currentTarget.parentElement.classList.add('broken') }} /><span>✓ Approved</span></div>
          <div className="admin-gallery-details"><h3>{item.product_name}</h3><p>{item.category || 'Other'}</p><div className="admin-gallery-actions"><small>Available to users</small><button type="button" className="admin-gallery-delete" disabled={deletingId === item.id} onClick={() => handleDeleteImage(item)} aria-label={`Delete image for ${item.product_name}`}>{deletingId === item.id ? 'Deleting…' : '🗑 Delete'}</button></div></div>
        </article>)}
      </div>}
    </section>
    <p className="admin-gallery-security-note">🔒 Only an authorized admin can add or delete gallery images. Deleting a gallery image does not delete household products.</p>
  </div>
}
