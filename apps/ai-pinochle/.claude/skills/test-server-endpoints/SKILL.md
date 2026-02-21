Test the server's REST endpoints using curl. Before running any commands, execute `source .venv/bin/activate` from the `server/` directory to activate the virtual environment.

Steps:
1. `cd server && source .venv/bin/activate`
2. Ensure the server is running (`uvicorn app.main:app --reload` in a separate terminal if needed).
3. Test each implemented endpoint listed below and report the HTTP status code and response body for each.

## Endpoints to test

### POST /auth/register — new user (expect 201)
```bash
curl -s -w "\nHTTP %{http_code}" -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"password123"}'
```

### POST /auth/register — duplicate username (expect 409)
```bash
curl -s -w "\nHTTP %{http_code}" -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"password123"}'
```

### POST /auth/register — with email (expect 201)
```bash
curl -s -w "\nHTTP %{http_code}" -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser2","password":"password123","email":"test@example.com"}'
```

### POST /auth/register — invalid username (expect 422)
```bash
curl -s -w "\nHTTP %{http_code}" -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"a","password":"password123"}'
```

After running all tests, summarize the results in a table:

| Endpoint | Scenario | Expected | Actual | Pass/Fail |
|----------|----------|----------|--------|-----------|
