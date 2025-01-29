import cluster from 'node:cluster'
import http from 'node:http'
import { Worker } from 'node:cluster'
import { ConfigSchemaType, rootConfigSchema } from './config-schema'
import { WorkerMessageType, workerMessageSchema } from './server-schema'
import { WorkerMessageReplyType, workerMessageReplySchema } from './server-schema'

interface CreateServerConfig {
    port: number
    workerCount: number
    config: ConfigSchemaType
}

export async function createServer(config: CreateServerConfig) {
    const { workerCount, port } = config

    if (cluster.isPrimary) {
        console.log("the master process is up and running")
        
        for (let i = 0; i < workerCount; i++) {
            cluster.fork({ config: JSON.stringify(config.config) })
            console.log(`Master process: the worker node    ${i} has started.`)
        }

        const server = http.createServer((req, res) => {
            const workers = Object.values(cluster.workers || {})
            if (workers.length === 0) {
                res.writeHead(500)
                res.end('No workers available')
                return
            }

            const index = Math.floor(Math.random() * workers.length)
            const worker = workers[index] as Worker

            let body = ''
            req.on('data', chunk => {
                body += chunk.toString()
            })

            req.on('end', () => {
                const payload: WorkerMessageType = {
                    requestType: 'HTTP',
                    headers: req.headers,
                    body: body || null,
                    url: req.url || ''
                }
                
                const messageHandler = async (workerReply: string) => {
                    try {
                        const reply = await workerMessageReplySchema.parseAsync(JSON.parse(workerReply))
                        if (reply.errorCode) {
                            res.writeHead(parseInt(reply.errorCode))
                            res.end(reply.error)
                        } else {
                            res.writeHead(200)
                            res.end(reply.data)
                        }
                        worker.removeListener('message', messageHandler)
                    } catch (error) {
                        res.writeHead(500)
                        res.end('Internal Server Error')
                        console.error('Error processing worker reply:', error)
                    }
                }

                worker.send(JSON.stringify(payload))
                worker.on('message', messageHandler)
            })
        })

        server.listen(port, () => {
            console.log(`The server is listening on port ${port}`)
        })

    } else {
        console.log(`Worker node.... `, process.env.config)
        const config = await rootConfigSchema.parseAsync(JSON.parse(`${process.env.config}`))
        
        process.on('message', async (message: string) => {
            try {
                const messageValidated = await workerMessageSchema.parseAsync(JSON.parse(message))
                const requestURL = messageValidated.url
                const rule = config.server.rules.find(rule => {
                    if (rule.path === '/') {
                        return requestURL === '/' || requestURL === ''
                    }
                    const cleanPath = rule.path.replace(/\/+$/, '')
                    return requestURL === cleanPath || requestURL.startsWith(cleanPath + '/')
                })
                
                if (!rule) {
                    const reply: WorkerMessageReplyType = {
                        errorCode: '404',
                        error: `Rule not found for path: ${requestURL}`
                    }
                    return process.send?.(JSON.stringify(reply))
                }

                const upstreamID = rule.upstreams[0]
                const upstream = config.server.upstreams.find(e => e.id === upstreamID)
                
                if (!upstream) {
                    const reply: WorkerMessageReplyType = {
                        errorCode: '500',
                        error: `Upstream not found for rule: ${requestURL}`
                    }
                    return process.send?.(JSON.stringify(reply))
                }

                const request = http.request({
                    host: upstream.url, 
                    path: requestURL
                }, (proxyRes) => {
                    let body = ''
                    proxyRes.on('data', (chunk) => {
                        body += chunk
                    })
                    proxyRes.on('end', () => {
                        const reply: WorkerMessageReplyType = {
                            data: body
                        }
                        process.send?.(JSON.stringify(reply))
                    })
                })

                request.on('error', (error) => {
                    const reply: WorkerMessageReplyType = {
                        errorCode: '500',
                        error: `Proxy request failed: ${error.message}`
                    }
                    process.send?.(JSON.stringify(reply))
                })

                request.end()
            } catch (error) {
                console.error('Error processing message:', error)
                const reply: WorkerMessageReplyType = {
                    errorCode: '500',
                    error: `Internal server error: ${error instanceof Error ? error.message : 'Unknown error'}`
                }
                process.send?.(JSON.stringify(reply))
            }
        })
    }
}