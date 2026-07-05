import Fastify from "fastify";
import { testConnection } from "./postgres_connect";
import { initDatabase } from "./init_db";

const fastify = Fastify({
    logger: true,
});

fastify.get("/health", async (_, reply) => {
    return reply
        .code(200)
        .type("text/plain")
        .send("Hello, Kiln Is Alive");
});

const start = async () => {
    try {
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