# application-models

Backend-neutral models, enums and constants that the application, the HTTP/WebSocket contracts and the plugin SDK
share. Nothing here may import `typeorm`, a database driver or `@attraccess/database-entities`.

The PostgreSQL/TypeORM schema (entities, column types, indexes, subscribers) lives in `libs/database-entities` and imports
from this library, never the other way round. See `docs/development` for the ownership rules.
