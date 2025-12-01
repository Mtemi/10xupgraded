export interface ParsedStrategy {
  className: string;
  timeframe: string;
  stoploss: number;
  roi: Record<string, number>;
  trailingStop: boolean;
  indicators: IndicatorConfig[];
  entryConditions: Condition[];
  exitConditions: Condition[];
}

export interface IndicatorConfig {
  name: string;
  taFunction: string;
  params: Record<string, any>;
}

export interface Condition {
  indicator: string;
  operator: string;
  value: number;
}

export function parseFreqtradeStrategy(pythonCode: string): ParsedStrategy {
  const classNameMatch = pythonCode.match(/class\s+(\w+)\s*\(/);
  const timeframeMatch = pythonCode.match(/timeframe\s*=\s*['"](\w+)['"]/);
  const stoplossMatch = pythonCode.match(/stoploss\s*=\s*(-?\d+\.?\d*)/);
  const roiMatch = pythonCode.match(/minimal_roi\s*=\s*\{([^}]+)\}/);
  const trailingStopMatch = pythonCode.match(/trailing_stop\s*=\s*(True|False)/);

  const indicators = extractIndicators(pythonCode);
  const entryConditions = extractConditions(pythonCode, 'enter_long');
  const exitConditions = extractConditions(pythonCode, 'exit_long');

  return {
    className: classNameMatch?.[1] || 'UnnamedStrategy',
    timeframe: timeframeMatch?.[1] || '5m',
    stoploss: parseFloat(stoplossMatch?.[1] || '-0.10'),
    roi: parseROI(roiMatch?.[1] || ''),
    trailingStop: trailingStopMatch?.[1] === 'True',
    indicators,
    entryConditions,
    exitConditions,
  };
}

function extractIndicators(code: string): IndicatorConfig[] {
  const indicators: IndicatorConfig[] = [];

  const indicatorPattern = /dataframe\[['"](\w+)['"]\]\s*=\s*ta\.(\w+)\([^,)]+(?:,\s*([^)]+))?\)/g;
  let match;

  while ((match = indicatorPattern.exec(code)) !== null) {
    const name = match[1];
    const taFunction = match[2];
    const paramsStr = match[3] || '';

    indicators.push({
      name,
      taFunction,
      params: parseIndicatorParams(paramsStr),
    });
  }

  return indicators;
}

function parseIndicatorParams(paramsStr: string): Record<string, any> {
  const params: Record<string, any> = {};

  const paramPattern = /(\w+)\s*=\s*([^,)]+)/g;
  let match;

  while ((match = paramPattern.exec(paramsStr)) !== null) {
    const key = match[1];
    const value = match[2].trim();

    if (!isNaN(Number(value))) {
      params[key] = Number(value);
    } else if (value === 'True') {
      params[key] = true;
    } else if (value === 'False') {
      params[key] = false;
    } else {
      params[key] = value.replace(/['"]/g, '');
    }
  }

  return params;
}

function extractConditions(code: string, signal: string): Condition[] {
  const conditions: Condition[] = [];

  const signalIndex = code.indexOf(`'${signal}'`);
  if (signalIndex === -1) return conditions;

  const section = code.substring(0, signalIndex);
  const lines = section.split('\n').reverse();

  const conditionPattern = /dataframe\[['"](\w+)['"]\]\s*([><=!]+)\s*(\d+\.?\d*)/g;

  for (const line of lines) {
    if (line.includes('dataframe.loc')) break;

    let match;
    while ((match = conditionPattern.exec(line)) !== null) {
      conditions.push({
        indicator: match[1],
        operator: match[2],
        value: parseFloat(match[3]),
      });
    }
  }

  return conditions;
}

function parseROI(roiStr: string): Record<string, number> {
  const roi: Record<string, number> = {};

  const pairPattern = /["'](\d+)["']\s*:\s*(-?\d+\.?\d*)/g;
  let match;

  while ((match = pairPattern.exec(roiStr)) !== null) {
    roi[match[1]] = parseFloat(match[2]);
  }

  return Object.keys(roi).length > 0 ? roi : { '0': 0.1, '30': 0.05, '60': 0.03, '120': 0.01 };
}
