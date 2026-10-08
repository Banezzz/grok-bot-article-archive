export type ContentLang = 'zh' | 'en' | 'both';

const ZH_CLASS = /(^|\s)(zh|cn|bi-zh|lang-zh)(\s|$)/i;
const EN_CLASS = /(^|\s)(en|tr|orig|bi-en|lang-en)(\s|$)/i;
const PAIR_CLASS = /(^|\s)(pair|bilingual|bi-pair|lang-pair)(\s|$)/i;
const STRUCTURAL_MARK_TAGS = new Set(['html', 'head', 'body', 'main', 'article']);

function classifyContentLang(
	tagName: string,
	lang: string | null,
	className: string | null,
	dataLang: string | null = null,
): 'zh' | 'en' | null {
	const tag = tagName.toLowerCase();
	if (STRUCTURAL_MARK_TAGS.has(tag)) {
		return null;
	}
	const langNorm = (dataLang || lang || '').trim().toLowerCase();
	const cls = className || '';
	if (langNorm === 'zh' || langNorm.startsWith('zh-') || ZH_CLASS.test(cls)) {
		return 'zh';
	}
	if (langNorm === 'en' || langNorm.startsWith('en-') || EN_CLASS.test(cls)) {
		return 'en';
	}
	return null;
}

function observeLangMark(
	state: { zh: number; en: number; hasPair: boolean },
	tagName: string,
	lang: string | null,
	className: string | null,
	dataLang: string | null = null,
): void {
	if (PAIR_CLASS.test(className || '')) {
		state.hasPair = true;
	}
	const kind = classifyContentLang(tagName, lang, className, dataLang);
	if (kind === 'zh') {
		state.zh += 1;
	} else if (kind === 'en') {
		state.en += 1;
	}
}

function isBilingualScan(state: { zh: number; en: number; hasPair: boolean }): boolean {
	if (state.zh < 1 || state.en < 1) {
		return false;
	}
	if (state.hasPair) {
		return true;
	}
	if (state.zh >= 2 && state.en >= 2) {
		return true;
	}
	const min = Math.min(state.zh, state.en);
	const max = Math.max(state.zh, state.en);
	return max <= min * 3 + 2;
}

const CJK_RE = /[\u3400-\u9FFF\uF900-\uFAFF]/g;
const LAT_RE = /[A-Za-z]/g;
const URL_RE = /https?:\/\/[^\s<>"']+|www\.[^\s<>"']+|\b[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(?:\/[^\s<>"']*)?/gi;
const EMAIL_RE = /\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi;
const PATH_RE = /(?:[A-Za-z]:\\|\/)[^\s<>"']+/g;

const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const SKIP_TEXT_TAGS = new Set(['script', 'style', 'textarea', 'noscript', 'template']);
const STRUCTURAL_TAGS = new Set(['html', 'head', 'body', 'main', 'article']);
const PAIRABLE_BLOCKS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'dt', 'dd', 'blockquote', 'figcaption']);
const TRANSPARENT_TAGS = new Set([
	'figure',
	'img',
	'hr',
	'br',
	'script',
	'style',
	'picture',
	'svg',
	'iframe',
	'video',
	'audio',
	'source',
	'track',
	'link',
	'meta',
	'noscript',
	'template',
	'wbr',
]);
const CAPTION_PARENTS = new Set(['figcaption', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'header']);

export type TextRole = 'zh' | 'en' | 'url' | 'code' | 'neutral';

export type RecoveredMark = {
	start: number;
	lang: 'zh' | 'en';
};

export type ArticleLangAnalysis = {
	bilingual: boolean;
	explicitZh: number;
	explicitEn: number;
	recoveredPairs: number;
	pairableBlocks: number;
	hasPair: boolean;
	marks: RecoveredMark[];
};

export type ContentLangMeasure = {
	switchShown: boolean;
	chineseLeftInEnPct: number;
	englishLeftInZhPct: number;
	wronglyHidden: string[];
};

function countRe(source: string, re: RegExp): number {
	return (source.match(re) || []).length;
}

function attr(source: string, name: string): string | null {
	const match = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(source);
	return match ? (match[1] ?? match[2] ?? null) : null;
}

/** Classify a text node for pairing. URL/path-only lines are never English. */
export function classifyTextRole(text: string): TextRole {
	const raw = String(text || '')
		.replace(/\s+/g, ' ')
		.trim();
	if (!raw) {
		return 'neutral';
	}

	const cjk = countRe(raw, CJK_RE);
	const stripped = raw.replace(URL_RE, ' ').replace(EMAIL_RE, ' ').replace(PATH_RE, ' ');
	const lat = countRe(stripped, LAT_RE);
	const latAll = countRe(raw, LAT_RE);

	if (cjk >= 4 && cjk >= lat) {
		return 'zh';
	}
	if (lat < 8 && cjk < 4) {
		if (latAll >= 8 || /https?:\/\/|www\.|\.[a-z]{2,}\//i.test(raw)) {
			return 'url';
		}
		if (/[{};=<>]|`/.test(raw) && latAll >= 6) {
			return 'code';
		}
		return 'neutral';
	}
	if (lat >= 12 && lat > cjk * 2) {
		return 'en';
	}
	if (cjk >= 4) {
		return 'zh';
	}
	return 'neutral';
}

type Frame = {
	id: number;
	tag: string;
	attrs: string;
	start: number;
	mark: ContentLang | null;
	text: string;
	parentId: number;
	parentTag: string;
	skipText: boolean;
	pairableChildCount: number;
};

type Block = {
	id: number;
	tag: string;
	attrs: string;
	start: number;
	mark: ContentLang | null;
	text: string;
	parentId: number;
	role: TextRole | ContentLang;
};

function isPairableTag(tag: string, attrs: string, parentTag: string, pairableChildCount: number, text: string): boolean {
	if (STRUCTURAL_TAGS.has(tag) || SKIP_TEXT_TAGS.has(tag) || VOID_TAGS.has(tag)) {
		return false;
	}
	if (PAIRABLE_BLOCKS.has(tag)) {
		return true;
	}
	const marked = Boolean(classifyContentLang(tag, attr(attrs, 'lang'), attr(attrs, 'class'), attr(attrs, 'data-lang')));
	if (tag === 'span' || tag === 'small') {
		return marked || CAPTION_PARENTS.has(parentTag);
	}
	if (tag === 'div' || tag === 'section') {
		if (marked) {
			return true;
		}
		if (pairableChildCount === 0 && (classifyTextRole(text) === 'zh' || classifyTextRole(text) === 'en')) {
			return true;
		}
	}
	return false;
}

function walkBlocks(html: string): { blocks: Block[]; hasPair: boolean; explicitZh: number; explicitEn: number } {
	const state = { zh: 0, en: 0, hasPair: false };
	const stripped = html.replace(/<(script|style|textarea|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, (chunk) => chunk.replace(/[^>]/g, ' '));
	const stack: Frame[] = [];
	const blocks: Block[] = [];
	let nextId = 1;
	const re = /<\/?([a-zA-Z][\w:-]*)\b([^>]*)>|([^<]+)/g;

	for (let match = re.exec(stripped); match; match = re.exec(stripped)) {
		if (match[3] != null) {
			const top = stack[stack.length - 1];
			if (top && !top.skipText) {
				top.text += match[3];
			}
			continue;
		}
		const tag = (match[1] ?? '').toLowerCase();
		const attrs = match[2] ?? '';
		const raw = match[0];
		if (VOID_TAGS.has(tag) || raw.endsWith('/>')) {
			continue;
		}
		if (raw.startsWith('</')) {
			for (let i = stack.length - 1; i >= 0; i -= 1) {
				if (stack[i]?.tag === tag) {
					const frame = stack[i];
					stack.length = i;
					if (!frame) {
						break;
					}
					if (
						isPairableTag(frame.tag, frame.attrs, frame.parentTag, frame.pairableChildCount, frame.text)
					) {
						const role = frame.mark ?? classifyTextRole(frame.text);
						blocks.push({
							id: frame.id,
							tag: frame.tag,
							attrs: frame.attrs,
							start: frame.start,
							mark: frame.mark,
							text: frame.text,
							parentId: frame.parentId,
							role,
						});
						const parent = stack[stack.length - 1];
						if (parent) {
							parent.pairableChildCount += 1;
						}
					}
					break;
				}
			}
			continue;
		}
		const parent = stack[stack.length - 1];
		observeLangMark(state, tag, attr(attrs, 'lang'), attr(attrs, 'class'), attr(attrs, 'data-lang'));
		stack.push({
			id: nextId,
			tag,
			attrs,
			start: match.index,
			mark: classifyContentLang(tag, attr(attrs, 'lang'), attr(attrs, 'class'), attr(attrs, 'data-lang')),
			text: '',
			parentId: parent?.id ?? 0,
			parentTag: parent?.tag ?? '',
			skipText: SKIP_TEXT_TAGS.has(tag),
			pairableChildCount: 0,
		});
		nextId += 1;
	}

	return { blocks, hasPair: state.hasPair, explicitZh: state.zh, explicitEn: state.en };
}

function complementary(a: Block, b: Block): { zh: Block; en: Block } | null {
	const aLang = a.mark ?? (a.role === 'zh' || a.role === 'en' ? a.role : null);
	const bLang = b.mark ?? (b.role === 'zh' || b.role === 'en' ? b.role : null);
	if (!aLang || !bLang || aLang === bLang) {
		return null;
	}
	if (a.role === 'url' || a.role === 'code' || b.role === 'url' || b.role === 'code') {
		return null;
	}
	return aLang === 'zh' ? { zh: a, en: b } : { zh: b, en: a };
}

function canPair(a: Block, b: Block): boolean {
	if (a.parentId !== b.parentId) {
		return false;
	}
	if (!(a.tag === b.tag || a.mark || b.mark)) {
		return false;
	}
	return Boolean(complementary(a, b));
}

function recoverPairs(blocks: Block[]): Array<{ zh: Block; en: Block }> {
	const byParent = new Map<number, Block[]>();
	for (const block of blocks) {
		const list = byParent.get(block.parentId) ?? [];
		list.push(block);
		byParent.set(block.parentId, list);
	}

	const pairs: Array<{ zh: Block; en: Block }> = [];
	const used = new Set<number>();
	for (const siblings of byParent.values()) {
		for (let i = 0; i < siblings.length; i += 1) {
			const a = siblings[i];
			if (!a || used.has(a.id)) {
				continue;
			}
			let partner: Block | undefined;
			for (let j = i + 1; j < siblings.length; j += 1) {
				const candidate = siblings[j];
				if (!candidate || used.has(candidate.id)) {
					continue;
				}
				if (TRANSPARENT_TAGS.has(candidate.tag) && !candidate.mark) {
					continue;
				}
				partner = candidate;
				break;
			}
			if (!partner || !canPair(a, partner)) {
				continue;
			}
			const pair = complementary(a, partner);
			if (!pair) {
				continue;
			}
			used.add(a.id);
			used.add(partner.id);
			pairs.push(pair);
		}
	}
	return pairs;
}

function decideBilingual(
	explicitZh: number,
	explicitEn: number,
	hasPair: boolean,
	recoveredPairs: number,
	pairableBlocks: number,
): boolean {
	if (hasPair && explicitZh >= 1 && explicitEn >= 1) {
		return true;
	}
	if (explicitZh >= 1 && explicitEn >= 1) {
		if (explicitZh >= 2 && explicitEn >= 2) {
			return true;
		}
		const min = Math.min(explicitZh, explicitEn);
		const max = Math.max(explicitZh, explicitEn);
		if (max <= min * 3 + 2) {
			return true;
		}
	}
	if (recoveredPairs >= 2) {
		const needed = Math.max(2, Math.ceil(pairableBlocks / 6));
		return recoveredPairs >= needed;
	}
	return false;
}

export function analyzeArticleLanguage(html: string): ArticleLangAnalysis {
	const { blocks, hasPair, explicitZh, explicitEn } = walkBlocks(html);
	const pairs = recoverPairs(blocks);
	const pairableBlocks = blocks.filter((block) => block.mark || block.role === 'zh' || block.role === 'en').length;
	const bilingual = decideBilingual(explicitZh, explicitEn, hasPair, pairs.length, pairableBlocks);
	const marks: RecoveredMark[] = [];
	if (bilingual) {
		for (const pair of pairs) {
			if (!pair.zh.mark) {
				marks.push({ start: pair.zh.start, lang: 'zh' });
			}
			if (!pair.en.mark) {
				marks.push({ start: pair.en.start, lang: 'en' });
			}
		}
	}
	return {
		bilingual,
		explicitZh,
		explicitEn,
		recoveredPairs: pairs.length,
		pairableBlocks,
		hasPair,
		marks,
	};
}

export function looksBilingualLegacy(html: string): boolean {
	const state = { zh: 0, en: 0, hasPair: false };
	const stripped = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
	const tagRe = /<([a-zA-Z][\w:-]*)\b([^>]*)>/g;
	for (let match = tagRe.exec(stripped); match; match = tagRe.exec(stripped)) {
		const attrs = match[2] ?? '';
		observeLangMark(state, match[1] ?? '', attr(attrs, 'lang'), attr(attrs, 'class'), attr(attrs, 'data-lang'));
	}
	return isBilingualScan(state);
}

function withLangClass(open: string, lang: 'zh' | 'en'): string {
	const cls = lang;
	const classMatch = /class\s*=\s*("([^"]*)"|'([^']*)')/i.exec(open);
	let result = open;
	if (classMatch) {
		const quote = classMatch[1]?.startsWith("'") ? "'" : '"';
		const value = classMatch[2] ?? classMatch[3] ?? '';
		if (!new RegExp(`(^|\\s)${cls}(\\s|$)`, 'i').test(value)) {
			result = result.replace(classMatch[0], `class=${quote}${value}${value ? ' ' : ''}${cls}${quote}`);
		}
	} else {
		result = result.replace(/>$/, ` class="${cls}">`);
	}
	if (!/\slang\s*=/i.test(result)) {
		result = result.replace(/>$/, ` lang="${lang}">`);
	}
	return result;
}

/** Add zh/en class+lang on recovered siblings. No-op when the page is not bilingual. */
export function markRecoveredLanguagePairs(html: string): string {
	const analysis = analyzeArticleLanguage(html);
	if (!analysis.bilingual || analysis.marks.length === 0) {
		return html;
	}
	const marks = [...analysis.marks].sort((a, b) => b.start - a.start);
	let out = html;
	for (const mark of marks) {
		const endOpen = out.indexOf('>', mark.start);
		if (endOpen === -1) {
			continue;
		}
		const open = out.slice(mark.start, endOpen + 1);
		if (!open.startsWith('<') || open.startsWith('</')) {
			continue;
		}
		out = `${out.slice(0, mark.start)}${withLangClass(open, mark.lang)}${out.slice(endOpen + 1)}`;
	}
	return out;
}

function collectVisible(blocks: Block[], hidden: Set<number>): { cjk: number; lat: number } {
	let cjk = 0;
	let lat = 0;
	for (const block of blocks) {
		if (hidden.has(block.id)) {
			continue;
		}
		const stripped = block.text.replace(URL_RE, ' ').replace(EMAIL_RE, ' ').replace(PATH_RE, ' ');
		cjk += countRe(stripped, CJK_RE);
		lat += countRe(stripped, LAT_RE);
	}
	return { cjk, lat };
}

function snippet(block: Block): string {
	const text = block.text.replace(/\s+/g, ' ').trim().slice(0, 48);
	return `${block.tag}.${block.mark ?? block.role}:${text}`;
}

export function measureContentLang(html: string): ContentLangMeasure {
	const marked = markRecoveredLanguagePairs(html);
	const analysis = analyzeArticleLanguage(marked);
	const { blocks } = walkBlocks(marked);
	const hiddenEn = new Set<number>();
	const hiddenZh = new Set<number>();
	const wronglyHidden: string[] = [];

	for (const block of blocks) {
		const lang = block.mark ?? (block.role === 'zh' || block.role === 'en' ? block.role : null);
		if (lang === 'zh') {
			hiddenEn.add(block.id);
		}
		if (lang === 'en') {
			hiddenZh.add(block.id);
		}
		if (!analysis.bilingual) {
			continue;
		}
		if (lang === 'zh' && block.role !== 'zh' && block.role !== 'en' && block.mark !== 'zh') {
			wronglyHidden.push(`en-mode ${snippet(block)}`);
		}
		if (lang === 'en' && (block.role === 'url' || block.role === 'code' || block.role === 'neutral')) {
			wronglyHidden.push(`zh-mode ${snippet(block)}`);
		}
	}

	if (analysis.bilingual) {
		for (const block of blocks) {
			if (hiddenEn.has(block.id) && block.role !== 'zh' && !block.mark) {
				wronglyHidden.push(`en-mode unmarked ${snippet(block)}`);
			}
		}
	}

	const both = collectVisible(blocks, new Set());
	const enMode = collectVisible(blocks, analysis.bilingual ? hiddenEn : new Set());
	const zhMode = collectVisible(blocks, analysis.bilingual ? hiddenZh : new Set());

	return {
		switchShown: analysis.bilingual,
		chineseLeftInEnPct: both.cjk === 0 ? 0 : Math.round((enMode.cjk / both.cjk) * 1000) / 10,
		englishLeftInZhPct: both.lat === 0 ? 0 : Math.round((zhMode.lat / both.lat) * 1000) / 10,
		wronglyHidden,
	};
}
