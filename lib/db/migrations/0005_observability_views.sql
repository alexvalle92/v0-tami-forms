-- Views para o Metabase. As datas das tabelas estão em UTC, por isso UTC_TIMESTAMP em vw_abandonment.
-- A lista de etapas (vw_funnel_steps) e a de chaves de resposta (vw_session_answers) repetem QUIZ_STEPS e
-- ALLOWED_ANSWER_KEYS: o teste tests/lib/quiz/steps-migration.test.ts falha se divergirem. Quando entrar uma
-- etapa nova, crie uma migration que recria as views (DROP VIEW + CREATE VIEW).
CREATE OR REPLACE VIEW `vw_funnel_steps` AS
SELECT s.step AS step, s.step_slug AS step_slug,
  COUNT(f.session_id) AS sessions,
  ROUND(100 * COUNT(f.session_id) / NULLIF((SELECT COUNT(*) FROM `funnel_sessions` WHERE `max_step` >= 0), 0), 1) AS pct_of_start
FROM (
  SELECT 0 AS step, 'faixa_etaria' AS step_slug
  UNION ALL SELECT 1, 'sexo_biologico'
  UNION ALL SELECT 2, 'tipo_fisico'
  UNION ALL SELECT 3, 'info_expectativa'
  UNION ALL SELECT 4, 'peso_comportamento'
  UNION ALL SELECT 5, 'info_prepare_se'
  UNION ALL SELECT 6, 'cafe_manha'
  UNION ALL SELECT 7, 'almoco'
  UNION ALL SELECT 8, 'lanche_tarde'
  UNION ALL SELECT 9, 'jantar'
  UNION ALL SELECT 10, 'sobremesa'
  UNION ALL SELECT 11, 'info_equilibrio'
  UNION ALL SELECT 12, 'rotina_dia'
  UNION ALL SELECT 13, 'sono'
  UNION ALL SELECT 14, 'agua'
  UNION ALL SELECT 15, 'habitos'
  UNION ALL SELECT 16, 'info_resultados'
  UNION ALL SELECT 17, 'info_nutricionista'
  UNION ALL SELECT 18, 'altura'
  UNION ALL SELECT 19, 'peso'
  UNION ALL SELECT 20, 'meta_peso'
  UNION ALL SELECT 21, 'perfil_imc'
  UNION ALL SELECT 22, 'info_rumo_objetivo'
  UNION ALL SELECT 23, 'email'
  UNION ALL SELECT 24, 'whatsapp'
  UNION ALL SELECT 25, 'nome'
  UNION ALL SELECT 26, 'cpf'
  UNION ALL SELECT 27, 'envio'
  UNION ALL SELECT 28, 'checkout'
) s
LEFT JOIN `funnel_sessions` f ON f.`max_step` >= s.step
GROUP BY s.step, s.step_slug;--> statement-breakpoint
CREATE OR REPLACE VIEW `vw_abandonment` AS
SELECT `session_id`, `last_step` AS abandon_step, `last_step_slug` AS abandon_step_slug,
  `started_at`, `last_event_at`, `utm_source`, `utm_medium`, `utm_campaign`, `referrer_host`,
  `device_type`, `os`, `browser`
FROM `funnel_sessions`
WHERE `checkout_clicked` = false
  AND `last_step` IS NOT NULL
  AND `last_event_at` < UTC_TIMESTAMP(3) - INTERVAL 30 MINUTE;--> statement-breakpoint
CREATE OR REPLACE VIEW `vw_session_answers` AS
SELECT `session_id`, `started_at`, `utm_source`, `utm_campaign`, `device_type`, `os`, `browser`,
  `max_step`, `checkout_clicked`,
  JSON_UNQUOTE(JSON_EXTRACT(`answers`, '$.faixa_etaria')) AS `faixa_etaria`,
  JSON_UNQUOTE(JSON_EXTRACT(`answers`, '$.sexo_biologico')) AS `sexo_biologico`,
  JSON_UNQUOTE(JSON_EXTRACT(`answers`, '$.tipo_fisico')) AS `tipo_fisico`,
  JSON_UNQUOTE(JSON_EXTRACT(`answers`, '$.peso_comportamento')) AS `peso_comportamento`,
  JSON_UNQUOTE(JSON_EXTRACT(`answers`, '$.breakfast_foods')) AS `breakfast_foods`,
  JSON_UNQUOTE(JSON_EXTRACT(`answers`, '$.almoco')) AS `almoco`,
  JSON_UNQUOTE(JSON_EXTRACT(`answers`, '$.lanche_tarde')) AS `lanche_tarde`,
  JSON_UNQUOTE(JSON_EXTRACT(`answers`, '$.jantar')) AS `jantar`,
  JSON_UNQUOTE(JSON_EXTRACT(`answers`, '$.sobremesa')) AS `sobremesa`,
  JSON_UNQUOTE(JSON_EXTRACT(`answers`, '$.rotina_dia')) AS `rotina_dia`,
  JSON_UNQUOTE(JSON_EXTRACT(`answers`, '$.sono')) AS `sono`,
  JSON_UNQUOTE(JSON_EXTRACT(`answers`, '$.agua')) AS `agua`,
  JSON_UNQUOTE(JSON_EXTRACT(`answers`, '$.habitos')) AS `habitos`,
  JSON_UNQUOTE(JSON_EXTRACT(`answers`, '$.imc_faixa')) AS `imc_faixa`
FROM `funnel_sessions`;--> statement-breakpoint
CREATE OR REPLACE VIEW `vw_step_durations` AS
SELECT `session_id`, `created_at`, `step`, `step_slug`,
  CAST(JSON_EXTRACT(`props`, '$.durationMs') AS UNSIGNED) AS duration_ms
FROM `funnel_events`
WHERE `event` = 'step_answer';--> statement-breakpoint
CREATE OR REPLACE VIEW `vw_api_errors` AS
SELECT DATE(`ts`) AS day, `area`, `event`, `level`, COUNT(*) AS total
FROM `app_logs`
GROUP BY DATE(`ts`), `area`, `event`, `level`;
