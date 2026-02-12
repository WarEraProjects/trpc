# WarEra tRPC Client
This package provides a frontend + backend compatible tRPC communication layer.

## Install
```bash
npm install
```

## Generate OpenAPI Types
```bash
npm run openapi
```

## Usage
```ts
import { createTrpcClient } from "../src/trpc-client";

async function main() {
  const trpc = createTrpcClient({
    url: "https://api2.warera.io/trpc",
    apiKey: process.env.WARERA_API_KEY
  });

  // After running npm run openapi, the objects and input typing will automatically
  // become available for the trpc object
  const allCountries: any = await trpc.country.getAllCountries({});
  const firstID = allCountries[0]._id;


  // Test: run multiple requests concurrently
  // Question: Is this the right way to have all the actions in one request?
  const [countryById, government] = await Promise.all([
    trpc.country.getCountryById({ countryId: firstID }),
    trpc.government.getByCountryId({ countryId: firstID })
  ]);

  // Log out the results
  console.log("Country details:", countryById);
  console.log("Government:", government);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

```

## Important
The API does not provide return types, thus the return types needs to be created manually, and added as a type.
Do not change the `warera-openapi.d.ts` as it will be overwritten when `npm run openapi` is executed.
Currently the tests folder is being used to create the types manually.
