const DEGSON_COLOR = '#2f6fed'
const BRAND_PALETTE = [
  '#d95926', '#168a62', '#c07a00', '#c44776', '#6b61c9',
  '#1a7a32', '#b45309', '#0f766e', '#9f1239', '#4338ca',
  '#365314', '#92400e', '#155e75', '#7e22ce', '#3f6212',
  '#9a3412', '#1e3a5f', '#854d0e', '#831843', '#334155'
]

export const BRAND_COLORS: Record<string, string> = {
  degson: DEGSON_COLOR
}

export function brandColor(id: string, self?: boolean): string {
  if (self || id === 'degson') return DEGSON_COLOR
  let hash = 0
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return BRAND_PALETTE[hash % BRAND_PALETTE.length]
}

// 模型对比专用色，与品牌色槽错开，避免"蓝=Degson 又=GPT"的误读
export const MODEL_COLORS: Record<string, string> = {
  gpt: '#6b61c9',
  gemini: '#1a7a32'
}

export const CHART_INK = {
  primary: '#243042',
  secondary: '#536074',
  muted: '#7b8696',
  grid: '#d8dde5',
  axis: '#c3cad4',
  surface: '#f6f7f9'
}

export const CHART_FONT = '"Segoe UI Variable Text", "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'

export const TOOLTIP_STYLE = {
  backgroundColor: '#f6f7f9',
  borderColor: '#c0c8d4',
  borderWidth: 1,
  textStyle: { color: '#243042', fontSize: 12, fontFamily: CHART_FONT },
  extraCssText: 'box-shadow: 0 8px 20px rgba(36, 48, 66, 0.12); border-radius: 8px;'
}
