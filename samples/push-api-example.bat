@echo off
rem specs/push-api-example.md: pushes sample stock price rows into the
rem "exchange-prices-feed" datastore (source_type=serialized, renderer=json,
rem api_mode=push) via the public push API (specs/api_datastore.md II).
rem
rem Push only takes effect while at least one dashboard/control is actively
rem watching that datastore -- open the "Live Stock Prices" dashboard's
rem "Push Load" tab in a browser tab before running this, otherwise the API
rem responds 202 with "No active controls -- push skipped." and nothing
rem updates on screen.
setlocal

set "API_KEY=bb_lhXyC4sLV7RK1Wx2sAcjTZq6SMFQH25sN-oOkt4rWok"
set "URL=http://localhost:5173/api/v1/datastores/exchange-prices-feed/push"

curl -sS -X POST "%URL%" ^
  -H "X-API-Key: %API_KEY%" ^
  -H "Content-Type: application/json" ^
  -d "[{\"id\":1,\"symbol\":\"NFLX\",\"price\":\"83.25\"},{\"id\":2,\"symbol\":\"AMZN\",\"price\":\"259.52\"},{\"id\":3,\"symbol\":\"AAPL\",\"price\":\"318.98\"},{\"id\":4,\"symbol\":\"META\",\"price\":\"643.77\"},{\"id\":5,\"symbol\":\"GOOGL\",\"price\":\"336.46\"}]"

echo.
endlocal
