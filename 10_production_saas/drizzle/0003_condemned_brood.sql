CREATE TABLE `billing_checkout_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider` text DEFAULT 'stripe' NOT NULL,
	`state` text DEFAULT 'reserved' NOT NULL,
	`request_version` integer DEFAULT 1 NOT NULL,
	`idempotency_key` text NOT NULL,
	`provider_price_id` text NOT NULL,
	`application_origin` text NOT NULL,
	`provider_customer_id` text,
	`customer_email` text NOT NULL,
	`provider_session_id` text,
	`provider_created_at` integer,
	`provider_expires_at` integer NOT NULL,
	`completed_at` integer,
	`expired_at` integer,
	`last_error_code` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`provider`,`provider_customer_id`,`account_id`) REFERENCES `billing_customers`(`provider`,`provider_customer_id`,`account_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "billing_checkout_attempts_provider_check" CHECK("billing_checkout_attempts"."provider" = 'stripe'),
	CONSTRAINT "billing_checkout_attempts_state_check" CHECK("billing_checkout_attempts"."state" in ('reserved', 'open', 'completed_pending_sync', 'completed', 'expired', 'quarantined')),
	CONSTRAINT "billing_checkout_attempts_request_version_check" CHECK("billing_checkout_attempts"."request_version" = 1),
	CONSTRAINT "billing_checkout_attempts_expiry_check" CHECK("billing_checkout_attempts"."provider_expires_at" > "billing_checkout_attempts"."created_at"),
	CONSTRAINT "billing_checkout_attempts_session_state_check" CHECK("billing_checkout_attempts"."state" not in ('open', 'completed_pending_sync', 'completed') or "billing_checkout_attempts"."provider_session_id" is not null),
	CONSTRAINT "billing_checkout_attempts_completed_check" CHECK(("billing_checkout_attempts"."state" = 'completed' and "billing_checkout_attempts"."completed_at" is not null) or ("billing_checkout_attempts"."state" <> 'completed' and "billing_checkout_attempts"."completed_at" is null)),
	CONSTRAINT "billing_checkout_attempts_expired_check" CHECK(("billing_checkout_attempts"."state" = 'expired' and "billing_checkout_attempts"."expired_at" is not null) or ("billing_checkout_attempts"."state" <> 'expired' and "billing_checkout_attempts"."expired_at" is null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_checkout_attempts_provider_key_unique` ON `billing_checkout_attempts` (`provider`,`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `billing_checkout_attempts_provider_session_unique` ON `billing_checkout_attempts` (`provider`,`provider_session_id`) WHERE "billing_checkout_attempts"."provider_session_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `billing_checkout_attempts_one_blocking_per_account` ON `billing_checkout_attempts` (`provider`,`account_id`) WHERE "billing_checkout_attempts"."state" in ('reserved', 'open', 'completed_pending_sync', 'quarantined');--> statement-breakpoint
CREATE INDEX `billing_checkout_attempts_expiry_idx` ON `billing_checkout_attempts` (`state`,`provider_expires_at`);--> statement-breakpoint
CREATE TABLE `billing_customers` (
	`provider` text NOT NULL,
	`provider_customer_id` text NOT NULL,
	`account_id` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	PRIMARY KEY(`provider`, `provider_customer_id`),
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "billing_customers_provider_check" CHECK("billing_customers"."provider" = 'stripe')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_customers_provider_account_unique` ON `billing_customers` (`provider`,`account_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `billing_customers_tenant_reference_unique` ON `billing_customers` (`provider`,`provider_customer_id`,`account_id`);--> statement-breakpoint
-- Deliberately use a plain INSERT rather than INSERT OR IGNORE. The unique
-- customer/account constraints are the migration preflight: an ambiguous
-- legacy ownership graph must stop the upgrade instead of choosing a tenant.
INSERT INTO `billing_customers` (`provider`, `provider_customer_id`, `account_id`)
SELECT DISTINCT `provider`, `provider_customer_id`, `account_id`
FROM `subscriptions`;--> statement-breakpoint
-- D1 executes migration batches transactionally, where changing
-- `foreign_keys` does not suppress ON DELETE actions. Preserve historical
-- webhook-to-subscription links explicitly across the table rebuild.
CREATE TABLE `__billing_event_subscription_links` (
	`billing_event_id` text PRIMARY KEY NOT NULL,
	`subscription_id` text NOT NULL
);--> statement-breakpoint
INSERT INTO `__billing_event_subscription_links` (`billing_event_id`, `subscription_id`)
SELECT `id`, `subscription_id`
FROM `billing_events`
WHERE `subscription_id` is not null;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_customer_id` text NOT NULL,
	`provider_subscription_id` text,
	`provider_price_id` text,
	`product_code` text NOT NULL,
	`status` text DEFAULT 'incomplete' NOT NULL,
	`billing_interval` text,
	`currency` text,
	`unit_amount_minor` integer,
	`trial_starts_at` integer,
	`trial_ends_at` integer,
	`current_period_starts_at` integer,
	`current_period_ends_at` integer,
	`cancel_at_period_end` integer DEFAULT false NOT NULL,
	`cancel_requested_at` integer,
	`canceled_at` integer,
	`pause_starts_at` integer,
	`pause_ends_at` integer,
	`ended_at` integer,
	`last_provider_sync_at` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`provider`,`provider_customer_id`,`account_id`) REFERENCES `billing_customers`(`provider`,`provider_customer_id`,`account_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "subscriptions_status_check" CHECK("__new_subscriptions"."status" in ('incomplete', 'trialing', 'active', 'past_due', 'paused', 'canceled', 'unpaid', 'ended')),
	CONSTRAINT "subscriptions_billing_interval_check" CHECK("__new_subscriptions"."billing_interval" is null or "__new_subscriptions"."billing_interval" in ('month', 'year')),
	CONSTRAINT "subscriptions_currency_check" CHECK("__new_subscriptions"."currency" is null or length("__new_subscriptions"."currency") = 3),
	CONSTRAINT "subscriptions_amount_check" CHECK("__new_subscriptions"."unit_amount_minor" is null or "__new_subscriptions"."unit_amount_minor" >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_subscriptions`("id", "account_id", "provider", "provider_customer_id", "provider_subscription_id", "provider_price_id", "product_code", "status", "billing_interval", "currency", "unit_amount_minor", "trial_starts_at", "trial_ends_at", "current_period_starts_at", "current_period_ends_at", "cancel_at_period_end", "cancel_requested_at", "canceled_at", "pause_starts_at", "pause_ends_at", "ended_at", "last_provider_sync_at", "created_at", "updated_at") SELECT "id", "account_id", "provider", "provider_customer_id", "provider_subscription_id", "provider_price_id", "product_code", "status", "billing_interval", "currency", "unit_amount_minor", "trial_starts_at", "trial_ends_at", "current_period_starts_at", "current_period_ends_at", "cancel_at_period_end", "cancel_requested_at", "canceled_at", "pause_starts_at", "pause_ends_at", "ended_at", "last_provider_sync_at", "created_at", "updated_at" FROM `subscriptions`;--> statement-breakpoint
DROP TABLE `subscriptions`;--> statement-breakpoint
ALTER TABLE `__new_subscriptions` RENAME TO `subscriptions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `subscriptions_account_id_unique` ON `subscriptions` (`account_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `subscriptions_provider_subscription_unique` ON `subscriptions` (`provider`,`provider_subscription_id`) WHERE "subscriptions"."provider_subscription_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `subscriptions_one_open_per_account` ON `subscriptions` (`account_id`) WHERE "subscriptions"."status" in ('incomplete', 'trialing', 'active', 'past_due', 'paused', 'unpaid');--> statement-breakpoint
CREATE INDEX `subscriptions_account_status_idx` ON `subscriptions` (`account_id`,`status`);--> statement-breakpoint
CREATE INDEX `subscriptions_period_end_idx` ON `subscriptions` (`current_period_ends_at`);--> statement-breakpoint
UPDATE `billing_events`
SET `subscription_id` = (
	SELECT `subscription_id`
	FROM `__billing_event_subscription_links`
	WHERE `billing_event_id` = `billing_events`.`id`
)
WHERE `id` in (SELECT `billing_event_id` FROM `__billing_event_subscription_links`);--> statement-breakpoint
DROP TABLE `__billing_event_subscription_links`;--> statement-breakpoint
CREATE TABLE `__new_billing_events` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text,
	`subscription_id` text,
	`provider` text NOT NULL,
	`provider_event_id` text NOT NULL,
	`provider_event_type` text NOT NULL,
	`status` text DEFAULT 'received' NOT NULL,
	`payload_sha256` text NOT NULL,
	`provider_invoice_id` text,
	`amount_minor` integer,
	`currency` text,
	`event_occurred_at` integer,
	`received_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	`processed_at` integer,
	`lease_token` text,
	`lease_expires_at` integer,
	`last_attempt_at` integer,
	`processing_attempts` integer DEFAULT 0 NOT NULL,
	`last_error_code` text,
	`last_error_message` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "billing_events_status_check" CHECK("__new_billing_events"."status" in ('received', 'processing', 'processed', 'ignored', 'failed')),
	CONSTRAINT "billing_events_amount_check" CHECK("__new_billing_events"."amount_minor" is null or "__new_billing_events"."amount_minor" >= 0),
	CONSTRAINT "billing_events_attempts_check" CHECK("__new_billing_events"."processing_attempts" >= 0)
);--> statement-breakpoint
INSERT INTO `__new_billing_events` (
	`id`, `account_id`, `subscription_id`, `provider`, `provider_event_id`,
	`provider_event_type`, `status`, `payload_sha256`, `provider_invoice_id`,
	`amount_minor`, `currency`, `event_occurred_at`, `received_at`,
	`processed_at`, `lease_token`, `lease_expires_at`, `last_attempt_at`,
	`processing_attempts`, `last_error_code`, `last_error_message`,
	`created_at`, `updated_at`
)
SELECT
	`id`, `account_id`, `subscription_id`, `provider`, `provider_event_id`,
	`provider_event_type`, `status`, `payload_sha256`, `provider_invoice_id`,
	`amount_minor`, `currency`, `event_occurred_at`, `received_at`,
	`processed_at`, NULL, NULL, NULL, `processing_attempts`,
	`last_error_code`, `last_error_message`, `created_at`,
	coalesce(`processed_at`, `received_at`, `created_at`)
FROM `billing_events`;--> statement-breakpoint
DROP TABLE `billing_events`;--> statement-breakpoint
ALTER TABLE `__new_billing_events` RENAME TO `billing_events`;--> statement-breakpoint
CREATE UNIQUE INDEX `billing_events_provider_event_unique` ON `billing_events` (`provider`,`provider_event_id`);--> statement-breakpoint
CREATE INDEX `billing_events_account_received_idx` ON `billing_events` (`account_id`,`received_at`);--> statement-breakpoint
CREATE INDEX `billing_events_status_received_idx` ON `billing_events` (`status`,`received_at`);
