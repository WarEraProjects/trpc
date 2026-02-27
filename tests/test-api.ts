import { createTrpcClient } from "../src/trpc-client";

async function processCountries(allCountries: { _id: string; name: string }[], client: ReturnType<typeof createTrpcClient>): Promise<{ totalUsers: number; totalCompanies: number }> {
  let totalUsers = 0;
  let totalCompanies = 0;

  await Promise.all(allCountries.map(async (country) => {
    let countryUserCount = 0;
    
    const companyBatchPromises = [];

    for await (const userPage of client.user.getUsersByCountry({
      countryId: country._id,
      autoPaginate: true
    })) {
      totalUsers += userPage.items.length;
      countryUserCount += userPage.items.length;

      // Queue all company requests at once for batching
      // Create the Promise.all but don't await it - let the loop continue
      const companyPromises = Promise.all(userPage.items.map(userData =>
        (async () => {
          for await (const companiesPage of client.company.getCompanies({
            userId: userData._id,
            autoPaginate: true
          })) {
            totalCompanies += companiesPage.items.length;
          }
        })()
      ));

      companyBatchPromises.push(companyPromises);
    }

    // Wait for all company requests to complete for this country
    await Promise.all(companyBatchPromises);
    
    console.log(`${country.name}: ${countryUserCount} users`);
  }));

  return { totalUsers, totalCompanies };
}

async function getAllFromCountry(countryID: string, client: ReturnType<typeof createTrpcClient>) {
  let allUserPromises = [];

  // Get all the user IDs from the country using pagination
  for await (const userPage of client.user.getUsersByCountry({countryId: countryID, autoPaginate: true, limit: 100})) {
    // Create the Promise.all but don't await it - let the loop continue
    const userLitePromises = Promise.all(userPage.items.map(async (userItem) => {
      return await client.user.getUserLite({userId: userItem._id})
    }));
    
    allUserPromises.push(userLitePromises);
  }

  // Wait for all promises to resolve and flatten the results
  const allUserArrays = await Promise.all(allUserPromises);
  const allUsers = allUserArrays.flat();

  return allUsers;
}

async function main() {

  let countingBatches = 0;
  let lastBatchTime = Date.now();

  const client = createTrpcClient({
    apiKey: process.env.WARERA_API_KEY,
    logBatches: (info) => {
      const now = Date.now();
      const timeSinceLastBatch = now - lastBatchTime;
      countingBatches++;
      console.log(`Batch #${countingBatches} | Time since last: ${timeSinceLastBatch}ms`);

      // console.log(info.paths);

      lastBatchTime = now;
    },
    rateLimit: 500
  });
  
  // Intensly test the performance:
  // Get all countries
  // Get all users for each country
  // Get all companies for each user.

  const allCountries = await client.country.getAllCountries();
  console.log(`Fetched ${allCountries.length} countries\n`);

  const startTime = Date.now();

  const { totalUsers, totalCompanies } = await processCountries(allCountries, client);
  // const users = await getAllFromCountry('6813b6d546e731854c7ac858', client);

  const elapsedTime = Date.now() - startTime;

  console.log(`\n✅ Complete:`);
  console.log(`  - Countries: ${allCountries.length}`);
  // console.log(`  - Total Users: ${users.length}`);
  console.log(`  - Total Users: ${totalUsers}`);
  console.log(`  - Total Companies: ${totalCompanies}`);
  console.log(`  - Elapsed Time: ${(elapsedTime / 1000).toFixed(2)}s`);
  console.log(`  - Batch calls: ${countingBatches}`);
  
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
