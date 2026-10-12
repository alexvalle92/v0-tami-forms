ALTER TABLE `notifications` ADD `meal_plan_id` char(36);--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_plan_channel_kind_unique` UNIQUE(`meal_plan_id`,`channel`,`kind`);--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_meal_plan_id_meal_plans_id_fk` FOREIGN KEY (`meal_plan_id`) REFERENCES `meal_plans`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `meal_plans_status_end_date_idx` ON `meal_plans` (`status`,`end_date`);--> statement-breakpoint
ALTER TABLE `meal_plans` DROP COLUMN `due_date_new_meal_plan`;--> statement-breakpoint
ALTER TABLE `meal_plans` DROP COLUMN `payment_url_new_meal_plan`;