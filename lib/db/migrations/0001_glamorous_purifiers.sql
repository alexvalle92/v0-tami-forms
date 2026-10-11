CREATE TABLE `asaas_webhook_events` (
	`id` varchar(128) NOT NULL,
	`event` varchar(64) NOT NULL,
	`asaas_payment_id` varchar(64),
	`payment_id` char(36),
	`outcome` enum('processed','ignored') NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `asaas_webhook_events_id` PRIMARY KEY(`id`)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
--> statement-breakpoint
CREATE TABLE `meal_plans` (
	`id` char(36) NOT NULL,
	`patient_id` char(36) NOT NULL,
	`payment_id` char(36),
	`quiz_response_id` char(36),
	`title` varchar(200) NOT NULL,
	`description` text,
	`start_date` date NOT NULL,
	`end_date` date,
	`due_date_new_meal_plan` date,
	`payment_url_new_meal_plan` varchar(500),
	`status` varchar(32) NOT NULL DEFAULT 'active',
	`plan_data` json NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `meal_plans_id` PRIMARY KEY(`id`),
	CONSTRAINT `meal_plans_payment_id_unique` UNIQUE(`payment_id`)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
--> statement-breakpoint
CREATE TABLE `plan_generations` (
	`id` char(36) NOT NULL,
	`payment_id` char(36) NOT NULL,
	`patient_id` char(36) NOT NULL,
	`quiz_response_id` char(36) NOT NULL,
	`status` enum('pending','done','failed') NOT NULL,
	`meal_plan_id` char(36),
	`attempts` int NOT NULL DEFAULT 0,
	`next_attempt_at` datetime(3),
	`locked_until` datetime(3),
	`last_error` json,
	`generation` json,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `plan_generations_id` PRIMARY KEY(`id`),
	CONSTRAINT `plan_generations_payment_id_unique` UNIQUE(`payment_id`)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
--> statement-breakpoint
ALTER TABLE `patients` ADD `password_hash` varchar(255);--> statement-breakpoint
ALTER TABLE `patients` ADD `must_change_password` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `patients` ADD `password_set_at` datetime(3);--> statement-breakpoint
ALTER TABLE `payments` ADD `paid_at` datetime(3);--> statement-breakpoint
ALTER TABLE `payments` ADD `payment_date` date;--> statement-breakpoint
ALTER TABLE `payments` ADD `last_event` varchar(64);--> statement-breakpoint
ALTER TABLE `asaas_webhook_events` ADD CONSTRAINT `asaas_webhook_events_payment_id_payments_id_fk` FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `meal_plans` ADD CONSTRAINT `meal_plans_patient_id_patients_id_fk` FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `meal_plans` ADD CONSTRAINT `meal_plans_payment_id_payments_id_fk` FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `meal_plans` ADD CONSTRAINT `meal_plans_quiz_response_id_quiz_responses_id_fk` FOREIGN KEY (`quiz_response_id`) REFERENCES `quiz_responses`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `plan_generations` ADD CONSTRAINT `plan_generations_payment_id_payments_id_fk` FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `plan_generations` ADD CONSTRAINT `plan_generations_patient_id_patients_id_fk` FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `plan_generations` ADD CONSTRAINT `plan_generations_quiz_response_id_quiz_responses_id_fk` FOREIGN KEY (`quiz_response_id`) REFERENCES `quiz_responses`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `plan_generations` ADD CONSTRAINT `plan_generations_meal_plan_id_meal_plans_id_fk` FOREIGN KEY (`meal_plan_id`) REFERENCES `meal_plans`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `meal_plans_patient_id_status_idx` ON `meal_plans` (`patient_id`,`status`);--> statement-breakpoint
CREATE INDEX `plan_generations_status_next_attempt_at_idx` ON `plan_generations` (`status`,`next_attempt_at`);