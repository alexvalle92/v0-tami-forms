CREATE TABLE `app_logs` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`ts` datetime(3) NOT NULL,
	`level` varchar(5) NOT NULL,
	`event` varchar(100) NOT NULL,
	`area` varchar(40) NOT NULL,
	`fields` json NOT NULL,
	CONSTRAINT `app_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `funnel_events` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`session_id` char(36) NOT NULL,
	`event` varchar(32) NOT NULL,
	`step` tinyint,
	`step_slug` varchar(40),
	`props` json NOT NULL,
	`client_ts` datetime(3) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `funnel_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `funnel_sessions` (
	`session_id` char(36) NOT NULL,
	`started_at` datetime(3) NOT NULL,
	`last_event_at` datetime(3) NOT NULL,
	`last_step` tinyint,
	`last_step_slug` varchar(40),
	`max_step_slug` varchar(40),
	`max_step` tinyint,
	`checkout_clicked` boolean NOT NULL DEFAULT false,
	`utm_source` varchar(100),
	`utm_medium` varchar(100),
	`utm_campaign` varchar(100),
	`utm_content` varchar(100),
	`utm_term` varchar(100),
	`referrer_host` varchar(100),
	`device_type` varchar(20) NOT NULL,
	`os` varchar(20) NOT NULL,
	`browser` varchar(20) NOT NULL,
	`viewport_w` smallint,
	`viewport_h` smallint,
	`answers` json NOT NULL DEFAULT (JSON_OBJECT()),
	CONSTRAINT `funnel_sessions_session_id` PRIMARY KEY(`session_id`)
);
--> statement-breakpoint
CREATE INDEX `app_logs_ts_idx` ON `app_logs` (`ts`);--> statement-breakpoint
CREATE INDEX `app_logs_area_level_ts_idx` ON `app_logs` (`area`,`level`,`ts`);--> statement-breakpoint
CREATE INDEX `funnel_events_session_id_idx` ON `funnel_events` (`session_id`);--> statement-breakpoint
CREATE INDEX `funnel_events_event_created_at_idx` ON `funnel_events` (`event`,`created_at`);--> statement-breakpoint
CREATE INDEX `funnel_events_created_at_idx` ON `funnel_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `funnel_sessions_started_at_idx` ON `funnel_sessions` (`started_at`);--> statement-breakpoint
CREATE INDEX `funnel_sessions_last_event_at_idx` ON `funnel_sessions` (`last_event_at`);