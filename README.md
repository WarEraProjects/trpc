# WarEra tRPC Client
This package provides a frontend + backend compatible tRPC communication layer for the WarEra.io API.

# Why should I use this package?
[WarEra.io](app.warera.io) is built on tRPC, and this client gives you a contract-aware integration layer instead of “raw HTTP calls”.

You get typed procedures, batching, and rate-limit safety out of the box.

## What it can do
- End-to-end TypeScript typing for inputs and responses.
- Procedure discovery via IntelliSense (no manual endpoint hunting).
- Automatic request batching to reduce network overhead and improve throughput.
- Built-in rate limiting aligned to API requirements, so your app degrades gracefully under throttling.
- Automatic URL length handling by splitting oversized requests and recombining results.
- Less boilerplate, fewer edge cases, faster iteration.

## Install
```bash
npm i @wareraprojects/api
```

## Usage
```ts
import { createTrpcLikeClient } from "@wareraprojects/api";

async function main() {
  const client = createTrpcLikeClient({
    url: "https://api2.warera.io/trpc",
    apiKey: process.env.WARERA_API_KEY
  });

  const allCountries = await client.country.getAllCountries({});
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

