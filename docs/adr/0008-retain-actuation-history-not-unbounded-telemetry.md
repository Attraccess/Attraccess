# Retain actuation history, not unbounded telemetry

Attraccess will persist current Reported State and Actuation History, including commands, lock operations, faults, commissioning, fabric changes, externally observed security changes, and OTA outcomes. High-frequency environmental and energy reports feed flows, current state, and metrics but are not retained as an unlimited Matter event archive.
