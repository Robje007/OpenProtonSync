ALTER TABLE `sync_jobs` ADD `finished_at` integer;
--> statement-breakpoint
UPDATE `sync_jobs`
SET `finished_at` = `created_at`
WHERE `status` IN ('SYNCED', 'BLOCKED');
--> statement-breakpoint
CREATE INDEX `idx_sync_jobs_status_finished`
ON `sync_jobs` (`status`, `finished_at`);
