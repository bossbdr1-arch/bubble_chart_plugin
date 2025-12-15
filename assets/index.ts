import $ from 'jquery';
import { bitable } from '@lark-base-open/js-sdk';
import './index.scss';

// 说明：该文件按你原始风格（jQuery + bitable.base）实现。
// 主要流程：拿 table 列表 -> 拿 view 列表 -> 根据 view（或回退到 table）拿 record ids -> 读取字段值 -> 渲染 ECharts 气泡图

let chart: echarts.ECharts | null = null;

$(async function () {
  try {
    // 1. 初始化 chart
    initChart();

    // 2. 读取表格元信息 和 当前选择（与你原始逻辑一致）。参见： base.getTableMetaList(), base.getSelection().
    const [tableList, selection] = await Promise.all([
      bitable.base.getTableMetaList(),
      bitable.base.getSelection()
    ]);
    // 填充表格下拉
    const optionsHtml = tableList.map((table: any) => `<option value="${table.id}">${table.name}</option>`).join('');
    $('#tableSelect').append(optionsHtml);
    if (selection && selection.tableId) {
      $('#tableSelect').val(selection.tableId);
    }

    // 3. 当切换表格时，加载视图
    $('#tableSelect').on('change', async function () {
      const tableId = $(this).val() as string;
      await loadViewsForTable(tableId);
      await fetchAndRender(); // 表格切换后刷新图表
    });

    // 4. 视图切换 / 刷新按钮
    $('#viewSelect').on('change', fetchAndRender);
    $('#refreshBtn').on('click', fetchAndRender);

    // 5. 随机数据按钮（仅演示）
    $('#randomBtn').on('click', () => {
      // 如果没有真实数据，生成示例并渲染
      const demo = generateSampleData();
      renderEcharts(demo);
    });

    // 6. 首次加载：如果 selection.tableId 可用，自动加载视图
    const initialTableId = ($('#tableSelect').val() as string) || (tableList[0] && tableList[0].id);
    if (initialTableId) {
      await loadViewsForTable(initialTableId);
    }

    // 7. 首次渲染
    await fetchAndRender();

  } catch (err) {
    console.error('初始化失败', err);
    alert('插件初始化失败（请确认已在多维表格插件中打开并给应用所需权限）');
  }
});

async function loadViewsForTable(tableId: string) {
  if (!tableId) {
    $('#viewSelect').empty();
    return;
  }
  try {
    const table = await bitable.base.getTableById(tableId); // 你原始代码风格
    // table.getViewMetaList() 返回 view 元数据数组（id/name）
    const viewMetaList = (typeof table.getViewMetaList === 'function') ? await table.getViewMetaList() : [];
    const viewOptions = (viewMetaList || []).map((v: any) => `<option value="${v.id}">${v.name}</option>`).join('');
    $('#viewSelect').html(viewOptions);

    // 若当前 selection 有 viewId，默认选中
    const selection = await bitable.base.getSelection();
    if (selection && selection.viewId) {
      $('#viewSelect').val(selection.viewId);
    }

    // 如果没有 view（某些表没有视图），留空并允许按全表读取
  } catch (err) {
    console.error('loadViewsForTable error', err);
    $('#viewSelect').empty();
  }
}

/**
 * 主流程：根据当前选择的 table + view 读取记录并渲染图表
 * - 优先：如果能获取 view 对象并且支持 getVisibleRecordIdList，则按视图获取（有序、可过滤）
 * - 回退：使用 table.getRecordIdList() 获取全表记录 id（无序）
 */
async function fetchAndRender() {
  try {
    const tableId = $('#tableSelect').val() as string;
    const viewId = $('#viewSelect').val() as string || null;

    if (!tableId) {
      console.warn('no table selected');
      return;
    }

    const table = await bitable.base.getTableById(tableId);
    // 先查字段（取品牌/价格）
    const fieldMetaList = (typeof table.getFieldMetaList === 'function') ? await table.getFieldMetaList() : [];
    // 找到字段 id（按字段名匹配）
    const brandField = fieldMetaList.find((f: any) => f.name === '品牌' || f.name === 'Brand');
    const priceField = fieldMetaList.find((f: any) => f.name === '价格' || f.name === 'Price');

    if (!brandField || !priceField) {
      // 提示并返回（字段不存在）
      alert('表中未检测到 "品牌" 或 "价格" 字段，请确认字段名称（区分中文/英文）');
      return;
    }

    // 取得 recordId 列表：优先 view.getVisibleRecordIdList()
    let recordIds: string[] = [];

    if (viewId) {
      try {
        // 多种 SDK 版本可能暴露不同方法，尝试多种取 view 的方式
        let viewObj: any = null;
        if (typeof (table.getViewById) === 'function') {
          viewObj = await table.getViewById(viewId);
        } else if (typeof (bitable.base.getViewById) === 'function') {
          viewObj = await (bitable.base as any).getViewById(viewId);
        } else {
          // 还有可能通过 viewMetaList 得到对象的方法（兼容性尝试）
          // 如果没有 view 对象可拿，则抛到 catch 走回退逻辑
          viewObj = null;
        }

        if (viewObj && typeof viewObj.getVisibleRecordIdList === 'function') {
          recordIds = await viewObj.getVisibleRecordIdList(); // 有序、按视图列出的记录 id。:contentReference[oaicite:3]{index=3}
        } else {
          // 如果 viewObj 不可用或者没有该方法，回退到 table.getRecordIdList()
          recordIds = await table.getRecordIdList(); // 无序（全表）。:contentReference[oaicite:4]{index=4}
        }
      } catch (err) {
        console.warn('视图读取失败，回退到表级记录列表', err);
        recordIds = await table.getRecordIdList(); // 回退
      }
    } else {
      // 无视图时直接取全表记录 id
      recordIds = await table.getRecordIdList(); // 无序（全表）
    }

    // 限制最大条数，避免渲染超长数据（可按需调整）
    const MAX = 1000;
    if (recordIds.length > MAX) {
      recordIds = recordIds.slice(0, MAX);
    }

    // 读取每条记录的品牌/价格（用 getCellString 或 getRecordById）
    const dataPoints: any[] = [];
    for (const rid of recordIds) {
      try {
        // 推荐使用 getCellString 读取字符串表示（兼容各种字段类型）
        const brandStr = await table.getCellString(brandField.id, rid);
        // price 可能是数字类型的 cell；用 getRecordById 更稳（可拿到原始数值）
        let priceVal: number | null = null;
        if (typeof table.getRecordById === 'function') {
          const rec = await table.getRecordById(rid);
          // 记录结构可能不同：常见为 rec.fields[fieldId] 或 rec.fields[fieldName]
          const maybe = rec?.fields?.[priceField.id];
          // 如果是对象或数组，尽量提取数字；否则试 parseFloat
          if (typeof maybe === 'number') priceVal = maybe;
          else if (typeof maybe === 'string') priceVal = parseFloat(maybe) || null;
          else if (Array.isArray(maybe) && maybe.length) {
            // 文本字段数组（取第一个文本段）
            const first = maybe[0];
            priceVal = typeof first === 'number' ? first : parseFloat(first?.text || String(first)) || null;
          } else {
            // fallback: 用 getCellString 并 parse
            const raw = await table.getCellString(priceField.id, rid);
            priceVal = parseFloat(String(raw).replace(/[^\d.-]/g, '')) || null;
          }
        } else {
          // table.getRecordById 不存在时，用 getCellString 回退
          const raw = await table.getCellString(priceField.id, rid);
          priceVal = parseFloat(String(raw).replace(/[^\d.-]/g, '')) || null;
        }

        if (brandStr && priceVal !== null && !Number.isNaN(priceVal)) {
          dataPoints.push({
            id: rid,
            brand: String(brandStr),
            price: priceVal,
            value: [String(brandStr), priceVal, priceVal] // ECharts 气泡用 [x, y, size]
          });
        }
      } catch (err) {
        // 单条记录读取失败，不阻塞其余
        console.warn('读取记录失败', rid, err);
      }
    }

    // 组织按品牌分组（x 轴为分类）
    renderEcharts(dataPoints);
  } catch (err) {
    console.error('fetchAndRender error', err);
    alert('读取数据失败，请查看控制台（Console）错误信息');
  }
}

/** 初始化 ECharts 实例 */
function initChart() {
  const dom = document.getElementById('chart')!;
  chart = echarts.init(dom);
  chart.setOption({
    title: { text: '正在加载数据...', left: 'center' },
    tooltip: { trigger: 'item' },
    xAxis: { type: 'category', name: '品牌' },
    yAxis: { type: 'value', name: '价格' },
    series: [{ type: 'scatter', data: [] }]
  });
}

/** 把解析后的 dataPoints 渲染成气泡图 */
function renderEcharts(dataPoints: any[]) {
  if (!chart) initChart();
  if (!chart) return;

  // x 轴：用品牌去重并保持出现顺序
  const brands: string[] = [];
  for (const p of dataPoints) {
    if (!brands.includes(p.brand)) brands.push(p.brand);
  }

  // 把每个数据点的 x 轴值替换为品牌对应的 index（category axis）
  const seriesData = dataPoints.map(p => {
    const xIndex = brands.indexOf(p.brand);
    // ECharts 支持 category xAxis：此处把 x 用品牌字符串直接放置（更直观）
    return {
      name: p.brand,
      value: [p.brand, p.price, p.price],
      extra: p
    };
  });

  const option: any = {
    title: { text: '品牌 vs 价格（气泡图）', left: 'center' },
    tooltip: {
      trigger: 'item',
      formatter: (params: any) => {
        return `品牌：${params.name}<br/>价格：${params.value[1]}`;
      }
    },
    xAxis: {
      type: 'category',
      name: '品牌',
      data: brands
    },
    yAxis: {
      type: 'value',
      name: '价格'
    },
    series: [
      {
        type: 'scatter',
        data: seriesData,
        symbolSize: (val: any) => Math.max(8, Math.sqrt(val[2]) * 0.8),
        emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.3)' } }
      }
    ]
  };

  chart.setOption(option, true);

  // 更新简要统计（可扩展）
  console.info('渲染数据点数：', seriesData.length);
}

/** 仅用于演示的随机数据 */
function generateSampleData() {
  const brands = ['A牌', 'B牌', 'C牌', 'D牌', 'E牌'];
  const arr: any[] = [];
  for (let i = 0; i < 30; i++) {
    const b = brands[Math.floor(Math.random() * brands.length)];
    const price = Math.floor(Math.random() * 2000) + 50;
    arr.push({ id: `demo_${i}`, brand: b, price, value: [b, price, price] });
  }
  return arr;
}
