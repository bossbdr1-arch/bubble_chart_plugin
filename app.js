// 飞书气泡图插件 - 配置管理版本
class FeishuPlugin {
    constructor() {
        this.config = this.loadConfig();
        this.chart = null;
        this.feishuAPI = null;
        this.currentExpression = '';
        this.isConfigured = false;
        
        this.init();
    }
    
    init() {
        this.checkExistingConfig();
        this.bindEvents();
        this.setupChart();
        
        // 如果已有配置，尝试连接
        if (this.isConfigured) {
            this.showMessage('检测到已有配置，正在连接...', 'info');
            setTimeout(() => this.testConnection(), 1000);
        }
    }
    
    // 配置管理
    loadConfig() {
        const saved = localStorage.getItem('feishuPluginConfig');
        if (saved) {
            try {
                const config = JSON.parse(saved);
                // 填充表单
                Object.keys(config).forEach(key => {
                    const element = document.getElementById(key);
                    if (element) {
                        element.value = config[key];
                    }
                });
                this.isConfigured = !!(config.appId && config.appSecret && config.appToken && config.tableId);
                this.updateConfigStatus(this.isConfigured);
                return config;
            } catch (e) {
                console.error('加载配置失败:', e);
            }
        }
        
        // 默认配置
        return {
            appId: '',
            appSecret: '',
            appToken: '',
            tableId: '',
            xField: '销售额',
            yField: '利润率',
            sizeField: '市场份额',
            labelField: '产品名称'
        };
    }
    
    saveConfig() {
        const config = {};
        ['appId', 'appSecret', 'appToken', 'tableId', 'xField', 'yField', 'sizeField', 'labelField'].forEach(key => {
            config[key] = document.getElementById(key).value;
        });
        
        try {
            localStorage.setItem('feishuPluginConfig', JSON.stringify(config));
            this.config = config;
            this.isConfigured = !!(config.appId && config.appSecret && config.appToken && config.tableId);
            this.updateConfigStatus(this.isConfigured);
            this.showMessage('配置已保存', 'success');
            return true;
        } catch (e) {
            this.showMessage('保存配置失败: ' + e.message, 'error');
            return false;
        }
    }
    
    clearConfig() {
        if (confirm('确定要清除所有配置吗？')) {
            localStorage.removeItem('feishuPluginConfig');
            this.config = this.loadConfig();
            this.isConfigured = false;
            this.updateConfigStatus(false);
            this.showMessage('配置已清除', 'info');
        }
    }
    
    updateConfigStatus(isConfigured) {
        const status = document.getElementById('configStatus');
        const loadBtn = document.getElementById('loadDataBtn');
        
        if (isConfigured) {
            status.textContent = '已配置';
            status.className = 'config-status status-configured';
            loadBtn.disabled = false;
        } else {
            status.textContent = '未配置';
            status.className = 'config-status status-unconfigured';
            loadBtn.disabled = true;
        }
    }
    
    // 界面管理
    showSection(sectionId) {
        const sections = ['configSection', 'chartSection', 'calculatorSection'];
        sections.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.style.display = id === sectionId ? 'block' : 'none';
            }
        });
    }
    
    showConfig() {
        this.showSection('configSection');
    }
    
    showChart() {
        this.showSection('chartSection');
        if (this.chart) {
            setTimeout(() => this.chart.resize(), 100);
        }
    }
    
    showCalculator() {
        const calcSection = document.getElementById('calculatorSection');
        if (calcSection.style.display === 'none' || !calcSection.style.display) {
            calcSection.style.display = 'block';
        } else {
            calcSection.style.display = 'none';
        }
    }
    
    // 消息提示
    showMessage(message, type = 'info', duration = 3000) {
        // 移除现有消息
        const existing = document.querySelector('.message');
        if (existing) {
            existing.remove();
        }
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;
        messageDiv.textContent = message;
        
        document.body.appendChild(messageDiv);
        
        setTimeout(() => {
            messageDiv.remove();
        }, duration);
    }
    
    // 飞书API集成
    async testConnection() {
        if (!this.saveConfig()) {
            return;
        }
        
        this.showMessage('正在测试连接...', 'info');
        
        try {
            const token = await this.getAccessToken();
            if (token) {
                this.showMessage('连接成功！', 'success');
                // 自动加载数据
                setTimeout(() => this.loadData(), 1000);
            }
        } catch (error) {
            this.showMessage('连接失败: ' + error.message, 'error');
            console.error('连接测试失败:', error);
        }
    }
    
    async getAccessToken() {
        const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                app_id: this.config.appId,
                app_secret: this.config.appSecret
            })
        });
        
        if (!response.ok) {
            throw new Error(`获取访问令牌失败: ${response.status}`);
        }
        
        const data = await response.json();
        if (data.code !== 0) {
            throw new Error(`获取访问令牌失败: ${data.msg}`);
        }
        
        return data.tenant_access_token;
    }
    
    async loadTableData(token) {
        const response = await fetch(
            `https://open.feishu.cn/open-apis/bitable/v1/apps/${this.config.appToken}/tables/${this.config.tableId}/records?page_size=100`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        if (!response.ok) {
            throw new Error(`获取表格数据失败: ${response.status}`);
        }
        
        const data = await response.json();
        if (data.code !== 0) {
            throw new Error(`获取表格数据失败: ${data.msg}`);
        }
        
        return data.data;
    }
    
    // 数据处理
    processTableData(rawData) {
        if (!rawData || !rawData.items) {
            throw new Error('表格数据格式错误');
        }
        
        return rawData.items.map(item => ({
            ...item.fields,
            recordId: item.record_id
        }));
    }
    
    // 图表功能
    setupChart() {
        const chartContainer = document.getElementById('chart');
        if (!chartContainer) {
            console.error('图表容器未找到');
            return;
        }
        
        this.chart = echarts.init(chartContainer);
        
        const option = {
            title: {
                text: '多维表格数据气泡图',
                left: 'center',
                textStyle: {
                    fontSize: 18,
                    fontWeight: 'bold'
                }
            },
            tooltip: {
                trigger: 'item',
                formatter: (params) => {
                    return `${params.name}<br/>
                            ${this.config.xField}: ${params.value[0]}<br/>
                            ${this.config.yField}: ${params.value[1]}<br/>
                            ${this.config.sizeField}: ${params.value[2]}`;
                }
            },
            xAxis: {
                name: this.config.xField,
                type: 'value',
                nameLocation: 'middle',
                nameGap: 30,
                nameTextStyle: {
                    fontSize: 14,
                    fontWeight: 'bold'
                }
            },
            yAxis: {
                name: this.config.yField,
                type: 'value',
                nameLocation: 'middle',
                nameGap: 40,
                nameTextStyle: {
                    fontSize: 14,
                    fontWeight: 'bold'
                }
            },
            series: [{
                type: 'scatter',
                symbolSize: (val) => {
                    return Math.max(10, Math.sqrt(val[2]) * 2);
                },
                data: [],
                label: {
                    show: false
                },
                emphasis: {
                    label: {
                        show: true,
                        formatter: '{b}',
                        position: 'top'
                    }
                },
                itemStyle: {
                    color: '#667eea',
                    opacity: 0.8
                }
            }],
            grid: {
                left: '10%',
                right: '10%',
                bottom: '15%',
                top: '15%'
            }
        };
        
        this.chart.setOption(option);
        
        // 响应式
        window.addEventListener('resize', () => {
            if (this.chart) {
                this.chart.resize();
            }
        });
    }
    
    updateChart(data) {
        if (!this.chart) {
            console.error('图表未初始化');
            return;
        }
        
        const chartData = data.map(item => ({
            value: [
                item[this.config.xField] || 0,
                item[this.config.yField] || 0,
                item[this.config.sizeField] || 0
            ],
            name: item[this.config.labelField] || '未知'
        }));
        
        this.chart.setOption({
            xAxis: {
                name: this.config.xField
            },
            yAxis: {
                name: this.config.yField
            },
            series: [{
                data: chartData
            }]
        });
        
        this.showMessage(`成功加载 ${data.length} 条数据`, 'success');
    }
    
    // 数据加载
    async loadData() {
        if (!this.isConfigured) {
            this.showMessage('请先配置飞书API信息', 'error');
            return;
        }
        
        const loading = document.getElementById('loadingIndicator');
        if (loading) {
            loading.classList.remove('hidden');
        }
        
        try {
            this.showMessage('正在加载数据...', 'info');
            
            const token = await this.getAccessToken();
            const tableData = await this.loadTableData(token);
            const processedData = this.processTableData(tableData);
            
            this.updateChart(processedData);
            this.showChart();
            
        } catch (error) {
            this.showMessage('数据加载失败: ' + error.message, 'error');
            console.error('数据加载失败:', error);
        } finally {
            if (loading) {
                loading.classList.add('hidden');
            }
        }
    }
    
    refreshData() {
        this.loadData();
    }
    
    // 图表导出
    exportChart() {
        if (!this.chart) {
            this.showMessage('图表未加载', 'error');
            return;
        }
        
        try {
            const url = this.chart.getDataURL({
                type: 'png',
                pixelRatio: 2,
                backgroundColor: '#fff'
            });
            
            const link = document.createElement('a');
            link.download = `气泡图_${new Date().toISOString().slice(0, 10)}.png`;
            link.href = url;
            link.click();
            
            this.showMessage('图表已导出', 'success');
        } catch (error) {
            this.showMessage('导出失败: ' + error.message, 'error');
        }
    }
    
    // 计算器功能
    calcClear() {
        this.currentExpression = '';
        document.getElementById('calcDisplay').value = '';
    }
    
    calcDelete() {
        this.currentExpression = this.currentExpression.slice(0, -1);
        document.getElementById('calcDisplay').value = this.currentExpression;
    }
    
    calcNumber(num) {
        this.currentExpression += num;
        document.getElementById('calcDisplay').value = this.currentExpression;
    }
    
    calcOperator(op) {
        if (this.currentExpression && !['+', '-', '*', '/'].includes(this.currentExpression.slice(-1))) {
            this.currentExpression += op;
            document.getElementById('calcDisplay').value = this.currentExpression;
        }
    }
    
    calcEquals() {
        try {
            const result = eval(this.currentExpression);
            this.currentExpression = result.toString();
            document.getElementById('calcDisplay').value = result;
            this.showMessage('计算完成', 'success');
        } catch (error) {
            this.showMessage('计算错误', 'error');
            this.calcClear();
        }
    }
    
    async sendCalcResults() {
        if (!this.currentExpression) {
            this.showMessage('请先进行计算', 'error');
            return;
        }
        
        try {
            const result = eval(this.currentExpression);
            const token = await this.getAccessToken();
            
            // 发送到飞书表格的示例代码
            // 这里需要实现具体的表格更新逻辑
            this.showMessage(`计算结果 ${result} 已准备发送到飞书`, 'info');
            
        } catch (error) {
            this.showMessage('发送失败: ' + error.message, 'error');
        }
    }
    
    // 事件绑定
    bindEvents() {
        // 配置相关
        document.getElementById('appId')?.addEventListener('input', () => this.updateConfigStatus(false));
        document.getElementById('appSecret')?.addEventListener('input', () => this.updateConfigStatus(false));
        document.getElementById('appToken')?.addEventListener('input', () => this.updateConfigStatus(false));
        document.getElementById('tableId')?.addEventListener('input', () => this.updateConfigStatus(false));
        
        // 键盘事件
        document.addEventListener('keydown', (e) => {
            if (document.getElementById('calculatorSection').style.display === 'block') {
                if (e.key >= '0' && e.key <= '9') {
                    this.calcNumber(e.key);
                } else if (['+', '-', '*', '/'].includes(e.key)) {
                    this.calcOperator(e.key);
                } else if (e.key === 'Enter') {
                    this.calcEquals();
                } else if (e.key === 'Escape') {
                    this.calcClear();
                } else if (e.key === 'Backspace') {
                    this.calcDelete();
                }
            }
        });
    }
    
    // 检查现有配置
    checkExistingConfig() {
        if (this.isConfigured) {
            this.showMessage('检测到已有配置', 'info');
        }
    }
}

// 全局函数
let plugin = null;

function testConnection() {
    if (!plugin) {
        alert('插件未初始化');
        return;
    }
    plugin.testConnection();
}

function saveConfig() {
    if (!plugin) {
        alert('插件未初始化');
        return;
    }
    plugin.saveConfig();
}

function loadData() {
    if (!plugin) {
        alert('插件未初始化');
        return;
    }
    plugin.loadData();
}

function refreshData() {
    if (!plugin) {
        alert('插件未初始化');
        return;
    }
    plugin.refreshData();
}

function exportChart() {
    if (!plugin) {
        alert('插件未初始化');
        return;
    }
    plugin.exportChart();
}

function showConfig() {
    if (!plugin) {
        alert('插件未初始化');
        return;
    }
    plugin.showConfig();
}

function toggleCalculator() {
    if (!plugin) {
        alert('插件未初始化');
        return;
    }
    plugin.showCalculator();
}

function calcClear() {
    if (!plugin) return;
    plugin.calcClear();
}

function calcDelete() {
    if (!plugin) return;
    plugin.calcDelete();
}

function calcNumber(num) {
    if (!plugin) return;
    plugin.calcNumber(num);
}

function calcOperator(op) {
    if (!plugin) return;
    plugin.calcOperator(op);
}

function calcEquals() {
    if (!plugin) return;
    plugin.calcEquals();
}

function sendCalcResults() {
    if (!plugin) return;
    plugin.sendCalcResults();
}

// 初始化
document.addEventListener('DOMContentLoaded', function() {
    plugin = new FeishuPlugin();
    console.log('飞书气泡图插件已初始化');
});