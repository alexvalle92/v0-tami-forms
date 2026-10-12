CREATE TABLE `admins` (
	`id` char(36) NOT NULL,
	`name` varchar(200) NOT NULL,
	`email` varchar(254) NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`cpf` char(11),
	`phone` varchar(13),
	`crn` varchar(32),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `admins_id` PRIMARY KEY(`id`),
	CONSTRAINT `admins_email_unique` UNIQUE(`email`)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
--> statement-breakpoint
CREATE TABLE `allowed_meal_items` (
	`id` char(36) NOT NULL,
	`meal_category_id` char(36) NOT NULL,
	`item_type` varchar(16) NOT NULL,
	`food_name` varchar(200),
	`recipe_id` char(36),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `allowed_meal_items_id` PRIMARY KEY(`id`)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
--> statement-breakpoint
CREATE TABLE `app_settings` (
	`id` varchar(32) NOT NULL,
	`diet_technical_definition` text NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `app_settings_id` PRIMARY KEY(`id`)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
--> statement-breakpoint
CREATE TABLE `meal_categories` (
	`id` char(36) NOT NULL,
	`name` varchar(100) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `meal_categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `meal_categories_name_unique` UNIQUE(`name`)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
--> statement-breakpoint
CREATE TABLE `password_reset_tokens` (
	`id` char(36) NOT NULL,
	`patient_id` char(36) NOT NULL,
	`token_hash` char(64) NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	`used` boolean NOT NULL DEFAULT false,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `password_reset_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `password_reset_tokens_token_hash_unique` UNIQUE(`token_hash`)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
--> statement-breakpoint
CREATE TABLE `recipes` (
	`id` char(36) NOT NULL,
	`title` varchar(200) NOT NULL,
	`description` text,
	`ingredients` json NOT NULL,
	`preparation` text NOT NULL,
	`tips` text,
	`prep_time` int,
	`servings` int,
	`calories` int,
	`category` varchar(100),
	`image_url` text,
	`portion_quantity` decimal(10,2),
	`proteins` decimal(10,2),
	`lipids` decimal(10,2),
	`carbohydrates` decimal(10,2),
	`fiber` decimal(10,2),
	`active_customer` boolean NOT NULL DEFAULT true,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `recipes_id` PRIMARY KEY(`id`)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
--> statement-breakpoint
ALTER TABLE `notifications` ADD `patient_id` char(36);--> statement-breakpoint
UPDATE `notifications` n JOIN `quiz_responses` q ON q.`id` = n.`quiz_response_id` SET n.`patient_id` = q.`patient_id`;--> statement-breakpoint
ALTER TABLE `notifications` MODIFY COLUMN `patient_id` char(36) NOT NULL;--> statement-breakpoint
ALTER TABLE `notifications` MODIFY COLUMN `quiz_response_id` char(36);--> statement-breakpoint
ALTER TABLE `notifications` MODIFY COLUMN `payment_id` char(36);--> statement-breakpoint
ALTER TABLE `notifications` ADD `payload` json;--> statement-breakpoint
ALTER TABLE `allowed_meal_items` ADD CONSTRAINT `allowed_meal_items_meal_category_id_meal_categories_id_fk` FOREIGN KEY (`meal_category_id`) REFERENCES `meal_categories`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `allowed_meal_items` ADD CONSTRAINT `allowed_meal_items_recipe_id_recipes_id_fk` FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `password_reset_tokens` ADD CONSTRAINT `password_reset_tokens_patient_id_patients_id_fk` FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `password_reset_tokens_patient_id_idx` ON `password_reset_tokens` (`patient_id`);--> statement-breakpoint
CREATE INDEX `recipes_category_idx` ON `recipes` (`category`);--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_patient_id_patients_id_fk` FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `notifications_patient_id_idx` ON `notifications` (`patient_id`);
