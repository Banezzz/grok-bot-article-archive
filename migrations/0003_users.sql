CREATE TABLE users (
	id TEXT PRIMARY KEY NOT NULL,
	username TEXT NOT NULL UNIQUE,
	password_hash TEXT NOT NULL,
	role TEXT NOT NULL CHECK (role IN ('user', 'admin')),
	upload_token_hash TEXT,
	upload_token_prefix TEXT,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_users_upload_token_hash ON users (upload_token_hash);

ALTER TABLE articles ADD COLUMN owner_id TEXT REFERENCES users (id);

CREATE INDEX idx_articles_owner_id ON articles (owner_id);
