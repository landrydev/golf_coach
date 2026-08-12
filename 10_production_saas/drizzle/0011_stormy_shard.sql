ALTER TABLE `accounts` ADD `auth_issuer` text CONSTRAINT "accounts_auth_mapping_check" CHECK((`auth_provider` in ('siwc', 'development') and `auth_issuer` is null) or (`auth_provider` = 'oidc' and `auth_issuer` is not null and length(`auth_issuer`) > 0));--> statement-breakpoint
ALTER TABLE `accounts` ADD `identity_version` integer DEFAULT 1 NOT NULL CONSTRAINT "accounts_identity_version_check" CHECK(`identity_version` > 0);--> statement-breakpoint
DROP INDEX `accounts_auth_identity_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_legacy_auth_identity_unique` ON `accounts` (`auth_provider`,`auth_subject`) WHERE `auth_issuer` is null;--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_oidc_auth_identity_unique` ON `accounts` (`auth_issuer`,`auth_subject`) WHERE `auth_provider` = 'oidc' and `auth_issuer` is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_id_identity_version_unique` ON `accounts` (`id`,`identity_version`);--> statement-breakpoint
CREATE TABLE `oidc_login_transactions` (
	`state_hash` text PRIMARY KEY NOT NULL,
	`state_hash_algorithm` text DEFAULT 'hmac-sha256-oidc-state-v1' NOT NULL,
	`sealed_payload` text NOT NULL,
	`payload_iv` text NOT NULL,
	`payload_algorithm` text DEFAULT 'aes-256-gcm-v1' NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	CONSTRAINT "oidc_login_transactions_state_hash_algorithm_check" CHECK("oidc_login_transactions"."state_hash_algorithm" = 'hmac-sha256-oidc-state-v1'),
	CONSTRAINT "oidc_login_transactions_state_hash_check" CHECK(length("oidc_login_transactions"."state_hash") = 64 and "oidc_login_transactions"."state_hash" not glob '*[^0-9a-f]*'),
	CONSTRAINT "oidc_login_transactions_payload_algorithm_check" CHECK("oidc_login_transactions"."payload_algorithm" = 'aes-256-gcm-v1'),
	CONSTRAINT "oidc_login_transactions_payload_iv_check" CHECK(length("oidc_login_transactions"."payload_iv") = 16 and "oidc_login_transactions"."payload_iv" not glob '*[^A-Za-z0-9_-]*'),
	CONSTRAINT "oidc_login_transactions_sealed_payload_check" CHECK(length("oidc_login_transactions"."sealed_payload") between 1 and 8192),
	CONSTRAINT "oidc_login_transactions_expiry_check" CHECK("oidc_login_transactions"."expires_at" > "oidc_login_transactions"."created_at"),
	CONSTRAINT "oidc_login_transactions_consumed_check" CHECK("oidc_login_transactions"."consumed_at" is null or "oidc_login_transactions"."consumed_at" >= "oidc_login_transactions"."created_at")
);
--> statement-breakpoint
CREATE INDEX `oidc_login_transactions_expiry_consumed_idx` ON `oidc_login_transactions` (`expires_at`,`consumed_at`);--> statement-breakpoint
CREATE TABLE `instructor_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`identity_version` integer NOT NULL,
	`token_hash` text NOT NULL,
	`token_hash_algorithm` text DEFAULT 'hmac-sha256-instructor-session-v1' NOT NULL,
	`authenticated_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`revoke_reason` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "instructor_sessions_token_hash_algorithm_check" CHECK("instructor_sessions"."token_hash_algorithm" = 'hmac-sha256-instructor-session-v1'),
	CONSTRAINT "instructor_sessions_token_hash_check" CHECK(length("instructor_sessions"."token_hash") = 64 and "instructor_sessions"."token_hash" not glob '*[^0-9a-f]*'),
	CONSTRAINT "instructor_sessions_identity_version_check" CHECK("instructor_sessions"."identity_version" > 0),
	CONSTRAINT "instructor_sessions_expiry_check" CHECK("instructor_sessions"."expires_at" > "instructor_sessions"."created_at"),
	CONSTRAINT "instructor_sessions_authenticated_at_check" CHECK("instructor_sessions"."authenticated_at" <= "instructor_sessions"."created_at"),
	CONSTRAINT "instructor_sessions_revocation_check" CHECK(("instructor_sessions"."revoked_at" is null and "instructor_sessions"."revoke_reason" is null) or ("instructor_sessions"."revoked_at" is not null and length(trim(coalesce("instructor_sessions"."revoke_reason", ''))) > 0))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `instructor_sessions_token_hash_unique` ON `instructor_sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `instructor_sessions_account_revoked_idx` ON `instructor_sessions` (`account_id`,`revoked_at`);--> statement-breakpoint
CREATE INDEX `instructor_sessions_expiry_revoked_idx` ON `instructor_sessions` (`expires_at`,`revoked_at`);--> statement-breakpoint
CREATE TABLE `__new_abuse_rate_limits` (
	`scope` text NOT NULL,
	`subject_key_hash` text NOT NULL,
	`window_started_at` integer NOT NULL,
	`window_expires_at` integer NOT NULL,
	`request_count` integer DEFAULT 1 NOT NULL,
	`last_request_at` integer NOT NULL,
	PRIMARY KEY(`scope`, `subject_key_hash`, `window_started_at`),
	CONSTRAINT "abuse_rate_limits_scope_check" CHECK("__new_abuse_rate_limits"."scope" in ('share_exchange_network', 'share_exchange_capability', 'share_close_network', 'share_close_session', 'share_response_network', 'share_response_capability', 'plan_publish_account', 'share_revoke_account', 'billing_checkout_account', 'billing_portal_account', 'billing_reconcile_account', 'data_export_account', 'data_request_account', 'data_request_operator_network', 'data_request_operator_identity', 'auth_login_network', 'auth_callback_network')),
	CONSTRAINT "abuse_rate_limits_hash_check" CHECK(length("__new_abuse_rate_limits"."subject_key_hash") = 64 and "__new_abuse_rate_limits"."subject_key_hash" not glob '*[^0-9a-f]*'),
	CONSTRAINT "abuse_rate_limits_window_check" CHECK("__new_abuse_rate_limits"."window_expires_at" > "__new_abuse_rate_limits"."window_started_at"),
	CONSTRAINT "abuse_rate_limits_count_check" CHECK("__new_abuse_rate_limits"."request_count" >= 1)
);
--> statement-breakpoint
INSERT INTO `__new_abuse_rate_limits`("scope", "subject_key_hash", "window_started_at", "window_expires_at", "request_count", "last_request_at") SELECT "scope", "subject_key_hash", "window_started_at", "window_expires_at", "request_count", "last_request_at" FROM `abuse_rate_limits`;--> statement-breakpoint
DROP TABLE `abuse_rate_limits`;--> statement-breakpoint
ALTER TABLE `__new_abuse_rate_limits` RENAME TO `abuse_rate_limits`;--> statement-breakpoint
CREATE INDEX `abuse_rate_limits_expires_idx` ON `abuse_rate_limits` (`window_expires_at`);
