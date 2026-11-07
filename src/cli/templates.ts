export interface TaskTemplate {
  name: string;
  summary: string;
  steps: string[];
  checklist: string[];
  pitfalls: string[];
}

export const TEMPLATES: TaskTemplate[] = [
  {
    name: 'pricing-page',
    summary: '做一个定价页',
    steps: ['问清受众和套餐', '读 UI 知识包', '生成设计令牌', '实现页面', '跑 ui:check 和测试'],
    checklist: ['无渐变/玻璃/霓虹', '颜色来自令牌', '套餐对比清晰', '窄屏可用'],
    pitfalls: ['紫蓝 AI 配色', '套餐卡片大圆角', '假数据'],
  },
  {
    name: 'regression-test',
    summary: '给现有功能补回归测试',
    steps: ['找到入口和现有测试', '构造最小复现', '写失败断言', '修复', '跑全量测试'],
    checklist: ['测试先失败后通过', '覆盖边界', '不依赖真实 API key', '无慢速网络'],
    pitfalls: ['只测 happy path', '测试之间共享状态', '断言太宽'],
  },
  {
    name: 'weekly-report',
    summary: '写一份周报',
    steps: ['收集本周事实', '按主题分组', '列出结果和风险', '给下周计划'],
    checklist: ['数据有来源', '区分事实和推断', '未完成项写明', '下一步可执行'],
    pitfalls: ['编造数字', '只列流水账', '把猜测写成结论'],
  },
];
