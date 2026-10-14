ALTER TABLE `feedback_messages` ADD `channel` text DEFAULT 'web' NOT NULL;--> statement-breakpoint
ALTER TABLE `feedback_messages` ADD `source_message_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `feedback_messages_source_message_id_unique` ON `feedback_messages` (`source_message_id`);