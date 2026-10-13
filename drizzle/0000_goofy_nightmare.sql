CREATE TABLE `feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`user_email` text NOT NULL,
	`type` text NOT NULL,
	`message` text NOT NULL,
	`page_url` text,
	`user_agent` text,
	`notify` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`response` text,
	`created_at` text NOT NULL,
	`updated_at` text
);
--> statement-breakpoint
CREATE TABLE `feedback_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`feedback_id` text NOT NULL,
	`author` text NOT NULL,
	`body` text NOT NULL,
	`email_status` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`feedback_id`) REFERENCES `feedback`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_feedback_messages_feedback` ON `feedback_messages` (`feedback_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `invites` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`token` text NOT NULL,
	`invited_by` text,
	`note` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`accepted_at` integer,
	`revoked_at` integer,
	`email_status` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invites_email_unique` ON `invites` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `invites_token_unique` ON `invites` (`token`);--> statement-breakpoint
CREATE TABLE `plans` (
	`id` text PRIMARY KEY NOT NULL,
	`share_id` text NOT NULL,
	`owner_email` text,
	`name` text,
	`name_key` text,
	`activities` text NOT NULL,
	`chart_types` text NOT NULL,
	`time_unit` text NOT NULL,
	`month` text,
	`year` integer,
	`source` text DEFAULT 'web' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plans_share_id_unique` ON `plans` (`share_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `plans_owner_name_key` ON `plans` (`owner_email`,`name_key`);--> statement-breakpoint
CREATE INDEX `plans_owner_updated` ON `plans` (`owner_email`,`updated_at`);--> statement-breakpoint
CREATE INDEX `plans_created` ON `plans` (`created_at`);