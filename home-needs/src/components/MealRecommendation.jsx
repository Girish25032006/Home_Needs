import './MealRecommendation.css'

function MealRecommendation() {
  return (
    <div className="meal-recommendation">

      <div className="page-title">
        <h1>🍽️ Meal Recommendations</h1>
        <p>Discover meals you can make with what you have at home</p>
      </div>

      {/* Available Ingredients */}

      <div className="available-ingredients">

        <h2>🥕 Available Ingredients</h2>

        <div className="ingredient-list">
          <span>🍚 Rice</span>
          <span>🧅 Onion</span>
          <span>🍅 Tomato</span>
          <span>🌶️ Chilli</span>
          <span>🛢️ Cooking Oil</span>
        </div>

      </div>


      {/* Recommended Meals */}

      <div className="meal-section">

        <h2>👩‍🍳 Recommended Meals</h2>

        <div className="meal-grid">

          <div className="meal-card">

            <div className="meal-image">
              🍅🍚
            </div>

            <div className="meal-content">
              <h3>Tomato Rice</h3>

              <p>
                A simple and tasty rice dish using your
                available ingredients.
              </p>

              <div className="meal-details">
                <span>⏱️ 30 mins</span>
                <span>🥗 Easy</span>
              </div>

              <button>
                👨‍🍳 View Recipe
              </button>
            </div>

          </div>


          <div className="meal-card">

            <div className="meal-image">
              🍚🥕
            </div>

            <div className="meal-content">
              <h3>Vegetable Rice</h3>

              <p>
                A healthy rice meal that uses ingredients
                already available in your kitchen.
              </p>

              <div className="meal-details">
                <span>⏱️ 35 mins</span>
                <span>🥗 Easy</span>
              </div>

              <button>
                👨‍🍳 View Recipe
              </button>
            </div>

          </div>


          <div className="meal-card">

            <div className="meal-image">
              🍅🌶️
            </div>

            <div className="meal-content">
              <h3>Spicy Tomato Rice</h3>

              <p>
                A spicy and flavorful meal prepared with
                tomato, chilli and rice.
              </p>

              <div className="meal-details">
                <span>⏱️ 25 mins</span>
                <span>🌶️ Medium</span>
              </div>

              <button>
                👨‍🍳 View Recipe
              </button>
            </div>

          </div>

        </div>

      </div>


      {/* AI Note */}

      <div className="meal-ai-note">

        <h2>🤖 Smart Meal Suggestions</h2>

        <p>
          Home Needs will recommend meals based on your
          available ingredients, consumption patterns,
          preferences and products that should be used soon.
        </p>

      </div>

    </div>
  )
}

export default MealRecommendation