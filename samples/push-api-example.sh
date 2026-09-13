#!/bin/bash
# specs/push-api-example.md: pushes sample stock price rows into the
# "exchange-prices-feed" datastore (source_type=serialized, renderer=json,
# api_mode=push) via the public push API (specs/api_datastore.md II).
#
# Push only takes effect while at least one dashboard/control is actively
# watching that datastore -- open the "Live Stock Prices" dashboard's
# "Push Load" tab in a browser tab before running this, otherwise the API
# responds 202 with "No active controls -- push skipped." and nothing
# updates on screen.
set -e

API_KEY="bb_lhXyC4sLV7RK1Wx2sAcjTZq6SMFQH25sN-oOkt4rWok"
URL="http://localhost:5173/api/v1/datastores/exchange-prices-feed/push"

curl -sS -X POST "$URL" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '[
    { "id": 1, "symbol": "NFLX", "price": "82.25" },
    { "id": 2, "symbol": "AMZN", "price": "259.52" },
    { "id": 3, "symbol": "AAPL", "price": "318.98" },
    { "id": 4, "symbol": "META", "price": "616.77" },
    { "id": 5, "symbol": "GOOGL", "price": "338.45" }
  ]'
echo
