import { bitable } from '@lark-base-open/js-sdk';

let chart: echarts.ECharts | null = null;

async function init() {
  const tableSelect = document.getElementById('tableSelect') as HTMLSelectElement;
  const viewSelect = document.getElementById('viewSelect') as HTMLSelectElement;
  const refreshBtn = document.getElementById('refreshBtn') as HTMLButtonElement;

  // 1. 获取所有表格
  const tables = await bitable.base.getTableMetaList();
  tableSelect.innerHTML = tables
    .map(t => `<option value="${t.id}">${t.name}</option>`)
    .join('');

  // 默认表
  const currentSelection = await bitable.base.getSelection();
  if (currentSelection.tableId) {
    tableSelect.value = currentSelection.tableId;
  }

  // 2. 加载视图
  await loadViews(tableSelect.value);

  tableSelect.onchange = async () => {
    await loadViews(tableSelect.value);
  };

  refreshBtn.onclick = async () => {
    await renderChart();
  };

  initChart();
  await renderChart();
}

// 加载视图列表
async function loadViews(tableId: string) {
  const viewSelect = document.getElementById('viewSelect') as HTMLSelectElement;
  const table = await bitable.base.getTableById(tableId);
  const views = await table.getViewMetaList();

  viewSelect.innerHTML = views
    .map(v => `<option value="${v.id}">${v.name}</option>`)
    .join('');
}

// 初始化 ECharts
function initChart() {
  const dom = document.getElementById('chart')!;
  chart = echarts.init(dom);
}

// 渲染气泡图
async function renderChart() {
  if (!chart) return;

  const tableSelect = document.getElementById('tableSelect') as HTMLSelectElement;
  const viewSelect = document.getElementById('viewSelect') as HTMLSelectElement;

  const table = await bitable.base.getTableById(tableSelect.value);
  const view = await table.getViewById(viewSelect.value);

  // 获取字段
  const fieldMetaList = await table.getFieldMetaList();

  const brandField = fieldMetaList.find(f => f.name === '品牌');
  const priceField = fieldMetaList.find(f => f.name === '价格');

  if (!brandField || !priceField) {
    chart.setOption({
      title: { text: '缺少【品牌】或【价格】字段' }
    });
    return;
  }

  // 读取记录
  const records = await view.getRecords({ pageSize: 500 });

  const data = records.records
    .map(r => {
      const brand = r.fields[brandField.id]?.[0]?.text || r.fields[brandField.id];
      const price = r.fields[priceField.id];

      if (!brand || typeof price !== 'number') return null;

      return {
        name: brand,
        value: [brand, price, price]
      };
    })
    .filter(Boolean) as any[];

  chart.setOption({
    title: {
      text: '品牌 - 价格 气泡图',
      left: 'center'
    },
    tooltip: {
      formatter: (p: any) =>
        `品牌：${p.name}<br/>价格：${p.value[1]}`
    },
    xAxis: {
      type: 'category',
      name: '品牌'
    },
    yAxis: {
      type: 'value',
      name: '价格'
    },
    series: [
      {
        type: 'scatter',
        data,
        symbolSize: (val: any[]) => Math.sqrt(val[2]) * 2,
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowColor: 'rgba(0,0,0,0.3)'
          }
        }
      }
    ]
  });
}

init();
