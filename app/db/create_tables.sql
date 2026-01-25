
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


CREATE TABLE IF NOT EXISTS events (
    id UUID DEFAULT uuid_generate_v4() NOT NULL PRIMARY KEY,
    event_name TEXT NOT NULL UNIQUE,
    event_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    total_tickets INTEGER NOT NULL,
    price REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL,
    ticket_status TEXT NOT NULL,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);