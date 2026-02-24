# WarEra tRPC Client
This package provides a frontend + backend compatible tRPC communication layer for the WarEra.io API.

# Why should I use this package?
[WarEra.io](https://app.warera.io) is built on tRPC, and this client gives you a contract-aware integration layer instead of “raw HTTP calls”.

You get typed procedures, batching, and rate-limit safety out of the box.

## What it can do
- End-to-end TypeScript typing for inputs and responses.
- Procedure discovery via IntelliSense (no manual endpoint hunting).
- Automatic request batching to reduce network overhead and improve throughput.
- Built-in rate limiting aligned to API requirements, so your app degrades gracefully under throttling.
- Automatic URL length handling by splitting oversized requests and recombining results.
- **Automatic cursor-based pagination** with type-safe async iterators. See [Auto-Pagination Guide](./docs/AUTO_PAGINATION.md).
- Less boilerplate, fewer edge cases, faster iteration. 

## Install
```bash
npm i @wareraprojects/api
```

## Usage
```ts
import { createAPIClient } from "@wareraprojects/api";

async function main() {
  const client = createAPIClient({
    apiKey: process.env.WARERA_API_KEY
  });

  const allCountries = await client.country.getAllCountries();
  const firstId = allCountries[0]._id;

  // Multiple calls in the same tick can be batched into fewer HTTP requests.
  const [countryById, government] = await Promise.all([
    client.country.getCountryById({ countryId: firstId }),
    client.government.getByCountryId({ countryId: firstId })
  ]);

  console.log("Country details:", countryById);
  console.log("Government:", government);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

## Auto-Pagination

For endpoints that support cursor-based pagination, use the `autoPaginate` flag to automatically iterate through all pages:

```ts
import { createAPIClient } from "@wareraprojects/api";

async function main() {
  const client = createAPIClient({
    apiKey: process.env.WARERA_API_KEY
  });

  // Automatically paginate through all articles
  for await (const page of client.article.getArticlesPaginated({
    type: "last",
    limit: 50,
    autoPaginate: true,
    maxPages: 20  // Optional: limit to 20 pages
  })) {
    console.log(`Processing ${page.items.length} articles`);
    page.items.forEach(article => {
      console.log(`- ${article.title}`);
    });
  }
}

main().catch(console.error);
```

See the [Auto-Pagination Guide](./docs/AUTO_PAGINATION.md) for more details and advanced usage patterns.

---

If you wish to support future development, feel free to support the devs:

ZaLimitless (Dog):

[![Buy me a coffee](https://img.shields.io/badge/Buy%20me%20a%20coffee-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/jvdlanger)
