import { useEffect, useState } from 'react'
import API_URL from '../api'
import './MealImageGallery.css'

export default function MealImageGallery({ selectionMode = false, onSelectImage, onClose }) {
  const [images, setImages] = useState([])
  const [mealName, setMealName] = useState('')
  const [category, setCategory] = useState('Vegetarian')
  const [imageUrl, setImageUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [showSearch, setShowSearch] = useState(false)

  async function fetchImages() {
    setLoading(true)
    try {
      const response = await fetch(`${API_URL}/meal-image-gallery`, { credentials: 'include' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || data.error || 'Unable to load gallery')
      setImages(Array.isArray(data) ? data : data.images || data.gallery || [])
    } catch (error) {
      setMessage(error.message || 'Unable to load meal images.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchImages() }, [])

  async function handleAddImage(event) {
    event.preventDefault()
    setMessage('')
    setSaving(true)
    try {
      const response = await fetch(`${API_URL}/meal-image-gallery`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meal_name: mealName.trim(), category, image_url: imageUrl.trim() })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || data.error || 'Unable to add image')
      setMessage('Meal image added successfully!')
      setMealName('')
      setImageUrl('')
      await fetchImages()
    } catch (error) {
      setMessage(error.message || 'Unable to add image.')
    } finally { setSaving(false) }
  }

  async function handleDelete(image) {
    if (!window.confirm(`Remove the gallery image for "${image.meal_name}"?`)) return
    try {
      const response = await fetch(`${API_URL}/meal-image-gallery/${image.id}`, { method: 'DELETE', credentials: 'include' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || data.error || 'Unable to delete image')
      setMessage('Gallery image removed. Saved meals and ingredients are preserved.')
      await fetchImages()
    } catch (error) { setMessage(error.message || 'Unable to delete image.') }
  }

  const filteredImages = images.filter(image => `${image.meal_name || ''} ${image.category || ''}`.toLowerCase().includes(search.trim().toLowerCase()))

  return (
    <div className={`meal-gallery-page ${selectionMode ? 'meal-gallery-selection-mode' : ''}`}>
      <header className="meal-gallery-header">
        <div>
          <h1>{selectionMode ? '🍽️ Choose a Meal Image' : '🍽️ Add Meal Image'}</h1>
          <p>{selectionMode ? 'Select an image to return to your new meal.' : 'Manage the shared image gallery for Home Needs meals.'}</p>
        </div>
        <div className="meal-gallery-header-actions">
          <span className="meal-gallery-count">{images.length} images</span>
          {selectionMode && <button type="button" className="meal-gallery-back-button" onClick={onClose}>← Back to Add Meal</button>}
        </div>
      </header>

      {!selectionMode && <form className="meal-gallery-form" onSubmit={handleAddImage}>
        <h2>➕ Add a Shared Meal Image</h2>
        <label htmlFor="gallery-meal-name">Meal name</label>
        <input id="gallery-meal-name" value={mealName} onChange={e => setMealName(e.target.value)} placeholder="Example: Masala Dosa" maxLength={150} required />
        <label htmlFor="gallery-meal-category">Category</label>
        <select id="gallery-meal-category" value={category} onChange={e => setCategory(e.target.value)}>
          <option value="Vegetarian">Vegetarian</option><option value="Non-Vegetarian">Non-Vegetarian</option><option value="Dessert">Dessert</option><option value="Snacks">Snacks</option><option value="General">General</option>
        </select>
        <label htmlFor="gallery-meal-url">Image URL (HTTPS)</label>
        <input id="gallery-meal-url" type="url" value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://example.com/meal.jpg" pattern="https://.*" required />
        {imageUrl.startsWith('https://') && <img className="meal-gallery-preview" src={imageUrl} alt="Meal preview" onError={e => { e.currentTarget.style.display = 'none' }} onLoad={e => { e.currentTarget.style.display = 'block' }} />}
        <button type="submit" disabled={saving}>{saving ? 'Adding image...' : 'Add to Shared Gallery'}</button>
        {message && <p className="meal-gallery-message" role="status">{message}</p>}
      </form>}

      <section className="meal-gallery-list">
        <div className="meal-gallery-list-heading">
          <h2>{selectionMode ? 'Select an Image' : 'Shared Meal Images'}</h2>
          <div className="meal-gallery-search">
            <button
              type="button"
              className="meal-gallery-search-toggle"
              aria-expanded={showSearch}
              onClick={() => {
                setShowSearch(previous => {
                  if (previous) setSearch('')
                  return !previous
                })
              }}
            >
              {showSearch ? '✕ Hide Search' : '🔍 Search Meals'}
            </button>
            {showSearch && (
              <input
                type="search"
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Search meals..."
                aria-label="Search meal images"
                autoFocus
              />
            )}
          </div>
        </div>
        {loading ? <p>Loading gallery...</p> : filteredImages.length === 0 ? <p>{images.length ? 'No images match your search.' : 'No meal images yet. Add your first image.'}</p> : (
          <div className="meal-gallery-grid">
            {filteredImages.map(image => <article className="meal-gallery-card" key={image.id || image.image_url}>
              <img src={image.image_url || image.imageUrl || image.url} alt={image.meal_name || image.name || 'Meal'} loading="lazy" />
              <div className="meal-gallery-card-content"><h3>{image.meal_name || image.mealName || image.name || 'Meal image'}</h3><span>{image.category || 'General'}</span>
                {selectionMode ? <button type="button" className="meal-gallery-select-button" onClick={() => { onSelectImage?.(image); onClose?.() }}>✓ Select This Image</button> : <button type="button" onClick={() => handleDelete(image)}>🗑️ Remove Image</button>}
              </div>
            </article>)}
          </div>
        )}
        {selectionMode && message && <p className="meal-gallery-message" role="alert">{message}</p>}
      </section>
    </div>
  )
}
