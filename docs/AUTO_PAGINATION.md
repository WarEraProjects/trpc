# Auto-Pagination Feature

## Overview

This tRPC client now supports automatic cursor-based pagination for endpoints that return paginated results. This allows you to easily iterate through all pages of data without manually managing cursors.

## Supported Endpoints

The following 8 endpoints support auto-pagination:

- `article.getArticlesPaginated`
- `battle.getBattles`
- `company.getCompanies`
- `event.getEventsPaginated`
- `mu.getManyPaginated`
- `transaction.getPaginatedTransactions`
- `user.getUsersByCountry`
- `workOffer.getWorkOffersPaginated`

## Usage

### Basic Auto-Pagination

To enable auto-pagination, add `autoPaginate: true` to your request:

```typescript
import { createAPIClient } from "@wareraprojects/api";

const client = createAPIClient({
  url: "https://api2.warera.net/trpc",
  apiKey: "your-api-key" // optional
});

// Iterate through 20 pages
for await (const page of client.article.getArticlesPaginated({
  type: "last",
  limit: 20,
  autoPaginate: true.
  maxPages: 20
})) {
  console.log(`Received ${page.items.length} articles`);
  
  // Process items
  page.items.forEach(article => {
    console.log(article.title);
  });
  
  // page.cursor contains the cursor for this page
  console.log(`Cursor: ${page.cursor}`);
}
```

### Options

#### `autoPaginate: boolean`

When set to `true`, the client returns an `AsyncIterableIterator` that yields pages until all data is retrieved.

```typescript
{
  autoPaginate: true
}
```

#### `maxPages?: number`

Limit the maximum number of pages to retrieve. Useful to prevent runaway pagination or for testing.

```typescript
{
  autoPaginate: true,
  maxPages: 5  // Stop after 5 pages
}
```

**Default**: `Infinity` (no limit)

#### `cursorEnd?: Date`

Stop pagination when the cursor date becomes older than this date. The cursor format includes a timestamp that is parsed and compared.

```typescript
{
  autoPaginate: true,
  cursorEnd: new Date("2026-02-15")  // Stop when cursor is before this date
}
```

**Default**: `undefined` (no date filtering)

**Note**: Cursors have the format `"{date}|{id}"`. The date portion is extracted and parsed for comparison.

## Return Types

### With Auto-Pagination

When `autoPaginate: true`, the function returns an `AsyncIterableIterator<PageResult<K>>`:

```typescript
type PageResult<K> = {
  items: T[];      // Array of items for this page
  cursor: string;  // The cursor that was used to fetch the next page
};
```

### Without Auto-Pagination (Regular Call)

Without `autoPaginate`, the function returns a `Promise` with the regular response:

```typescript
{
  items: T[];
  nextCursor: string;
}
```

## Examples

### Example 1: Collect All Items

```typescript
const client = createAPIClient({ url: "..." });

const allBattles: Battle[] = [];

for await (const page of client.battle.getBattles({
  autoPaginate: true,
  maxPages: 10,
  limit: 50
})) {
  allBattles.push(...page.items);
}

console.log(`Total battles: ${allBattles.length}`);
```

### Example 2: Date-Based Filtering

```typescript
// Get all events from the last week
const oneWeekAgo = new Date();
oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

for await (const page of client.event.getEventsPaginated({
  autoPaginate: true,
  cursorEnd: oneWeekAgo,
  limit: 100
})) {
  processEvents(page.items);
}
```

### Example 3: Early Termination

```typescript
let foundTarget = false;

for await (const page of client.company.getCompanies({
  autoPaginate: true,
  perPage: 50
})) {
  for (const company of page.items) {
    if (company.name === "Target Company") {
      foundTarget = true;
      break;
    }
  }
  
  if (foundTarget) {
    break; // Exit the async iteration
  }
}
```

### Example 4: Regular (Non-Paginated) Call

```typescript
// Regular single-page request (backward compatible)
const result = await client.article.getArticlesPaginated({
  type: "last",
  limit: 10
  // No autoPaginate flag
});

console.log(`Items: ${result.items.length}`);
console.log(`Next cursor: ${result.nextCursor}`);
```

## Type Safety

The implementation is fully type-safe:

- `autoPaginate` parameter is only available on paginated endpoints
- Return types automatically adjust based on whether `autoPaginate` is used
- `PageResult<K>` correctly infers item types from the endpoint

```typescript
// TypeScript knows this returns AsyncIterableIterator
const iterator = client.article.getArticlesPaginated({
  type: "last",
  autoPaginate: true
});

for await (const page of iterator) {
  // page.items is correctly typed as Article[]
  // page.cursor is a string
  page.items.forEach(article => {
    console.log(article.title); // TypeScript knows about 'title'
  });
}
```

## Rate Limiting

Auto-pagination respects the existing rate limiting:

- Default: 100 requests per minute (without API key)
- With API key: 200 requests per minute
- Configurable via `rateLimit` option

Each page request counts toward the rate limit and is automatically queued and delayed as needed.

## Termination Conditions

Auto-pagination stops when any of the following conditions is met:

1. **No more data**: The API returns an empty or null `nextCursor`
2. **Max pages reached**: The `maxPages` limit is hit
3. **Cursor date exceeded**: When using `cursorEnd`, pagination stops when the next cursor's date is older than the specified date

## Error Handling

Errors during pagination will throw and stop the iteration:

```typescript
try {
  for await (const page of client.battle.getBattles({
    autoPaginate: true
  })) {
    // Process page
  }
} catch (error) {
  console.error("Pagination failed:", error);
}
```

## Migration Guide

Existing code continues to work without changes:

```typescript
// Before (still works)
const result = await client.article.getArticlesPaginated({
  type: "last",
  limit: 10,
  cursor: someCursor
});

// New feature (opt-in)
for await (const page of client.article.getArticlesPaginated({
  type: "last",
  limit: 10,
  autoPaginate: true
})) {
  // ...
}
```

## Implementation Notes

- Cursor format: `"{date}|{id}"` where date is a parseable date string
- Empty cursors, malformed cursors, or unparseable dates are handled gracefully
- All 8 paginated endpoints follow the same response pattern: `{ items: T[], nextCursor: string }`
- The feature is zero-cost for non-paginated endpoints and backward compatible
