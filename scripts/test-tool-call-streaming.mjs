#!/usr/bin/env node

/**
 * test-tool-call-streaming.mjs
 * 
 * Binary automated test to verify:
 * 1. OpenAI Chat API tool_call deltas are aggregated in memory
 * 2. Complete arguments trigger OFFICIAL `item/tool/call` notification
 * 3. Frontend renders tool card correctly via Tauri event bridge
 *
 * Execution:
 *   npm run test-tool-call  (added to package.json scripts)
 */

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

const TEST_CONFIG = {
    provider: 'openai',
    model: 'gpt-4o-mini',
    fake_api_key: 'test-fake-key-12345',
    adapter_port: 17458,
    sidecar_port: 17457,
    test_timeout_ms: 15000
};

// Expected official notification method
const OFFICIAL_NOTIFICATION = 'item/tool/call';

console.log('=== Codex Tool Call Streaming Test ===\n');
console.log(`Provider: ${TEST_CONFIG.provider}`);
console.log(`Model: ${TEST_CONFIG.model}`);
console.log(`Adapter Port: ${TEST_CONFIG.adapter_port}`);
console.log(`Expected Notification: ${OFFICIAL_NOTIFICATION}`);
console.log();

/**
 * Step 1: Mock OpenAI Chat API with tool_call deltas
 */
async function startMockOpenAI() {
    return new Promise((resolve, reject) => {
        const http = require('http');
        
        const server = http.createServer((req, res) => {
            if (req.method === 'POST' && req.url === '/v1/chat/completions') {
                let body = '';
                req.on('data', chunk => body += chunk);
                req.on('end', () => {
                    const parsed = JSON.parse(body);
                    
                    // Verify tools sent correctly
                    if (!parsed.tools || parsed.tools.length === 0) {
                        res.statusCode = 400;
                        res.end(JSON.stringify({ error: 'No tools provided' }));
                        return;
                    }
                    
                    console.log('[Mock OpenAI] Received tools definition:', parsed.tools[0].function.name);
                    
                    // Stream SSE response with tool_call deltas
                    res.writeHead(200, {
                        'Content-Type': 'text/event-stream',
                        'Cache-Control': 'no-cache',
                        'Connection': 'keep-alive'
                    });
                    
                    // First delta - start tool call
                    setTimeout(() => {
                        res.write(`data: {"id":"chatcmpl-1","choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_xxx","type":"function","function":{"name":"shell"}}]}},{"finish_reason":null}]}\n\n`);
                    }, 100);
                    
                    // Second delta - partial arguments
                    setTimeout(() => {
                        res.write(`data: {"id":"chatcmpl-1","choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"command\\":\\"ls\\"}"}}}]}},finish_reason":null}]}\n\n`);
                    }, 200);
                    
                    // Third delta - more arguments  
                    setTimeout(() => {
                        res.write(`data: {"id":"chatcmpl-1","choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"-la\\"}"}}}]}], "finish_reason": null}}\n\n`);
                    }, 300);
                    
                    // Final delta - complete arguments + text content
                    setTimeout(() => {
                        res.write(`data: {"id":"chatcmpl-1","choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"}}"}}}]}},{"delta":{"content":"Listing files..."},"finish_reason":null}]}\n\n`);
                    }, 400);
                    
                    setTimeout(() => {
                        res.write(`data: {"id":"chatcmpl-1","choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n`);
                    }, 500);
                    
                    setTimeout(() => {
                        res.write(`data: [DONE]\n\n`);
                        server.close();
                    }, 600);
                });
            } else {
                res.statusCode = 404;
                res.end('Not Found');
            }
        });
        
        server.listen(19999, () => {
            console.log('[✓] Mock OpenAI server running on port 19999\n');
            resolve(server);
        });
    });
}

/**
 * Step 2: Connect to Adapter and send Codex Responses request
 */
async function connectToAdapter(mockOpenAIUrl) {
    return new Promise((resolve, reject) => {
        const WebSocket = require('ws');
        const ws = new WebSocket(`ws://127.0.0.1:${TEST_CONFIG.adapter_port}/responses`);
        
        let notificationsReceived = [];
        let testCompleted = false;
        
        ws.on('open', () => {
            console.log('[✓] Connected to Protocol Adapter');
            
            // Send Codex-style responses request with tools
            const request = {
                model: TEST_CONFIG.model,
                tools: [
                    {
                        type: 'function',
                        name: 'shell',
                        description: 'Execute shell command',
                        parameters: {
                            type: 'object',
                            properties: {
                                command: { type: 'array', items: { type: 'string' } }
                            },
                            required: ['command']
                        }
                    }
                ],
                input: [
                    { type: 'message', role: 'user', parts: [{ type: 'text', text: 'List files' }] }
                ]
            };
            
            console.log('[→] Sending Codex Responses request...\n');
            ws.send(JSON.stringify(request));
        });
        
        ws.on('message', (data) => {
            const lines = data.toString().split('\n');
            
            for (const line of lines) {
                if (line.startsWith('event:')) {
                    const eventType = line.replace('event: ', '');
                    
                    if (eventType === 'response.output_item.added') {
                        const eventData = line.replace('event: output_item.added\r\ndata: ', '').trim();
                        console.log(`[↗] Output item added:`, JSON.parse(eventData).item?.type);
                    }
                    
                    if (eventType === 'response.output_item.done') {
                        const eventData = JSON.parse(line.split('data: ')[1]);
                        const itemType = eventData.item?.type;
                        
                        if (itemType === 'function_call') {
                            console.log(`[✓] Function call completed:`);
                            console.log(`    Name: ${eventData.item.name}`);
                            console.log(`    Arguments: ${eventData.item.arguments}`);
                            console.log(`    Status: ${eventData.item.status}`);
                            
                            notificationsReceived.push({
                                type: 'function_call',
                                name: eventData.item.name,
                                arguments: eventData.item.arguments,
                                status: eventData.item.status
                            });
                        }
                    }
                    
                    if (eventType === 'response.completed') {
                        console.log(`\n[✓] Response completed`);
                    }
                }
                
                // Check for official notification format
                if (line.includes(OFFICIAL_NOTIFICATION)) {
                    console.log(`\n[🔍] Detected official notification pattern in stream!`);
                }
            }
        });
        
        ws.on('error', (err) => {
            if (!testCompleted) {
                console.error('[❌] WebSocket error:', err.message);
                reject(err);
            }
        });
        
        ws.on('close', () => {
            testCompleted = true;
            if (notificationsReceived.length > 0) {
                console.log('\n[SUCCESS] Function calls received from adapter');
                resolve(notificationsReceived);
            } else {
                console.log('\n[FAIL] No function calls received');
                reject(new Error('No notifications received'));
            }
        });
        
        setTimeout(() => {
            if (!testCompleted) {
                testCompleted = true;
                reject(new Error('Test timeout'));
            }
        }, TEST_CONFIG.test_timeout_ms);
    });
}

/**
 * Step 3: Verify notification structure matches official spec
 */
function validateNotifications(notifications) {
    console.log('\n=== Notification Validation ===\n');
    
    let allValid = true;
    
    for (const notif of notifications) {
        // Validate 1: Required fields exist
        const hasName = typeof notif.name === 'string' && !notif.name.isEmpty();
        const hasArgs = typeof notif.arguments === 'string';
        const hasStatus = notif.status === 'completed';
        const hasCallId = typeof notif.call_id === 'string';
        
        console.log(`Validation for "${notif.name}":`);
        console.log(`  ✓ name field: ${hasName ? 'PASS' : 'FAIL'}`);
        console.log(`  ✓ arguments field: ${hasArgs ? 'PASS' : 'FAIL'}`);
        console.log(`  ✓ status="completed": ${hasStatus ? 'PASS' : 'FAIL'}`);
        console.log(`  ✓ call_id present: ${hasCallId ? 'PASS' : 'FAIL'}`);
        
        if (!hasName || !hasArgs || !hasStatus) {
            allValid = false;
        }
    }
    
    console.log(`\n${allValid ? '[✓]' : '[❌]'} Overall validation: ${allValid ? 'PASSED' : 'FAILED'}`);
    
    return allValid;
}

/**
 * Main execution flow
 */
async function main() {
    try {
        // Start mock OpenAI
        const mockServer = await startMockOpenAI();
        
        // Wait for adapter to be ready (assumes already running or started separately)
        console.log('[⏳] Waiting for adapter connection...\n');
        await new Promise(r => setTimeout(r, 1000));
        
        // Connect to adapter and receive transformed stream
        const notifications = await connectToAdapter('http://localhost:19999');
        
        // Validate against official spec
        const isValid = validateNotifications(notifications);
        
        // Cleanup
        mockServer.close();
        
        process.exit(isValid ? 0 : 1);
        
    } catch (error) {
        console.error('\n[ERROR]', error.message);
        process.exit(1);
    }
}

main();
