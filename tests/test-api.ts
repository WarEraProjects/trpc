import { createTrpcClient } from "../src/trpc-client";

async function main() {
  const trpc = createTrpcClient({
    url: "https://api2.warera.io/trpc",
    apiKey: process.env.WARERA_API_KEY
  });

  const allCountries: any = await trpc.country.getAllCountries({});
  const firstID = allCountries[0]._id;


  // Test: run multiple requests concurrently
  const [countryById, government] = await Promise.all([
    trpc.country.getCountryById({ countryId: firstID }),
    trpc.government.getByCountryId({ countryId: firstID })
  ]);

  console.log("Country details:", countryById);
  console.log("Government:", government);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
