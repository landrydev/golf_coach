CREATE TABLE `share_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`share_link_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`token_hash_algorithm` text DEFAULT 'hmac-sha256-session-v1' NOT NULL,
	`expires_at` integer NOT NULL,
	`last_accessed_at` integer,
	`access_count` integer DEFAULT 0 NOT NULL,
	`revoked_at` integer,
	`revoke_reason` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`,`share_link_id`) REFERENCES `share_links`(`account_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "share_sessions_token_hash_algorithm_check" CHECK("share_sessions"."token_hash_algorithm" = 'hmac-sha256-session-v1'),
	CONSTRAINT "share_sessions_token_hash_check" CHECK(length("share_sessions"."token_hash") = 64 and "share_sessions"."token_hash" not glob '*[^0-9a-f]*'),
	CONSTRAINT "share_sessions_expiry_check" CHECK("share_sessions"."expires_at" > "share_sessions"."created_at"),
	CONSTRAINT "share_sessions_access_count_check" CHECK("share_sessions"."access_count" >= 0),
	CONSTRAINT "share_sessions_revocation_check" CHECK(("share_sessions"."revoked_at" is null and "share_sessions"."revoke_reason" is null) or ("share_sessions"."revoked_at" is not null and length(trim(coalesce("share_sessions"."revoke_reason", ''))) > 0))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `share_sessions_token_hash_unique` ON `share_sessions` (`token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `share_sessions_account_id_unique` ON `share_sessions` (`account_id`,`id`);--> statement-breakpoint
CREATE INDEX `share_sessions_share_created_idx` ON `share_sessions` (`account_id`,`share_link_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `share_sessions_expiry_revocation_idx` ON `share_sessions` (`expires_at`,`revoked_at`);