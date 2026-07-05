import { db } from "./postgres_connect";

const createTablesQuery = `
    CREATE TABLE IF NOT EXISTS jobs (
        id UUID PRIMARY KEY,

        repo_owner TEXT NOT NULL,
        repo_name TEXT NOT NULL,
        branch TEXT NOT NULL,
        commit_sha TEXT NOT NULL,

        event_type TEXT NOT NULL
        CHECK (
            event_type IN (
                'push',
                'pull_request'
            )
        ),

        status TEXT NOT NULL
        CHECK (
            status IN (
                'awaiting_source',
                'queued',
                'preparing',
                'fetching_source',
                'restoring_cache',
                'building',
                'testing',
                'uploading_artifacts',
                'publishing_status',
                'completed',
                'failed',
                'timed_out',
                'superseded'
            )
        ),

        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        started_at TIMESTAMPTZ,
        finished_at TIMESTAMPTZ
    );

     CREATE TABLE IF NOT EXISTS webhook_deliveries (
        delivery_id TEXT PRIMARY KEY,
        received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
`;

export async function initDatabase() {
    try {
        console.log("Running database migrations...");

        await db.query(createTablesQuery);

        console.log("Tables verified/created successfully.");
    } catch (error) {
        console.error("Error executing migration query:", error);
        throw error;
    }
}