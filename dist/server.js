"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createServer = createServer;
const node_cluster_1 = __importDefault(require("node:cluster"));
const node_http_1 = __importDefault(require("node:http"));
const config_schema_1 = require("./config-schema");
const server_schema_1 = require("./server-schema");
const server_schema_2 = require("./server-schema");
function createServer(config) {
    return __awaiter(this, void 0, void 0, function* () {
        const { workerCount, port } = config;
        if (node_cluster_1.default.isPrimary) {
            console.log("the master process is up and running");
            for (let i = 0; i < workerCount; i++) {
                node_cluster_1.default.fork({ config: JSON.stringify(config.config) });
                console.log(`Master process: the worker node    ${i} has started.`);
            }
            const server = node_http_1.default.createServer((req, res) => {
                const workers = Object.values(node_cluster_1.default.workers || {});
                if (workers.length === 0) {
                    res.writeHead(500);
                    res.end('No workers available');
                    return;
                }
                const index = Math.floor(Math.random() * workers.length);
                const worker = workers[index];
                let body = '';
                req.on('data', chunk => {
                    body += chunk.toString();
                });
                req.on('end', () => {
                    const payload = {
                        requestType: 'HTTP',
                        headers: req.headers,
                        body: body || null,
                        url: req.url || ''
                    };
                    const messageHandler = (workerReply) => __awaiter(this, void 0, void 0, function* () {
                        try {
                            const reply = yield server_schema_2.workerMessageReplySchema.parseAsync(JSON.parse(workerReply));
                            if (reply.errorCode) {
                                res.writeHead(parseInt(reply.errorCode));
                                res.end(reply.error);
                            }
                            else {
                                res.writeHead(200);
                                res.end(reply.data);
                            }
                            worker.removeListener('message', messageHandler);
                        }
                        catch (error) {
                            res.writeHead(500);
                            res.end('Internal Server Error');
                            console.error('Error processing worker reply:', error);
                        }
                    });
                    worker.send(JSON.stringify(payload));
                    worker.on('message', messageHandler);
                });
            });
            server.listen(port, () => {
                console.log(`The server is listening on port ${port}`);
            });
        }
        else {
            console.log(`Worker node.... `, process.env.config);
            const config = yield config_schema_1.rootConfigSchema.parseAsync(JSON.parse(`${process.env.config}`));
            process.on('message', (message) => __awaiter(this, void 0, void 0, function* () {
                var _a, _b, _c;
                try {
                    const messageValidated = yield server_schema_1.workerMessageSchema.parseAsync(JSON.parse(message));
                    const requestURL = messageValidated.url;
                    const rule = config.server.rules.find(e => e.path === requestURL);
                    if (!rule) {
                        const reply = {
                            errorCode: '404',
                            error: `Rule not found for path: ${requestURL}`
                        };
                        return (_a = process.send) === null || _a === void 0 ? void 0 : _a.call(process, JSON.stringify(reply));
                    }
                    const upstreamID = rule.upstreams[0];
                    const upstream = config.server.upstreams.find(e => e.id === upstreamID);
                    if (!upstream) {
                        const reply = {
                            errorCode: '500',
                            error: `Upstream not found for rule: ${requestURL}`
                        };
                        return (_b = process.send) === null || _b === void 0 ? void 0 : _b.call(process, JSON.stringify(reply));
                    }
                    const request = node_http_1.default.request({
                        host: upstream.url,
                        path: requestURL
                    }, (proxyRes) => {
                        let body = '';
                        proxyRes.on('data', (chunk) => {
                            body += chunk;
                        });
                        proxyRes.on('end', () => {
                            var _a;
                            const reply = {
                                data: body
                            };
                            (_a = process.send) === null || _a === void 0 ? void 0 : _a.call(process, JSON.stringify(reply));
                        });
                    });
                    request.on('error', (error) => {
                        var _a;
                        const reply = {
                            errorCode: '500',
                            error: `Proxy request failed: ${error.message}`
                        };
                        (_a = process.send) === null || _a === void 0 ? void 0 : _a.call(process, JSON.stringify(reply));
                    });
                    request.end();
                }
                catch (error) {
                    console.error('Error processing message:', error);
                    const reply = {
                        errorCode: '500',
                        error: `Internal server error: ${error instanceof Error ? error.message : 'Unknown error'}`
                    };
                    (_c = process.send) === null || _c === void 0 ? void 0 : _c.call(process, JSON.stringify(reply));
                }
            }));
        }
    });
}
