CREATE TABLE `users` (
	`email` text PRIMARY KEY NOT NULL,
	`name` text,
	`created_at` integer NOT NULL,
	`last_active_at` integer
);
