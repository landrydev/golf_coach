CREATE TABLE `practice_assignment_replacements` (
	`account_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`replaced_practice_item_id` text NOT NULL,
	`replacement_practice_item_id` text NOT NULL,
	`replaced_status` text NOT NULL,
	`replacement_plan_revision` integer NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	PRIMARY KEY(`account_id`, `plan_id`, `replaced_practice_item_id`),
	FOREIGN KEY (`account_id`,`plan_id`,`replaced_practice_item_id`) REFERENCES `practice_items`(`account_id`,`plan_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`,`plan_id`,`replacement_practice_item_id`) REFERENCES `practice_items`(`account_id`,`plan_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "practice_assignment_replacements_distinct_check" CHECK("practice_assignment_replacements"."replaced_practice_item_id" <> "practice_assignment_replacements"."replacement_practice_item_id"),
	CONSTRAINT "practice_assignment_replacements_status_check" CHECK("practice_assignment_replacements"."replaced_status" in ('active', 'paused')),
	CONSTRAINT "practice_assignment_replacements_revision_check" CHECK("practice_assignment_replacements"."replacement_plan_revision" >= 2)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `practice_assignment_replacements_next_unique` ON `practice_assignment_replacements` (`account_id`,`plan_id`,`replacement_practice_item_id`);--> statement-breakpoint
CREATE INDEX `practice_assignment_replacements_plan_created_idx` ON `practice_assignment_replacements` (`account_id`,`plan_id`,`created_at`);--> statement-breakpoint
CREATE TRIGGER `practice_assignment_replacements_immutable_update`
BEFORE UPDATE ON `practice_assignment_replacements`
BEGIN
	SELECT RAISE(ABORT, 'practice assignment replacement lineage is immutable');
END;--> statement-breakpoint
CREATE TRIGGER `practice_assignment_replacements_immutable_delete`
BEFORE DELETE ON `practice_assignment_replacements`
WHEN EXISTS (
	SELECT 1 FROM `development_plans`
	WHERE `account_id` = OLD.`account_id` AND `id` = OLD.`plan_id`
)
BEGIN
	SELECT RAISE(ABORT, 'practice assignment replacement lineage is immutable');
END;
