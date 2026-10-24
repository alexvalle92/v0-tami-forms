CREATE TABLE `meta_attributions` (
	`quiz_response_id` char(36) NOT NULL,
	`external_id` char(36),
	`fbp` varchar(500),
	`fbc` varchar(500),
	`client_ip` varchar(45),
	`user_agent` varchar(500),
	`event_source_url` varchar(500),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `meta_attributions_quiz_response_id` PRIMARY KEY(`quiz_response_id`)
);
--> statement-breakpoint
CREATE TABLE `meta_conversions` (
	`id` char(36) NOT NULL,
	`payment_id` char(36) NOT NULL,
	`quiz_response_id` char(36) NOT NULL,
	`event_id` varchar(80) NOT NULL,
	`event_time` datetime(3) NOT NULL,
	`status` enum('pending','sent','failed') NOT NULL,
	`attempts` int NOT NULL DEFAULT 0,
	`next_attempt_at` datetime(3) NOT NULL,
	`locked_until` datetime(3),
	`last_error` json,
	`sent_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `meta_conversions_id` PRIMARY KEY(`id`),
	CONSTRAINT `meta_conversions_payment_id_unique` UNIQUE(`payment_id`)
);
--> statement-breakpoint
ALTER TABLE `meta_attributions` ADD CONSTRAINT `meta_attributions_quiz_response_id_quiz_responses_id_fk` FOREIGN KEY (`quiz_response_id`) REFERENCES `quiz_responses`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `meta_conversions` ADD CONSTRAINT `meta_conversions_payment_id_payments_id_fk` FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `meta_attributions_created_at_idx` ON `meta_attributions` (`created_at`);--> statement-breakpoint
CREATE INDEX `meta_conversions_status_next_attempt_at_idx` ON `meta_conversions` (`status`,`next_attempt_at`);