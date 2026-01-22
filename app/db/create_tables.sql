
CREATE TABLE IF NOT EXISTS Events (
    id INTEGER PRIMARY KEY,
    event_name TEXT NOT NULL,
    event_date TIMESTAMP NOT NULL,
    total_tickets INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS Tickets (
    id INTEGER PRIMARY KEY,
    event_id INTEGER NOT NULL,
    ticket_status TEXT NOT NULL,
    price REAL NOT NULL,
    FOREIGN KEY (event_id) REFERENCES Events(id) ON DELETE CASCADE
);