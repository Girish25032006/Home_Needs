import './ConsumptionTracking.css'

function ConsumptionTracking() {
  return (
    <div className="consumption-tracking">

      <div className="page-title">
        <h1>📊 Consumption Tracking</h1>
        <p>Track how much your household uses</p>
      </div>

      {/* Consumption Form */}

      <div className="consumption-form">

        <div className="form-group">
          <label>Product</label>

          <select>
            <option>Rice</option>
            <option>Cooking Oil</option>
            <option>Detergent</option>
            <option>Sugar</option>
          </select>
        </div>

        <div className="form-row">

          <div className="form-group">
            <label>Quantity Used</label>

            <input
              type="number"
              placeholder="Example: 2"
            />
          </div>

          <div className="form-group">
            <label>Unit</label>

            <select>
              <option>Kg</option>
              <option>Gram</option>
              <option>Litre</option>
              <option>Packet</option>
              <option>Piece</option>
              <option>Bottle</option>
            </select>
          </div>

        </div>

        <div className="form-group">
          <label>Usage Date</label>
          <input type="date" />
        </div>

        <button className="consumption-save-button">
          💾 Record Usage
        </button>

      </div>


      {/* Consumption Summary */}

      <div className="consumption-history">

        <h2>📋 Recent Consumption</h2>

        <div className="consumption-card">

          <div>
            <h3>🍚 Rice</h3>
            <p>2 Kg used • 6 September 2026</p>
          </div>

          <strong>2 Kg</strong>

        </div>

        <div className="consumption-card">

          <div>
            <h3>🛢️ Cooking Oil</h3>
            <p>1 Litre used • 5 September 2026</p>
          </div>

          <strong>1 Litre</strong>

        </div>

        <div className="consumption-card">

          <div>
            <h3>🧺 Detergent</h3>
            <p>1 Packet used • 4 September 2026</p>
          </div>

          <strong>1 Packet</strong>

        </div>

      </div>

    </div>
  )
}

export default ConsumptionTracking