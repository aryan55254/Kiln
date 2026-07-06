import Fastify from "fastify";
import { testConnection, db } from "./postgres_connect";
import { initDatabase } from "./init_db";
import fastifyRawBody from "fastify-raw-body";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { Push, PR, normalized_payload } from "../types/github.types";

import dotenv from "dotenv";

const fastify = Fastify({
    logger: true,
});

// general health check for the api 
fastify.get("/health", async (_, reply) => {
    return reply
        .code(200)
        .type("text/plain")
        .send("Hello, Kiln Is Alive");
});

/*
1. Verify the GitHub webhook signature using SHA256.
2. Read delivery ID and check whether the webhook has already been processed. Duplicate deliveries are ignored.
3. Validate the GitHub event type.
4. Parse the webhook payload and normalize repository/commit data.
5. Persist the delivery and CI job in PostgreSQL.
*/
fastify.post("/webhooks/github", { config: { rawBody: true, }, }, async (request, reply) => {

    const rawSignature = request.headers['x-hub-signature-256'];

    const githubSignature: string = Array.isArray(rawSignature)
        ? rawSignature[0]
        : (rawSignature || '');

    if (!githubSignature) {
        return reply
            .code(401)
            .send({ error: "Missing signature" });
    }

    const rawBody = request.rawBody;

    if (!rawBody) {
        return reply
            .code(400)
            .send({ error: "Missing raw body" });
    }


    const verifier = process.env.GITHUB_VERIFIER;

    if (!verifier) {
        throw new Error("GITHUB_VERIFIER is not configured");
    }

    const expectedSignature =
        "sha256=" + createHmac("sha256", verifier)
            .update(rawBody)
            .digest("hex");

    const githubSignatureBuffer = Buffer.from(githubSignature, 'utf-8');
    const trustedBuffer = Buffer.from(expectedSignature, 'utf-8');

    if (trustedBuffer.length !== githubSignatureBuffer.length) {
        return reply.code(401).send({ error: 'Unauthorized' });
    }

    if (!timingSafeEqual(trustedBuffer, githubSignatureBuffer)) {
        return reply.code(401).send({ error: 'Unauthorized' });
    }

    const rawDeliveryID = request.headers["x-github-delivery"];

    const deliveryId = Array.isArray(rawDeliveryID)
        ? rawDeliveryID[0]
        : rawDeliveryID;

    if (!deliveryId) {
        return reply
            .code(400)
            .send({ error: "Missing GitHub delivery ID" });
    }

    const existingDelivery = await db.query(
        `
    SELECT delivery_id
    FROM webhook_deliveries
    WHERE delivery_id = $1
    `,
        [deliveryId]
    );

    if (existingDelivery.rowCount !== 0) {
        return reply.code(200).send({
            success: true,
            duplicate: true,
        });
    }

    const rawEvent = request.headers["x-github-event"];

    const event = Array.isArray(rawEvent)
        ? rawEvent[0]
        : rawEvent;

    if (!event) {
        return reply.code(400).send({
            error: "Missing GitHub event type",
        });
    }

    if (event !== "push" && event !== "pull_request") {
        return reply.code(200).send({
            success: true,
            ignored: true,
        });

    }

    let normalizedPayload: normalized_payload;

    if (event === "push") {
        const body = request.body as Push;

        normalizedPayload = {
            eventType: "push",
            repoName: body.repository.name,
            repoOwner: body.repository.owner.login,
            branch: body.ref.replace("refs/heads/", ""),
            commitSha: body.after,
        };
    } else {
        const body = request.body as PR;

        normalizedPayload = {
            eventType: "pull_request",
            repoName: body.repository.name,
            repoOwner: body.repository.owner.login,
            branch: body.pull_request.head.ref,
            commitSha: body.pull_request.head.sha,
        };
    }

    const client = await db.connect();

    try {
        const job_uuid = randomUUID();
        const jobqueryText = `INSERT INTO jobs (id , repo_owner , repo_name , branch , commit_sha , event_type , status)
        VALUES($1, $2, $3 , $4 , $5 , $6 , 'awaiting_source')` ;
        const jobvalues = [job_uuid, normalizedPayload.repoOwner, normalizedPayload.repoName, normalizedPayload.branch, normalizedPayload.commitSha, normalizedPayload.eventType];

        const deliveryqueryText = `INSERT INTO webhook_deliveries (delivery_id , job_id) VALUES($1 , $2)`
        const deliveryvalues = [deliveryId, job_uuid];


        await client.query('BEGIN');
        await client.query(jobqueryText, jobvalues);
        await client.query(deliveryqueryText, deliveryvalues);
        await client.query('COMMIT');
        console.log('Transaction successful! All data saved.');

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Transaction failed. Database rolled back.');
        throw error;
    }
    finally {
        client.release();
    }

    return reply.code(200).send("Job Persisted");
})

// start the api gateway 
const start = async () => {
    try {

        await fastify.register(fastifyRawBody, {
            field: "rawBody",
            global: false,
            encoding: false,
            runFirst: true,
        });

        await testConnection(); // db connection
        await initDatabase();   // db initiazation

        // server start

        await fastify.listen({
            port: 3000,
            host: "0.0.0.0",
        });

    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();