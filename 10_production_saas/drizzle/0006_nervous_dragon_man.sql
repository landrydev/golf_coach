CREATE TABLE `billing_account_operation_leases` (
	`account_id` text PRIMARY KEY NOT NULL,
	`provider` text DEFAULT 'stripe' NOT NULL,
	`state` text DEFAULT 'idle' NOT NULL,
	`operation` text,
	`lease_token` text,
	`lease_generation` integer DEFAULT 1 NOT NULL,
	`lease_expires_at` integer,
	`last_acquired_at` integer,
	`last_released_at` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "billing_account_operation_leases_provider_check" CHECK("billing_account_operation_leases"."provider" = 'stripe'),
	CONSTRAINT "billing_account_operation_leases_state_check" CHECK("billing_account_operation_leases"."state" in ('idle', 'held')),
	CONSTRAINT "billing_account_operation_leases_operation_check" CHECK("billing_account_operation_leases"."operation" is null or "billing_account_operation_leases"."operation" in ('checkout', 'reconciliation')),
	CONSTRAINT "billing_account_operation_leases_generation_check" CHECK("billing_account_operation_leases"."lease_generation" >= 1),
	CONSTRAINT "billing_account_operation_leases_shape_check" CHECK(("billing_account_operation_leases"."state" = 'held' and "billing_account_operation_leases"."operation" is not null and "billing_account_operation_leases"."lease_token" is not null and "billing_account_operation_leases"."lease_expires_at" is not null and "billing_account_operation_leases"."last_acquired_at" is not null) or ("billing_account_operation_leases"."state" = 'idle' and "billing_account_operation_leases"."operation" is null and "billing_account_operation_leases"."lease_token" is null and "billing_account_operation_leases"."lease_expires_at" is null))
);
--> statement-breakpoint
CREATE INDEX `billing_account_operation_leases_expiry_idx` ON `billing_account_operation_leases` (`state`,`lease_expires_at`);--> statement-breakpoint
CREATE TABLE `billing_reconciliation_targets` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider` text DEFAULT 'stripe' NOT NULL,
	`subscription_id` text,
	`checkout_attempt_id` text,
	`state` text NOT NULL,
	`lease_token` text,
	`lease_expires_at` integer,
	`last_attempt_at` integer NOT NULL,
	`processing_attempts` integer NOT NULL,
	`automatic_failure_count` integer DEFAULT 0 NOT NULL,
	`next_automatic_attempt_at` integer,
	`automatic_dead_lettered_at` integer,
	`last_error_code` text,
	`last_error_message` text,
	`last_completed_at` integer,
	`last_succeeded_at` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`,`subscription_id`) REFERENCES `subscriptions`(`account_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`,`checkout_attempt_id`) REFERENCES `billing_checkout_attempts`(`account_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "billing_reconciliation_targets_provider_check" CHECK("billing_reconciliation_targets"."provider" = 'stripe'),
	CONSTRAINT "billing_reconciliation_targets_exact_target_check" CHECK(("billing_reconciliation_targets"."subscription_id" is not null and "billing_reconciliation_targets"."checkout_attempt_id" is null) or ("billing_reconciliation_targets"."subscription_id" is null and "billing_reconciliation_targets"."checkout_attempt_id" is not null)),
	CONSTRAINT "billing_reconciliation_targets_state_check" CHECK("billing_reconciliation_targets"."state" in ('processing', 'succeeded', 'failed')),
	CONSTRAINT "billing_reconciliation_targets_attempts_check" CHECK("billing_reconciliation_targets"."processing_attempts" >= 1),
	CONSTRAINT "billing_reconciliation_targets_automatic_failures_check" CHECK("billing_reconciliation_targets"."automatic_failure_count" >= 0),
	CONSTRAINT "billing_reconciliation_targets_lease_check" CHECK(("billing_reconciliation_targets"."state" = 'processing' and "billing_reconciliation_targets"."lease_token" is not null and "billing_reconciliation_targets"."lease_expires_at" is not null) or ("billing_reconciliation_targets"."state" <> 'processing' and "billing_reconciliation_targets"."lease_token" is null and "billing_reconciliation_targets"."lease_expires_at" is null)),
	CONSTRAINT "billing_reconciliation_targets_completion_check" CHECK(("billing_reconciliation_targets"."state" = 'processing' and "billing_reconciliation_targets"."last_completed_at" is null) or ("billing_reconciliation_targets"."state" <> 'processing' and "billing_reconciliation_targets"."last_completed_at" is not null)),
	CONSTRAINT "billing_reconciliation_targets_error_check" CHECK(("billing_reconciliation_targets"."state" = 'failed' and "billing_reconciliation_targets"."last_error_code" is not null and "billing_reconciliation_targets"."last_error_message" is not null) or ("billing_reconciliation_targets"."state" <> 'failed' and "billing_reconciliation_targets"."last_error_code" is null and "billing_reconciliation_targets"."last_error_message" is null)),
	CONSTRAINT "billing_reconciliation_targets_automatic_retry_check" CHECK(("billing_reconciliation_targets"."state" = 'failed' and (("billing_reconciliation_targets"."automatic_dead_lettered_at" is null and ("billing_reconciliation_targets"."next_automatic_attempt_at" is not null or "billing_reconciliation_targets"."automatic_failure_count" = 0)) or ("billing_reconciliation_targets"."automatic_dead_lettered_at" is not null and "billing_reconciliation_targets"."automatic_failure_count" >= 8 and "billing_reconciliation_targets"."next_automatic_attempt_at" is null))) or ("billing_reconciliation_targets"."state" <> 'failed' and "billing_reconciliation_targets"."next_automatic_attempt_at" is null and "billing_reconciliation_targets"."automatic_dead_lettered_at" is null)),
	CONSTRAINT "billing_reconciliation_targets_success_failure_reset_check" CHECK("billing_reconciliation_targets"."state" <> 'succeeded' or "billing_reconciliation_targets"."automatic_failure_count" = 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_reconciliation_targets_subscription_unique` ON `billing_reconciliation_targets` (`provider`,`account_id`,`subscription_id`) WHERE "billing_reconciliation_targets"."subscription_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `billing_reconciliation_targets_checkout_unique` ON `billing_reconciliation_targets` (`provider`,`account_id`,`checkout_attempt_id`) WHERE "billing_reconciliation_targets"."checkout_attempt_id" is not null;--> statement-breakpoint
CREATE INDEX `billing_reconciliation_targets_state_lease_idx` ON `billing_reconciliation_targets` (`state`,`lease_expires_at`);--> statement-breakpoint
CREATE INDEX `billing_reconciliation_targets_account_state_idx` ON `billing_reconciliation_targets` (`account_id`,`state`);--> statement-breakpoint
CREATE INDEX `billing_reconciliation_targets_automatic_due_idx` ON `billing_reconciliation_targets` (`provider`,`state`,`automatic_dead_lettered_at`,`next_automatic_attempt_at`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_abuse_rate_limits` (
	`scope` text NOT NULL,
	`subject_key_hash` text NOT NULL,
	`window_started_at` integer NOT NULL,
	`window_expires_at` integer NOT NULL,
	`request_count` integer DEFAULT 1 NOT NULL,
	`last_request_at` integer NOT NULL,
	PRIMARY KEY(`scope`, `subject_key_hash`, `window_started_at`),
	CONSTRAINT "abuse_rate_limits_scope_check" CHECK("__new_abuse_rate_limits"."scope" in ('share_exchange_network', 'share_exchange_capability', 'share_response_network', 'share_response_capability', 'plan_publish_account', 'share_revoke_account', 'billing_checkout_account', 'billing_portal_account', 'billing_reconcile_account', 'data_export_account', 'data_request_account')),
	CONSTRAINT "abuse_rate_limits_hash_check" CHECK(length("__new_abuse_rate_limits"."subject_key_hash") = 64 and "__new_abuse_rate_limits"."subject_key_hash" not glob '*[^0-9a-f]*'),
	CONSTRAINT "abuse_rate_limits_window_check" CHECK("__new_abuse_rate_limits"."window_expires_at" > "__new_abuse_rate_limits"."window_started_at"),
	CONSTRAINT "abuse_rate_limits_count_check" CHECK("__new_abuse_rate_limits"."request_count" >= 1)
);
--> statement-breakpoint
INSERT INTO `__new_abuse_rate_limits`("scope", "subject_key_hash", "window_started_at", "window_expires_at", "request_count", "last_request_at") SELECT "scope", "subject_key_hash", "window_started_at", "window_expires_at", "request_count", "last_request_at" FROM `abuse_rate_limits`;--> statement-breakpoint
DROP TABLE `abuse_rate_limits`;--> statement-breakpoint
ALTER TABLE `__new_abuse_rate_limits` RENAME TO `abuse_rate_limits`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `abuse_rate_limits_expires_idx` ON `abuse_rate_limits` (`window_expires_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `billing_checkout_attempts_account_id_unique` ON `billing_checkout_attempts` (`account_id`,`id`);--> statement-breakpoint
CREATE INDEX `subscriptions_provider_status_sync_idx` ON `subscriptions` (`provider`,`status`,`last_provider_sync_at`);