# Do not retry ambiguous physical actuation

Attraccess will not automatically retry a physical Matter command when communication is lost before the outcome is known. It reconnects and reconciles Reported State, records an Uncertain Actuation, and lets an administrator-authored flow deliberately decide whether another command is safe; transport recovery must not create duplicate physical actions.
