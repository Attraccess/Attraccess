-- Flyer demo seed: sanitize real dev data -> realistic German makerspace demo.
-- Idempotent-ish: safe to re-run on a fresh copy of the dev DB.
PRAGMA foreign_keys = OFF;
BEGIN;

-- ---------- USERS: German demo personas, no real names/emails ----------
UPDATE "user" SET username='anna.becker',     email='anna.becker@makerspace.demo',     isEmailVerified=1, canManageResources=1, canManageSystemConfiguration=1, canManageUsers=1, canManageBilling=1, creditBalance=4200, deletedAt=NULL WHERE id=1;
UPDATE "user" SET username='tobias.wagner',   email='tobias.wagner@makerspace.demo',   isEmailVerified=1, canManageResources=1, canManageSystemConfiguration=0, canManageUsers=0, canManageBilling=0, creditBalance=1850, deletedAt=NULL WHERE id=2;
UPDATE "user" SET username='laura.schmidt',   email='laura.schmidt@makerspace.demo',   isEmailVerified=1, canManageResources=0, creditBalance=920,  deletedAt=NULL WHERE id=3;
UPDATE "user" SET username='jonas.weber',     email='jonas.weber@makerspace.demo',     isEmailVerified=1, canManageResources=0, creditBalance=640,  deletedAt=NULL WHERE id=4;
UPDATE "user" SET username='katrin.hoffmann', email='katrin.hoffmann@makerspace.demo', isEmailVerified=1, canManageResources=1, creditBalance=2300, deletedAt=NULL WHERE id=5;
UPDATE "user" SET username='carina.lang',     email='carina.lang@makerspace.demo',     isEmailVerified=1, canManageResources=0, creditBalance=410,  deletedAt=NULL WHERE id=6;
UPDATE "user" SET username='max.fischer',     email='max.fischer@makerspace.demo',     isEmailVerified=1, canManageResources=0, creditBalance=1120, deletedAt=NULL WHERE id=7;
UPDATE "user" SET username='lea.richter',     email='lea.richter@makerspace.demo',     isEmailVerified=1, canManageResources=0, creditBalance=80,   deletedAt=NULL WHERE id=8;
UPDATE "user" SET username='paul.neumann',    email='paul.neumann@makerspace.demo',    isEmailVerified=1, canManageResources=0, creditBalance=560,  deletedAt=NULL WHERE id=9;
UPDATE "user" SET username='marie.krause',    email='marie.krause@makerspace.demo',    isEmailVerified=1, canManageResources=0, creditBalance=1750, deletedAt=NULL WHERE id=10;

-- ---------- RESOURCES: the five requested machines + door + extras ----------
UPDATE resource SET name='Werkstatt-Tür', type='door',
  description='Hauptzugang zur Werkstatt. Entriegelung per NFC-Karte für eingewiesene Mitglieder.',
  imageFilename=NULL, deletedAt=NULL WHERE id=1;
UPDATE resource SET name='3D-Drucker Prusa MK4S', type='machine',
  description='FDM-3D-Drucker, 250×210×220 mm Bauraum. Einweisung erforderlich. Filament: PLA, PETG, ASA.',
  deletedAt=NULL WHERE id=2;
UPDATE resource SET name='Lasercutter Epilog Fusion Pro', type='machine',
  description='CO₂-Lasercutter 120 W, Arbeitsfläche 810×510 mm. Nur mit Einweisung und Materialfreigabe.',
  deletedAt=NULL WHERE id=3;
UPDATE resource SET name='CNC-Fräse Stepcraft D.840', type='machine',
  description='3-Achs-CNC-Portalfräse, Arbeitsbereich 600×840 mm. Für Holz, Kunststoff und Aluminium.',
  deletedAt=NULL WHERE id=4;

INSERT INTO resource (id, name, description, type, supervisionMode, allowTakeOver, createdAt, updatedAt) VALUES
 (5, 'Kreissäge Bosch GTS 635-216', 'Tisch-Kreissäge mit Schiebeschlitten. Sicherheitseinweisung zwingend erforderlich.', 'machine', 'introduction_required', 0, datetime('now','-220 days'), datetime('now','-3 days')),
 (6, 'Standbohrmaschine Optimum B24H', 'Säulenbohrmaschine bis Ø24 mm, MK2-Aufnahme. Für Metall- und Holzbearbeitung.', 'machine', 'introduction_required', 0, datetime('now','-200 days'), datetime('now','-5 days')),
 (7, 'Lötstation Weller WT1010', 'Digitale Lötstation 95 W mit Heißluft. Frei nutzbar für Elektronikprojekte.', 'machine', 'supervision_allowed', 1, datetime('now','-180 days'), datetime('now','-12 days')),
 (8, 'Vinyl-Schneideplotter Roland GS-24', 'Schneideplotter für Folien und Aufkleber bis 700 mm Breite.', 'machine', 'introduction_required', 0, datetime('now','-160 days'), datetime('now','-8 days'));

-- ---------- GROUPS ----------
UPDATE resource_group SET name='Holzwerkstatt', description='Sägen, Fräsen und Bohren für die Holzbearbeitung.', isHidden=0 WHERE id=1;
INSERT INTO resource_group (id, name, description, isHidden, createdAt, updatedAt) VALUES
 (2, 'Metallwerkstatt', 'Maschinen für die spanende Metallbearbeitung.', 0, datetime('now','-210 days'), datetime('now','-4 days')),
 (3, 'Digitale Fertigung', 'Lasercutter, 3D-Druck und CNC – vom Modell zum Werkstück.', 0, datetime('now','-210 days'), datetime('now','-2 days')),
 (4, 'Elektroniklabor', 'Löten, Messen und Prototyping für Elektronikprojekte.', 0, datetime('now','-150 days'), datetime('now','-9 days'));

DELETE FROM resource_groups_resource_group;
INSERT INTO resource_groups_resource_group (resourceId, resourceGroupId) VALUES
 (4,1),(5,1),(6,1),          -- Holzwerkstatt
 (4,2),(6,2),                -- Metallwerkstatt
 (2,3),(3,3),(4,3),(8,3),    -- Digitale Fertigung
 (7,4);                      -- Elektroniklabor

-- ---------- BELEGT: active usage session on the Lasercutter ----------
INSERT INTO resource_usage (resourceId, userId, startTime, startNotes, usageAction, isFinalized)
VALUES (3, 4, datetime('now','-26 minutes'), 'Acrylglas-Gehäuse, 3 mm', 'usage', 0);

-- ---------- GESPERRT: active maintenance on the CNC-Fräse ----------
INSERT INTO resource_maintenance (createdAt, updatedAt, startTime, endTime, reason, resourceId, createdByUserId)
VALUES (datetime('now','-3 hours'), datetime('now','-3 hours'), datetime('now','-3 hours'), NULL,
        'Spindel-Lager wird getauscht – voraussichtlich bis morgen Mittag.', 4, 2);

-- ---------- Spread historical usage across the machine fleet for analytics ----------
UPDATE resource_usage
SET resourceId = CASE (id % 6)
  WHEN 0 THEN 2 WHEN 1 THEN 3 WHEN 2 THEN 4
  WHEN 3 THEN 5 WHEN 4 THEN 6 ELSE 8 END
WHERE usageAction = 'usage' AND endTime IS NOT NULL;

-- ---------- Maintenance schedules (Wartungsplanung / Erinnerungen) ----------
DELETE FROM resource_maintenance_schedule_time_interval_config;
DELETE FROM resource_maintenance_schedule_usage_count_config;
DELETE FROM resource_maintenance_schedule_usage_hours_config;
DELETE FROM resource_maintenance_schedule;
INSERT INTO resource_maintenance_schedule (id, resourceId, name, triggerType, enabled, createdAt, updatedAt) VALUES
 (1, 3, 'Linsenreinigung & Spiegel prüfen', 'TIME_INTERVAL', 1, datetime('now','-90 days'), datetime('now','-10 days')),
 (2, 3, 'Großer Service (Optik & Achsen)',   'USAGE_HOURS',   1, datetime('now','-90 days'), datetime('now','-10 days')),
 (3, 2, 'Düse & Druckbett kontrollieren',    'USAGE_COUNT',   1, datetime('now','-80 days'), datetime('now','-6 days')),
 (4, 5, 'Sägeblatt-Wechsel & Schärfung',     'USAGE_HOURS',   1, datetime('now','-70 days'), datetime('now','-7 days')),
 (5, 4, 'Achsen schmieren',                  'TIME_INTERVAL', 1, datetime('now','-60 days'), datetime('now','-5 days'));
INSERT INTO resource_maintenance_schedule_time_interval_config (scheduleId, duration, unit) VALUES (1, 30, 'DAYS'), (5, 14, 'DAYS');
INSERT INTO resource_maintenance_schedule_usage_hours_config  (scheduleId, duration, unit) VALUES (2, 100, 'HOURS'), (4, 40, 'HOURS');
INSERT INTO resource_maintenance_schedule_usage_count_config  (scheduleId, thresholdSessions) VALUES (3, 50);

-- ---------- Introductions (Einweisungsnachweise / Schulungs-Doku) ----------
UPDATE resource_introduction SET tutorUserId=1 WHERE id=1;
INSERT INTO resource_introduction (resourceId, receiverUserId, tutorUserId, completedAt, createdAt) VALUES
 (3, 4,  1, datetime('now','-40 days'), datetime('now','-40 days')),
 (3, 6,  5, datetime('now','-33 days'), datetime('now','-33 days')),
 (3, 7,  1, datetime('now','-21 days'), datetime('now','-21 days')),
 (2, 3,  5, datetime('now','-55 days'), datetime('now','-55 days')),
 (2, 9,  1, datetime('now','-18 days'), datetime('now','-18 days')),
 (5, 4,  2, datetime('now','-60 days'), datetime('now','-60 days')),
 (5, 10, 2, datetime('now','-14 days'), datetime('now','-14 days')),
 (6, 7,  2, datetime('now','-50 days'), datetime('now','-50 days')),
 (8, 6,  5, datetime('now','-28 days'), datetime('now','-28 days'));

-- ---------- Introducers / maintainers ----------
DELETE FROM resource_introducer;
INSERT INTO resource_introducer (resourceId, userId, type, grantedAt) VALUES
 (3, 1, 'introducer', datetime('now','-120 days')),
 (3, 5, 'maintainer', datetime('now','-120 days')),
 (2, 5, 'introducer', datetime('now','-110 days')),
 (4, 2, 'maintainer', datetime('now','-100 days')),
 (5, 2, 'introducer', datetime('now','-95 days')),
 (6, 2, 'introducer', datetime('now','-95 days'));

-- ---------- Billing config so credits/billing views look real ----------
DELETE FROM resource_billing_configuration;
INSERT INTO resource_billing_configuration (resourceId, creditsPerUsage, creditsPerMinute, createdAt, updatedAt) VALUES
 (3, 50, 5, datetime('now','-120 days'), datetime('now','-10 days')),
 (4, 30, 4, datetime('now','-100 days'), datetime('now','-10 days')),
 (8, 20, 2, datetime('now','-90 days'),  datetime('now','-10 days'));

COMMIT;
PRAGMA foreign_keys = ON;
