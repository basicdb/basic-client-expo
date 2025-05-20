# Changelog


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
