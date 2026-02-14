import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const outputsRoot = __dirname;
const repoRoot = path.resolve(outputsRoot, "..", "..");
const outputFile = path.join(outputsRoot, "Responses.d.ts");
const srcOutputFile = path.join(repoRoot, "src", "api", "Responses.d.ts");
const ignoredFiles = new Set([
	path.join(outputsRoot, "convert_to_types.ts"),
	path.join(outputsRoot, "Responses.d.ts")
]);

type OutputEntry = {
	operationKey: string;
	typeName: string;
	typeBody: string;
};

function isIdentifier(name: string): boolean {
	return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);
}

function formatPropertyName(name: string): string {
	return isIdentifier(name) ? name : JSON.stringify(name);
}

function looksLikeIdKey(key: string): boolean {
	return (
		/^[a-f0-9]{24}$/i.test(key) ||
		/^[a-f0-9]{32}$/i.test(key) ||
		/^[a-f0-9-]{36}$/i.test(key) ||
		/^\d+$/.test(key)
	);
}

function shouldUseRecord(obj: Record<string, JsonValue>): boolean {
	const keys = Object.keys(obj);
	if (keys.length === 0) {
		return false;
	}

	const idKeyCount = keys.filter(looksLikeIdKey).length;
	if (keys.length >= 5 && idKeyCount === keys.length) {
		return true;
	}

	const invalidKeyCount = keys.filter((key) => !isIdentifier(key)).length;
	if (keys.length >= 20 && invalidKeyCount / keys.length > 0.6) {
		return true;
	}

	return false;
}

function toPascalCase(value: string): string {
	const separated = value
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.replace(/[^A-Za-z0-9]+/g, " ")
		.trim();

	if (!separated) {
		return "";
	}

	return separated
		.split(/\s+/g)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join("");
}

function indent(level: number): string {
	return "  ".repeat(level);
}

function uniqueTypes(types: string[]): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const type of types) {
		if (!seen.has(type)) {
			seen.add(type);
			result.push(type);
		}
	}
	return result;
}

function toUnion(types: string[]): string {
	const unique = uniqueTypes(types);
	if (unique.length === 0) {
		return "unknown";
	}
	if (unique.length === 1) {
		return unique[0];
	}
	return unique.join(" | ");
}

function inferType(value: JsonValue, level: number): string {
	if (value === null) {
		return "null";
	}

	if (Array.isArray(value)) {
		if (value.length === 0) {
			return "unknown[]";
		}
		const itemTypes = value.map((item) => inferType(item, level));
		const union = toUnion(itemTypes);
		return `Array<${union}>`;
	}

	switch (typeof value) {
		case "string":
			return "string";
		case "number":
			return "number";
		case "boolean":
			return "boolean";
		case "object":
			return inferObjectType(value as Record<string, JsonValue>, level);
		default:
			return "unknown";
	}
}

function inferObjectType(obj: Record<string, JsonValue>, level: number): string {
	const entries = Object.entries(obj);
	if (entries.length === 0) {
		return "{}";
	}

	if (shouldUseRecord(obj)) {
		const valueTypes = entries.map(([, value]) => inferType(value, level + 1));
		const union = toUnion(valueTypes);
		return `Record<string, ${union}>`;
	}

	const lines = entries.map(([key, value]) => {
		const propName = formatPropertyName(key);
		const propType = inferType(value, level + 1);
		return `${indent(level + 1)}${propName}: ${propType};`;
	});

	return `{
${lines.join("\n")}
${indent(level)}}`;
}

async function listJsonFiles(dir: string): Promise<string[]> {
	const entries = await fs.readdir(dir, { withFileTypes: true });
	const files: string[] = [];

	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);
		if (ignoredFiles.has(fullPath)) {
			continue;
		}
		if (entry.isDirectory()) {
			files.push(...(await listJsonFiles(fullPath)));
		} else if (entry.isFile() && entry.name.endsWith(".json")) {
			files.push(fullPath);
		}
	}

	return files;
}

async function readJson(filePath: string): Promise<JsonValue | undefined> {
	const content = await fs.readFile(filePath, "utf8");
	if (!content.trim()) {
		return undefined;
	}
	return JSON.parse(content) as JsonValue;
}

function buildTypeName(group: string, name: string): string {
	return `${toPascalCase(group)}${toPascalCase(name)}Response`;
}

async function buildEntries(files: string[]): Promise<OutputEntry[]> {
	const entries: OutputEntry[] = [];

	for (const filePath of files) {
		const relative = path.relative(outputsRoot, filePath).replace(/\\/g, "/");
		const parts = relative.split("/");
		if (parts.length < 2) {
			continue;
		}
		const group = parts[0];
		const fileName = parts[parts.length - 1];
		const name = path.basename(fileName, ".json");
		const operationKey = `${group}.${name}`;

		const payload = await readJson(filePath);
		if (payload === undefined) {
			continue;
		}

		const typeName = buildTypeName(group, name);
		const typeBody = inferType(payload, 0);
		entries.push({ operationKey, typeName, typeBody });
	}

	return entries.sort((a, b) => a.operationKey.localeCompare(b.operationKey));
}

async function writeResponses(entries: OutputEntry[], targetFile: string): Promise<void> {
	const lines: string[] = [];
	lines.push("// Generated by tests/outputs/convert_to_types.ts");
	lines.push("");

	for (const entry of entries) {
		lines.push(`export type ${entry.typeName} = ${entry.typeBody};`);
		lines.push("");
	}

	lines.push("export interface Responses {");
	for (const entry of entries) {
		lines.push(`  \"${entry.operationKey}\": ${entry.typeName};`);
	}
	lines.push("}");
	lines.push("");

	await fs.writeFile(targetFile, lines.join("\n"), "utf8");
}

async function main(): Promise<void> {
	const jsonFiles = await listJsonFiles(outputsRoot);
	const entries = await buildEntries(jsonFiles);
	await Promise.all([
		writeResponses(entries, outputFile),
		writeResponses(entries, srcOutputFile)
	]);
	console.log(
		`Generated ${entries.length} response types in ${outputFile} and ${srcOutputFile}`
	);
}

main().catch((error) => {
	console.error("Failed to generate response types:", error);
	process.exit(1);
});
