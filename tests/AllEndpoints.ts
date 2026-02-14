import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { operations as Operations } from "../src/api/warera-openapi";
import { createTrpcClient } from "../src/trpc-client";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type OperationKey = keyof Operations;

const outputsRoot = path.join(__dirname, "outputs");

const trpc = createTrpcClient({
	url: process.env.WARERA_API_URL ?? "https://api2.warera.io/trpc",
	apiKey: process.env.WARERA_API_KEY
});

const operationOrder: OperationKey[] = [
	"gameConfig.getDates",
	"gameConfig.getGameConfig",
	"itemTrading.getPrices",
	"region.getRegionsObject",
	"country.getAllCountries",
	"company.getCompanies",
	"ranking.getRanking",
	"search.searchAnything",
	"event.getEventsPaginated",
	"battle.getBattles",
	"mu.getManyPaginated",
	"article.getArticlesPaginated",
	"workOffer.getWorkOffersPaginated",
	"transaction.getPaginatedTransactions"
];

const allOperations: OperationKey[] = [
	"company.getById",
	"company.getCompanies",
	"country.getCountryById",
	"country.getAllCountries",
	"event.getEventsPaginated",
	"government.getByCountryId",
	"region.getById",
	"region.getRegionsObject",
	"battle.getById",
	"battle.getLiveBattleData",
	"battle.getBattles",
	"round.getById",
	"round.getLastHits",
	"battleRanking.getRanking",
	"itemTrading.getPrices",
	"tradingOrder.getTopOrders",
	"itemOffer.getById",
	"workOffer.getById",
	"workOffer.getWorkOfferByCompanyId",
	"workOffer.getWorkOffersPaginated",
	"ranking.getRanking",
	"search.searchAnything",
	"gameConfig.getDates",
	"gameConfig.getGameConfig",
	"user.getUserLite",
	"user.getUsersByCountry",
	"article.getArticleById",
	"article.getArticleLiteById",
	"article.getArticlesPaginated",
	"mu.getById",
	"mu.getManyPaginated",
	"transaction.getPaginatedTransactions",
	"upgrade.getUpgradeByTypeAndEntity",
	"worker.getWorkers",
	"worker.getTotalWorkersCount"
];

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

const responses: Record<string, JsonValue> = {};

function getOutputPath(operationKey: OperationKey): string {
	const [group, name] = operationKey.split(".");
	return path.join(outputsRoot, group, `${name}.json`);
}

async function readJsonIfExists(filePath: string): Promise<JsonValue | undefined> {
	try {
		const content = await fs.readFile(filePath, "utf8");
		if (!content.trim()) {
			return undefined;
		}
		return JSON.parse(content) as JsonValue;
	} catch (error) {
		const err = error as NodeJS.ErrnoException;
		if (err.code === "ENOENT") {
			return undefined;
		}
		throw error;
	}
}

async function writeJson(filePath: string, data: JsonValue): Promise<void> {
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

async function callProcedure(operationKey: OperationKey, input: Record<string, unknown> | undefined) {
	const [group, name] = operationKey.split(".");
	const caller = (trpc as Record<string, Record<string, (payload: unknown) => Promise<JsonValue>>>)[group];
	if (!caller || !caller[name]) {
		throw new Error(`Unknown operation: ${operationKey}`);
	}
	return caller[name](input ?? {});
}

async function loadOrFetch(operationKey: OperationKey, input?: Record<string, unknown>, forceFetch?: boolean): Promise<JsonValue> {
	const outputPath = getOutputPath(operationKey);;
	if (!forceFetch) {
		const cached = await readJsonIfExists(outputPath);
		if (cached !== undefined) {
			responses[operationKey] = cached;
			return cached;
		}
	}

	const result = await callProcedure(operationKey, input);
	responses[operationKey] = result;
	await writeJson(outputPath, result);
	return result;
}

function findFirstString(
	value: unknown,
	options: { keys?: string[]; matchSuffixId?: boolean } = {}
): string | undefined {
	const { keys = [], matchSuffixId = false } = options;
	const visited = new Set<unknown>();
	const stack: unknown[] = [value];

	while (stack.length > 0) {
		const current = stack.pop();
		if (!current || typeof current !== "object") {
			continue;
		}

		if (visited.has(current)) {
			continue;
		}

		visited.add(current);

		if (Array.isArray(current)) {
			for (const item of current) {
				stack.push(item);
			}
			continue;
		}

		for (const [key, val] of Object.entries(current)) {
			if (typeof val === "string") {
				if (keys.includes(key)) {
					return val;
				}
				if (matchSuffixId && key.toLowerCase().endsWith("id")) {
					return val;
				}
			}
			if (typeof val === "object" && val !== null) {
				stack.push(val);
			}
		}
	}

	return undefined;
}

function resolveId(
	source: JsonValue | undefined,
	keys: string[],
	envKey: string
): string | undefined {
	return (
		findFirstString(source, { keys, matchSuffixId: true }) ??
		(process.env[envKey] ? String(process.env[envKey]) : undefined)
	);
}

function findFirstArrayItemId(source: JsonValue | undefined, keys: string[]): string | undefined {
	if (!source || typeof source !== "object") {
		return undefined;
	}

	const stack: unknown[] = [source];
	const visited = new Set<unknown>();

	while (stack.length > 0) {
		const current = stack.pop();
		if (!current || typeof current !== "object") {
			continue;
		}
		if (visited.has(current)) {
			continue;
		}
		visited.add(current);

		if (Array.isArray(current)) {
			for (const item of current) {
				if (item && typeof item === "object" && !Array.isArray(item)) {
					for (const key of keys) {
						const value = (item as Record<string, unknown>)[key];
						if (typeof value === "string") {
							return value;
						}
					}
				}
				stack.push(item);
			}
			continue;
		}

		for (const value of Object.values(current)) {
			if (value && typeof value === "object") {
				stack.push(value);
			}
		}
	}

	return undefined;
}

function findFirstArrayString(source: JsonValue | undefined): string | undefined {
	if (!source || typeof source !== "object") {
		return undefined;
	}

	const stack: unknown[] = [source];
	const visited = new Set<unknown>();

	while (stack.length > 0) {
		const current = stack.pop();
		if (!current || typeof current !== "object") {
			continue;
		}
		if (visited.has(current)) {
			continue;
		}
		visited.add(current);

		if (Array.isArray(current)) {
			for (const item of current) {
				if (typeof item === "string") {
					return item;
				}
				if (item && typeof item === "object") {
					stack.push(item);
				}
			}
			continue;
		}

		for (const value of Object.values(current)) {
			if (value && typeof value === "object") {
				stack.push(value);
			}
		}
	}

	return undefined;
}

function findFirstKeyString(source: JsonValue | undefined, keyName: string): string | undefined {
	if (!source || typeof source !== "object") return undefined;
	try {
		const obj = source as any;
		if (Array.isArray(obj.items) && obj.items.length > 0) {
			const first = obj.items[0];
			if (first && typeof first === "object" && typeof first[keyName] === "string") {
				return first[keyName] as string;
			}
		}
	} catch {
		// ignore
	}
	return undefined;
}

function requireId(label: string, id: string | undefined, envKey: string): string {
	if (!id) {
		throw new Error(`Missing ${label}. Provide cache data or set ${envKey}.`);
	}
	return id;
}

function finalItemCodeFromEnvOrCache(itemCode: string | undefined, envValue: string | undefined): string | undefined {
	return itemCode ?? (envValue ? String(envValue) : undefined);
}

function resolveCompanyIdFromCache(): string | undefined {
	const cached = responses["company.getCompanies"];
	return (
		resolveId(cached, ["companyId", "_id", "id"], "WARERA_COMPANY_ID") ??
		findFirstArrayItemId(cached, ["companyId", "_id", "id"]) ??
		findFirstArrayString(cached)
	);
}

async function main() {
	for (const op of operationOrder) {
		if (!responses[op]) {
			if (op === "search.searchAnything") {
				await loadOrFetch(op, { searchText: process.env.WARERA_SEARCH_TEXT ?? "war" });
				continue;
			}
			if (op === "ranking.getRanking") {
				await loadOrFetch(op, { rankingType: "countryDamages" });
				continue;
			}
			if (op === "article.getArticlesPaginated") {
				await loadOrFetch(op, { type: "last", limit: 1 });
				continue;
			}
			await loadOrFetch(op, {});
		}
	}

	const countries = responses["country.getAllCountries"] ??
		(await loadOrFetch("country.getAllCountries", {}));
	const countryId = requireId(
		"countryId",
		resolveId(countries, ["countryId", "_id", "id"], "WARERA_COUNTRY_ID"),
		"WARERA_COUNTRY_ID"
	);

	await loadOrFetch("country.getCountryById", { countryId });
	await loadOrFetch("government.getByCountryId", { countryId });

	const usersByCountry = await loadOrFetch("user.getUsersByCountry", { countryId, limit: 1 });
	const userId = requireId(
		"userId",
		resolveId(usersByCountry, ["userId", "_id", "id"], "WARERA_USER_ID"),
		"WARERA_USER_ID"
	);
	await loadOrFetch("user.getUserLite", { userId });
	await loadOrFetch("worker.getTotalWorkersCount", { userId });

	const regionObject = responses["region.getRegionsObject"] ??
		(await loadOrFetch("region.getRegionsObject", {}));
	const regionId = resolveId(regionObject, ["regionId", "_id", "id"], "WARERA_REGION_ID");
	if (regionId) {
		await loadOrFetch("region.getById", { regionId });
	}

	const companies = responses["company.getCompanies"] ??
		(await loadOrFetch("company.getCompanies", {}));
	const companyId =
		resolveId(companies, ["companyId", "_id", "id"], "WARERA_COMPANY_ID") ??
		findFirstArrayItemId(companies, ["companyId", "_id", "id"]) ??
		findFirstArrayString(companies);
	if (companyId) {
		await loadOrFetch("company.getById", { companyId });
		await loadOrFetch("worker.getWorkers", { companyId });
	} else {
		await loadOrFetch("worker.getWorkers", { userId });
	}

	await loadOrFetch("ranking.getRanking", { rankingType: "countryDamages" });
	await loadOrFetch("event.getEventsPaginated", {});

	const battleList = responses["battle.getBattles"] ??
		(await loadOrFetch("battle.getBattles", {}));
	const battleId = resolveId(battleList, ["battleId", "_id", "id"], "WARERA_BATTLE_ID");
	if (battleId) {
		await loadOrFetch("battle.getById", { battleId });
		const battleLive = await loadOrFetch("battle.getLiveBattleData", { battleId });
		const roundId = resolveId(battleLive, ["roundId", "_id", "id"], "WARERA_ROUND_ID") ??
			resolveId(battleList, ["roundId", "_id", "id"], "WARERA_ROUND_ID");
		if (roundId) {
			await loadOrFetch("round.getById", { roundId });
			await loadOrFetch("round.getLastHits", { roundId });
		}
	}

	await loadOrFetch("battleRanking.getRanking", {
		dataType: "damage",
		type: "country",
		side: "attacker"
	});

	const prices = responses["itemTrading.getPrices"] ??
		(await loadOrFetch("itemTrading.getPrices", {}));
	const itemCode = resolveId(prices, ["itemCode", "code"], "WARERA_ITEM_CODE");
	let topOrders: JsonValue | undefined;
	if (itemCode) {
		topOrders = await loadOrFetch("tradingOrder.getTopOrders", { itemCode, limit: 1 });
	}

	const itemOfferId = process.env.WARERA_ITEM_OFFER_ID;
	if (itemOfferId) {
		await loadOrFetch("itemOffer.getById", { itemOfferId });
	}

	const workOffers = responses["workOffer.getWorkOffersPaginated"] ??
		(await loadOrFetch("workOffer.getWorkOffersPaginated", {}));
	const workOfferId = resolveId(workOffers, ["workOfferId", "_id", "id"], "WARERA_WORK_OFFER_ID");
	if (workOfferId) {
		await loadOrFetch("workOffer.getById", { workOfferId });
	}

	// Candidate company id from the work offers list (first item's `company` field)
	const companyFromWorkOffers = findFirstKeyString(workOffers, "company");

	const articles = responses["article.getArticlesPaginated"] ??
		(await loadOrFetch("article.getArticlesPaginated", { type: "last", limit: 1 }));
	const articleId = resolveId(articles, ["articleId", "_id", "id"], "WARERA_ARTICLE_ID");
	if (articleId) {
		await loadOrFetch("article.getArticleById", { articleId });
	}

	const mus = responses["mu.getManyPaginated"] ??
		(await loadOrFetch("mu.getManyPaginated", { limit: 1 }));
	const muId = resolveId(mus, ["muId", "_id", "id"], "WARERA_MU_ID");
	if (muId) {
		await loadOrFetch("mu.getById", { muId });
	}

	await loadOrFetch("upgrade.getUpgradeByTypeAndEntity", {
		upgradeType: "bunker",
		regionId,
		companyId,
		muId
	});

	await loadOrFetch("search.searchAnything", { searchText: process.env.WARERA_SEARCH_TEXT ?? "war" });

	const finalRegionId = regionId ?? process.env.WARERA_REGION_ID;
	const finalCompanyId = companyId ?? process.env.WARERA_COMPANY_ID;
	const finalMuId = muId ?? process.env.WARERA_MU_ID;
	const finalBattleId = battleId ?? process.env.WARERA_BATTLE_ID;
	const finalRoundId = (process.env.WARERA_ROUND_ID as string | undefined) ??
		resolveId(responses["battle.getLiveBattleData"], ["roundId", "_id", "id"], "WARERA_ROUND_ID");
	const finalItemOfferId = itemOfferId ?? process.env.WARERA_ITEM_OFFER_ID;
	const finalWorkOfferId = workOfferId ?? process.env.WARERA_WORK_OFFER_ID;
	const finalArticleId = articleId ?? process.env.WARERA_ARTICLE_ID;
	const finalItemCode = finalItemCodeFromEnvOrCache(itemCode, process.env.WARERA_ITEM_CODE);
	const finalCompanyIdResolved = finalCompanyId ?? resolveCompanyIdFromCache();

	const getInputForOperation = (op: OperationKey): Record<string, unknown> | undefined => {
		switch (op) {
			case "company.getById":
				if (!finalCompanyIdResolved) {
					return undefined;
				}
				return { companyId: finalCompanyIdResolved };
			case "company.getCompanies":
				return {};
			case "country.getCountryById":
				return { countryId };
			case "country.getAllCountries":
				return {};
			case "event.getEventsPaginated":
				return {};
			case "government.getByCountryId":
				return { countryId };
			case "region.getById":
				return { regionId: requireId("regionId", finalRegionId, "WARERA_REGION_ID") };
			case "region.getRegionsObject":
				return {};
			case "battle.getById":
				return { battleId: requireId("battleId", finalBattleId, "WARERA_BATTLE_ID") };
			case "battle.getLiveBattleData":
				return { battleId: requireId("battleId", finalBattleId, "WARERA_BATTLE_ID") };
			case "battle.getBattles":
				return {};
			case "round.getById":
				return { roundId: requireId("roundId", finalRoundId, "WARERA_ROUND_ID") };
			case "round.getLastHits":
				return { roundId: requireId("roundId", finalRoundId, "WARERA_ROUND_ID") };
			case "battleRanking.getRanking":
				return { dataType: "damage", type: "country", side: "attacker" };
			case "itemTrading.getPrices":
				return {};
			case "tradingOrder.getTopOrders":
				return { itemCode: finalItemCode, limit: 1 };
			case "itemOffer.getById":
				return { itemOfferId: finalItemOfferId };
			case "workOffer.getById":
				return { workOfferId: requireId("workOfferId", finalWorkOfferId, "WARERA_WORK_OFFER_ID") };
			case "workOffer.getWorkOfferByCompanyId":
				// prefer company id found in work offers list, otherwise fall back to resolved company id
				const cid = companyFromWorkOffers ?? finalCompanyIdResolved;
				if (!cid) return undefined;
				return { companyId: cid };
			case "workOffer.getWorkOffersPaginated":
				return {};
			case "ranking.getRanking":
				return { rankingType: "countryDamages" };
			case "search.searchAnything":
				return { searchText: process.env.WARERA_SEARCH_TEXT ?? "war" };
			case "gameConfig.getDates":
				return {};
			case "gameConfig.getGameConfig":
				return {};
			case "user.getUserLite":
				return { userId };
			case "user.getUsersByCountry":
				return { countryId, limit: 1 };
			case "article.getArticleById":
				return { articleId: requireId("articleId", finalArticleId, "WARERA_ARTICLE_ID") };
			case "article.getArticleLiteById":
				return { articleId: requireId("articleId", finalArticleId, "WARERA_ARTICLE_ID") };
			case "article.getArticlesPaginated":
				return { type: "last", limit: 1 };
			case "mu.getById":
				return { muId: requireId("muId", finalMuId, "WARERA_MU_ID") };
			case "mu.getManyPaginated":
				return { limit: 1 };
			case "transaction.getPaginatedTransactions":
				return {};
			case "upgrade.getUpgradeByTypeAndEntity":
				return { upgradeType: "bunker", regionId: finalRegionId, companyId: finalCompanyIdResolved, muId: finalMuId };
			case "worker.getWorkers":
				return finalCompanyIdResolved ? { companyId: finalCompanyIdResolved } : { userId };
			case "worker.getTotalWorkersCount":
				return { userId };
			default:
				return {};
		}
	};

	for (const op of allOperations) {
		const input = getInputForOperation(op);
		if (!input) {
			continue;
		}
		await loadOrFetch(op, input);
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
