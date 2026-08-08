CREATE TABLE `billing_subscription_projection_generations` (
	`provider` text NOT NULL,
	`provider_subscription_id` text NOT NULL,
	`generation` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	PRIMARY KEY(`provider`, `provider_subscription_id`),
	CONSTRAINT "billing_subscription_projection_generations_provider_check" CHECK("billing_subscription_projection_generations"."provider" = 'stripe'),
	CONSTRAINT "billing_subscription_projection_generations_generation_check" CHECK("billing_subscription_projection_generations"."generation" >= 1)
);
