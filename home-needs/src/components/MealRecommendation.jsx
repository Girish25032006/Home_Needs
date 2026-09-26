
import { useEffect, useState } from 'react'
import './MealRecommendation.css'

const API_URL = 'http://127.0.0.1:5000'

const recipes = []

function normalizeName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function MealRecommendation() {
  const [products, setProducts] = useState([])
  const [customMeals, setCustomMeals] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedRecipe, setSelectedRecipe] = useState(null)

  const [showAddForm, setShowAddForm] = useState(false)
  const [mealName, setMealName] = useState('')
  const [preparationTime, setPreparationTime] = useState('30')
  const [difficulty, setDifficulty] = useState('Easy')
  const [ingredients, setIngredients] = useState([
    { ingredient_name: '', quantity: '', unit: '' }
  ])
  const [saving, setSaving] = useState(false)
  const [formMessage, setFormMessage] = useState('')

  useEffect(() => {
    // Load products and saved meals when the page opens.
    fetchProducts()
    fetchMeals()

    // Refresh inventory whenever a product is added or updated
    // from another page in the Home Needs app.
    const handleProductsUpdated = () => {
      fetchProducts()
    }

    window.addEventListener('productsUpdated', handleProductsUpdated)

    // Clean up the event listener when this component unmounts.
    return () => {
      window.removeEventListener('productsUpdated', handleProductsUpdated)
    }
  }, [])

  async function fetchProducts() {
    try {
      setError('')

      const response = await fetch(`${API_URL}/`)

      if (!response.ok) {
        throw new Error('Unable to fetch products')
      }

      const data = await response.json()

      if (!Array.isArray(data)) {
        throw new Error('Invalid product data received')
      }

      setProducts(data)
    } catch (err) {
      console.error('Product error:', err)
      setError(
        'Unable to load ingredients. Please check whether the backend is running.'
      )
    } finally {
      setLoading(false)
    }
  }

  async function fetchMeals() {
    try {
      const response = await fetch(`${API_URL}/meals`)

      if (!response.ok) {
        throw new Error('Unable to fetch meals')
      }

      const data = await response.json()

      if (Array.isArray(data)) {
        setCustomMeals(data)
      }
    } catch (err) {
      console.error('Meal fetching error:', err)
    }
  }

  const availableProducts = products.filter(
    product => Number(product.quantity) > 0
  )

  const availableIngredients = availableProducts.map(product => ({
    name:
      product.product_name ||
      product.productName ||
      product.name ||
      'Product',
    quantity: product.quantity,
    unit: product.unit || ''
  }))

  // Find matching product in the current stock.
  function findProduct(ingredientName) {
    const searchName = normalizeName(ingredientName)

    // Search all inventory products, including products with zero stock.
    return products.find(product => {
      const productName = normalizeName(
        product.product_name ||
        product.productName ||
        product.name
      )

      return (
        productName &&
        searchName &&
        (
          productName === searchName ||
          productName.includes(searchName) ||
          searchName.includes(productName)
        )
      )
    })
  }

  function hasIngredient(ingredient) {
    const product = findProduct(ingredient)
    return Boolean(product && Number(product.quantity) > 0)
  }

  // Check if required ingredient quantity is available.
  
function isIngredientSufficient(ingredient) {
  const product = findProduct(
    ingredient.ingredient_name || ingredient
  )

  if (!product) return false

  // Built-in recipes only check whether the ingredient exists.
  if (typeof ingredient === 'string') {
    return true
  }

  const requiredQuantity = Number(ingredient.quantity)

  const availableQuantity = Number(product.quantity)

  if (
    !Number.isFinite(requiredQuantity) ||
    requiredQuantity <= 0 ||
    !Number.isFinite(availableQuantity)
  ) {
    return false
  }

  function normalizeUnit(unit) {
    return String(unit || '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '')
  }

  const requiredUnit = normalizeUnit(ingredient.unit)
  const availableUnit = normalizeUnit(product.unit)

  // Convert stock quantity into the recipe's required unit.
  const conversions = {
    kg: { g: 1000 },
    g: { kg: 0.001 },
    litre: { ml: 1000, l: 1000 },
    liter: { ml: 1000, l: 1000 },
    l: { ml: 1000 },
    ml: { litre: 0.001, liter: 0.001, l: 0.001 }
  }

  let convertedStock = availableQuantity

  if (availableUnit !== requiredUnit) {
    const conversion =
      conversions[availableUnit]?.[requiredUnit]

    if (!conversion) {
      return false
    }

    convertedStock = availableQuantity * conversion
  }

  return convertedStock >= requiredQuantity
}

  function getMealStatus(meal) {
    const mealIngredients = meal.ingredients || []

    if (mealIngredients.length === 0) {
      return 2
    }

    const availableCount = mealIngredients.filter(
      ingredient => isIngredientSufficient(ingredient)
    ).length

    if (availableCount === mealIngredients.length) {
      return 0
    }

    if (availableCount > 0) {
      return 1
    }

    const matchedCount = mealIngredients.filter(ingredient => {
      const name = typeof ingredient === 'string'
        ? ingredient
        : ingredient.ingredient_name
      return Boolean(findProduct(name))
    }).length

    // Unknown ingredients with no inventory match are placed last.
    return matchedCount === 0 ? 3 : 2
  }

  // Built-in recipes and database meals are combined.
  const allMeals = [
    ...recipes.map(recipe => ({
      ...recipe,
      isCustom: false
    })),
    ...customMeals.map(meal => ({
      ...meal,
      id: `custom-${meal.id}`,
      name: meal.meal_name,
      image: '🍽️',
      description: 'Your own saved meal recipe.',
      time: `${meal.preparation_time || 30} mins`,
      difficulty: meal.difficulty || 'Easy',
      isCustom: true,
      steps: []
    }))
  ]

  // Meals with all ingredients available appear first.
  const recommendedMeals = [...allMeals].sort((a, b) => {
    return getMealStatus(a) - getMealStatus(b)
  })

  function addIngredientRow() {
    setIngredients([
      ...ingredients,
      { ingredient_name: '', quantity: '', unit: '' }
    ])
  }

  function removeIngredientRow(index) {
    setIngredients(
      ingredients.filter((_, i) => i !== index)
    )
  }

  function updateIngredient(index, field, value) {
    const updatedIngredients = [...ingredients]

    updatedIngredients[index] = {
      ...updatedIngredients[index],
      [field]: value
    }

    setIngredients(updatedIngredients)
  }

  async function handleAddMeal(event) {
    event.preventDefault()

    setFormMessage('')

    if (!mealName.trim()) {
      setFormMessage('Please enter the meal name.')
      return
    }

    const validIngredients = ingredients.filter(
      ingredient =>
        ingredient.ingredient_name.trim() &&
        Number(ingredient.quantity) > 0 &&
        ingredient.unit.trim()
    )

    if (validIngredients.length === 0) {
      setFormMessage(
        'Please enter at least one ingredient with quantity and unit.'
      )
      return
    }

    setSaving(true)

    try {
      const response = await fetch(`${API_URL}/meals`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          meal_name: mealName.trim(),
          preparation_time: Number(preparationTime),
          difficulty,
          ingredients: validIngredients.map(ingredient => ({
            ingredient_name: ingredient.ingredient_name.trim(),
            quantity: Number(ingredient.quantity),
            unit: ingredient.unit.trim()
          }))
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Unable to save meal')
      }

      setFormMessage('Meal added successfully!')

      setMealName('')
      setPreparationTime('30')
      setDifficulty('Easy')
      setIngredients([
        { ingredient_name: '', quantity: '', unit: '' }
      ])

      await fetchMeals()
      setShowAddForm(false)
    } catch (err) {
      console.error('Add meal error:', err)
      setFormMessage(err.message || 'Unable to save meal.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteMeal(meal) {
    const confirmed = window.confirm(`Delete "${meal.meal_name}"?`)
    if (!confirmed) return

    try {
      const response = await fetch(`${API_URL}/meals/${meal.id}`, {
        method: 'DELETE'
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Unable to delete meal')
      }

      if (selectedRecipe?.isCustom && selectedRecipe.id === `custom-${meal.id}`) {
        setSelectedRecipe(null)
      }
      await fetchMeals()
    } catch (err) {
      console.error('Delete meal error:', err)
      setFormMessage(err.message || 'Unable to delete meal.')
    }
  }

  return (
    <div className="meal-recommendation">

      <div className="page-title">
        <h1>🍽️ Meal Recommendations</h1>
        <p>Discover meals you can make with what you have at home</p>
      </div>

      {/* Available Ingredients */}

      <div className="available-ingredients">
        <h2>🥕 Available Ingredients</h2>

        {loading ? (
          <p>Loading ingredients from your stock...</p>
        ) : error ? (
          <p>{error}</p>
        ) : availableIngredients.length === 0 ? (
          <p>
            No ingredients available. Add products and update their stock.
          </p>
        ) : (
          <div className="ingredient-list">
            {availableIngredients.map((ingredient, index) => (
              <span key={`${ingredient.name}-${index}`}>
                🥕 {ingredient.name} ({ingredient.quantity} {ingredient.unit})
              </span>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            fetchProducts()
            fetchMeals()
          }}
          style={{
            marginTop: '15px',
            padding: '9px 16px',
            border: 'none',
            borderRadius: '8px',
            background: '#4caf50',
            color: 'white',
            cursor: 'pointer'
          }}
        >
          🔄 Refresh Ingredients
        </button>
      </div>

      {/* Add Your Own Meal */}

      <div className="meal-section">

        <button
          type="button"
          onClick={() => {
            setShowAddForm(!showAddForm)
            setFormMessage('')
          }}
          style={{
            padding: '12px 20px',
            border: 'none',
            borderRadius: '10px',
            background: '#ff9800',
            color: 'white',
            fontWeight: 'bold',
            cursor: 'pointer',
            marginBottom: '20px'
          }}
        >
          {showAddForm ? '✖ Close Form' : '➕ Add Your Own Meal'}
        </button>

        {showAddForm && (
          <form
            onSubmit={handleAddMeal}
            style={{
              background: '#fff',
              padding: '20px',
              borderRadius: '15px',
              marginBottom: '25px',
              boxShadow: '0 2px 10px rgba(0,0,0,0.08)'
            }}
          >
            <h2>🍳 Add a New Meal</h2>

            <label
              style={{
                display: 'block',
                margin: '15px 0 6px',
                fontWeight: 'bold'
              }}
            >
              Meal Name
            </label>

            <input
              type="text"
              value={mealName}
              onChange={event => setMealName(event.target.value)}
              placeholder="Enter meal name"
              required
              style={{
                width: '100%',
                padding: '12px',
                border: '1px solid #ccc',
                borderRadius: '8px',
                boxSizing: 'border-box'
              }}
            />

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '12px',
                marginTop: '15px'
              }}
            >
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: 'bold' }}>
                  Preparation Time (minutes)
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={preparationTime}
                  onChange={event => setPreparationTime(event.target.value)}
                  required
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: 'bold' }}>
                  Difficulty
                </label>
                <select
                  value={difficulty}
                  onChange={event => setDifficulty(event.target.value)}
                  style={inputStyle}
                >
                  <option value="Easy">Easy</option>
                  <option value="Medium">Medium</option>
                  <option value="Hard">Hard</option>
                </select>
              </div>
            </div>

            <h3 style={{ marginTop: '20px' }}>
              🥕 Required Ingredients
            </h3>

            {ingredients.map((ingredient, index) => (
              <div
                key={index}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 1fr 1fr auto',
                  gap: '10px',
                  marginBottom: '12px',
                  alignItems: 'center'
                }}
              >
                <input
                  type="text"
                  value={ingredient.ingredient_name}
                  onChange={event =>
                    updateIngredient(
                      index,
                      'ingredient_name',
                      event.target.value
                    )
                  }
                  placeholder="Ingredient name"
                  required
                  style={inputStyle}
                />

                <input
                  type="number"
                  min="0.01"
                  step="any"
                  value={ingredient.quantity}
                  onChange={event =>
                    updateIngredient(
                      index,
                      'quantity',
                      event.target.value
                    )
                  }
                  placeholder="Quantity"
                  required
                  style={inputStyle}
                />

                <input
                  type="text"
                  value={ingredient.unit}
                  onChange={event =>
                    updateIngredient(
                      index,
                      'unit',
                      event.target.value
                    )
                  }
                  placeholder="Unit (kg, g)"
                  required
                  style={inputStyle}
                />

                <button
                  type="button"
                  onClick={() => removeIngredientRow(index)}
                  disabled={ingredients.length === 1}
                  style={{
                    padding: '10px',
                    border: 'none',
                    borderRadius: '8px',
                    background: '#ffdddd',
                    color: '#b00020',
                    cursor: 'pointer'
                  }}
                >
                  ✖
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={addIngredientRow}
              style={{
                padding: '10px 15px',
                border: 'none',
                borderRadius: '8px',
                background: '#4caf50',
                color: 'white',
                cursor: 'pointer',
                marginTop: '5px'
              }}
            >
              ➕ Add Ingredient
            </button>

            {formMessage && (
              <p style={{ marginTop: '15px' }}>
                {formMessage}
              </p>
            )}

            <button
              type="submit"
              disabled={saving}
              style={{
                display: 'block',
                width: '100%',
                padding: '13px',
                marginTop: '20px',
                border: 'none',
                borderRadius: '10px',
                background: '#ff9800',
                color: 'white',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              {saving ? 'Saving Meal...' : '💾 Save Meal'}
            </button>
          </form>
        )}

      </div>

      {/* Recommended Meals */}

      <div className="meal-section">
        <h2>👩‍🍳 Recommended Meals</h2>

        <p style={{ marginBottom: '15px' }}>
          Meals with all required ingredients available are shown first.
        </p>

        {loading ? (
          <p>Finding meals for you...</p>
        ) : error ? (
          <p>
            Meal recommendations are unavailable until the backend is connected.
          </p>
        ) : recommendedMeals.length === 0 ? (
          <p>
            No meals found. Add your own meal or update your stock.
          </p>
        ) : (
          <div className="meal-grid">
            {recommendedMeals.map(recipe => {
              const status = getMealStatus(recipe)

              return (
                <div className="meal-card" key={recipe.id}>

                  <div className="meal-image">
                    {recipe.image}
                  </div>

                  <div className="meal-content">
                    <h3>{recipe.name}</h3>

                    <p>{recipe.description}</p>

                    <div className="meal-details">
                      <span>⏱️ {recipe.time}</span>
                      <span>🥗 {recipe.difficulty}</span>
                    </div>

                    <p
                      style={{
                        fontWeight: 'bold',
                        color:
                          status === 0
                            ? 'green'
                            : status === 1
                            ? '#d97706'
                            : '#d32f2f',
                        marginTop: '10px'
                      }}
                    >
                      {status === 0
                        ? '✅ All ingredients available'
                        : status === 1
                        ? '⚠️ Some ingredients available'
                        : status === 2
                        ? '🛒 Ingredients need to be purchased'
                        : '➕ Ingredients not in your inventory'}
                    </p>

                    <button
                      type="button"
                      onClick={() => setSelectedRecipe(recipe)}
                    >
                      👨‍🍳 View Recipe
                    </button>

                    {recipe.isCustom && (
                      <button
                        type="button"
                        onClick={() =>
                          handleDeleteMeal(
                            customMeals.find(
                              meal => `custom-${meal.id}` === recipe.id
                            )
                          )
                        }
                        className="delete-meal-btn"
                      >
                        🗑️ Delete
                      </button>
                    )}
                  </div>

                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Recipe Details */}

      {selectedRecipe && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px'
          }}
          onClick={() => setSelectedRecipe(null)}
        >
          <div
            style={{
              background: 'white',
              padding: '25px',
              borderRadius: '18px',
              width: '100%',
              maxWidth: '550px',
              maxHeight: '85vh',
              overflowY: 'auto'
            }}
            onClick={event => event.stopPropagation()}
          >
            <h2>
              {selectedRecipe.image} {selectedRecipe.name}
            </h2>

            <h3>🥕 Ingredients</h3>

            <ul>
              {selectedRecipe.ingredients.map((ingredient, index) => {
                const ingredientName =
                  typeof ingredient === 'string'
                    ? ingredient
                    : ingredient.ingredient_name

                const sufficient =
                  isIngredientSufficient(ingredient)

                return (
                  <li key={index}>
                    {ingredientName}

                    {typeof ingredient !== 'string' && (
                      <>
                        {' '}
                        - Required: {ingredient.quantity} {ingredient.unit}
                      </>
                    )}

                    {sufficient
                      ? ' - Available in stock'
                      : ' - Need to purchase or update stock'}
                  </li>
                )
              })}
            </ul>

            <h3>👩‍🍳 Preparation Steps</h3>

            {selectedRecipe.steps.length > 0 ? (
              <ol>
                {selectedRecipe.steps.map((step, index) => (
                  <li key={index} style={{ marginBottom: '10px' }}>
                    {step}
                  </li>
                ))}
              </ol>
            ) : (
              <p>
                This is your saved custom meal. Follow your preferred
                preparation method using the ingredients listed above.
              </p>
            )}

            <button
              type="button"
              onClick={() => setSelectedRecipe(null)}
              style={{
                width: '100%',
                padding: '12px',
                border: 'none',
                borderRadius: '10px',
                background: '#ff9800',
                color: 'white',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              Close Recipe
            </button>
          </div>
        </div>
      )}

      {/* AI Note */}

      <div className="meal-ai-note">
        <h2>🤖 Smart Meal Suggestions</h2>

        <p>
          Home Needs recommends meals using your available product stock.
          Meals with all required ingredients and quantities available
          appear first. Meals with partially available ingredients appear
          next, followed by meals whose ingredients are not in stock, and
          finally meals with ingredients not listed in your inventory.
          Your custom meals are saved in the database.
        </p>
      </div>

    </div>
  )
}

const inputStyle = {
  width: '100%',
  minWidth: 0,
  padding: '12px',
  border: '1px solid #ccc',
  borderRadius: '8px',
  boxSizing: 'border-box'
}

export default MealRecommendation