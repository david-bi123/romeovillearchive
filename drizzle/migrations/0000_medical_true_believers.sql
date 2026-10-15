CREATE TABLE `audit_logs` (
	`id` varchar(36) NOT NULL,
	`actor_user_id` varchar(36),
	`actor_email` varchar(255),
	`action` varchar(80) NOT NULL,
	`entity_type` varchar(60) NOT NULL,
	`entity_id` varchar(64),
	`register_id` varchar(64),
	`summary` varchar(400),
	`metadata` json,
	`ip` varchar(64),
	`request_id` varchar(64),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `import_chunks` (
	`id` varchar(36) NOT NULL,
	`job_id` varchar(36) NOT NULL,
	`chunk_index` int NOT NULL,
	`data` longblob NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `import_chunks_id` PRIMARY KEY(`id`),
	CONSTRAINT `import_chunks_job_index_unique` UNIQUE(`job_id`,`chunk_index`)
);
--> statement-breakpoint
CREATE TABLE `import_errors` (
	`id` varchar(36) NOT NULL,
	`job_id` varchar(36) NOT NULL,
	`row_number` int NOT NULL,
	`column_name` varchar(160),
	`code` varchar(64) NOT NULL,
	`message` varchar(600) NOT NULL,
	`severity` enum('error','warning') NOT NULL DEFAULT 'error',
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `import_errors_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `import_jobs` (
	`id` varchar(36) NOT NULL,
	`kind` enum('new_register','existing_register') NOT NULL,
	`status` enum('draft','pending','processing','completed','partial','failed','cancelled') NOT NULL DEFAULT 'draft',
	`target_register_id` varchar(36),
	`target_register_name` varchar(160),
	`filename` varchar(255) NOT NULL,
	`mime_type` varchar(120),
	`file_size` int NOT NULL DEFAULT 0,
	`checksum` varchar(64),
	`chunk_count` int NOT NULL DEFAULT 0,
	`chunk_size` int NOT NULL DEFAULT 0,
	`sheet_name` varchar(160),
	`header_row` int NOT NULL DEFAULT 1,
	`mapping` json,
	`strategy` json,
	`rows_total` int NOT NULL DEFAULT 0,
	`rows_imported` int NOT NULL DEFAULT 0,
	`rows_updated` int NOT NULL DEFAULT 0,
	`rows_skipped` int NOT NULL DEFAULT 0,
	`rows_rejected` int NOT NULL DEFAULT 0,
	`duplicates_found` int NOT NULL DEFAULT 0,
	`progress` int NOT NULL DEFAULT 0,
	`error_message` text,
	`cancel_requested` boolean NOT NULL DEFAULT false,
	`created_by_user_id` varchar(36),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`started_at` datetime(3),
	`finished_at` datetime(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `import_jobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invitations` (
	`id` varchar(36) NOT NULL,
	`kind` enum('staff','bootstrap') NOT NULL DEFAULT 'staff',
	`email` varchar(255) NOT NULL,
	`full_name` varchar(160),
	`message` text,
	`role` enum('super_admin','admin','editor','viewer') NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	`status` enum('pending','accepted','revoked','expired') NOT NULL DEFAULT 'pending',
	`invited_by_user_id` varchar(36),
	`expires_at` datetime(3) NOT NULL,
	`sent_at` datetime(3),
	`resend_count` int NOT NULL DEFAULT 0,
	`accepted_at` datetime(3),
	`revoked_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `invitations_id` PRIMARY KEY(`id`),
	CONSTRAINT `invitations_token_hash_unique` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `password_reset_tokens` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	`consumed_at` datetime(3),
	`request_ip` varchar(64),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `password_reset_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `password_reset_tokens_hash_unique` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`bucket` varchar(190) NOT NULL,
	`window_start` datetime(3) NOT NULL,
	`count` int NOT NULL DEFAULT 0,
	CONSTRAINT `rate_limits_bucket` PRIMARY KEY(`bucket`)
);
--> statement-breakpoint
CREATE TABLE `record_values` (
	`id` varchar(36) NOT NULL,
	`record_id` varchar(36) NOT NULL,
	`field_id` varchar(36) NOT NULL,
	`value_text` text,
	`value_number` decimal(24,8),
	`value_date` datetime(3),
	`value_boolean` boolean,
	`value_json` json,
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `record_values_id` PRIMARY KEY(`id`),
	CONSTRAINT `record_values_record_field_unique` UNIQUE(`record_id`,`field_id`)
);
--> statement-breakpoint
CREATE TABLE `records` (
	`id` varchar(36) NOT NULL,
	`register_id` varchar(36) NOT NULL,
	`serial` bigint unsigned NOT NULL,
	`status` enum('active','archived') NOT NULL DEFAULT 'active',
	`data_version` int NOT NULL DEFAULT 1,
	`search_text` text,
	`created_by_user_id` varchar(36),
	`updated_by_user_id` varchar(36),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`deleted_at` datetime(3),
	CONSTRAINT `records_id` PRIMARY KEY(`id`),
	CONSTRAINT `records_register_serial_unique` UNIQUE(`register_id`,`serial`)
);
--> statement-breakpoint
CREATE TABLE `register_access` (
	`id` varchar(36) NOT NULL,
	`register_id` varchar(36) NOT NULL,
	`target_type` enum('role','user') NOT NULL,
	`target_id` varchar(120) NOT NULL,
	`can_view` boolean NOT NULL DEFAULT false,
	`can_create` boolean NOT NULL DEFAULT false,
	`can_edit` boolean NOT NULL DEFAULT false,
	`can_delete` boolean NOT NULL DEFAULT false,
	`can_import` boolean NOT NULL DEFAULT false,
	`can_export` boolean NOT NULL DEFAULT false,
	`created_by_user_id` varchar(36),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `register_access_id` PRIMARY KEY(`id`),
	CONSTRAINT `register_access_target_unique` UNIQUE(`register_id`,`target_type`,`target_id`)
);
--> statement-breakpoint
CREATE TABLE `register_fields` (
	`id` varchar(36) NOT NULL,
	`register_id` varchar(36) NOT NULL,
	`field_key` varchar(64) NOT NULL,
	`name` varchar(160) NOT NULL,
	`field_type` enum('text','long_text','integer','decimal','date','datetime','boolean','select','multi_select','email','phone','url') NOT NULL,
	`required` boolean NOT NULL DEFAULT false,
	`help_text` varchar(300),
	`options` json,
	`default_value` varchar(500),
	`display_order` int NOT NULL DEFAULT 0,
	`show_in_table` boolean NOT NULL DEFAULT true,
	`show_in_card` boolean NOT NULL DEFAULT true,
	`editable` boolean NOT NULL DEFAULT true,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `register_fields_id` PRIMARY KEY(`id`),
	CONSTRAINT `register_fields_key_unique` UNIQUE(`register_id`,`field_key`)
);
--> statement-breakpoint
CREATE TABLE `register_views` (
	`id` varchar(36) NOT NULL,
	`register_id` varchar(36) NOT NULL,
	`name` varchar(160) NOT NULL,
	`owner_user_id` varchar(36) NOT NULL,
	`config` json NOT NULL,
	`is_shared` boolean NOT NULL DEFAULT false,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `register_views_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `registers` (
	`id` varchar(36) NOT NULL,
	`name` varchar(160) NOT NULL,
	`slug` varchar(180) NOT NULL,
	`description` text,
	`category` varchar(120),
	`icon` varchar(64),
	`color` varchar(32),
	`status` enum('active','archived') NOT NULL DEFAULT 'active',
	`serial_counter` bigint unsigned NOT NULL DEFAULT 0,
	`record_count` int NOT NULL DEFAULT 0,
	`created_by_user_id` varchar(36),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`archived_at` datetime(3),
	CONSTRAINT `registers_id` PRIMARY KEY(`id`),
	CONSTRAINT `registers_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`last_seen_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`ip` varchar(64),
	`user_agent` varchar(400),
	`revoked_at` datetime(3),
	CONSTRAINT `sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `sessions_token_hash_unique` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` varchar(80) NOT NULL,
	`value` text NOT NULL,
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `settings_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` varchar(36) NOT NULL,
	`email` varchar(255) NOT NULL,
	`full_name` varchar(160),
	`password_hash` varchar(255),
	`role` enum('super_admin','admin','editor','viewer') NOT NULL DEFAULT 'viewer',
	`status` enum('pending','active','disabled') NOT NULL DEFAULT 'pending',
	`last_login_at` datetime(3),
	`last_login_ip` varchar(64),
	`password_updated_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`deactivated_at` datetime(3),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_actor_user_id_users_id_fk` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `import_chunks` ADD CONSTRAINT `import_chunks_job_id_import_jobs_id_fk` FOREIGN KEY (`job_id`) REFERENCES `import_jobs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `import_errors` ADD CONSTRAINT `import_errors_job_id_import_jobs_id_fk` FOREIGN KEY (`job_id`) REFERENCES `import_jobs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `import_jobs` ADD CONSTRAINT `import_jobs_target_register_id_registers_id_fk` FOREIGN KEY (`target_register_id`) REFERENCES `registers`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `import_jobs` ADD CONSTRAINT `import_jobs_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invitations` ADD CONSTRAINT `invitations_invited_by_user_id_users_id_fk` FOREIGN KEY (`invited_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `password_reset_tokens` ADD CONSTRAINT `password_reset_tokens_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `record_values` ADD CONSTRAINT `record_values_record_id_records_id_fk` FOREIGN KEY (`record_id`) REFERENCES `records`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `record_values` ADD CONSTRAINT `record_values_field_id_register_fields_id_fk` FOREIGN KEY (`field_id`) REFERENCES `register_fields`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `records` ADD CONSTRAINT `records_register_id_registers_id_fk` FOREIGN KEY (`register_id`) REFERENCES `registers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `records` ADD CONSTRAINT `records_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `records` ADD CONSTRAINT `records_updated_by_user_id_users_id_fk` FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `register_access` ADD CONSTRAINT `register_access_register_id_registers_id_fk` FOREIGN KEY (`register_id`) REFERENCES `registers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `register_access` ADD CONSTRAINT `register_access_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `register_fields` ADD CONSTRAINT `register_fields_register_id_registers_id_fk` FOREIGN KEY (`register_id`) REFERENCES `registers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `register_views` ADD CONSTRAINT `register_views_register_id_registers_id_fk` FOREIGN KEY (`register_id`) REFERENCES `registers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `register_views` ADD CONSTRAINT `register_views_owner_user_id_users_id_fk` FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `registers` ADD CONSTRAINT `registers_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `audit_logs_created_idx` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `audit_logs_entity_idx` ON `audit_logs` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `audit_logs_actor_idx` ON `audit_logs` (`actor_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `import_errors_job_idx` ON `import_errors` (`job_id`,`row_number`);--> statement-breakpoint
CREATE INDEX `import_jobs_status_idx` ON `import_jobs` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `import_jobs_creator_idx` ON `import_jobs` (`created_by_user_id`);--> statement-breakpoint
CREATE INDEX `invitations_email_status_idx` ON `invitations` (`email`,`status`);--> statement-breakpoint
CREATE INDEX `password_reset_tokens_user_idx` ON `password_reset_tokens` (`user_id`);--> statement-breakpoint
CREATE INDEX `record_values_field_idx` ON `record_values` (`field_id`);--> statement-breakpoint
CREATE INDEX `record_values_field_number_idx` ON `record_values` (`field_id`,`value_number`);--> statement-breakpoint
CREATE INDEX `record_values_field_date_idx` ON `record_values` (`field_id`,`value_date`);--> statement-breakpoint
CREATE INDEX `records_register_updated_idx` ON `records` (`register_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `register_fields_register_idx` ON `register_fields` (`register_id`,`display_order`);--> statement-breakpoint
CREATE INDEX `register_views_register_idx` ON `register_views` (`register_id`,`owner_user_id`);--> statement-breakpoint
CREATE INDEX `sessions_user_id_idx` ON `sessions` (`user_id`);