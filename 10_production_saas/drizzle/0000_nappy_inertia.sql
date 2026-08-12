CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`auth_provider` text DEFAULT 'siwc' NOT NULL,
	`auth_subject` text NOT NULL,
	`primary_email` text NOT NULL,
	`normalized_email` text NOT NULL,
	`email_verified_at` integer,
	`status` text DEFAULT 'pending_verification' NOT NULL,
	`locale` text DEFAULT 'en-CA' NOT NULL,
	`timezone` text DEFAULT 'America/Edmonton' NOT NULL,
	`last_signed_in_at` integer,
	`suspended_at` integer,
	`suspension_reason` text,
	`deletion_scheduled_at` integer,
	`deleted_at` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	CONSTRAINT "accounts_status_check" CHECK("accounts"."status" in ('pending_verification', 'active', 'suspended', 'deletion_pending', 'deleted')),
	CONSTRAINT "accounts_normalized_email_check" CHECK("accounts"."normalized_email" = lower(trim("accounts"."normalized_email")))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_auth_identity_unique` ON `accounts` (`auth_provider`,`auth_subject`);--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_normalized_email_unique` ON `accounts` (`normalized_email`);--> statement-breakpoint
CREATE INDEX `accounts_status_idx` ON `accounts` (`status`);--> statement-breakpoint
CREATE TABLE `assessments` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`assessed_at` integer,
	`context` text,
	`starting_point` text NOT NULL,
	`strength_summary` text NOT NULL,
	`primary_pattern` text NOT NULL,
	`limitations` text,
	`coach_approved_at` integer,
	`superseded_at` integer,
	`archived_at` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`,`plan_id`) REFERENCES `development_plans`(`account_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "assessments_status_check" CHECK("assessments"."status" in ('draft', 'confirmed', 'superseded', 'archived'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assessments_account_id_unique` ON `assessments` (`account_id`,`id`);--> statement-breakpoint
CREATE INDEX `assessments_plan_status_idx` ON `assessments` (`account_id`,`plan_id`,`status`);--> statement-breakpoint
CREATE INDEX `assessments_assessed_at_idx` ON `assessments` (`assessed_at`);--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text,
	`actor_type` text NOT NULL,
	`actor_account_id` text,
	`actor_reference` text,
	`action` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text,
	`outcome` text NOT NULL,
	`request_id` text,
	`ip_address_hash` text,
	`metadata` text,
	`occurred_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	`retention_expires_at` integer,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`actor_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "audit_events_actor_type_check" CHECK("audit_events"."actor_type" in ('account', 'golfer_share', 'system', 'support', 'billing_provider')),
	CONSTRAINT "audit_events_outcome_check" CHECK("audit_events"."outcome" in ('success', 'failure', 'denied')),
	CONSTRAINT "audit_events_metadata_json_check" CHECK("audit_events"."metadata" is null or json_valid("audit_events"."metadata"))
);
--> statement-breakpoint
CREATE INDEX `audit_events_account_occurred_idx` ON `audit_events` (`account_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `audit_events_actor_occurred_idx` ON `audit_events` (`actor_account_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `audit_events_target_occurred_idx` ON `audit_events` (`target_type`,`target_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `audit_events_action_outcome_idx` ON `audit_events` (`action`,`outcome`);--> statement-breakpoint
CREATE INDEX `audit_events_retention_expires_idx` ON `audit_events` (`retention_expires_at`);--> statement-breakpoint
CREATE TABLE `billing_events` (
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
	`processing_attempts` integer DEFAULT 0 NOT NULL,
	`last_error_code` text,
	`last_error_message` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "billing_events_status_check" CHECK("billing_events"."status" in ('received', 'processing', 'processed', 'ignored', 'failed')),
	CONSTRAINT "billing_events_amount_check" CHECK("billing_events"."amount_minor" is null or "billing_events"."amount_minor" >= 0),
	CONSTRAINT "billing_events_attempts_check" CHECK("billing_events"."processing_attempts" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_events_provider_event_unique` ON `billing_events` (`provider`,`provider_event_id`);--> statement-breakpoint
CREATE INDEX `billing_events_account_received_idx` ON `billing_events` (`account_id`,`received_at`);--> statement-breakpoint
CREATE INDEX `billing_events_status_received_idx` ON `billing_events` (`status`,`received_at`);--> statement-breakpoint
CREATE TABLE `coaching_packages` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`name` text NOT NULL,
	`purpose` text NOT NULL,
	`fit_description` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`currency` text,
	`price_amount_minor` integer,
	`current_details_text` text,
	`inclusions` text DEFAULT '[]' NOT NULL,
	`cadence` text,
	`practice_expectation` text,
	`evaluation_description` text,
	`terms_summary` text,
	`external_action_type` text NOT NULL,
	`external_action_label` text NOT NULL,
	`external_action_url` text NOT NULL,
	`external_action_verified_at` integer,
	`is_default` integer DEFAULT false NOT NULL,
	`archived_at` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "coaching_packages_status_check" CHECK("coaching_packages"."status" in ('draft', 'active', 'archived')),
	CONSTRAINT "coaching_packages_external_action_type_check" CHECK("coaching_packages"."external_action_type" in ('booking', 'purchase', 'contact', 'other')),
	CONSTRAINT "coaching_packages_price_check" CHECK(("coaching_packages"."price_amount_minor" is null and "coaching_packages"."currency" is null) or ("coaching_packages"."price_amount_minor" is not null and "coaching_packages"."price_amount_minor" >= 0 and "coaching_packages"."currency" is not null and length("coaching_packages"."currency") = 3)),
	CONSTRAINT "coaching_packages_details_check" CHECK("coaching_packages"."price_amount_minor" is not null or length(trim(coalesce("coaching_packages"."current_details_text", ''))) > 0),
	CONSTRAINT "coaching_packages_inclusions_json_check" CHECK(json_valid("coaching_packages"."inclusions"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `coaching_packages_account_id_unique` ON `coaching_packages` (`account_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `coaching_packages_one_default_per_account` ON `coaching_packages` (`account_id`) WHERE "coaching_packages"."is_default" = 1 and "coaching_packages"."status" = 'active';--> statement-breakpoint
CREATE INDEX `coaching_packages_account_status_idx` ON `coaching_packages` (`account_id`,`status`);--> statement-breakpoint
CREATE TABLE `consent_records` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`golfer_id` text,
	`subject_type` text NOT NULL,
	`scope` text NOT NULL,
	`status` text NOT NULL,
	`policy_version` text NOT NULL,
	`purpose_description` text NOT NULL,
	`capture_method` text NOT NULL,
	`evidence_reference` text,
	`recorded_by_account_id` text,
	`granted_at` integer,
	`declined_at` integer,
	`withdrawn_at` integer,
	`expires_at` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`recorded_by_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`,`golfer_id`) REFERENCES `golfers`(`account_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "consent_records_subject_type_check" CHECK("consent_records"."subject_type" in ('account', 'golfer')),
	CONSTRAINT "consent_records_subject_reference_check" CHECK(("consent_records"."subject_type" = 'account' and "consent_records"."golfer_id" is null) or ("consent_records"."subject_type" = 'golfer' and "consent_records"."golfer_id" is not null)),
	CONSTRAINT "consent_records_scope_check" CHECK("consent_records"."scope" in ('terms', 'privacy_notice', 'golfer_record', 'roadmap_sharing', 'media_use', 'service_email', 'optional_analytics')),
	CONSTRAINT "consent_records_status_check" CHECK("consent_records"."status" in ('granted', 'declined', 'withdrawn', 'expired')),
	CONSTRAINT "consent_records_capture_method_check" CHECK("consent_records"."capture_method" in ('self_service', 'instructor_attested', 'support_assisted', 'imported'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `consent_records_account_id_unique` ON `consent_records` (`account_id`,`id`);--> statement-breakpoint
CREATE INDEX `consent_records_subject_scope_created_idx` ON `consent_records` (`account_id`,`golfer_id`,`scope`,`created_at`);--> statement-breakpoint
CREATE INDEX `consent_records_status_expires_idx` ON `consent_records` (`status`,`expires_at`);--> statement-breakpoint
CREATE TABLE `data_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text,
	`golfer_id` text,
	`request_type` text NOT NULL,
	`requested_by_type` text NOT NULL,
	`requester_contact_hash` text,
	`status` text DEFAULT 'submitted' NOT NULL,
	`details` text,
	`identity_verified_at` integer,
	`due_at` integer,
	`assigned_to_reference` text,
	`decision_reason` text,
	`export_object_key` text,
	`export_sha256` text,
	`export_expires_at` integer,
	`deletion_scheduled_at` integer,
	`fulfilled_at` integer,
	`canceled_at` integer,
	`failed_at` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`account_id`,`golfer_id`) REFERENCES `golfers`(`account_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "data_requests_type_check" CHECK("data_requests"."request_type" in ('access', 'export', 'correction', 'deletion', 'restriction', 'consent_withdrawal')),
	CONSTRAINT "data_requests_requester_type_check" CHECK("data_requests"."requested_by_type" in ('account', 'golfer', 'authorized_representative', 'support')),
	CONSTRAINT "data_requests_status_check" CHECK("data_requests"."status" in ('submitted', 'identity_verification_required', 'verified', 'in_progress', 'fulfilled', 'denied', 'canceled', 'failed')),
	CONSTRAINT "data_requests_export_fields_check" CHECK("data_requests"."export_object_key" is null or "data_requests"."request_type" in ('access', 'export'))
);
--> statement-breakpoint
CREATE INDEX `data_requests_account_created_idx` ON `data_requests` (`account_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `data_requests_golfer_created_idx` ON `data_requests` (`golfer_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `data_requests_status_due_idx` ON `data_requests` (`status`,`due_at`);--> statement-breakpoint
CREATE TABLE `development_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`golfer_id` text NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`approved_revision` integer,
	`published_revision` integer,
	`welcome_note` text,
	`assessment_context` text,
	`current_coach_note` text,
	`current_coach_note_at` integer,
	`private_context_label` text DEFAULT 'Private coaching roadmap' NOT NULL,
	`coach_approved_at` integer,
	`previewed_at` integer,
	`published_at` integer,
	`last_shared_at` integer,
	`paused_at` integer,
	`completed_at` integer,
	`archived_at` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`,`golfer_id`) REFERENCES `golfers`(`account_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "development_plans_status_check" CHECK("development_plans"."status" in ('draft', 'preview_ready', 'published', 'paused', 'completed', 'archived')),
	CONSTRAINT "development_plans_revision_check" CHECK("development_plans"."revision" >= 1),
	CONSTRAINT "development_plans_approved_revision_check" CHECK("development_plans"."approved_revision" is null or ("development_plans"."approved_revision" >= 1 and "development_plans"."approved_revision" <= "development_plans"."revision")),
	CONSTRAINT "development_plans_published_revision_check" CHECK("development_plans"."published_revision" is null or ("development_plans"."published_revision" >= 1 and "development_plans"."published_revision" <= "development_plans"."revision"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `development_plans_account_id_unique` ON `development_plans` (`account_id`,`id`);--> statement-breakpoint
CREATE INDEX `development_plans_account_status_updated_idx` ON `development_plans` (`account_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `development_plans_golfer_status_idx` ON `development_plans` (`account_id`,`golfer_id`,`status`);--> statement-breakpoint
CREATE TABLE `evidence_items` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`assessment_id` text,
	`phase_id` text,
	`lesson_id` text,
	`practice_item_id` text,
	`media_asset_id` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`evidence_type` text NOT NULL,
	`context_type` text NOT NULL,
	`title` text NOT NULL,
	`claim` text,
	`source_label` text NOT NULL,
	`source_type` text NOT NULL,
	`observed_at` integer,
	`comparison_role` text DEFAULT 'standalone' NOT NULL,
	`comparison_group_id` text,
	`metric_name` text,
	`metric_value` real,
	`metric_unit` text,
	`value_text` text,
	`interpretation` text NOT NULL,
	`limitation` text NOT NULL,
	`maturity` text NOT NULL,
	`next_evidence_needed` text,
	`is_representative` integer DEFAULT false NOT NULL,
	`coach_approved_at` integer,
	`withdrawn_at` integer,
	`archived_at` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`,`plan_id`) REFERENCES `development_plans`(`account_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`,`assessment_id`) REFERENCES `assessments`(`account_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`,`phase_id`) REFERENCES `plan_phases`(`account_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`,`lesson_id`) REFERENCES `lessons`(`account_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`,`practice_item_id`) REFERENCES `practice_items`(`account_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`,`media_asset_id`) REFERENCES `media_assets`(`account_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "evidence_items_status_check" CHECK("evidence_items"."status" in ('draft', 'published', 'withdrawn', 'archived')),
	CONSTRAINT "evidence_items_type_check" CHECK("evidence_items"."evidence_type" in ('coach_observation', 'golfer_report', 'measurement', 'outcome_count', 'media', 'comparison', 'note')),
	CONSTRAINT "evidence_items_context_check" CHECK("evidence_items"."context_type" in ('assessment', 'lesson', 'practice', 'on_course', 'phase_review', 'other')),
	CONSTRAINT "evidence_items_source_type_check" CHECK("evidence_items"."source_type" in ('coach_observed', 'golfer_reported', 'device', 'document', 'mixed')),
	CONSTRAINT "evidence_items_comparison_role_check" CHECK("evidence_items"."comparison_role" in ('standalone', 'baseline', 'current')),
	CONSTRAINT "evidence_items_maturity_check" CHECK("evidence_items"."maturity" in ('single_observation', 'early_indication', 'repeated_practice', 'on_course_observation', 'insufficient')),
	CONSTRAINT "evidence_items_metric_check" CHECK(("evidence_items"."metric_value" is null and "evidence_items"."metric_name" is null and "evidence_items"."metric_unit" is null) or ("evidence_items"."metric_value" is not null and length(trim(coalesce("evidence_items"."metric_name", ''))) > 0)),
	CONSTRAINT "evidence_items_media_check" CHECK("evidence_items"."evidence_type" <> 'media' or "evidence_items"."media_asset_id" is not null)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `evidence_items_account_id_unique` ON `evidence_items` (`account_id`,`id`);--> statement-breakpoint
CREATE INDEX `evidence_items_plan_status_observed_idx` ON `evidence_items` (`account_id`,`plan_id`,`status`,`observed_at`);--> statement-breakpoint
CREATE INDEX `evidence_items_phase_status_idx` ON `evidence_items` (`account_id`,`phase_id`,`status`);--> statement-breakpoint
CREATE INDEX `evidence_items_comparison_group_idx` ON `evidence_items` (`account_id`,`comparison_group_id`);--> statement-breakpoint
CREATE TABLE `golfer_goals` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`golfer_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`desired_outcome` text NOT NULL,
	`why_it_matters` text,
	`context` text,
	`constraints` text,
	`score_or_handicap_context` text,
	`target_date` integer,
	`status` text DEFAULT 'active' NOT NULL,
	`is_primary` integer DEFAULT true NOT NULL,
	`confirmed_by_golfer_at` integer,
	`coach_approved_at` integer,
	`achieved_at` integer,
	`revised_at` integer,
	`archived_at` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`,`plan_id`) REFERENCES `development_plans`(`account_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`,`golfer_id`) REFERENCES `golfers`(`account_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "golfer_goals_status_check" CHECK("golfer_goals"."status" in ('active', 'achieved', 'revised', 'archived'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `golfer_goals_account_id_unique` ON `golfer_goals` (`account_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `golfer_goals_one_primary_per_plan` ON `golfer_goals` (`account_id`,`plan_id`) WHERE "golfer_goals"."is_primary" = 1 and "golfer_goals"."status" = 'active';--> statement-breakpoint
CREATE INDEX `golfer_goals_golfer_status_idx` ON `golfer_goals` (`account_id`,`golfer_id`,`status`);--> statement-breakpoint
CREATE TABLE `golfer_plan_responses` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`share_link_id` text,
	`response_type` text NOT NULL,
	`note` text,
	`external_outcome_observed` integer DEFAULT false NOT NULL,
	`occurred_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`,`plan_id`) REFERENCES `development_plans`(`account_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`,`share_link_id`) REFERENCES `share_links`(`account_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "golfer_plan_responses_type_check" CHECK("golfer_plan_responses"."response_type" in ('ask_question', 'wait', 'decline', 'request_reassessment', 'independent_practice', 'external_action_opened')),
	CONSTRAINT "golfer_plan_responses_external_outcome_check" CHECK("golfer_plan_responses"."external_outcome_observed" = 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `golfer_plan_responses_account_id_unique` ON `golfer_plan_responses` (`account_id`,`id`);--> statement-breakpoint
CREATE INDEX `golfer_plan_responses_plan_occurred_idx` ON `golfer_plan_responses` (`account_id`,`plan_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `golfers` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`display_name` text NOT NULL,
	`preferred_name` text,
	`contact_email` text,
	`external_reference` text,
	`status` text DEFAULT 'active' NOT NULL,
	`eligibility_status` text DEFAULT 'unconfirmed' NOT NULL,
	`eligibility_confirmed_at` integer,
	`last_activity_at` integer,
	`archived_at` integer,
	`deletion_scheduled_at` integer,
	`deleted_at` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "golfers_status_check" CHECK("golfers"."status" in ('active', 'inactive', 'archived', 'deletion_pending', 'deleted')),
	CONSTRAINT "golfers_eligibility_status_check" CHECK("golfers"."eligibility_status" in ('unconfirmed', 'adult_confirmed', 'ineligible'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `golfers_account_id_unique` ON `golfers` (`account_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `golfers_external_reference_unique` ON `golfers` (`account_id`,`external_reference`) WHERE "golfers"."external_reference" is not null;--> statement-breakpoint
CREATE INDEX `golfers_account_status_updated_idx` ON `golfers` (`account_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `golfers_account_display_name_idx` ON `golfers` (`account_id`,`display_name`);--> statement-breakpoint
CREATE TABLE `instructor_profiles` (
	`account_id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`business_name` text,
	`professional_title` text,
	`philosophy` text,
	`contact_email` text NOT NULL,
	`contact_phone` text,
	`website_url` text,
	`province_or_territory` text,
	`city` text,
	`accent_color` text,
	`logo_media_asset_id` text,
	`profile_photo_media_asset_id` text,
	`setup_completed_at` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`,`logo_media_asset_id`) REFERENCES `media_assets`(`account_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`,`profile_photo_media_asset_id`) REFERENCES `media_assets`(`account_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "instructor_profiles_accent_color_check" CHECK("instructor_profiles"."accent_color" is null or (length("instructor_profiles"."accent_color") = 7 and substr("instructor_profiles"."accent_color", 1, 1) = '#' and substr("instructor_profiles"."accent_color", 2) not glob '*[^0-9A-Fa-f]*'))
);
--> statement-breakpoint
CREATE TABLE `lessons` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`phase_id` text,
	`sequence` integer NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`purpose` text NOT NULL,
	`coach_observation` text,
	`golfer_learning` text,
	`takeaway` text,
	`next_check` text,
	`phase_connection` text,
	`scheduled_at` integer,
	`occurred_at` integer,
	`coach_approved_at` integer,
	`completed_at` integer,
	`canceled_at` integer,
	`archived_at` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`,`plan_id`) REFERENCES `development_plans`(`account_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`,`phase_id`) REFERENCES `plan_phases`(`account_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "lessons_status_check" CHECK("lessons"."status" in ('planned', 'completed', 'canceled', 'archived')),
	CONSTRAINT "lessons_sequence_check" CHECK("lessons"."sequence" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lessons_account_id_unique` ON `lessons` (`account_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `lessons_plan_sequence_unique` ON `lessons` (`account_id`,`plan_id`,`sequence`);--> statement-breakpoint
CREATE INDEX `lessons_plan_status_idx` ON `lessons` (`account_id`,`plan_id`,`status`);--> statement-breakpoint
CREATE INDEX `lessons_phase_sequence_idx` ON `lessons` (`account_id`,`phase_id`,`sequence`);--> statement-breakpoint
CREATE TABLE `media_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`storage_provider` text NOT NULL,
	`object_key` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`media_kind` text NOT NULL,
	`mime_type` text NOT NULL,
	`original_filename` text,
	`byte_size` integer NOT NULL,
	`content_sha256` text,
	`width_pixels` integer,
	`height_pixels` integer,
	`duration_ms` integer,
	`alt_text` text,
	`caption` text,
	`transcript` text,
	`failure_code` text,
	`uploaded_at` integer,
	`processed_at` integer,
	`deleted_at` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "media_assets_status_check" CHECK("media_assets"."status" in ('pending', 'ready', 'failed', 'quarantined', 'deleted')),
	CONSTRAINT "media_assets_kind_check" CHECK("media_assets"."media_kind" in ('image', 'video', 'audio', 'document')),
	CONSTRAINT "media_assets_byte_size_check" CHECK("media_assets"."byte_size" >= 0),
	CONSTRAINT "media_assets_dimensions_check" CHECK(("media_assets"."width_pixels" is null or "media_assets"."width_pixels" > 0) and ("media_assets"."height_pixels" is null or "media_assets"."height_pixels" > 0) and ("media_assets"."duration_ms" is null or "media_assets"."duration_ms" >= 0))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_assets_account_id_unique` ON `media_assets` (`account_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `media_assets_storage_object_unique` ON `media_assets` (`storage_provider`,`object_key`);--> statement-breakpoint
CREATE INDEX `media_assets_account_status_idx` ON `media_assets` (`account_id`,`status`);--> statement-breakpoint
CREATE INDEX `media_assets_content_sha256_idx` ON `media_assets` (`account_id`,`content_sha256`);--> statement-breakpoint
CREATE TABLE `phase_priorities` (
	`account_id` text NOT NULL,
	`phase_id` text NOT NULL,
	`priority_id` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`,`phase_id`) REFERENCES `plan_phases`(`account_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`,`priority_id`) REFERENCES `plan_priorities`(`account_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "phase_priorities_sort_order_check" CHECK("phase_priorities"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `phase_priorities_pair_unique` ON `phase_priorities` (`account_id`,`phase_id`,`priority_id`);--> statement-breakpoint
CREATE INDEX `phase_priorities_phase_order_idx` ON `phase_priorities` (`account_id`,`phase_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `phase_review_evidence` (
	`account_id` text NOT NULL,
	`phase_review_id` text NOT NULL,
	`evidence_item_id` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`,`phase_review_id`) REFERENCES `phase_reviews`(`account_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`,`evidence_item_id`) REFERENCES `evidence_items`(`account_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "phase_review_evidence_sort_order_check" CHECK("phase_review_evidence"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `phase_review_evidence_pair_unique` ON `phase_review_evidence` (`account_id`,`phase_review_id`,`evidence_item_id`);--> statement-breakpoint
CREATE INDEX `phase_review_evidence_review_order_idx` ON `phase_review_evidence` (`account_id`,`phase_review_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `phase_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`phase_id` text NOT NULL,
	`next_phase_id` text,
	`recommended_package_id` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`outcome` text NOT NULL,
	`original_purpose` text NOT NULL,
	`baseline_summary` text NOT NULL,
	`work_completed` text NOT NULL,
	`change_summary` text NOT NULL,
	`reliability_label` text NOT NULL,
	`limitations` text NOT NULL,
	`golfer_contribution` text,
	`coach_conclusion` text NOT NULL,
	`remaining_opportunity` text,
	`next_phase_rationale` text,
	`independent_practice_alternative` text,
	`confirmed_at` integer,
	`shared_at` integer,
	`superseded_at` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`,`plan_id`) REFERENCES `development_plans`(`account_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`,`phase_id`) REFERENCES `plan_phases`(`account_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`,`next_phase_id`) REFERENCES `plan_phases`(`account_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`,`recommended_package_id`) REFERENCES `coaching_packages`(`account_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "phase_reviews_status_check" CHECK("phase_reviews"."status" in ('draft', 'confirmed', 'shared', 'superseded')),
	CONSTRAINT "phase_reviews_outcome_check" CHECK("phase_reviews"."outcome" in ('complete', 'partially_complete', 'paused', 'revised', 'insufficient_evidence', 'goal_changed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `phase_reviews_account_id_unique` ON `phase_reviews` (`account_id`,`id`);--> statement-breakpoint
CREATE INDEX `phase_reviews_phase_status_idx` ON `phase_reviews` (`account_id`,`phase_id`,`status`);--> statement-breakpoint
CREATE INDEX `phase_reviews_plan_created_idx` ON `phase_reviews` (`account_id`,`plan_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `plan_phases` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`coaching_package_id` text,
	`sequence` integer NOT NULL,
	`title` text NOT NULL,
	`purpose` text NOT NULL,
	`rationale` text,
	`progress_signals` text DEFAULT '[]' NOT NULL,
	`expectations` text,
	`estimated_duration` text,
	`status` text DEFAULT 'planned' NOT NULL,
	`is_recommended` integer DEFAULT false NOT NULL,
	`coach_approved_at` integer,
	`started_at` integer,
	`paused_at` integer,
	`completed_at` integer,
	`revised_at` integer,
	`canceled_at` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`,`plan_id`) REFERENCES `development_plans`(`account_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`,`coaching_package_id`) REFERENCES `coaching_packages`(`account_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "plan_phases_status_check" CHECK("plan_phases"."status" in ('planned', 'active', 'paused', 'complete', 'revised', 'canceled')),
	CONSTRAINT "plan_phases_sequence_check" CHECK("plan_phases"."sequence" >= 1),
	CONSTRAINT "plan_phases_progress_signals_json_check" CHECK(json_valid("plan_phases"."progress_signals"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plan_phases_account_id_unique` ON `plan_phases` (`account_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `plan_phases_sequence_unique` ON `plan_phases` (`account_id`,`plan_id`,`sequence`);--> statement-breakpoint
CREATE UNIQUE INDEX `plan_phases_one_active_per_plan` ON `plan_phases` (`account_id`,`plan_id`) WHERE "plan_phases"."status" = 'active';--> statement-breakpoint
CREATE INDEX `plan_phases_plan_status_idx` ON `plan_phases` (`account_id`,`plan_id`,`status`);--> statement-breakpoint
CREATE TABLE `plan_priorities` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`assessment_id` text,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`rationale` text,
	`status` text DEFAULT 'active' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_current` integer DEFAULT false NOT NULL,
	`coach_approved_at` integer,
	`resolved_at` integer,
	`archived_at` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`,`plan_id`) REFERENCES `development_plans`(`account_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`,`assessment_id`) REFERENCES `assessments`(`account_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "plan_priorities_status_check" CHECK("plan_priorities"."status" in ('active', 'resolved', 'deferred', 'archived')),
	CONSTRAINT "plan_priorities_sort_order_check" CHECK("plan_priorities"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plan_priorities_account_id_unique` ON `plan_priorities` (`account_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `plan_priorities_one_current_per_plan` ON `plan_priorities` (`account_id`,`plan_id`) WHERE "plan_priorities"."is_current" = 1 and "plan_priorities"."status" = 'active';--> statement-breakpoint
CREATE INDEX `plan_priorities_plan_order_idx` ON `plan_priorities` (`account_id`,`plan_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `practice_items` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`phase_id` text,
	`lesson_id` text,
	`title` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`objective` text NOT NULL,
	`rationale` text NOT NULL,
	`instructions` text DEFAULT '[]' NOT NULL,
	`time_or_cadence` text,
	`success_check` text NOT NULL,
	`common_mistake` text,
	`stop_or_ask_rule` text NOT NULL,
	`constraint_note` text,
	`starts_at` integer,
	`due_at` integer,
	`coach_approved_at` integer,
	`completed_at` integer,
	`retired_at` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`,`plan_id`) REFERENCES `development_plans`(`account_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`,`phase_id`) REFERENCES `plan_phases`(`account_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`,`lesson_id`) REFERENCES `lessons`(`account_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "practice_items_status_check" CHECK("practice_items"."status" in ('draft', 'active', 'completed', 'paused', 'retired')),
	CONSTRAINT "practice_items_instructions_json_check" CHECK(json_valid("practice_items"."instructions"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `practice_items_account_id_unique` ON `practice_items` (`account_id`,`id`);--> statement-breakpoint
CREATE INDEX `practice_items_plan_status_due_idx` ON `practice_items` (`account_id`,`plan_id`,`status`,`due_at`);--> statement-breakpoint
CREATE INDEX `practice_items_phase_status_idx` ON `practice_items` (`account_id`,`phase_id`,`status`);--> statement-breakpoint
CREATE TABLE `share_links` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`token_hash_algorithm` text DEFAULT 'hmac-sha256-v1' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`scope` text DEFAULT 'golfer_plan_read' NOT NULL,
	`plan_revision` integer NOT NULL,
	`intended_recipient_context` text NOT NULL,
	`expires_at` integer,
	`last_accessed_at` integer,
	`access_count` integer DEFAULT 0 NOT NULL,
	`revoked_at` integer,
	`revoke_reason` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`,`plan_id`) REFERENCES `development_plans`(`account_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "share_links_status_check" CHECK("share_links"."status" in ('active', 'revoked', 'expired')),
	CONSTRAINT "share_links_scope_check" CHECK("share_links"."scope" = 'golfer_plan_read'),
	CONSTRAINT "share_links_token_hash_algorithm_check" CHECK("share_links"."token_hash_algorithm" = 'hmac-sha256-v1'),
	CONSTRAINT "share_links_token_hash_check" CHECK(length("share_links"."token_hash") = 64 and "share_links"."token_hash" not glob '*[^0-9a-f]*'),
	CONSTRAINT "share_links_revision_check" CHECK("share_links"."plan_revision" >= 1),
	CONSTRAINT "share_links_access_count_check" CHECK("share_links"."access_count" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `share_links_token_hash_unique` ON `share_links` (`token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `share_links_account_id_unique` ON `share_links` (`account_id`,`id`);--> statement-breakpoint
CREATE INDEX `share_links_plan_status_idx` ON `share_links` (`account_id`,`plan_id`,`status`);--> statement-breakpoint
CREATE INDEX `share_links_status_expires_idx` ON `share_links` (`status`,`expires_at`);--> statement-breakpoint
CREATE TABLE `subscriptions` (
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
	CONSTRAINT "subscriptions_status_check" CHECK("subscriptions"."status" in ('incomplete', 'trialing', 'active', 'past_due', 'paused', 'canceled', 'unpaid', 'ended')),
	CONSTRAINT "subscriptions_billing_interval_check" CHECK("subscriptions"."billing_interval" is null or "subscriptions"."billing_interval" in ('month', 'year')),
	CONSTRAINT "subscriptions_currency_check" CHECK("subscriptions"."currency" is null or length("subscriptions"."currency") = 3),
	CONSTRAINT "subscriptions_amount_check" CHECK("subscriptions"."unit_amount_minor" is null or "subscriptions"."unit_amount_minor" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscriptions_account_id_unique` ON `subscriptions` (`account_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `subscriptions_provider_subscription_unique` ON `subscriptions` (`provider`,`provider_subscription_id`) WHERE "subscriptions"."provider_subscription_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `subscriptions_one_open_per_account` ON `subscriptions` (`account_id`) WHERE "subscriptions"."status" in ('incomplete', 'trialing', 'active', 'past_due', 'paused', 'unpaid');--> statement-breakpoint
CREATE INDEX `subscriptions_account_status_idx` ON `subscriptions` (`account_id`,`status`);--> statement-breakpoint
CREATE INDEX `subscriptions_period_end_idx` ON `subscriptions` (`current_period_ends_at`);
