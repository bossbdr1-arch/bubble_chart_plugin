const express = require('express');
const fetch = require('node-fetch').default;
const path = require('path');
const cors = require('cors');
const dotenv = require('dotenv');
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// 缓存 app_access_token
let cached = {
  token: null,
  expires_at: 0
};

// 获取 app_access_token
async function getAppAccessToken() {
  const now = Date.now();
  if (cached.token && cached.expires_at > now + 5000) {
    return cached.token;
  }

  const APP_ID = process.env.APP_ID;
  const APP_SECRET = process.env.APP_SECRET;
  
  if (!APP_ID || !APP_SECRET) {
    throw new Error('APP_ID and APP_SECRET must be set in .env file');
  }

  const url = 'https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal';
  const payload = {
    app_id: APP_ID,
    app_secret: APP_SECRET
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Failed to get access token: ${response.status} - ${errorBody}`);
    }

    const data = await response.json();
    const token = data.app_access_token;
    cached.token = token;
    cached.expires_at = Date.now() + (data.expire * 1000);
    return token;
  } catch (error) {
    console.error('Error getting access token:', error);
    throw error;
  }
}

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// 获取飞书表字段 API
app.get('/api/bitable/fields', async (req, res) => {
  try {
    const { app_token, table_id } = req.query;
    if (!app_token || !table_id) {
      return res.status(400).json({ error: 'app_token and table_id are required' });
    }

    const app_access_token = await getAppAccessToken();
    const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${encodeURIComponent(app_token)}/tables/${encodeURIComponent(table_id)}/fields`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${app_access_token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      let errorBody;
      try {
        errorBody = await response.json();
      } catch (e) {
        errorBody = await response.text();
      }
      return res.status(response.status).json({ 
        error: `HTTP Error: ${response.status}`, 
        details: errorBody 
      });
    }

    const data = await response.json();
    
    console.log('飞书API字段返回:', JSON.stringify(data, null, 2));
    
    let fields = [];
    
    // 处理飞书API返回结构
    if (data.code === 0 && data.data && data.data.items && Array.isArray(data.data.items)) {
      fields = data.data.items;
    } else if (data.code === 0 && data.data && data.data.fields && Array.isArray(data.data.fields)) {
      fields = data.data.fields;
    } else if (data.code === 0 && data.fields && Array.isArray(data.fields)) {
      fields = data.fields;
    } else if (data.code === 0 && data.data && Array.isArray(data.data)) {
      fields = data.data;
    } else {
      return res.status(500).json({
        error: `API Error: ${data.code || 'Unknown'}`,
        message: data.msg || 'Unknown error',
        details: data
      });
    }

    const resultFields = fields.map(field => ({
      id: field.field_id || field.id,
      name: field.field_name || field.name,
      type: field.field_type || field.type || 'unknown'
    }));
    
    res.json({ fields: resultFields });
  } catch (error) {
    console.error('Field API error:', error);
    res.status(500).json({ 
      error: 'Internal Server Error', 
      message: error.message 
    });
  }
});

// 获取飞书表格记录 API
app.get('/api/bitable/records', async (req, res) => {
  try {
    const { app_token, table_id, page_size = 500, page_token = '' } = req.query;
    if (!app_token || !table_id) {
      return res.status(400).json({ error: 'app_token and table_id are required' });
    }

    const app_access_token = await getAppAccessToken();
    let url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${encodeURIComponent(app_token)}/tables/${encodeURIComponent(table_id)}/records?page_size=${page_size}`;
    
    if (page_token) {
      url += `&page_token=${encodeURIComponent(page_token)}`;
    }

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${app_access_token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      let errorBody;
      try {
        errorBody = await response.json();
      } catch (e) {
        errorBody = await response.text();
      }
      return res.status(response.status).json({ 
        error: `HTTP Error: ${response.status}`, 
        details: errorBody 
      });
    }

    const data = await response.json();
    
    console.log('飞书API记录返回:', JSON.stringify(data, null, 2));
    
    let records = [];
    let total = 0;
    let has_more = false;
    let next_page_token = '';
    
    // 处理飞书API返回结构
    if (data.code === 0 && data.data) {
      records = data.data.items || data.data.records || [];
      total = data.data.total || records.length;
      has_more = data.data.has_more || false;
      next_page_token = data.data.page_token || '';
    } else {
      return res.status(500).json({
        error: `API Error: ${data.code || 'Unknown'}`,
        message: data.msg || 'Unknown error',
        details: data
      });
    }

    const resultRecords = records.map(record => ({
      record_id: record.record_id,
      fields: record.fields || {}
    }));
    
    res.json({ 
      records: resultRecords,
      total: total,
      has_more: has_more,
      page_token: next_page_token
    });
  } catch (error) {
    console.error('Records API error:', error);
    res.status(500).json({ 
      error: 'Internal Server Error', 
      message: error.message 
    });
  }
});

// 获取表格基本信息 API
app.get('/api/bitable/table-info', async (req, res) => {
  try {
    const { app_token, table_id } = req.query;
    if (!app_token || !table_id) {
      return res.status(400).json({ error: 'app_token and table_id are required' });
    }

    const app_access_token = await getAppAccessToken();
    
    // 获取表格信息
    const tableUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${encodeURIComponent(app_token)}/tables/${encodeURIComponent(table_id)}`;
    
    const tableResponse = await fetch(tableUrl, {
      headers: {
        'Authorization': `Bearer ${app_access_token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!tableResponse.ok) {
      let errorBody;
      try {
        errorBody = await tableResponse.json();
      } catch (e) {
        errorBody = await tableResponse.text();
      }
      return res.status(tableResponse.status).json({ 
        error: `HTTP Error: ${tableResponse.status}`, 
        details: errorBody 
      });
    }

    const tableData = await tableResponse.json();
    
    // 获取记录数量
    const recordsUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${encodeURIComponent(app_token)}/tables/${encodeURIComponent(table_id)}/records?page_size=1`;
    
    const recordsResponse = await fetch(recordsUrl, {
      headers: {
        'Authorization': `Bearer ${app_access_token}`,
        'Content-Type': 'application/json'
      }
    });

    let recordCount = 0;
    if (recordsResponse.ok) {
      const recordsData = await recordsResponse.json();
      if (recordsData.code === 0 && recordsData.data) {
        recordCount = recordsData.data.total || 0;
      }
    }

    let tableInfo = {};
    if (tableData.code === 0 && tableData.data) {
      tableInfo = {
        table_id: tableData.data.table_id || table_id,
        name: tableData.data.name || '未知表格',
        revision: tableData.data.revision || 0,
        record_count: recordCount
      };
    }
    
    res.json({ 
      table_info: tableInfo,
      app_token: app_token
    });
  } catch (error) {
    console.error('Table info API error:', error);
    res.status(500).json({ 
      error: 'Internal Server Error', 
      message: error.message 
    });
  }
});

// 获取应用信息 API
app.get('/api/app-info', async (req, res) => {
  try {
    const app_access_token = await getAppAccessToken();
    
    const url = 'https://open.feishu.cn/open-apis/application/v6/applications/batch_get_id';
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${app_access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        app_ids: [process.env.APP_ID]
      })
    });

    if (!response.ok) {
      let errorBody;
      try {
        errorBody = await response.json();
      } catch (e) {
        errorBody = await response.text();
      }
      return res.status(response.status).json({ 
        error: `HTTP Error: ${response.status}`, 
        details: errorBody 
      });
    }

    const data = await response.json();
    
    res.json({ 
      app_info: data.data || {},
      status: 'active'
    });
  } catch (error) {
    console.error('App info API error:', error);
    res.status(500).json({ 
      error: 'Internal Server Error', 
      message: error.message 
    });
  }
});

// 健康检查 API
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// 获取所有表格列表 API
app.get('/api/bitable/tables', async (req, res) => {
  try {
    const { app_token } = req.query;
    if (!app_token) {
      return res.status(400).json({ error: 'app_token is required' });
    }

    const app_access_token = await getAppAccessToken();
    const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${encodeURIComponent(app_token)}/tables`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${app_access_token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      let errorBody;
      try {
        errorBody = await response.json();
      } catch (e) {
        errorBody = await response.text();
      }
      return res.status(response.status).json({ 
        error: `HTTP Error: ${response.status}`, 
        details: errorBody 
      });
    }

    const data = await response.json();
    
    let tables = [];
    if (data.code === 0 && data.data && data.data.items && Array.isArray(data.data.items)) {
      tables = data.data.items.map(table => ({
        table_id: table.table_id,
        name: table.name,
        revision: table.revision || 0
      }));
    }
    
    res.json({ 
      tables: tables,
      total: tables.length
    });
  } catch (error) {
    console.error('Tables API error:', error);
    res.status(500).json({ 
      error: 'Internal Server Error', 
      message: error.message 
    });
  }
});

// 处理所有其他路由
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`🚀 飞书气泡图插件服务器启动成功！`);
  console.log(`📍 服务器运行在端口: ${PORT}`);
  console.log('');
  console.log('📋 可用API端点:');
  console.log('  • GET  /api/health                    - 健康检查');
  console.log('  • GET  /api/app-info                  - 获取应用信息');
  console.log('  • GET  /api/bitable/fields            - 获取表格字段');
  console.log('  • GET  /api/bitable/records           - 获取表格记录');
  console.log('  • GET  /api/bitable/table-info       - 获取表格信息');
  console.log('  • GET  /api/bitable/tables           - 获取所有表格');
  console.log('');
  console.log('🔧 环境变量配置:');
  console.log('  • APP_ID     - 飞书应用ID');
  console.log('  • APP_SECRET - 飞书应用密钥');
  console.log('  • PORT       - 服务器端口 (默认3000)');
  console.log('');
  console.log('⚠️  请确保在 .env 文件中设置 APP_ID 和 APP_SECRET');
});

// 验证环境变量
if (!process.env.APP_ID || !process.env.APP_SECRET) {
  console.warn('\n⚠️ 警告: 未在 .env 文件中设置 APP_ID 或 APP_SECRET！');
  console.warn('请创建 .env 文件并添加以下配置:');
  console.warn('APP_ID=你的飞书应用ID');
  console.warn('APP_SECRET=你的飞书应用密钥');
}