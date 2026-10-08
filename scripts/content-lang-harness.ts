/**
 * Local harness for private article samples.
 * Looks for uploads/samples.tar.gz or a samples directory. Never commit those files.
 *
 * Usage: npx --yes tsx scripts/content-lang-harness.ts [samples-dir-or-tarball]
 *
 * When Chrome is available, measures visible text with the real hide/show CSS.
 * "Before" numbers are PR #12 (uploads/before-after.md after-column) when that file exists.
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
import {
	CONTENT_LANG_SCRIPT,
	CONTENT_LANG_STYLE,
	contentLangSwitch,
	insertSwitchIntoArticleHtml,
	looksBilingual,
	markRecoveredLanguagePairs,
} from '../src/content-lang';

type Prior = {
	switchShown: boolean | null;
	chineseLeftInEnPct: number | null;
	englishLeftInZhPct: number | null;
};

type Row = {
	slug: string;
	beforeSwitch: boolean | null;
	afterSwitch: boolean;
	beforeZhLeft: number | null;
	afterZhLeft: number | null;
	beforeEnLeft: number | null;
	afterEnLeft: number | null;
	wronglyHidden: string[];
};

const SEARCH_PATHS = [
	process.argv[2],
	process.env.CONTENT_LANG_SAMPLES,
	join(process.cwd(), 'uploads', 'samples.tar.gz'),
	join(process.cwd(), 'uploads', 'samples'),
	'/tmp/archive-samples/samples',
	'/tmp/archive-samples',
	'/home/ubuntu/.cursor/projects/workspace/uploads/samples.tar_251d.gz',
	join(process.cwd(), 'uploads'),
	'/tmp/samples.tar.gz',
].filter((value): value is string => Boolean(value));

const PRIOR_PATHS = [
	'/home/ubuntu/.cursor/projects/workspace/uploads/before-after_c4f6.md',
	join(process.cwd(), 'uploads', 'before-after.md'),
];

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

function parsePct(value: string): number | null {
	const trimmed = value.trim();
	if (!trimmed || trimmed === '—' || trimmed === 'n/a') {
		return null;
	}
	const num = Number(trimmed);
	return Number.isFinite(num) ? num : null;
}

function parsePriorTable(md: string): Map<string, Prior> {
	const map = new Map<string, Prior>();
	for (const line of md.split('\n')) {
		if (!line.startsWith('|') || line.includes('slug') || line.includes('---')) {
			continue;
		}
		const cells = line.split('|').map((cell) => cell.trim());
		const slug = cells[1];
		const sw = cells[2] ?? '';
		const zh = cells[3] ?? '';
		const en = cells[4] ?? '';
		if (!slug) {
			continue;
		}
		const swAfter = sw.includes('→') ? sw.split('→')[1]?.trim() : sw;
		const zhAfter = zh.includes('→') ? zh.split('→')[1]?.trim() : zh;
		const enAfter = en.includes('→') ? en.split('→')[1]?.trim() : en;
		map.set(slug, {
			switchShown: swAfter === 'Y' ? true : swAfter === '–' || swAfter === '-' ? false : null,
			chineseLeftInEnPct: parsePct(zhAfter ?? ''),
			englishLeftInZhPct: parsePct(enAfter ?? ''),
		});
	}
	return map;
}

function loadPrior(): Map<string, Prior> {
	for (const path of PRIOR_PATHS) {
		if (existsSync(path)) {
			return parsePriorTable(readFileSync(path, 'utf8'));
		}
	}
	return new Map();
}

function buildDocument(html: string, bilingual: boolean): string {
	const marked = insertSwitchIntoArticleHtml(
		markRecoveredLanguagePairs(html),
		contentLangSwitch('zh', '/a/sample', 'both'),
	);
	const hasHtml = /<html\b/i.test(marked);
	const attrs = `data-bilingual="${bilingual ? '1' : ''}" data-content-lang="both"`.replace('data-bilingual=""', '');
	const headBits = `<style data-archive-content-lang>${CONTENT_LANG_STYLE}</style>${CONTENT_LANG_SCRIPT}`;
	if (hasHtml) {
		let out = marked.replace(/<html\b([^>]*)>/i, (_all, extra: string) => {
			let next = extra;
			if (!/\bdata-bilingual=/.test(next) && bilingual) {
				next += ' data-bilingual="1"';
			}
			if (!/\bdata-content-lang=/.test(next)) {
				next += ' data-content-lang="both"';
			}
			return `<html${next}>`;
		});
		if (/<head\b/i.test(out)) {
			out = out.replace(/<head\b[^>]*>/i, (open) => `${open}${headBits}`);
		} else {
			out = out.replace(/<html\b[^>]*>/i, (open) => `${open}<head>${headBits}</head>`);
		}
		return out;
	}
	return `<!doctype html><html ${attrs}><head>${headBits}</head><body>${marked}</body></html>`;
}

function slugFrom(file: string): string {
	return basename(file, extname(file));
}

function fmt(value: boolean | number | null): string {
	if (value === null || value === undefined) {
		return '—';
	}
	if (typeof value === 'boolean') {
		return value ? 'Y' : '–';
	}
	return String(value);
}

function fmtChange(before: boolean | number | null, after: boolean | number | null): string {
	if (before === null || before === undefined) {
		return fmt(after);
	}
	if (before === after) {
		return `${fmt(before)} → ${fmt(after)}`;
	}
	return `${fmt(before)} → ${fmt(after)}`;
}

async function measureWithChrome(files: string[], prior: Map<string, Prior>): Promise<Row[]> {
	const require = createRequire(import.meta.url);
	const candidates = [
		join(process.cwd(), 'node_modules/puppeteer-core'),
		'/tmp/puppeteer-shot/node_modules/puppeteer-core',
	];
	let puppeteer: any;
	for (const path of candidates) {
		if (existsSync(path)) {
			puppeteer = require(path);
			break;
		}
	}
	if (!puppeteer) {
		throw new Error('puppeteer-core is required for CSS-accurate measurement');
	}
	const browser = await puppeteer.launch({
		executablePath: '/usr/bin/google-chrome-stable',
		headless: 'new',
		args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
	});
	const page = await browser.newPage();
	const rows: Row[] = [];

	try {
		for (const file of files) {
			const slug = slugFrom(file);
			const html = readFileSync(file, 'utf8');
			const bilingual = looksBilingual(html);
			const doc = buildDocument(html, bilingual);
			await page.setContent(doc, { waitUntil: 'domcontentloaded' });
			const measured = (await page.evaluate(
				/* eslint-disable */ new Function(
					'isBilingual',
					`const CJK = /[\\u3400-\\u9FFF\\uF900-\\uFAFF]/g;
					const LAT = /[A-Za-z]/g;
					const URL = /https?:\\/\\/\\S+|www\\.\\S+/gi;
					function hidden(el) {
						for (var node = el; node; node = node.parentElement) {
							var style = getComputedStyle(node);
							if (style.display === 'none' || style.visibility === 'hidden') return true;
						}
						return false;
					}
					function counts() {
						var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
						var cjk = 0, lat = 0, hiddenZh = 0, node;
						while ((node = walker.nextNode())) {
							var parent = node.parentElement;
							if (!parent) continue;
							if (parent.closest('[data-archive-content-lang-switch], [data-archive-chrome], script, style')) continue;
							if (parent.closest('header.meta')) continue;
							var stripped = String(node.textContent || '').replace(URL, ' ');
							var c = (stripped.match(CJK) || []).length;
							var l = (stripped.match(LAT) || []).length;
							if (hidden(parent)) { hiddenZh += c; continue; }
							cjk += c; lat += l;
						}
						return { cjk: cjk, lat: lat, hiddenZh: hiddenZh };
					}
					function setMode(mode) {
						document.documentElement.setAttribute('data-content-lang', mode);
						if (isBilingual) document.documentElement.setAttribute('data-bilingual', '1');
						else document.documentElement.removeAttribute('data-bilingual');
					}
					var sw = document.querySelector('[data-archive-content-lang-switch]');
					var switchShown = !!isBilingual && !!sw && !sw.hasAttribute('hidden') && getComputedStyle(sw).display !== 'none';
					setMode('both');
					var both = counts();
					setMode('en');
					var en = counts();
					var wrong = [];
					document.querySelectorAll('p.byline, header.meta > p.byline').forEach(function (el) {
						if (hidden(el)) wrong.push('byline');
					});
					document.querySelectorAll('header.meta a').forEach(function (el) {
						if (/Source|原文/.test(el.textContent || '') && hidden(el)) wrong.push('source-link');
					});
					document.querySelectorAll('figure, figure img, pre, pre code').forEach(function (el) {
						if (el.closest('.zh, .zh-inline, .zh-list, [lang^="zh"]')) return;
						if (hidden(el)) wrong.push(el.tagName.toLowerCase());
					});
					setMode('zh');
					var zh = counts();
					if (isBilingual && both.cjk > 0 && zh.hiddenZh / both.cjk > 0.08) wrong.push('chinese-in-zh');
					return {
						switchShown: switchShown,
						chineseLeftInEnPct: both.cjk === 0 ? 0 : Math.round((en.cjk / both.cjk) * 1000) / 10,
						englishLeftInZhPct: both.lat === 0 ? 0 : Math.round((zh.lat / both.lat) * 1000) / 10,
						wronglyHidden: Array.from(new Set(wrong))
					};`,
				) as (isBilingual: boolean) => {
					switchShown: boolean;
					chineseLeftInEnPct: number;
					englishLeftInZhPct: number;
					wronglyHidden: string[];
				},
				bilingual,
			)) as {
				switchShown: boolean;
				chineseLeftInEnPct: number;
				englishLeftInZhPct: number;
				wronglyHidden: string[];
			};

			const prev = prior.get(slug);
			rows.push({
				slug,
				beforeSwitch: prev?.switchShown ?? null,
				afterSwitch: measured.switchShown,
				beforeZhLeft: prev?.chineseLeftInEnPct ?? null,
				afterZhLeft: bilingual ? measured.chineseLeftInEnPct : null,
				beforeEnLeft: prev?.englishLeftInZhPct ?? null,
				afterEnLeft: bilingual ? measured.englishLeftInZhPct : null,
				wronglyHidden: measured.wronglyHidden,
			});
		}
	} finally {
		await browser.close();
	}
	return rows;
}

async function main(): Promise<void> {
	const samples = resolveSamples();
	if (!samples) {
		console.log('No private samples found. Place them in uploads/samples.tar.gz (gitignored) and re-run.');
		console.log('Searched:', SEARCH_PATHS.join(', '));
		process.exit(0);
	}
	const prior = loadPrior();
	const rows = await measureWithChrome(samples.files, prior);
	const switchOn = rows.filter((row) => row.afterSwitch).length;
	const switchBefore = rows.filter((row) => row.beforeSwitch).length;
	const leftover = rows.filter(
		(row) => row.afterSwitch && ((row.afterZhLeft ?? 0) > 20 || (row.afterEnLeft ?? 0) > 20),
	);
	const wrong = rows.filter((row) => row.wronglyHidden.length > 0);

	const lines = [
		'# Content-language harness (headless Chrome + real CSS)',
		'',
		`Samples: ${rows.length} from ${samples.dir}`,
		`Switch shown: ${switchBefore} → ${switchOn}`,
		`Bilingual with >20% leftover Chinese in en or English in zh: ${leftover.length}`,
		`Rows with wrongly hidden bylines/links/images/code/Chinese-in-zh: ${wrong.length}`,
		'',
		'| slug | switch before→after | % Chinese left in EN | % English left in 中文 | wrongly hidden |',
		'| --- | --- | --- | --- | --- |',
		...rows.map(
			(row) =>
				`| ${row.slug} | ${fmtChange(row.beforeSwitch, row.afterSwitch)} | ${fmtChange(row.beforeZhLeft, row.afterZhLeft)} | ${fmtChange(row.beforeEnLeft, row.afterEnLeft)} | ${row.wronglyHidden.join(', ')} |`,
		),
		'',
	];
	const report = lines.join('\n');
	const outPath = join(tmpdir(), 'content-lang-harness-report.md');
	mkdirSync(tmpdir(), { recursive: true });
	writeFileSync(outPath, report);
	console.log(report);
	console.log(`Wrote ${outPath}`);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
