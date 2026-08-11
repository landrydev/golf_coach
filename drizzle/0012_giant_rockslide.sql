CREATE TABLE `content_media_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`plan_id` text,
	`media_asset_id` text NOT NULL,
	`profile_account_id` text,
	`assessment_id` text,
	`lesson_id` text,
	`practice_item_id` text,
	`evidence_item_id` text,
	`phase_review_id` text,
	`drill_template_id` text,
	`target_type` text NOT NULL,
	`attachment_role` text DEFAULT 'supporting' NOT NULL,
	`label` text,
	`coach_context` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`withdrawn_at` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`,`media_asset_id`) REFERENCES `media_assets`(`account_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`profile_account_id`) REFERENCES `instructor_profiles`(`account_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`,`plan_id`,`assessment_id`) REFERENCES `assessments`(`account_id`,`plan_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`,`plan_id`,`lesson_id`) REFERENCES `lessons`(`account_id`,`plan_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`,`plan_id`,`practice_item_id`) REFERENCES `practice_items`(`account_id`,`plan_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`,`plan_id`,`evidence_item_id`) REFERENCES `evidence_items`(`account_id`,`plan_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`,`plan_id`,`phase_review_id`) REFERENCES `phase_reviews`(`account_id`,`plan_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`,`drill_template_id`) REFERENCES `drill_templates`(`account_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "content_media_attachments_target_type_check" CHECK("content_media_attachments"."target_type" in ('profile', 'assessment', 'lesson', 'practice', 'evidence', 'phase_review', 'drill')),
	CONSTRAINT "content_media_attachments_role_check" CHECK("content_media_attachments"."attachment_role" in ('primary', 'supporting', 'demo', 'baseline', 'current', 'poster', 'logo', 'profile_photo', 'source')),
	CONSTRAINT "content_media_attachments_status_check" CHECK("content_media_attachments"."status" in ('active', 'withdrawn')),
	CONSTRAINT "content_media_attachments_exact_one_target_check" CHECK((("content_media_attachments"."profile_account_id" is not null) + ("content_media_attachments"."assessment_id" is not null) + ("content_media_attachments"."lesson_id" is not null) + ("content_media_attachments"."practice_item_id" is not null) + ("content_media_attachments"."evidence_item_id" is not null) + ("content_media_attachments"."phase_review_id" is not null) + ("content_media_attachments"."drill_template_id" is not null)) = 1),
	CONSTRAINT "content_media_attachments_target_alignment_check" CHECK(("content_media_attachments"."target_type" = 'profile' and "content_media_attachments"."profile_account_id" is not null) or ("content_media_attachments"."target_type" = 'assessment' and "content_media_attachments"."assessment_id" is not null) or ("content_media_attachments"."target_type" = 'lesson' and "content_media_attachments"."lesson_id" is not null) or ("content_media_attachments"."target_type" = 'practice' and "content_media_attachments"."practice_item_id" is not null) or ("content_media_attachments"."target_type" = 'evidence' and "content_media_attachments"."evidence_item_id" is not null) or ("content_media_attachments"."target_type" = 'phase_review' and "content_media_attachments"."phase_review_id" is not null) or ("content_media_attachments"."target_type" = 'drill' and "content_media_attachments"."drill_template_id" is not null)),
	CONSTRAINT "content_media_attachments_plan_alignment_check" CHECK(("content_media_attachments"."plan_id" is null and ("content_media_attachments"."profile_account_id" is not null or "content_media_attachments"."drill_template_id" is not null)) or ("content_media_attachments"."plan_id" is not null and ("content_media_attachments"."assessment_id" is not null or "content_media_attachments"."lesson_id" is not null or "content_media_attachments"."practice_item_id" is not null or "content_media_attachments"."evidence_item_id" is not null or "content_media_attachments"."phase_review_id" is not null))),
	CONSTRAINT "content_media_attachments_profile_tenant_check" CHECK("content_media_attachments"."profile_account_id" is null or "content_media_attachments"."profile_account_id" = "content_media_attachments"."account_id"),
	CONSTRAINT "content_media_attachments_sort_order_check" CHECK("content_media_attachments"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `content_media_attachments_account_id_unique` ON `content_media_attachments` (`account_id`,`id`);--> statement-breakpoint
CREATE INDEX `content_media_attachments_media_status_idx` ON `content_media_attachments` (`account_id`,`media_asset_id`,`status`);--> statement-breakpoint
CREATE INDEX `content_media_attachments_plan_status_idx` ON `content_media_attachments` (`account_id`,`plan_id`,`status`);--> statement-breakpoint
CREATE TABLE `drill_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`source_template_id` text,
	`title` text NOT NULL,
	`purpose` text NOT NULL,
	`when_it_fits` text NOT NULL,
	`equipment` text DEFAULT '[]' NOT NULL,
	`setup` text NOT NULL,
	`steps` text DEFAULT '[]' NOT NULL,
	`dosage_or_cadence` text NOT NULL,
	`feel_or_cue` text,
	`success_check` text NOT NULL,
	`common_miss` text,
	`stop_or_ask_rule` text NOT NULL,
	`constraint_or_adaptation` text,
	`progression` text,
	`regression` text,
	`status` text DEFAULT 'active' NOT NULL,
	`is_favourite` integer DEFAULT false NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`archived_at` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`,`source_template_id`) REFERENCES `drill_templates`(`account_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "drill_templates_status_check" CHECK("drill_templates"."status" in ('active', 'archived')),
	CONSTRAINT "drill_templates_version_check" CHECK("drill_templates"."version" >= 1),
	CONSTRAINT "drill_templates_equipment_json_check" CHECK(json_valid("drill_templates"."equipment")),
	CONSTRAINT "drill_templates_steps_json_check" CHECK(json_valid("drill_templates"."steps")),
	CONSTRAINT "drill_templates_source_not_self_check" CHECK("drill_templates"."source_template_id" is null or "drill_templates"."source_template_id" <> "drill_templates"."id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `drill_templates_account_id_unique` ON `drill_templates` (`account_id`,`id`);--> statement-breakpoint
CREATE INDEX `drill_templates_account_status_title_idx` ON `drill_templates` (`account_id`,`status`,`title`);--> statement-breakpoint
CREATE INDEX `drill_templates_account_favourite_idx` ON `drill_templates` (`account_id`,`is_favourite`,`updated_at`);--> statement-breakpoint
CREATE TABLE `launch_monitor_comparison_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`title` text NOT NULL,
	`baseline_session_id` text NOT NULL,
	`current_session_id` text NOT NULL,
	`coach_interpretation` text NOT NULL,
	`limitations` text NOT NULL,
	`next_evidence_needed` text,
	`status` text DEFAULT 'active' NOT NULL,
	`coach_approved_at` integer,
	`withdrawn_at` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`,`plan_id`) REFERENCES `development_plans`(`account_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`,`plan_id`,`baseline_session_id`) REFERENCES `launch_monitor_sessions`(`account_id`,`plan_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`,`plan_id`,`current_session_id`) REFERENCES `launch_monitor_sessions`(`account_id`,`plan_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "launch_monitor_comparison_groups_status_check" CHECK("launch_monitor_comparison_groups"."status" in ('active', 'withdrawn')),
	CONSTRAINT "launch_monitor_comparison_groups_distinct_sessions_check" CHECK("launch_monitor_comparison_groups"."baseline_session_id" <> "launch_monitor_comparison_groups"."current_session_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `launch_monitor_comparison_groups_account_id_unique` ON `launch_monitor_comparison_groups` (`account_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `launch_monitor_comparison_groups_plan_id_unique` ON `launch_monitor_comparison_groups` (`account_id`,`plan_id`,`id`);--> statement-breakpoint
CREATE INDEX `launch_monitor_comparison_groups_plan_status_idx` ON `launch_monitor_comparison_groups` (`account_id`,`plan_id`,`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `launch_monitor_comparison_metrics` (
	`account_id` text NOT NULL,
	`comparison_group_id` text NOT NULL,
	`baseline_metric_id` text NOT NULL,
	`current_metric_id` text NOT NULL,
	`display_name` text NOT NULL,
	`unit` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	PRIMARY KEY(`account_id`, `comparison_group_id`, `baseline_metric_id`),
	FOREIGN KEY (`account_id`,`comparison_group_id`) REFERENCES `launch_monitor_comparison_groups`(`account_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`,`baseline_metric_id`) REFERENCES `launch_monitor_metrics`(`account_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`,`current_metric_id`) REFERENCES `launch_monitor_metrics`(`account_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "launch_monitor_comparison_metrics_distinct_check" CHECK("launch_monitor_comparison_metrics"."baseline_metric_id" <> "launch_monitor_comparison_metrics"."current_metric_id"),
	CONSTRAINT "launch_monitor_comparison_metrics_unit_check" CHECK(length(trim("launch_monitor_comparison_metrics"."unit")) > 0),
	CONSTRAINT "launch_monitor_comparison_metrics_sort_order_check" CHECK("launch_monitor_comparison_metrics"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `launch_monitor_comparison_metrics_current_unique` ON `launch_monitor_comparison_metrics` (`account_id`,`comparison_group_id`,`current_metric_id`);--> statement-breakpoint
CREATE TABLE `launch_monitor_imports` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`source_media_asset_id` text,
	`status` text DEFAULT 'staged' NOT NULL,
	`column_headers` text DEFAULT '[]' NOT NULL,
	`column_mappings` text DEFAULT '{}' NOT NULL,
	`validation_report` text DEFAULT '{}' NOT NULL,
	`total_row_count` integer DEFAULT 0 NOT NULL,
	`accepted_row_count` integer DEFAULT 0 NOT NULL,
	`rejected_row_count` integer DEFAULT 0 NOT NULL,
	`error_code` text,
	`idempotency_key_hash` text,
	`committed_at` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`,`plan_id`) REFERENCES `development_plans`(`account_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`,`source_media_asset_id`) REFERENCES `media_assets`(`account_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "launch_monitor_imports_status_check" CHECK("launch_monitor_imports"."status" in ('staged', 'mapping_required', 'validated', 'committed', 'failed', 'abandoned')),
	CONSTRAINT "launch_monitor_imports_headers_json_check" CHECK(json_valid("launch_monitor_imports"."column_headers")),
	CONSTRAINT "launch_monitor_imports_mappings_json_check" CHECK(json_valid("launch_monitor_imports"."column_mappings")),
	CONSTRAINT "launch_monitor_imports_report_json_check" CHECK(json_valid("launch_monitor_imports"."validation_report")),
	CONSTRAINT "launch_monitor_imports_counts_check" CHECK("launch_monitor_imports"."total_row_count" >= 0 and "launch_monitor_imports"."accepted_row_count" >= 0 and "launch_monitor_imports"."rejected_row_count" >= 0 and "launch_monitor_imports"."accepted_row_count" + "launch_monitor_imports"."rejected_row_count" <= "launch_monitor_imports"."total_row_count"),
	CONSTRAINT "launch_monitor_imports_idempotency_hash_check" CHECK("launch_monitor_imports"."idempotency_key_hash" is null or (length("launch_monitor_imports"."idempotency_key_hash") = 64 and "launch_monitor_imports"."idempotency_key_hash" not glob '*[^0-9a-f]*'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `launch_monitor_imports_account_id_unique` ON `launch_monitor_imports` (`account_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `launch_monitor_imports_plan_id_unique` ON `launch_monitor_imports` (`account_id`,`plan_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `launch_monitor_imports_idempotency_unique` ON `launch_monitor_imports` (`account_id`,`plan_id`,`idempotency_key_hash`) WHERE "launch_monitor_imports"."idempotency_key_hash" is not null;--> statement-breakpoint
CREATE INDEX `launch_monitor_imports_plan_status_idx` ON `launch_monitor_imports` (`account_id`,`plan_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `launch_monitor_metric_definitions` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`canonical_key` text NOT NULL,
	`display_name` text NOT NULL,
	`description` text,
	`direction` text DEFAULT 'unknown' NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "launch_monitor_metric_definitions_key_check" CHECK(length(trim("launch_monitor_metric_definitions"."canonical_key")) > 0 and "launch_monitor_metric_definitions"."canonical_key" = lower("launch_monitor_metric_definitions"."canonical_key") and "launch_monitor_metric_definitions"."canonical_key" not glob '*[^a-z0-9_]*'),
	CONSTRAINT "launch_monitor_metric_definitions_direction_check" CHECK("launch_monitor_metric_definitions"."direction" in ('higher', 'lower', 'target', 'context_only', 'unknown'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `launch_monitor_metric_definitions_account_id_unique` ON `launch_monitor_metric_definitions` (`account_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `launch_monitor_metric_definitions_key_unique` ON `launch_monitor_metric_definitions` (`account_id`,`canonical_key`);--> statement-breakpoint
CREATE TABLE `launch_monitor_metrics` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`session_id` text NOT NULL,
	`shot_id` text,
	`metric_definition_id` text,
	`original_name` text NOT NULL,
	`display_name` text NOT NULL,
	`numeric_value` real NOT NULL,
	`unit` text NOT NULL,
	`source_column` text,
	`is_summary` integer DEFAULT false NOT NULL,
	`is_golfer_facing` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`,`session_id`) REFERENCES `launch_monitor_sessions`(`account_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`,`session_id`,`shot_id`) REFERENCES `launch_monitor_shots`(`account_id`,`session_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`,`metric_definition_id`) REFERENCES `launch_monitor_metric_definitions`(`account_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "launch_monitor_metrics_summary_shot_check" CHECK(("launch_monitor_metrics"."is_summary" = 1 and "launch_monitor_metrics"."shot_id" is null) or ("launch_monitor_metrics"."is_summary" = 0 and "launch_monitor_metrics"."shot_id" is not null)),
	CONSTRAINT "launch_monitor_metrics_text_check" CHECK(length(trim("launch_monitor_metrics"."original_name")) > 0 and length(trim("launch_monitor_metrics"."display_name")) > 0 and length(trim("launch_monitor_metrics"."unit")) > 0),
	CONSTRAINT "launch_monitor_metrics_sort_order_check" CHECK("launch_monitor_metrics"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `launch_monitor_metrics_account_id_unique` ON `launch_monitor_metrics` (`account_id`,`id`);--> statement-breakpoint
CREATE INDEX `launch_monitor_metrics_session_summary_idx` ON `launch_monitor_metrics` (`account_id`,`session_id`,`is_summary`,`sort_order`);--> statement-breakpoint
CREATE INDEX `launch_monitor_metrics_definition_unit_idx` ON `launch_monitor_metrics` (`account_id`,`metric_definition_id`,`unit`);--> statement-breakpoint
CREATE TABLE `launch_monitor_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`phase_id` text,
	`lesson_id` text,
	`import_id` text,
	`source_media_asset_id` text,
	`source_mode` text NOT NULL,
	`session_date` integer NOT NULL,
	`device_source` text NOT NULL,
	`club` text,
	`environment` text,
	`conditions` text,
	`notes` text,
	`coach_interpretation` text NOT NULL,
	`limitations` text NOT NULL,
	`representativeness` text DEFAULT 'unknown' NOT NULL,
	`next_evidence_needed` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`coach_approved_at` integer,
	`withdrawn_at` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`,`plan_id`) REFERENCES `development_plans`(`account_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`,`phase_id`) REFERENCES `plan_phases`(`account_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`,`plan_id`,`lesson_id`) REFERENCES `lessons`(`account_id`,`plan_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`,`plan_id`,`import_id`) REFERENCES `launch_monitor_imports`(`account_id`,`plan_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`,`source_media_asset_id`) REFERENCES `media_assets`(`account_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "launch_monitor_sessions_source_mode_check" CHECK("launch_monitor_sessions"."source_mode" in ('manual', 'csv_import')),
	CONSTRAINT "launch_monitor_sessions_import_mode_check" CHECK(("launch_monitor_sessions"."source_mode" = 'manual' and "launch_monitor_sessions"."import_id" is null) or ("launch_monitor_sessions"."source_mode" = 'csv_import' and "launch_monitor_sessions"."import_id" is not null)),
	CONSTRAINT "launch_monitor_sessions_representativeness_check" CHECK("launch_monitor_sessions"."representativeness" in ('representative', 'limited', 'unknown')),
	CONSTRAINT "launch_monitor_sessions_status_check" CHECK("launch_monitor_sessions"."status" in ('draft', 'committed', 'withdrawn'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `launch_monitor_sessions_account_id_unique` ON `launch_monitor_sessions` (`account_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `launch_monitor_sessions_plan_id_unique` ON `launch_monitor_sessions` (`account_id`,`plan_id`,`id`);--> statement-breakpoint
CREATE INDEX `launch_monitor_sessions_plan_date_idx` ON `launch_monitor_sessions` (`account_id`,`plan_id`,`session_date`);--> statement-breakpoint
CREATE TABLE `launch_monitor_shots` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`session_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`source_row_number` integer,
	`label` text,
	`captured_at` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`,`session_id`) REFERENCES `launch_monitor_sessions`(`account_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "launch_monitor_shots_sequence_check" CHECK("launch_monitor_shots"."sequence" >= 1),
	CONSTRAINT "launch_monitor_shots_source_row_check" CHECK("launch_monitor_shots"."source_row_number" is null or "launch_monitor_shots"."source_row_number" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `launch_monitor_shots_account_id_unique` ON `launch_monitor_shots` (`account_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `launch_monitor_shots_session_id_unique` ON `launch_monitor_shots` (`account_id`,`session_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `launch_monitor_shots_sequence_unique` ON `launch_monitor_shots` (`account_id`,`session_id`,`sequence`);--> statement-breakpoint
CREATE TABLE `media_asset_details` (
	`account_id` text NOT NULL,
	`media_asset_id` text NOT NULL,
	`poster_media_asset_id` text,
	`captured_at` integer,
	`orientation` text DEFAULT 'unknown' NOT NULL,
	`view_label` text,
	`coach_context` text,
	`processing_attempts` integer DEFAULT 0 NOT NULL,
	`last_processing_attempt_at` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	PRIMARY KEY(`account_id`, `media_asset_id`),
	FOREIGN KEY (`account_id`,`media_asset_id`) REFERENCES `media_assets`(`account_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`,`poster_media_asset_id`) REFERENCES `media_assets`(`account_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "media_asset_details_orientation_check" CHECK("media_asset_details"."orientation" in ('landscape', 'portrait', 'square', 'unknown')),
	CONSTRAINT "media_asset_details_attempts_check" CHECK("media_asset_details"."processing_attempts" >= 0),
	CONSTRAINT "media_asset_details_poster_not_self_check" CHECK("media_asset_details"."poster_media_asset_id" is null or "media_asset_details"."poster_media_asset_id" <> "media_asset_details"."media_asset_id")
);
--> statement-breakpoint
CREATE INDEX `media_asset_details_poster_idx` ON `media_asset_details` (`account_id`,`poster_media_asset_id`);--> statement-breakpoint
CREATE TRIGGER `media_assets_immutable_metadata_update`
BEFORE UPDATE ON `media_assets`
WHEN
	NEW.`account_id` IS NOT OLD.`account_id`
	OR NEW.`storage_provider` IS NOT OLD.`storage_provider`
	OR NEW.`object_key` IS NOT OLD.`object_key`
	OR NEW.`media_kind` IS NOT OLD.`media_kind`
	OR NEW.`mime_type` IS NOT OLD.`mime_type`
	OR NEW.`original_filename` IS NOT OLD.`original_filename`
	OR NEW.`byte_size` IS NOT OLD.`byte_size`
	OR (OLD.`content_sha256` IS NOT NULL AND NEW.`content_sha256` IS NOT OLD.`content_sha256`)
	OR (OLD.`width_pixels` IS NOT NULL AND NEW.`width_pixels` IS NOT OLD.`width_pixels`)
	OR (OLD.`height_pixels` IS NOT NULL AND NEW.`height_pixels` IS NOT OLD.`height_pixels`)
	OR (OLD.`duration_ms` IS NOT NULL AND NEW.`duration_ms` IS NOT OLD.`duration_ms`)
	OR NEW.`alt_text` IS NOT OLD.`alt_text`
	OR NEW.`caption` IS NOT OLD.`caption`
	OR NEW.`transcript` IS NOT OLD.`transcript`
BEGIN
	SELECT RAISE(ABORT, 'media asset metadata is immutable; create a replacement');
END;--> statement-breakpoint
CREATE TRIGGER `media_asset_details_immutable_context_update`
BEFORE UPDATE ON `media_asset_details`
WHEN
	NEW.`account_id` IS NOT OLD.`account_id`
	OR NEW.`media_asset_id` IS NOT OLD.`media_asset_id`
	OR NEW.`captured_at` IS NOT OLD.`captured_at`
	OR NEW.`orientation` IS NOT OLD.`orientation`
	OR NEW.`view_label` IS NOT OLD.`view_label`
	OR NEW.`coach_context` IS NOT OLD.`coach_context`
BEGIN
	SELECT RAISE(ABORT, 'media context metadata is immutable; create a replacement');
END;--> statement-breakpoint
CREATE TABLE `media_asset_replacements` (
	`account_id` text NOT NULL,
	`replaced_media_asset_id` text NOT NULL,
	`replacement_media_asset_id` text NOT NULL,
	`reason_code` text DEFAULT 'coach_replaced' NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	PRIMARY KEY(`account_id`, `replaced_media_asset_id`),
	FOREIGN KEY (`account_id`,`replaced_media_asset_id`) REFERENCES `media_assets`(`account_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`,`replacement_media_asset_id`) REFERENCES `media_assets`(`account_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "media_asset_replacements_distinct_check" CHECK("media_asset_replacements"."replaced_media_asset_id" <> "media_asset_replacements"."replacement_media_asset_id"),
	CONSTRAINT "media_asset_replacements_reason_check" CHECK("media_asset_replacements"."reason_code" in ('coach_replaced', 'processing_retry', 'metadata_correction'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_asset_replacements_target_unique` ON `media_asset_replacements` (`account_id`,`replacement_media_asset_id`);--> statement-breakpoint
CREATE TABLE `milestones` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`phase_id` text,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`coach_approved_at` integer,
	`withdrawn_at` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`,`plan_id`) REFERENCES `development_plans`(`account_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`,`phase_id`) REFERENCES `plan_phases`(`account_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "milestones_status_check" CHECK("milestones"."status" in ('draft', 'published', 'withdrawn'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `milestones_account_id_unique` ON `milestones` (`account_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `milestones_plan_id_unique` ON `milestones` (`account_id`,`plan_id`,`id`);--> statement-breakpoint
CREATE INDEX `milestones_plan_status_occurred_idx` ON `milestones` (`account_id`,`plan_id`,`status`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `phase_review_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`phase_review_id` text NOT NULL,
	`lesson_id` text,
	`practice_item_id` text,
	`practice_check_in_id` text,
	`media_asset_id` text,
	`launch_monitor_session_id` text,
	`launch_monitor_comparison_group_id` text,
	`evidence_item_id` text,
	`source_type` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`,`plan_id`,`phase_review_id`) REFERENCES `phase_reviews`(`account_id`,`plan_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`,`plan_id`,`lesson_id`) REFERENCES `lessons`(`account_id`,`plan_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`,`plan_id`,`practice_item_id`) REFERENCES `practice_items`(`account_id`,`plan_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`,`plan_id`,`practice_check_in_id`) REFERENCES `practice_check_ins`(`account_id`,`plan_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`,`media_asset_id`) REFERENCES `media_assets`(`account_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`,`plan_id`,`launch_monitor_session_id`) REFERENCES `launch_monitor_sessions`(`account_id`,`plan_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`,`plan_id`,`launch_monitor_comparison_group_id`) REFERENCES `launch_monitor_comparison_groups`(`account_id`,`plan_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`,`plan_id`,`evidence_item_id`) REFERENCES `evidence_items`(`account_id`,`plan_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "phase_review_sources_source_type_check" CHECK("phase_review_sources"."source_type" in ('lesson', 'practice', 'practice_check_in', 'media', 'launch_session', 'launch_comparison', 'evidence')),
	CONSTRAINT "phase_review_sources_exact_one_source_check" CHECK((("phase_review_sources"."lesson_id" is not null) + ("phase_review_sources"."practice_item_id" is not null) + ("phase_review_sources"."practice_check_in_id" is not null) + ("phase_review_sources"."media_asset_id" is not null) + ("phase_review_sources"."launch_monitor_session_id" is not null) + ("phase_review_sources"."launch_monitor_comparison_group_id" is not null) + ("phase_review_sources"."evidence_item_id" is not null)) = 1),
	CONSTRAINT "phase_review_sources_alignment_check" CHECK(("phase_review_sources"."source_type" = 'lesson' and "phase_review_sources"."lesson_id" is not null) or ("phase_review_sources"."source_type" = 'practice' and "phase_review_sources"."practice_item_id" is not null) or ("phase_review_sources"."source_type" = 'practice_check_in' and "phase_review_sources"."practice_check_in_id" is not null) or ("phase_review_sources"."source_type" = 'media' and "phase_review_sources"."media_asset_id" is not null) or ("phase_review_sources"."source_type" = 'launch_session' and "phase_review_sources"."launch_monitor_session_id" is not null) or ("phase_review_sources"."source_type" = 'launch_comparison' and "phase_review_sources"."launch_monitor_comparison_group_id" is not null) or ("phase_review_sources"."source_type" = 'evidence' and "phase_review_sources"."evidence_item_id" is not null)),
	CONSTRAINT "phase_review_sources_sort_order_check" CHECK("phase_review_sources"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `phase_review_sources_account_id_unique` ON `phase_review_sources` (`account_id`,`id`);--> statement-breakpoint
CREATE INDEX `phase_review_sources_review_order_idx` ON `phase_review_sources` (`account_id`,`phase_review_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `practice_assignment_snapshots` (
	`account_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`practice_item_id` text NOT NULL,
	`drill_template_id` text,
	`drill_template_version` integer,
	`was_customized` integer DEFAULT false NOT NULL,
	`title` text NOT NULL,
	`purpose` text NOT NULL,
	`when_it_fits` text NOT NULL,
	`equipment` text DEFAULT '[]' NOT NULL,
	`setup` text NOT NULL,
	`steps` text DEFAULT '[]' NOT NULL,
	`dosage_or_cadence` text NOT NULL,
	`feel_or_cue` text,
	`success_check` text NOT NULL,
	`common_miss` text,
	`stop_or_ask_rule` text NOT NULL,
	`constraint_or_adaptation` text,
	`progression` text,
	`regression` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	PRIMARY KEY(`account_id`, `practice_item_id`),
	FOREIGN KEY (`account_id`,`plan_id`,`practice_item_id`) REFERENCES `practice_items`(`account_id`,`plan_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`,`drill_template_id`) REFERENCES `drill_templates`(`account_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "practice_assignment_snapshots_template_version_check" CHECK(("practice_assignment_snapshots"."drill_template_id" is null and "practice_assignment_snapshots"."drill_template_version" is null) or ("practice_assignment_snapshots"."drill_template_id" is not null and "practice_assignment_snapshots"."drill_template_version" >= 1)),
	CONSTRAINT "practice_assignment_snapshots_equipment_json_check" CHECK(json_valid("practice_assignment_snapshots"."equipment")),
	CONSTRAINT "practice_assignment_snapshots_steps_json_check" CHECK(json_valid("practice_assignment_snapshots"."steps"))
);
--> statement-breakpoint
CREATE INDEX `practice_assignment_snapshots_template_idx` ON `practice_assignment_snapshots` (`account_id`,`drill_template_id`);--> statement-breakpoint
CREATE TABLE `practice_check_ins` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`practice_item_id` text NOT NULL,
	`share_link_id` text NOT NULL,
	`share_session_id` text NOT NULL,
	`idempotency_key_hash` text NOT NULL,
	`input_fingerprint` text NOT NULL,
	`completion_status` text NOT NULL,
	`perceived_difficulty` text,
	`confidence_rating` integer,
	`note` text,
	`request_help` integer DEFAULT false NOT NULL,
	`occurred_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`,`plan_id`,`practice_item_id`) REFERENCES `practice_items`(`account_id`,`plan_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`,`share_link_id`) REFERENCES `share_links`(`account_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`,`share_link_id`,`share_session_id`) REFERENCES `share_sessions`(`account_id`,`share_link_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "practice_check_ins_completion_check" CHECK("practice_check_ins"."completion_status" in ('completed', 'not_completed')),
	CONSTRAINT "practice_check_ins_difficulty_check" CHECK("practice_check_ins"."perceived_difficulty" is null or "practice_check_ins"."perceived_difficulty" in ('very_easy', 'easy', 'appropriate', 'hard', 'very_hard')),
	CONSTRAINT "practice_check_ins_confidence_check" CHECK("practice_check_ins"."confidence_rating" is null or "practice_check_ins"."confidence_rating" between 1 and 5),
	CONSTRAINT "practice_check_ins_idempotency_hash_check" CHECK(length("practice_check_ins"."idempotency_key_hash") = 64 and "practice_check_ins"."idempotency_key_hash" not glob '*[^0-9a-f]*'),
	CONSTRAINT "practice_check_ins_input_fingerprint_check" CHECK(length("practice_check_ins"."input_fingerprint") = 64 and "practice_check_ins"."input_fingerprint" not glob '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `practice_check_ins_account_id_unique` ON `practice_check_ins` (`account_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `practice_check_ins_plan_id_unique` ON `practice_check_ins` (`account_id`,`plan_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `practice_check_ins_idempotency_unique` ON `practice_check_ins` (`account_id`,`share_session_id`,`idempotency_key_hash`);--> statement-breakpoint
CREATE INDEX `practice_check_ins_practice_occurred_idx` ON `practice_check_ins` (`account_id`,`practice_item_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `roadmap_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`source_template_id` text,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`content` text NOT NULL,
	`origin` text DEFAULT 'coach' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`is_favourite` integer DEFAULT false NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`archived_at` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`,`source_template_id`) REFERENCES `roadmap_templates`(`account_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "roadmap_templates_content_json_check" CHECK(json_valid("roadmap_templates"."content")),
	CONSTRAINT "roadmap_templates_origin_check" CHECK("roadmap_templates"."origin" in ('coach', 'editable_example')),
	CONSTRAINT "roadmap_templates_status_check" CHECK("roadmap_templates"."status" in ('active', 'archived')),
	CONSTRAINT "roadmap_templates_version_check" CHECK("roadmap_templates"."version" >= 1),
	CONSTRAINT "roadmap_templates_source_not_self_check" CHECK("roadmap_templates"."source_template_id" is null or "roadmap_templates"."source_template_id" <> "roadmap_templates"."id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `roadmap_templates_account_id_unique` ON `roadmap_templates` (`account_id`,`id`);--> statement-breakpoint
CREATE INDEX `roadmap_templates_account_status_title_idx` ON `roadmap_templates` (`account_id`,`status`,`title`);--> statement-breakpoint
-- D1 applies migration statements as one transaction. `foreign_keys=OFF` is
-- ignored once that transaction has begun, so defer all FK checks while the
-- lessons table is rebuilt and restored under its original name.
PRAGMA defer_foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_lessons` (
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
	CONSTRAINT "lessons_status_check" CHECK("__new_lessons"."status" in ('planned', 'scheduled', 'completed', 'canceled', 'archived')),
	CONSTRAINT "lessons_sequence_check" CHECK("__new_lessons"."sequence" >= 1)
);
--> statement-breakpoint
INSERT INTO `__new_lessons`("id", "account_id", "plan_id", "phase_id", "sequence", "title", "status", "purpose", "coach_observation", "golfer_learning", "takeaway", "next_check", "phase_connection", "scheduled_at", "occurred_at", "coach_approved_at", "completed_at", "canceled_at", "archived_at", "created_at", "updated_at") SELECT "id", "account_id", "plan_id", "phase_id", "sequence", "title", "status", "purpose", "coach_observation", "golfer_learning", "takeaway", "next_check", "phase_connection", "scheduled_at", "occurred_at", "coach_approved_at", "completed_at", "canceled_at", "archived_at", "created_at", "updated_at" FROM `lessons`;--> statement-breakpoint
DROP TABLE `lessons`;--> statement-breakpoint
ALTER TABLE `__new_lessons` RENAME TO `lessons`;--> statement-breakpoint
PRAGMA defer_foreign_keys=OFF;--> statement-breakpoint
CREATE UNIQUE INDEX `lessons_account_id_unique` ON `lessons` (`account_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `lessons_plan_id_unique` ON `lessons` (`account_id`,`plan_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `lessons_plan_sequence_unique` ON `lessons` (`account_id`,`plan_id`,`sequence`);--> statement-breakpoint
CREATE INDEX `lessons_plan_status_idx` ON `lessons` (`account_id`,`plan_id`,`status`);--> statement-breakpoint
CREATE INDEX `lessons_phase_sequence_idx` ON `lessons` (`account_id`,`phase_id`,`sequence`);--> statement-breakpoint
ALTER TABLE `practice_items` ADD `paused_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `practice_items_plan_id_unique` ON `practice_items` (`account_id`,`plan_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `assessments_plan_id_unique` ON `assessments` (`account_id`,`plan_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `evidence_items_plan_id_unique` ON `evidence_items` (`account_id`,`plan_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `phase_reviews_plan_id_unique` ON `phase_reviews` (`account_id`,`plan_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `share_sessions_share_id_unique` ON `share_sessions` (`account_id`,`share_link_id`,`id`);--> statement-breakpoint
INSERT INTO `media_asset_details` (`account_id`, `media_asset_id`)
SELECT `account_id`, `id`
FROM `media_assets`;--> statement-breakpoint
INSERT INTO `practice_assignment_snapshots` (
	`account_id`, `plan_id`, `practice_item_id`, `drill_template_id`,
	`drill_template_version`, `was_customized`, `title`, `purpose`,
	`when_it_fits`, `equipment`, `setup`, `steps`, `dosage_or_cadence`,
	`feel_or_cue`, `success_check`, `common_miss`, `stop_or_ask_rule`,
	`constraint_or_adaptation`, `progression`, `regression`, `created_at`
)
SELECT
	`account_id`, `plan_id`, `id`, null, null, 1, `title`, `objective`,
	`rationale`, '[]', 'Use the saved assignment steps.', `instructions`,
	coalesce(`time_or_cadence`, 'Cadence not specified.'), null,
	`success_check`, `common_mistake`, `stop_or_ask_rule`, `constraint_note`,
	null, null, `created_at`
FROM `practice_items`;--> statement-breakpoint
INSERT INTO `content_media_attachments` (
	`id`, `account_id`, `plan_id`, `media_asset_id`, `profile_account_id`,
	`target_type`, `attachment_role`, `sort_order`, `status`, `created_at`, `updated_at`
)
SELECT
	'legacy-profile-logo:' || `account_id`, `account_id`, null,
	`logo_media_asset_id`, `account_id`, 'profile', 'logo', 0, 'active',
	`created_at`, `updated_at`
FROM `instructor_profiles`
WHERE `logo_media_asset_id` is not null;--> statement-breakpoint
INSERT INTO `content_media_attachments` (
	`id`, `account_id`, `plan_id`, `media_asset_id`, `profile_account_id`,
	`target_type`, `attachment_role`, `sort_order`, `status`, `created_at`, `updated_at`
)
SELECT
	'legacy-profile-photo:' || `account_id`, `account_id`, null,
	`profile_photo_media_asset_id`, `account_id`, 'profile', 'profile_photo',
	0, 'active', `created_at`, `updated_at`
FROM `instructor_profiles`
WHERE `profile_photo_media_asset_id` is not null;--> statement-breakpoint
INSERT INTO `content_media_attachments` (
	`id`, `account_id`, `plan_id`, `media_asset_id`, `evidence_item_id`,
	`target_type`, `attachment_role`, `sort_order`, `status`, `created_at`, `updated_at`
)
SELECT
	'legacy-evidence-media:' || `id`, `account_id`, `plan_id`,
	`media_asset_id`, `id`, 'evidence',
	case `comparison_role` when 'baseline' then 'baseline' when 'current' then 'current' else 'primary' end,
	0, case when `status` in ('withdrawn', 'archived') then 'withdrawn' else 'active' end,
	`created_at`, `updated_at`
FROM `evidence_items`
WHERE `media_asset_id` is not null;--> statement-breakpoint
INSERT INTO `phase_review_sources` (
	`id`, `account_id`, `plan_id`, `phase_review_id`, `evidence_item_id`,
	`source_type`, `sort_order`, `created_at`
)
SELECT
	'legacy-review-evidence:' || links.`phase_review_id` || ':' || links.`evidence_item_id`,
	links.`account_id`, reviews.`plan_id`, links.`phase_review_id`,
	links.`evidence_item_id`, 'evidence', links.`sort_order`, links.`created_at`
FROM `phase_review_evidence` links
JOIN `phase_reviews` reviews
	ON reviews.`account_id` = links.`account_id`
	AND reviews.`id` = links.`phase_review_id`;--> statement-breakpoint
CREATE TRIGGER `launch_monitor_sessions_phase_plan_insert`
BEFORE INSERT ON `launch_monitor_sessions`
WHEN NEW.`phase_id` IS NOT NULL AND NOT EXISTS (
	SELECT 1 FROM `plan_phases`
	WHERE `account_id` = NEW.`account_id`
		AND `plan_id` = NEW.`plan_id`
		AND `id` = NEW.`phase_id`
)
BEGIN
	SELECT RAISE(ABORT, 'launch-monitor phase does not belong to plan');
END;--> statement-breakpoint
CREATE TRIGGER `launch_monitor_sessions_phase_plan_update`
BEFORE UPDATE OF `account_id`, `plan_id`, `phase_id` ON `launch_monitor_sessions`
WHEN NEW.`phase_id` IS NOT NULL AND NOT EXISTS (
	SELECT 1 FROM `plan_phases`
	WHERE `account_id` = NEW.`account_id`
		AND `plan_id` = NEW.`plan_id`
		AND `id` = NEW.`phase_id`
)
BEGIN
	SELECT RAISE(ABORT, 'launch-monitor phase does not belong to plan');
END;--> statement-breakpoint
CREATE TRIGGER `milestones_phase_plan_insert`
BEFORE INSERT ON `milestones`
WHEN NEW.`phase_id` IS NOT NULL AND NOT EXISTS (
	SELECT 1 FROM `plan_phases`
	WHERE `account_id` = NEW.`account_id`
		AND `plan_id` = NEW.`plan_id`
		AND `id` = NEW.`phase_id`
)
BEGIN
	SELECT RAISE(ABORT, 'milestone phase does not belong to plan');
END;--> statement-breakpoint
CREATE TRIGGER `milestones_phase_plan_update`
BEFORE UPDATE OF `account_id`, `plan_id`, `phase_id` ON `milestones`
WHEN NEW.`phase_id` IS NOT NULL AND NOT EXISTS (
	SELECT 1 FROM `plan_phases`
	WHERE `account_id` = NEW.`account_id`
		AND `plan_id` = NEW.`plan_id`
		AND `id` = NEW.`phase_id`
)
BEGIN
	SELECT RAISE(ABORT, 'milestone phase does not belong to plan');
END;--> statement-breakpoint
CREATE TRIGGER `phase_review_sources_media_plan_insert`
BEFORE INSERT ON `phase_review_sources`
WHEN NEW.`source_type` = 'media' AND NOT EXISTS (
	SELECT 1 FROM `content_media_attachments`
	WHERE `account_id` = NEW.`account_id`
		AND `plan_id` = NEW.`plan_id`
		AND `media_asset_id` = NEW.`media_asset_id`
		AND `status` = 'active'
)
BEGIN
	SELECT RAISE(ABORT, 'review media is not attached to plan');
END;--> statement-breakpoint
CREATE TRIGGER `phase_review_sources_media_plan_update`
BEFORE UPDATE OF `account_id`, `plan_id`, `source_type`, `media_asset_id` ON `phase_review_sources`
WHEN NEW.`source_type` = 'media' AND NOT EXISTS (
	SELECT 1 FROM `content_media_attachments`
	WHERE `account_id` = NEW.`account_id`
		AND `plan_id` = NEW.`plan_id`
		AND `media_asset_id` = NEW.`media_asset_id`
		AND `status` = 'active'
)
BEGIN
	SELECT RAISE(ABORT, 'review media is not attached to plan');
END;
