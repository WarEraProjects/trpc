import { createAPIClient } from "../src/index";

/**
 * Test file demonstrating auto-pagination functionality.
 * 
 * This shows how to use the autoPaginate flag to automatically iterate
 * through all pages of a cursor-based endpoint.
 */
async function testAutoPagination() {
  const client = createAPIClient({
    url: "https://api2.warera.io/trpc",
    rateLimit: 100,
    apiKey: process.env.WARERA_API_KEY
  });

  console.log("\n=== Test 1: Basic auto-pagination (max 2 pages) ===");
  try {
    let pageNum = 0;
    for await (const page of client.article.getArticlesPaginated({
      type: "last",
      limit: 5,
      maxPages: 20,
      autoPaginate: true
    })) {
      pageNum++;
      console.log(`Page ${pageNum}:`);
      console.log(`  - Items: ${page.items.length}`);
      console.log(`  - Next cursor: ${page.cursor.substring(0, 50)}...`);
    }
  } catch (error) {
    console.error("Error:", error);
  }

  console.log("\n=== Test 2: Auto-pagination with cursorEnd date ===");
  try {
    const cutoffDate = new Date("2026-02-15"); // Stop when cursor is before this date
    let pageNum = 0;
    for await (const page of client.article.getArticlesPaginated({
      type: "last",
      limit: 5,
      autoPaginate: true,
      maxPages: 20,
      cursorEnd: cutoffDate,
    })) {
      pageNum++;
      console.log(`Page ${pageNum}:`);
      console.log(`  - Items: ${page.items.length}`);
      console.log(`  - Next cursor: ${page.cursor.substring(0, 50)}...`);
      
      // Safety check to prevent infinite loops in testing
      if (pageNum >= 5) {
        console.log("  (Stopping at 5 pages for safety)");
        break;
      }
    }
  } catch (error) {
    console.error("Error:", error);
  }

  console.log("\n=== Test 3: Regular (non-paginated) call ===");
  try {
    const result = await client.article.getArticlesPaginated({
      type: "last",
      limit: 3,
    });
    console.log(`Single page result:`);
    console.log(`  - Items: ${result.items.length}`);
    console.log(`  - Next cursor: ${result.nextCursor.substring(0, 50)}...`);
  } catch (error) {
    console.error("Error:", error);
  }

  console.log("\n=== Test 4: Collecting all items from multiple pages ===");
  try {
    const allItems: any[] = [];
    for await (const page of client.battle.getBattles({
      autoPaginate: true,
      maxPages: 3,
      limit: 5,
    })) {
      allItems.push(...page.items);
      console.log(`Collected ${page.items.length} items (total: ${allItems.length})`);
    }
    console.log(`Total items collected: ${allItems.length}`);
  } catch (error) {
    console.error("Error:", error);
  }
}

// Run the tests

testAutoPagination()
.then(() => {
    console.log("\n✅ All tests completed");
    process.exit(0);
})
.catch((error) => {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
});
