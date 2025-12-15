class FeishuTablePlugin {
  constructor() {
    this.table = null;
    this.loading = document.getElementById('loading');
    this.errorContainer = document.getElementById('error');
    this.errorMessage = document.getElementById('error-message');
    this.content = document.getElementById('content');
    
    // 初始化插件
    this.init();
  }

  async init() {
    try {
      console.log('🚀 插件初始化开始');
      
      // 显示加载状态
      this.showLoading();
      
      // 等待飞书环境加载
      await this.waitForFeishuEnvironment();
      
      // 获取当前表格
      this.table = await this.getActiveTable();
      
      // 渲染UI
      this.renderUI();
      
      console.log('✅ 插件初始化成功', this.table);
      
    } catch (error) {
      console.error('❌ 初始化失败:', error);
      this.showError(`初始化失败: ${error.message}`);
    }
  }

  async waitForFeishuEnvironment() {
    return new Promise((resolve, reject) => {
      const maxAttempts = 200; // 200 * 200ms = 40秒
      let attempts = 0;
      
      const checkEnvironment = () => {
        attempts++;
        console.log(`[环境检查] 尝试 ${attempts}/${maxAttempts}...`);
        
        // 检查飞书环境API
        if (window.bitable && typeof window.bitable.getActiveTable === 'function') {
          console.log('✅ 飞书环境检测成功');
          resolve();
        } else if (attempts >= maxAttempts) {
          console.error('❌ 飞书环境加载超时');
          reject(new Error('飞书环境加载超时，请确保在飞书多维表格编辑页面运行插件'));
        } else {
          setTimeout(checkEnvironment, 200);
        }
      };
      
      checkEnvironment();
    });
  }

  async getActiveTable() {
    console.log('🔍 获取当前表格信息...');
    
    try {
      const table = await window.bitable.getActiveTable();
      
      if (!table) {
        throw new Error('无法获取当前表格。请确保在飞书多维表格编辑页面中运行插件');
      }
      
      console.log('✅ 获取到表格信息:', table);
      return table;
    } catch (error) {
      console.error('⚠️ 获取表格失败:', error);
      throw new Error(`获取表格失败: ${error.message}`);
    }
  }

  renderUI() {
    if (!this.table) return;
    
    this.content.innerHTML = `
      <div class="table-info">
        <h2>当前多维表格信息</h2>
        
        <div class="table-detail">
          <span class="detail-label">表格ID:</span>
          <span class="detail-value">${this.table.tableId}</span>
        </div>
        
        <div class="table-detail">
          <span class="detail-label">表格名称:</span>
          <span class="detail-value">${this.table.name}</span>
        </div>
        
        <div class="table-detail">
          <span class="detail-label">当前视图:</span>
          <span class="detail-value">${this.table.currentViewId}</span>
        </div>
        
        <div class="table-detail">
          <span class="detail-label">数据行数:</span>
          <span class="detail-value">${this.table.recordCount || 'N/A'}</span>
        </div>
        
        <div class="table-detail">
          <span class="detail-label">最后更新:</span>
          <span class="detail-value">${this.formatDate(this.table.updatedAt)}</span>
        </div>
        
        <button class="btn" id="refreshBtn">刷新数据</button>
      </div>
    `;
    
    // 添加刷新按钮事件
    document.getElementById('refreshBtn').addEventListener('click', () => {
      this.refreshData();
    });
  }

  async refreshData() {
    try {
      this.showLoading();
      this.table = await this.getActiveTable();
      this.renderUI();
    } catch (error) {
      this.showError(`刷新失败: ${error.message}`);
    }
  }

  formatDate(timestamp) {
    if (!timestamp) return 'N/A';
    
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  }

  showLoading() {
    this.loading.style.display = 'flex';
    this.errorContainer.style.display = 'none';
    this.content.innerHTML = '';
  }

  showError(message) {
    this.errorMessage.textContent = message;
    this.errorContainer.style.display = 'block';
    this.loading.style.display = 'none';
  }
}

// 当DOM加载完成后初始化插件
document.addEventListener('DOMContentLoaded', () => {
  new FeishuTablePlugin();
});// JavaScript source code
