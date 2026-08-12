-- D1 applies migration statements as one transaction. `foreign_keys=OFF` is
-- ignored once that transaction has begun, so defer FK checks while the
-- imports table is rebuilt beneath existing committed launch sessions.
PRAGMA defer_foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_launch_monitor_imports` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`source_media_asset_id` text,
	`status` text DEFAULT 'staged' NOT NULL,
	`column_headers` text DEFAULT '[]' NOT NULL,
	`column_mappings` text DEFAULT '{}' NOT NULL,
	`validation_report` text DEFAULT '{}' NOT NULL,
	`review_rows` text DEFAULT '[]' NOT NULL,
	`accepted_rows` text DEFAULT '[]' NOT NULL,
	`accepted_source_row_numbers` text DEFAULT '[]' NOT NULL,
	`rejected_rows` text DEFAULT '[]' NOT NULL,
	`total_row_count` integer DEFAULT 0 NOT NULL,
	`accepted_row_count` integer DEFAULT 0 NOT NULL,
	`rejected_row_count` integer DEFAULT 0 NOT NULL,
	`error_code` text,
	`idempotency_key_hash` text,
	`request_fingerprint` text,
	`committed_at` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`,`plan_id`) REFERENCES `development_plans`(`account_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`,`source_media_asset_id`) REFERENCES `media_assets`(`account_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "launch_monitor_imports_status_check" CHECK("__new_launch_monitor_imports"."status" in ('staged', 'mapping_required', 'validated', 'committed', 'failed', 'abandoned')),
	CONSTRAINT "launch_monitor_imports_headers_json_check" CHECK(json_valid("__new_launch_monitor_imports"."column_headers")),
	CONSTRAINT "launch_monitor_imports_mappings_json_check" CHECK(json_valid("__new_launch_monitor_imports"."column_mappings")),
	CONSTRAINT "launch_monitor_imports_report_json_check" CHECK(json_valid("__new_launch_monitor_imports"."validation_report")),
	CONSTRAINT "launch_monitor_imports_review_rows_json_check" CHECK(json_valid("__new_launch_monitor_imports"."review_rows")),
	CONSTRAINT "launch_monitor_imports_accepted_rows_json_check" CHECK(json_valid("__new_launch_monitor_imports"."accepted_rows")),
	CONSTRAINT "launch_monitor_imports_source_rows_json_check" CHECK(json_valid("__new_launch_monitor_imports"."accepted_source_row_numbers")),
	CONSTRAINT "launch_monitor_imports_rejected_rows_json_check" CHECK(json_valid("__new_launch_monitor_imports"."rejected_rows")),
	CONSTRAINT "launch_monitor_imports_counts_check" CHECK("__new_launch_monitor_imports"."total_row_count" >= 0 and "__new_launch_monitor_imports"."accepted_row_count" >= 0 and "__new_launch_monitor_imports"."rejected_row_count" >= 0 and "__new_launch_monitor_imports"."accepted_row_count" + "__new_launch_monitor_imports"."rejected_row_count" <= "__new_launch_monitor_imports"."total_row_count"),
	CONSTRAINT "launch_monitor_imports_idempotency_hash_check" CHECK("__new_launch_monitor_imports"."idempotency_key_hash" is null or (length("__new_launch_monitor_imports"."idempotency_key_hash") = 64 and "__new_launch_monitor_imports"."idempotency_key_hash" not glob '*[^0-9a-f]*')),
	CONSTRAINT "launch_monitor_imports_request_fingerprint_check" CHECK("__new_launch_monitor_imports"."request_fingerprint" is null or (length("__new_launch_monitor_imports"."request_fingerprint") = 64 and "__new_launch_monitor_imports"."request_fingerprint" not glob '*[^0-9a-f]*'))
);
--> statement-breakpoint
INSERT INTO `__new_launch_monitor_imports`("id", "account_id", "plan_id", "source_media_asset_id", "status", "column_headers", "column_mappings", "validation_report", "review_rows", "accepted_rows", "accepted_source_row_numbers", "rejected_rows", "total_row_count", "accepted_row_count", "rejected_row_count", "error_code", "idempotency_key_hash", "request_fingerprint", "committed_at", "created_at", "updated_at") SELECT "id", "account_id", "plan_id", "source_media_asset_id", "status", "column_headers", "column_mappings", "validation_report", '[]', '[]', '[]', '[]', "total_row_count", "accepted_row_count", "rejected_row_count", "error_code", "idempotency_key_hash", NULL, "committed_at", "created_at", "updated_at" FROM `launch_monitor_imports`;--> statement-breakpoint
DROP TABLE `launch_monitor_imports`;--> statement-breakpoint
ALTER TABLE `__new_launch_monitor_imports` RENAME TO `launch_monitor_imports`;--> statement-breakpoint
CREATE UNIQUE INDEX `launch_monitor_imports_account_id_unique` ON `launch_monitor_imports` (`account_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `launch_monitor_imports_plan_id_unique` ON `launch_monitor_imports` (`account_id`,`plan_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `launch_monitor_imports_idempotency_unique` ON `launch_monitor_imports` (`account_id`,`plan_id`,`idempotency_key_hash`) WHERE "launch_monitor_imports"."idempotency_key_hash" is not null;--> statement-breakpoint
CREATE INDEX `launch_monitor_imports_plan_status_idx` ON `launch_monitor_imports` (`account_id`,`plan_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `__new_phase_review_sources` (
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
	`source_plan_revision` integer,
	`source_snapshot` text,
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
	CONSTRAINT "phase_review_sources_source_type_check" CHECK("__new_phase_review_sources"."source_type" in ('lesson', 'practice', 'practice_check_in', 'media', 'launch_session', 'launch_comparison', 'evidence')),
	CONSTRAINT "phase_review_sources_exact_one_source_check" CHECK((("__new_phase_review_sources"."lesson_id" is not null) + ("__new_phase_review_sources"."practice_item_id" is not null) + ("__new_phase_review_sources"."practice_check_in_id" is not null) + ("__new_phase_review_sources"."media_asset_id" is not null) + ("__new_phase_review_sources"."launch_monitor_session_id" is not null) + ("__new_phase_review_sources"."launch_monitor_comparison_group_id" is not null) + ("__new_phase_review_sources"."evidence_item_id" is not null)) = 1),
	CONSTRAINT "phase_review_sources_snapshot_pair_check" CHECK(("__new_phase_review_sources"."source_plan_revision" is null and "__new_phase_review_sources"."source_snapshot" is null) or ("__new_phase_review_sources"."source_plan_revision" >= 1 and "__new_phase_review_sources"."source_snapshot" is not null and json_valid("__new_phase_review_sources"."source_snapshot"))),
	CONSTRAINT "phase_review_sources_alignment_check" CHECK(("__new_phase_review_sources"."source_type" = 'lesson' and "__new_phase_review_sources"."lesson_id" is not null) or ("__new_phase_review_sources"."source_type" = 'practice' and "__new_phase_review_sources"."practice_item_id" is not null) or ("__new_phase_review_sources"."source_type" = 'practice_check_in' and "__new_phase_review_sources"."practice_check_in_id" is not null) or ("__new_phase_review_sources"."source_type" = 'media' and "__new_phase_review_sources"."media_asset_id" is not null) or ("__new_phase_review_sources"."source_type" = 'launch_session' and "__new_phase_review_sources"."launch_monitor_session_id" is not null) or ("__new_phase_review_sources"."source_type" = 'launch_comparison' and "__new_phase_review_sources"."launch_monitor_comparison_group_id" is not null) or ("__new_phase_review_sources"."source_type" = 'evidence' and "__new_phase_review_sources"."evidence_item_id" is not null)),
	CONSTRAINT "phase_review_sources_sort_order_check" CHECK("__new_phase_review_sources"."sort_order" >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_phase_review_sources`("id", "account_id", "plan_id", "phase_review_id", "lesson_id", "practice_item_id", "practice_check_in_id", "media_asset_id", "launch_monitor_session_id", "launch_monitor_comparison_group_id", "evidence_item_id", "source_type", "source_plan_revision", "source_snapshot", "sort_order", "created_at") SELECT "id", "account_id", "plan_id", "phase_review_id", "lesson_id", "practice_item_id", "practice_check_in_id", "media_asset_id", "launch_monitor_session_id", "launch_monitor_comparison_group_id", "evidence_item_id", "source_type", NULL, NULL, "sort_order", "created_at" FROM `phase_review_sources`;--> statement-breakpoint
DROP TABLE `phase_review_sources`;--> statement-breakpoint
ALTER TABLE `__new_phase_review_sources` RENAME TO `phase_review_sources`;--> statement-breakpoint
CREATE UNIQUE INDEX `phase_review_sources_account_id_unique` ON `phase_review_sources` (`account_id`,`id`);--> statement-breakpoint
CREATE INDEX `phase_review_sources_review_order_idx` ON `phase_review_sources` (`account_id`,`phase_review_id`,`sort_order`);--> statement-breakpoint
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
END;--> statement-breakpoint
PRAGMA defer_foreign_keys=OFF;
