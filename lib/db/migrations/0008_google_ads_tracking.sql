CREATE TABLE `google_ads_attributions` (
	`quiz_response_id` char(36) NOT NULL,
	`gclid` varchar(255),
	`gbraid` varchar(255),
	`wbraid` varchar(255),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `google_ads_attributions_quiz_response_id` PRIMARY KEY(`quiz_response_id`)
);
--> statement-breakpoint
CREATE TABLE `google_ads_conversions` (
	`id` char(36) NOT NULL,
	`payment_id` char(36) NOT NULL,
	`quiz_response_id` char(36) NOT NULL,
	`transaction_id` varchar(80) NOT NULL,
	`event_time` datetime(3) NOT NULL,
	`status` enum('pending','sent','failed') NOT NULL,
	`attempts` int NOT NULL DEFAULT 0,
	`next_attempt_at` datetime(3) NOT NULL,
	`locked_until` datetime(3),
	`last_error` json,
	`request_id` varchar(100),
	`sent_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `google_ads_conversions_id` PRIMARY KEY(`id`),
	CONSTRAINT `google_ads_conversions_payment_id_unique` UNIQUE(`payment_id`)
);
--> statement-breakpoint
ALTER TABLE `google_ads_attributions` ADD CONSTRAINT `google_ads_attributions_quiz_response_id_quiz_responses_id_fk` FOREIGN KEY (`quiz_response_id`) REFERENCES `quiz_responses`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `google_ads_conversions` ADD CONSTRAINT `google_ads_conversions_payment_id_payments_id_fk` FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `google_ads_attributions_created_at_idx` ON `google_ads_attributions` (`created_at`);--> statement-breakpoint
CREATE INDEX `google_ads_conversions_status_next_attempt_at_idx` ON `google_ads_conversions` (`status`,`next_attempt_at`);