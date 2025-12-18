"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.closeConnection = exports.client = exports.db = void 0;
const postgres_js_1 = require("drizzle-orm/postgres-js");
const postgres_1 = __importDefault(require("postgres"));
const dotenv = __importStar(require("dotenv"));
const schema = __importStar(require("./schema"));
// Ensure environment variables are loaded
dotenv.config();
const getConnectionString = () => {
    return process.env.DATABASE_URL;
};
// Create postgres client with connection pooling for self-hosted environment
const client = (0, postgres_1.default)(getConnectionString(), {
    max: 20, // Maximum number of connections in the pool
    idle_timeout: 20, // Close connections after 20 seconds of inactivity
    max_lifetime: 60 * 30, // Maximum lifetime of a connection (30 minutes)
    connect_timeout: 60,
});
exports.client = client;
// Create Drizzle database instance
exports.db = (0, postgres_js_1.drizzle)(client, { schema });
// Graceful shutdown helper
const closeConnection = async () => {
    try {
        await client.end();
        console.log("Database connection closed successfully");
    }
    catch (error) {
        console.error("Error closing database connection:", error);
    }
};
exports.closeConnection = closeConnection;
exports.default = exports.db;
//# sourceMappingURL=connection.js.map