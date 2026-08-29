CREATE TABLE `tactile_designs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`floor_model_version` integer NOT NULL,
	`design` text NOT NULL,
	`notes` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
