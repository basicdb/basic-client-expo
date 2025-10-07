# Changelog

## [0.0.8] - 2025-10-07

### Fixed
- **OAuth2 Compliance**: Fixed critical authentication flow issues
  - Fixed scope separator (comma → space-separated)
  - Fixed userInfo endpoint case (`userInfo` → `userinfo`)
  - Added required `redirect_uri` parameter to token exchange
  - Fixed refresh token parameter name (`code` → `refresh_token`)
- **Error Handling**: Improved error messages throughout with OAuth2 error format parsing
- **Error Handling**: Added proper state validation and CSRF attack detection
- **Logging**: Removed success logging, now only logs errors

### Changed
- Default scopes updated to `['profile', 'email', 'app:admin']`

## [0.0.6] 

### Added
- New database query functions:
  - `getAll()` - Fetch all records from a table
  - `get(id)` - Fetch a specific record by ID
  - `filter(conditions)` - Filter records with operators:
    - `eq`, `neq` - Equality operators
    - `gt`, `gte`, `lt`, `lte` - Comparison operators
    - `like`, `ilike` - Pattern matching
    - `in` - Set membership
    - `not` - Negation
  - `order(field, direction)` - Sort results
  - `limit(n)` and `offset(n)` - Pagination support

### Limitations
- Multiple conditions on different fields not supported
- Range filters not supported
- Operations must be chained after `getAll()`
