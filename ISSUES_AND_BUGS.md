# 1. Random Transaction Error that happened during testing

                                                                                                                                                      ║
┃  [Nest] 74892  - 04/09/2026, 5:33:59 PM   DEBUG [UsersService] Found 1 total users, returning page 1 with 1 results                                                                       ║
┃  [Nest] 74892  - 04/09/2026, 5:33:59 PM   DEBUG [UsersController] Found 1 users total, returning 1 users                                                                                  ║
┃  [Nest] 74892  - 04/09/2026, 5:35:00 PM   DEBUG [MaintenanceScheduleEvaluatorService] Schedule evaluation already in progress, skipping                                                   ║
┃  [Nest] 74892  - 04/09/2026, 5:35:00 PM   DEBUG [MaintenanceScheduleEvaluatorService] Schedule evaluation already in progress, skipping                                                   ║
┃  [Nest] 74892  - 04/09/2026, 5:35:00 PM     LOG [MaintenanceScheduleEvaluatorService] Schedule 2 triggered for resource 1: created maintenance. Reason: {"i18nKey":"reason.auto.usageCo   ║
┃  unt","details":{"count":50,"scheduleName":"Alles durchprüfen"}}                                                                                                                          ║
┃  [Nest] 74892  - 04/09/2026, 5:35:00 PM   ERROR [MaintenanceScheduleEvaluatorService] Error evaluating schedules for resource 1 after maintenance changed: TransactionNotStartedError:    ║
┃  Transaction is not started yet, start transaction before committing or rolling it back.                                                                                                  ║
┃                                                                                                                                                                                           ║
┃  TransactionNotStartedError: Transaction is not started yet, start transaction before committing or rolling it back.                                                                      ║
┃      at SqliteQueryRunner.commitTransaction (/Users/jappy/code/attraccess/Attraccess/node_modules/.pnpm/typeorm@0.3.28_patch_hash=awxlykwbpei6nnl5vfaztyyefy_babel-plugin-macros@3.1.0_   ║
┃  pg@8.15.6_sql._unfz22ywznrf2khujxckiqeske/src/driver/sqlite-abstract/AbstractSqliteQueryRunner.ts:125:46)                                                                                ║
┃      at EntityManager.transaction (/Users/jappy/code/attraccess/Attraccess/node_modules/.pnpm/typeorm@0.3.28_patch_hash=awxlykwbpei6nnl5vfaztyyefy_babel-plugin-macros@3.1.0_pg@8.15.6_   ║
┃  sql._unfz22ywznrf2khujxckiqeske/src/entity-manager/EntityManager.ts:157:31)                                                                                                              ║
┃      at MaintenanceScheduleEvaluatorService.evaluateResource (/Users/jappy/code/attraccess/Attraccess/dist/apps/api/webpack:/@attraccess/api/src/resources/maintenances/maintenance-sch   ║
┃  edule-evaluator.service.ts:147:5)  


# 2. Maintenances in the future cannot be edited, completed or deleted

If i create a maintenance with start and end in the future, i see no buttons/options to further modify it (edit/finish/delete)