/**
 * Local harness for private article samples.
 * Looks for uploads/samples.tar.gz or a samples directory. Never commit those files.
 *
 * Usage: npx --yes tsx scripts/content-lang-harness.ts [samples-dir-or-tarball]
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, extname, join, resolve } from 'node:path';
import {
	looksBilingual,
	looksBilingualLegacy,
	measureContentLang,
} from '../src/content-lang';

type Row = {
	slug: string;
	beforeSwitch: boolean;
	afterSwitch: boolean;
	chineseLeftInEnPct: number;
	englishLeftInZhPct: number;
	wronglyHidden: string[];
};

const SEARCH_PATHS = [
	process.argv[2],
	process.env.CONTENT_LANG_SAMPLES,
	join(process.cwd(), 'uploads', 'samples.tar.gz'),
	join(process.cwd(), 'uploads', 'samples'),
	join(process.cwd(), 'uploads'),
	'/tmp/archive-samples',
	'/tmp/samples.tar.gz',
].filter((value): value is string => Boolean(value));

function listHtmlFiles(dir: string): string[] {
	const out: string[] = [];
	const walk = (root: string) => {
		for (const entry of readdirSync(root, { withFileTypes: true })) {
			const full = join(root, entry.name);
			if (entry.isDirectory()) {
				walk(full);
				continue;
			}
			if (/\.html?$/i.test(entry.name)) {
				out.push(full);
			}
		}
	};
	walk(dir);
	return out.sort((a, b) => a.localeCompare(b));
}

function resolveSamples(): { dir: string; files: string[] } | null {
	for (const candidate of SEARCH_PATHS) {
		if (!existsSync(candidate)) {
			continue;
		}
		if (candidate.endsWith('.tar.gz') || candidate.endsWith('.tgz')) {
			const dest = mkdtempSync(join(tmpdir(), 'content-lang-samples-'));
			execFileSync('tar', ['-xzf', candidate, '-C', dest]);
			const files = listHtmlFiles(dest);
			if (files.length) {
				return { dir: dest, files };
			}
		} else {
			const files = listHtmlFiles(candidate);
			if (files.length) {
				return { dir: candidate, files };
			}
		}
	}
	return null;
}

function slugFrom(file: string): string {
	return basename(file, extname(file));
}

function formatRow(row: Row): string {
	const hidden = row.wronglyHidden.length ? row.wronglyHidden.slice(0, 3).join('; ') : '';
	return `| ${row.slug} | ${row.beforeSwitch ? 'yes' : 'no'} | ${row.afterSwitch ? 'yes' : 'no'} | ${row.chineseLeftInEnPct} | ${row.englishLeftInZhPct} | ${hidden} |`;
}

function main(): void {
	const samples = resolveSamples();
	if (!samples) {
		console.log('No private samples found. Place them in uploads/samples.tar.gz (gitignored) and re-run.');
		console.log('Searched:', SEARCH_PATHS.join(', '));
		process.exit(0);
	}

	const rows: Row[] = samples.files.map((file) => {
		const html = readFileSync(file, 'utf8');
		const measure = measureContentLang(html);
		return {
			slug: slugFrom(file),
			beforeSwitch: looksBilingualLegacy(html),
			afterSwitch: looksBilingual(html),
			chineseLeftInEnPct: measure.chineseLeftInEnPct,
			englishLeftInZhPct: measure.englishLeftInZhPct,
			wronglyHidden: measure.wronglyHidden,
		};
	});

	const beforeOn = rows.filter((row) => row.beforeSwitch).length;
	const afterOn = rows.filter((row) => row.afterSwitch).length;
	const newlyOn = rows.filter((row) => !row.beforeSwitch && row.afterSwitch).length;
	const lost = rows.filter((row) => row.beforeSwitch && !row.afterSwitch).length;
	const leftover = rows.filter(
		(row) => row.afterSwitch && (row.chineseLeftInEnPct > 20 || row.englishLeftInZhPct > 20),
	);
	const wrong = rows.filter((row) => row.wronglyHidden.length > 0);

	const lines = [
		'# Content-language harness',
		'',
		`Samples: ${rows.length} from ${samples.dir}`,
		`Switch before / after: ${beforeOn} → ${afterOn} (newly shown ${newlyOn}, lost ${lost})`,
		`Bilingual with >20% leftover Chinese in en or English in zh: ${leftover.length}`,
		`Rows with wrongly hidden blocks: ${wrong.length}`,
		'',
		'| slug | before switch | after switch | % Chinese left in en | % English left in zh | wrongly hidden |',
		'| --- | --- | --- | --- | --- | --- |',
		...rows.map(formatRow),
		'',
	];
	const report = lines.join('\n');
	const outPath = join(tmpdir(), 'content-lang-harness-report.md');
	mkdirSync(tmpdir(), { recursive: true });
	writeFileSync(outPath, report);
	console.log(report);
	console.log(`Wrote ${outPath}`);
}

main();
