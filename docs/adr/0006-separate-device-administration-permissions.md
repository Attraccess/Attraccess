# Separate device administration permissions

Matter and Thread administration receive dedicated read, manage, commission, direct-command, and network-management permissions rather than inheriting broad resource-management authority. MQTT server administration will adopt the same read/manage split as related work; existing roles and API tokens that currently receive MQTT administration through `resources.update` will be migrated to preserve their effective access.
