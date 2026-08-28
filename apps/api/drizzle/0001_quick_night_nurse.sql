ALTER TABLE `projects` ADD `status` text DEFAULT 'uploaded' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `parse_error` text;