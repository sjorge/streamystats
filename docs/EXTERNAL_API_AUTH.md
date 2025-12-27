# External API Authentication

StreamyStats API endpoints support authentication via Jellyfin session tokens, allowing external clients (mobile apps, scripts, third-party integrations) to access the API.

## Authentication Method

Use the `Authorization` header with the MediaBrowser format:

```
Authorization: MediaBrowser Token="<access-token>"
```

### Full Header Format

The complete MediaBrowser authorization header can include additional parameters:

```
Authorization: MediaBrowser Client="MyApp", Device="iPhone", DeviceId="abc123", Version="1.0.0", Token="<access-token>"
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `Token` | **Yes** | The Jellyfin access token from `AuthenticationResult.AccessToken` |
| `Client` | No | Your client application name |
| `Device` | No | Device name |
| `DeviceId` | No | Unique device identifier |
| `Version` | No | Client version |

## Obtaining a Token

When authenticating with Jellyfin, the `/Users/AuthenticateByName` endpoint returns an `AuthenticationResult`:

```json
{
  "AccessToken": "abc123...",
  "User": {
    "Id": "user-id",
    "Name": "username",
    ...
  },
  "SessionInfo": { ... },
  "ServerId": "server-id"
}
```

Use the `AccessToken` value in the `Token` parameter.

## Example: Authenticate and Search

### Step 1: Get Token from Jellyfin

```bash
curl -X POST "https://your-jellyfin-server/Users/AuthenticateByName" \
  -H "Content-Type: application/json" \
  -H "X-Emby-Authorization: MediaBrowser Client=\"curl\", Device=\"CLI\", DeviceId=\"test\", Version=\"1.0\"" \
  -d '{"Username": "your-username", "Pw": "your-password"}'
```

### Step 2: Use Token with StreamyStats API

```bash
curl "https://your-streamystats/api/search?q=matrix" \
  -H "Authorization: MediaBrowser Token=\"<access-token-from-step-1>\""
```

## Supported Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/search` | GET | Global search across media, people, users |

*More endpoints will be added as they are updated to support external authentication.*

## Query Parameters for Search

| Parameter | Description | Example |
|-----------|-------------|---------|
| `q` | Search query (required) | `?q=matrix` |
| `limit` | Max results per category (1-100, default: 10) | `?limit=20` |
| `type` | Filter by type | `?type=movies` |
| `format` | Response format: `full` or `ids` | `?format=ids` |

### Type Filters

- `all` - All types (default)
- `media` - All media items
- `movies` - Movies only
- `series` - TV series only
- `episodes` - Episodes only
- `audio` - Audio/music
- `people` - All people (actors, directors, writers)
- `actors` - Actors only
- `directors` - Directors only
- `writers` - Writers only

### Response Formats

**Full format** (default):
```json
{
  "data": {
    "items": [{ "id": "...", "title": "The Matrix", ... }],
    "actors": [{ "id": "...", "title": "Keanu Reeves", ... }],
    ...
  }
}
```

**IDs format** (`?format=ids`):
```json
{
  "data": {
    "movies": ["id1", "id2"],
    "series": ["id3"],
    "actors": ["actor-id1"],
    ...
  }
}
```

The IDs format returns Jellyfin item IDs that can be used directly with the Jellyfin API.

## Error Responses

| Status | Description |
|--------|-------------|
| 401 | Invalid or missing token |
| 400 | Missing required parameters |

```json
{
  "error": "Unauthorized",
  "message": "Valid Jellyfin token required. Use Authorization: MediaBrowser Token=\"...\" header."
}
```

## Security Notes

- Tokens are validated against the Jellyfin server on each request
- Use HTTPS in production
- Tokens inherit the permissions of the Jellyfin user
- Session tokens can be revoked from Jellyfin's device management

