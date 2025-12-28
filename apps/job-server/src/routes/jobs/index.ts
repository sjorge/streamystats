import { Hono } from "hono";
import serverRoutes from "./servers";
import embeddingRoutes from "./embeddings";
import queueRoutes from "./queue";
import statusRoutes from "./status";
import schedulerRoutes from "./scheduler";
import maintenanceRoutes from "./maintenance";
import inferWatchtimeRoutes from "./infer-watchtime";

const app = new Hono();

app.route("/", serverRoutes);
app.route("/", embeddingRoutes);
app.route("/", queueRoutes);
app.route("/", statusRoutes);
app.route("/", schedulerRoutes);
app.route("/", maintenanceRoutes);
app.route("/", inferWatchtimeRoutes);

export default app;
