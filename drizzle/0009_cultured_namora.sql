PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_consent_records` (
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
	CONSTRAINT "consent_records_subject_type_check" CHECK("__new_consent_records"."subject_type" in ('account', 'golfer')),
	CONSTRAINT "consent_records_subject_reference_check" CHECK(("__new_consent_records"."subject_type" = 'account' and "__new_consent_records"."golfer_id" is null) or ("__new_consent_records"."subject_type" = 'golfer' and "__new_consent_records"."golfer_id" is not null)),
	CONSTRAINT "consent_records_scope_check" CHECK("__new_consent_records"."scope" in ('terms', 'privacy_notice', 'golfer_record', 'roadmap_sharing', 'media_use', 'service_email', 'optional_analytics')),
	CONSTRAINT "consent_records_status_check" CHECK("__new_consent_records"."status" in ('granted', 'declined', 'withdrawn', 'expired')),
	CONSTRAINT "consent_records_capture_method_check" CHECK("__new_consent_records"."capture_method" in ('self_service', 'instructor_attested', 'support_assisted', 'imported')),
	CONSTRAINT "consent_records_status_timestamp_consistency_check" CHECK((
        "__new_consent_records"."status" = 'granted'
        and "__new_consent_records"."granted_at" is not null
        and "__new_consent_records"."granted_at" <= "__new_consent_records"."created_at"
        and "__new_consent_records"."declined_at" is null
        and "__new_consent_records"."withdrawn_at" is null
        and ("__new_consent_records"."expires_at" is null or "__new_consent_records"."expires_at" > "__new_consent_records"."granted_at")
      ) or (
        "__new_consent_records"."status" = 'declined'
        and "__new_consent_records"."granted_at" is null
        and "__new_consent_records"."declined_at" is not null
        and "__new_consent_records"."declined_at" <= "__new_consent_records"."created_at"
        and "__new_consent_records"."withdrawn_at" is null
        and "__new_consent_records"."expires_at" is null
      ) or (
        "__new_consent_records"."status" = 'withdrawn'
        and "__new_consent_records"."granted_at" is null
        and "__new_consent_records"."declined_at" is null
        and "__new_consent_records"."withdrawn_at" is not null
        and "__new_consent_records"."withdrawn_at" <= "__new_consent_records"."created_at"
        and "__new_consent_records"."expires_at" is null
      ) or (
        "__new_consent_records"."status" = 'expired'
        and "__new_consent_records"."granted_at" is null
        and "__new_consent_records"."declined_at" is null
        and "__new_consent_records"."withdrawn_at" is null
        and "__new_consent_records"."expires_at" is not null
        and "__new_consent_records"."expires_at" <= "__new_consent_records"."created_at"
      ))
);
--> statement-breakpoint
INSERT INTO `__new_consent_records`("id", "account_id", "golfer_id", "subject_type", "scope", "status", "policy_version", "purpose_description", "capture_method", "evidence_reference", "recorded_by_account_id", "granted_at", "declined_at", "withdrawn_at", "expires_at", "created_at") SELECT "id", "account_id", "golfer_id", "subject_type", "scope", "status", "policy_version", "purpose_description", "capture_method", "evidence_reference", "recorded_by_account_id", "granted_at", "declined_at", "withdrawn_at", "expires_at", "created_at" FROM `consent_records`;--> statement-breakpoint
DROP TABLE `consent_records`;--> statement-breakpoint
ALTER TABLE `__new_consent_records` RENAME TO `consent_records`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `consent_records_account_id_unique` ON `consent_records` (`account_id`,`id`);--> statement-breakpoint
CREATE INDEX `consent_records_subject_scope_created_idx` ON `consent_records` (`account_id`,`golfer_id`,`scope`,`created_at`);--> statement-breakpoint
CREATE INDEX `consent_records_status_expires_idx` ON `consent_records` (`status`,`expires_at`);