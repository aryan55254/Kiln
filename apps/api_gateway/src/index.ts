import Fastify from "fastify";
import { testConnection } from "./postgres_connect";
import { initDatabase } from "./init_db";
import fastifyRawBody from "fastify-raw-body";
import { createHmac, timingSafeEqual } from "node:crypto";
import dotenv from "dotenv";

const fastify = Fastify({
    logger: true,
});

fastify.get("/health", async (_, reply) => {
    return reply
        .code(200)
        .type("text/plain")
        .send("Hello, Kiln Is Alive");
});

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

    return { success: true };

})

const start = async () => {
    try {

        await fastify.register(fastifyRawBody, {
            field: "rawBody",
            global: false,
            encoding: false,
            runFirst: true,
        });

        await testConnection();
        await initDatabase();
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