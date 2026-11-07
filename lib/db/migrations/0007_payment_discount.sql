ALTER TABLE `payments` ADD `discount_status` varchar(16);--> statement-breakpoint
ALTER TABLE `payments` ADD `discount_applied_at` datetime(3);--> statement-breakpoint
ALTER TABLE `payments` ADD `original_amount` decimal(10,2);--> statement-breakpoint
CREATE INDEX `payments_discount_status_patient_idx` ON `payments` (`discount_status`,`patient_id`);--> statement-breakpoint
CREATE INDEX `payments_created_at_idx` ON `payments` (`created_at`);