CREATE TABLE `notifications` (
	`id` char(36) NOT NULL,
	`quiz_response_id` char(36) NOT NULL,
	`payment_id` char(36) NOT NULL,
	`channel` enum('email','whatsapp') NOT NULL,
	`kind` varchar(32) NOT NULL,
	`recipient` varchar(254) NOT NULL,
	`status` enum('pending','sent','failed') NOT NULL,
	`parts_sent` int NOT NULL DEFAULT 0,
	`attempts` int NOT NULL DEFAULT 0,
	`next_attempt_at` datetime(3) NOT NULL,
	`locked_until` datetime(3),
	`last_error` json,
	`sent_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`),
	CONSTRAINT `notifications_response_channel_kind_unique` UNIQUE(`quiz_response_id`,`channel`,`kind`)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
--> statement-breakpoint
CREATE TABLE `patients` (
	`id` char(36) NOT NULL,
	`name` varchar(200) NOT NULL,
	`cpf` char(11) NOT NULL,
	`email` varchar(254) NOT NULL,
	`phone` varchar(13) NOT NULL,
	`asaas_customer_id` varchar(64),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `patients_id` PRIMARY KEY(`id`),
	CONSTRAINT `patients_cpf_unique` UNIQUE(`cpf`)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` char(36) NOT NULL,
	`patient_id` char(36) NOT NULL,
	`amount` decimal(10,2) NOT NULL,
	`due_date` date,
	`status` varchar(32) NOT NULL,
	`asaas_id` varchar(64),
	`asaas_customer_id` varchar(64),
	`payment_url` varchar(500),
	`invoice_number` varchar(32),
	`billing_type` varchar(32),
	`sync_attempts` int NOT NULL DEFAULT 0,
	`next_sync_at` datetime(3),
	`locked_until` datetime(3),
	`last_error` json,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `payments_id` PRIMARY KEY(`id`),
	CONSTRAINT `payments_asaas_id_unique` UNIQUE(`asaas_id`)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
--> statement-breakpoint
CREATE TABLE `quiz_responses` (
	`id` char(36) NOT NULL,
	`submission_id` char(36) NOT NULL,
	`patient_id` char(36) NOT NULL,
	`answers` json NOT NULL,
	`first_quiz` boolean NOT NULL,
	`payment_id` char(36),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `quiz_responses_id` PRIMARY KEY(`id`),
	CONSTRAINT `quiz_responses_submission_id_unique` UNIQUE(`submission_id`)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_quiz_response_id_quiz_responses_id_fk` FOREIGN KEY (`quiz_response_id`) REFERENCES `quiz_responses`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_payment_id_payments_id_fk` FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payments` ADD CONSTRAINT `payments_patient_id_patients_id_fk` FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quiz_responses` ADD CONSTRAINT `quiz_responses_patient_id_patients_id_fk` FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quiz_responses` ADD CONSTRAINT `quiz_responses_payment_id_payments_id_fk` FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `notifications_status_next_attempt_at_idx` ON `notifications` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE INDEX `patients_email_idx` ON `patients` (`email`);--> statement-breakpoint
CREATE INDEX `payments_status_next_sync_at_idx` ON `payments` (`status`,`next_sync_at`);--> statement-breakpoint
CREATE INDEX `payments_patient_id_idx` ON `payments` (`patient_id`);--> statement-breakpoint
CREATE INDEX `quiz_responses_patient_id_idx` ON `quiz_responses` (`patient_id`);