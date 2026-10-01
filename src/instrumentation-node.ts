import { getDbHandle } from "./server/db";

getDbHandle().catch((err) => console.error("[db] inicialização falhou:", err));
