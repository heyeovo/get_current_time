import express from 'express';
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const app = express();
app.use(express.json());

const server = new Server(
  { name: "cloud-time-server", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_current_time",
      description: "获取当前的北京时间（GMT+8）与日期",
      inputSchema: { type: "object", properties: {} }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "get_current_time") {
    const formatter = new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false
    });
    const nowStr = formatter.format(new Date());
    return {
      content: [{ type: "text", text: `当前北京时间: ${nowStr} (时区: Asia/Shanghai)` }]
    };
  }
  throw new Error("Tool not found");
});

let transport = null;

app.get('/sse', async (req, res) => {
  // 🔑 关键：先关闭旧连接，避免重复连接错误
  if (transport) {
    try {
      await transport.close();
    } catch (e) {
      // 忽略关闭时的错误
    }
    transport = null;
  }

  transport = new SSEServerTransport('/messages', res);
  try {
    await server.connect(transport);
    // 监听客户端断开，清理 transport
    req.on('close', () => {
      if (transport) {
        transport.close().catch(() => {});
        transport = null;
      }
    });
  } catch (err) {
    console.error('SSE connection error:', err);
    if (!res.headersSent) {
      res.status(500).send('SSE connection failed');
    }
    transport = null;
  }
});

app.post('/messages', async (req, res) => {
  if (transport) {
    try {
      await transport.handleMessage(req, res);
    } catch (err) {
      console.error('Message handling error:', err);
      if (!res.headersSent) {
        res.status(500).send('Message handling failed');
      }
    }
  } else {
    res.status(400).send('No active SSE session');
  }
});

app.get('/', (req, res) => {
  res.send('MCP time server is running');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});