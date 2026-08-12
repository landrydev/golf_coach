CREATE TABLE `abuse_rate_limits` (
	`scope` text NOT NULL,
	`subject_key_hash` text NOT NULL,
	`window_started_at` integer NOT NULL,
	`window_expires_at` integer NOT NULL,
	`request_count` integer DEFAULT 1 NOT NULL,
	`last_request_at` integer NOT NULL,
	PRIMARY KEY(`scope`, `subject_key_hash`, `window_started_at`),
	CONSTRAINT "abuse_rate_limits_scope_check" CHECK("abuse_rate_limits"."scope" in ('share_exchange_network', 'share_exchange_capability', 'share_response_network', 'share_response_capability', 'plan_publish_account', 'share_revoke_account', 'billing_checkout_account', 'billing_portal_account', 'data_export_account', 'data_request_account')),
	CONSTRAINT "abuse_rate_limits_hash_check" CHECK(length("abuse_rate_limits"."subject_key_hash") = 64 and "abuse_rate_limits"."subject_key_hash" not glob '*[^0-9a-f]*'),
	CONSTRAINT "abuse_rate_limits_window_check" CHECK("abuse_rate_limits"."window_expires_at" > "abuse_rate_limits"."window_started_at"),
	CONSTRAINT "abuse_rate_limits_count_check" CHECK("abuse_rate_limits"."request_count" >= 1)
);
--> statement-breakpoint
CREATE INDEX `abuse_rate_limits_expires_idx` ON `abuse_rate_limits` (`window_expires_at`);