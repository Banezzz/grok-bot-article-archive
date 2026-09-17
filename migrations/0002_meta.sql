-- Chinese summary, thumbnail R2 key, and reusable tags.
ALTER TABLE articles ADD COLUMN summary_zh TEXT;
ALTER TABLE articles ADD COLUMN thumbnail_key TEXT;

CREATE TABLE IF NOT EXISTS tags (
	id TEXT PRIMARY KEY NOT NULL,
	slug TEXT NOT NULL,
	name_zh TEXT NOT NULL,
	name_en TEXT,
	created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_slug ON tags (slug);

CREATE TABLE IF NOT EXISTS article_tags (
	article_id TEXT NOT NULL,
	tag_id TEXT NOT NULL,
	PRIMARY KEY (article_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_article_tags_tag_id ON article_tags (tag_id);
CREATE INDEX IF NOT EXISTS idx_article_tags_article_id ON article_tags (article_id);

INSERT OR IGNORE INTO tags (id, slug, name_zh, name_en, created_at) VALUES
	('tag-ai', 'ai', 'AI', 'AI', '2026-09-14T00:00:00.000Z'),
	('tag-programming', 'programming', '编程', 'Programming', '2026-09-14T00:00:00.000Z'),
	('tag-quant', 'quant', '量化交易', 'Quant trading', '2026-09-14T00:00:00.000Z'),
	('tag-product', 'product', '产品', 'Product', '2026-09-14T00:00:00.000Z'),
	('tag-infra', 'infra', '基础设施/云', 'Infrastructure / cloud', '2026-09-14T00:00:00.000Z'),
	('tag-llm-ops', 'llm-ops', '模型与工程配置', 'Models and engineering', '2026-09-14T00:00:00.000Z'),
	('tag-markets', 'markets', '市场/宏观', 'Markets / macro', '2026-09-14T00:00:00.000Z'),
	('tag-security', 'security', '安全', 'Security', '2026-09-14T00:00:00.000Z'),
	('tag-career', 'career', '职业成长', 'Career', '2026-09-14T00:00:00.000Z'),
	('tag-misc', 'misc', '其他', 'Other', '2026-09-14T00:00:00.000Z');
