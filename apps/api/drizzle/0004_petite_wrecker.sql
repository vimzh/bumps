ALTER TABLE `tactile_designs` ADD `valid` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `tactile_designs` ADD `violations` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `tactile_designs` ADD `iterations` text DEFAULT '[]' NOT NULL;