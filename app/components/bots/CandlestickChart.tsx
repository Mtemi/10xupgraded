import React, { useState, useEffect, useRef } from 'react';
import ReactECharts from 'echarts-for-react';
import { toast } from 'react-toastify';
import { supabase } from '~/lib/superbase/client';

interface CandlestickChartProps {
  strategyName: string;
  pair?: string;
  timeframe?: string;
  tradeId?: number;
}

interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

interface PairHistory {
  pair: string;
  timeframe: string;
  columns: string[];
  data: any[][];
  length: number;
  buy_signals?: number;
  sell_signals?: number;
  strategy?: string;
}

const CandlestickChart: React.FC<CandlestickChartProps> = ({ 
  strategyName, 
  pair = 'BTC/USDT', 
  timeframe = '5m',
  tradeId
}) => {
  const [chartData, setChartData] = useState<CandleData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [availablePairs, setAvailablePairs] = useState<string[]>([]);
  const [availableTimeframes, setAvailableTimeframes] = useState<string[]>(['1m', '5m', '15m', '30m', '1h', '4h', '1d']);
  const [selectedPair, setSelectedPair] = useState(pair);
  const [selectedTimeframe, setSelectedTimeframe] = useState(timeframe);
  const chartRef = useRef<ReactECharts>(null);
  const [buySignals, setBuySignals] = useState<{time: number, price: number}[]>([]);
  const [sellSignals, setSellSignals] = useState<{time: number, price: number}[]>([]);
  
  // Function to fetch candle data
  const fetchCandleData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      console.log(`Fetching candle data for ${selectedPair} on ${selectedTimeframe}`);
      
      // Get authenticated user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }
      
      // Construct API URL
      const apiUsername = 'meghan';
      const apiPassword = user.id;
      const limit = 200; // Number of candles to fetch
      
      let url: string;
      
      if (tradeId) {
        // If tradeId is provided, fetch data for a specific trade
        url = `/user/${strategyName}/api/v1/trade_candles?trade_id=${tradeId}`;
        console.log(`Fetching trade-specific candles: ${url}`);
      } else {
        // Otherwise fetch general pair data
        url = `/user/${strategyName}/api/v1/pair_candles?pair=${encodeURIComponent(selectedPair)}&timeframe=${selectedTimeframe}&limit=${limit}`;
        console.log(`Fetching general pair candles: ${url}`);
      }
      
      // Make API request with basic auth
      const response = await fetch(url, {
        headers: {
          'Authorization': 'Basic ' + btoa(`${apiUsername}:${apiPassword}`),
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to fetch candle data:', errorText);
        throw new Error(`Failed to fetch candle data: ${response.status} ${response.statusText}`);
      }
      
      const data: PairHistory = await response.json();
      console.log('Received candle data:', data);
      
      if (!data || !data.data || !Array.isArray(data.data) || data.data.length === 0) {
        setChartData([]);
        setLoading(false);
        return;
      }
      
      // Find column indices
      const dateIndex = data.columns.indexOf('date');
      const openIndex = data.columns.indexOf('open');
      const highIndex = data.columns.indexOf('high');
      const lowIndex = data.columns.indexOf('low');
      const closeIndex = data.columns.indexOf('close');
      const volumeIndex = data.columns.indexOf('volume');
      const buyIndex = data.columns.indexOf('buy');
      const sellIndex = data.columns.indexOf('sell');
      
      if (dateIndex === -1 || openIndex === -1 || highIndex === -1 || 
          lowIndex === -1 || closeIndex === -1) {
        throw new Error('Required columns missing in candle data');
      }
      
      // Process candle data
      const processedData: CandleData[] = data.data.map(row => {
        // Convert date string to timestamp (ms)
        const dateStr = row[dateIndex];
        const timestamp = new Date(dateStr).getTime();
        
        return {
          time: timestamp,
          open: parseFloat(row[openIndex]),
          high: parseFloat(row[highIndex]),
          low: parseFloat(row[lowIndex]),
          close: parseFloat(row[closeIndex]),
          volume: volumeIndex !== -1 ? parseFloat(row[volumeIndex]) : undefined
        };
      });
      
      setChartData(processedData);
      
      // Process buy/sell signals if available
      const newBuySignals: {time: number, price: number}[] = [];
      const newSellSignals: {time: number, price: number}[] = [];
      
      if (buyIndex !== -1 && sellIndex !== -1) {
        data.data.forEach(row => {
          const timestamp = new Date(row[dateIndex]).getTime();
          const price = parseFloat(row[closeIndex]);
          
          if (row[buyIndex] === 1) {
            newBuySignals.push({ time: timestamp, price });
          }
          
          if (row[sellIndex] === 1) {
            newSellSignals.push({ time: timestamp, price });
          }
        });
      }
      
      setBuySignals(newBuySignals);
      setSellSignals(newSellSignals);
      
      // Fetch available pairs if not already loaded
      if (availablePairs.length === 0) {
        fetchAvailablePairs();
      }
      
    } catch (error) {
      console.error('Error fetching candle data:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch candle data');
      toast.error('Failed to load chart data');
    } finally {
      setLoading(false);
    }
  };
  
  // Function to fetch available trading pairs
  const fetchAvailablePairs = async () => {
    try {
      console.log('Fetching available pairs');
      
      // Get authenticated user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }
      
      // Construct API URL
      const apiUsername = 'meghan';
      const apiPassword = user.id;
      const url = `/user/${strategyName}/api/v1/whitelist`;
      
      // Make API request with basic auth
      const response = await fetch(url, {
        headers: {
          'Authorization': 'Basic ' + btoa(`${apiUsername}:${apiPassword}`),
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch available pairs: ${response.status} ${response.statusText}`);
      }
      
      const pairs: string[] = await response.json();
      console.log('Available pairs:', pairs);
      
      if (Array.isArray(pairs) && pairs.length > 0) {
        setAvailablePairs(pairs);
        
        // If current pair is not in the list, select the first available pair
        if (!pairs.includes(selectedPair)) {
          setSelectedPair(pairs[0]);
        }
      }
    } catch (error) {
      console.error('Error fetching available pairs:', error);
      // Don't show toast for this as it's not critical
    }
  };
  
  // Fetch data when component mounts or when pair/timeframe changes
  useEffect(() => {
    if (strategyName) {
      fetchCandleData();
    }
  }, [strategyName, selectedPair, selectedTimeframe, tradeId]);
  
  // Prepare chart options
  const getChartOptions = () => {
    if (chartData.length === 0) {
      return {
        title: {
          text: 'No data available',
          left: 'center',
          top: 'center',
          textStyle: {
            color: '#888'
          }
        }
      };
    }
    
    // Format data for ECharts
    const categoryData = chartData.map(item => item.time);
    const values = chartData.map(item => [item.open, item.close, item.low, item.high]);
    
    // Prepare buy/sell markers
    const buyMarkers = buySignals.map(signal => ({
      name: 'Buy',
      coord: [signal.time, signal.price],
      value: signal.price,
      itemStyle: {
        color: 'rgb(14, 203, 129)'
      },
      symbol: 'arrow',
      symbolSize: 8
    }));
    
    const sellMarkers = sellSignals.map(signal => ({
      name: 'Sell',
      coord: [signal.time, signal.price],
      value: signal.price,
      itemStyle: {
        color: 'rgb(246, 70, 93)'
      },
      symbol: 'arrow',
      symbolSize: 8,
      symbolRotate: 180
    }));
    
    const allMarkers = [...buyMarkers, ...sellMarkers];
    
    return {
      animation: false,
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'cross'
        },
        formatter: function (params: any) {
          const candleData = params[0];
          if (!candleData) return '';
          
          const date = new Date(candleData.axisValue);
          const formattedDate = date.toLocaleString();
          
          let tooltip = `<div style="font-size:12px;margin-bottom:5px;">${formattedDate}</div>`;
          
          // Add candle data
          tooltip += `<div style="display:flex;justify-content:space-between;margin-bottom:3px;">
            <span>Open:</span>
            <span style="font-weight:bold;">${candleData.data[0].toFixed(8)}</span>
          </div>`;
          tooltip += `<div style="display:flex;justify-content:space-between;margin-bottom:3px;">
            <span>Close:</span>
            <span style="font-weight:bold;">${candleData.data[1].toFixed(8)}</span>
          </div>`;
          tooltip += `<div style="display:flex;justify-content:space-between;margin-bottom:3px;">
            <span>Low:</span>
            <span style="font-weight:bold;">${candleData.data[2].toFixed(8)}</span>
          </div>`;
          tooltip += `<div style="display:flex;justify-content:space-between;margin-bottom:3px;">
            <span>High:</span>
            <span style="font-weight:bold;">${candleData.data[3].toFixed(8)}</span>
          </div>`;
          
          // Add volume if available
          if (params.length > 1 && params[1].seriesName === 'Volume') {
            tooltip += `<div style="display:flex;justify-content:space-between;margin-bottom:3px;">
              <span>Volume:</span>
              <span style="font-weight:bold;">${params[1].data[1].toFixed(8)}</span>
            </div>`;
          }
          
          return tooltip;
        }
      },
      axisPointer: {
        link: [{ xAxisIndex: 'all' }]
      },
      grid: [
        {
          left: '10%',
          right: '10%',
          height: '60%'
        },
        {
          left: '10%',
          right: '10%',
          top: '75%',
          height: '15%'
        }
      ],
      xAxis: [
        {
          type: 'category',
          data: categoryData,
          scale: true,
          boundaryGap: false,
          axisLine: { onZero: false },
          splitLine: { show: false },
          splitNumber: 20,
          min: 'dataMin',
          max: 'dataMax',
          axisPointer: {
            z: 100
          }
        },
        {
          type: 'category',
          gridIndex: 1,
          data: categoryData,
          scale: true,
          boundaryGap: false,
          axisLine: { onZero: false },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { show: false },
          splitNumber: 20,
          min: 'dataMin',
          max: 'dataMax'
        }
      ],
      yAxis: [
        {
          scale: true,
          splitArea: {
            show: true
          }
        },
        {
          scale: true,
          gridIndex: 1,
          splitNumber: 2,
          axisLabel: { show: false },
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { show: false }
        }
      ],
      dataZoom: [
        {
          type: 'inside',
          xAxisIndex: [0, 1],
          start: 0,
          end: 100
        },
        {
          show: true,
          xAxisIndex: [0, 1],
          type: 'slider',
          top: '92%',
          start: 0,
          end: 100
        }
      ],
      series: [
        {
          name: 'Candle',
          type: 'candlestick',
          data: values,
          itemStyle: {
            color: 'rgb(14, 203, 129)',     // green candle (close > open)
            color0: 'rgb(246, 70, 93)',     // red candle (close < open)
            borderColor: 'rgb(14, 203, 129)',
            borderColor0: 'rgb(246, 70, 93)'
          },
          markPoint: {
            data: allMarkers
          }
        },
        {
          name: 'Volume',
          type: 'bar',
          xAxisIndex: 1,
          yAxisIndex: 1,
          data: chartData.map(item => [item.time, item.volume || 0, item.open < item.close ? 1 : -1])
        }
      ]
    };
  };
  
  // Handle pair change
  const handlePairChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedPair(e.target.value);
  };
  
  // Handle timeframe change
  const handleTimeframeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedTimeframe(e.target.value);
  };
  
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-4 mb-4 p-2 bg-bolt-elements-background-depth-3 rounded-md">
        <div className="flex items-center gap-2">
          <label className="text-sm text-bolt-elements-textSecondary">Pair:</label>
          <select
            value={selectedPair}
            onChange={handlePairChange}
            className="p-1 rounded bg-bolt-elements-background-depth-2 text-bolt-elements-textPrimary border border-bolt-elements-borderColor"
            disabled={loading || tradeId !== undefined}
          >
            {availablePairs.length > 0 ? (
              availablePairs.map(p => (
                <option key={p} value={p}>{p}</option>
              ))
            ) : (
              <option value={selectedPair}>{selectedPair}</option>
            )}
          </select>
        </div>
        
        <div className="flex items-center gap-2">
          <label className="text-sm text-bolt-elements-textSecondary">Timeframe:</label>
          <select
            value={selectedTimeframe}
            onChange={handleTimeframeChange}
            className="p-1 rounded bg-bolt-elements-background-depth-2 text-bolt-elements-textPrimary border border-bolt-elements-borderColor"
            disabled={loading || tradeId !== undefined}
          >
            {availableTimeframes.map(tf => (
              <option key={tf} value={tf}>{tf}</option>
            ))}
          </select>
        </div>
        
        <button
          onClick={fetchCandleData}
          className="ml-auto px-3 py-1 bg-bolt-elements-button-secondary-background text-bolt-elements-button-secondary-text rounded hover:bg-bolt-elements-button-secondary-backgroundHover"
          disabled={loading}
        >
          {loading ? (
            <span className="flex items-center gap-1">
              <div className="i-svg-spinners:90-ring-with-bg animate-spin" />
              Loading...
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <div className="i-ph:arrows-clockwise" />
              Refresh
            </span>
          )}
        </button>
      </div>
      
      <div className="flex-1 min-h-[400px] relative">
        {error ? (
          <div className="absolute inset-0 flex items-center justify-center text-bolt-elements-textSecondary">
            <div className="text-center p-4">
              <div className="i-ph:warning-circle text-3xl mb-2 text-red-500" />
              <p>{error}</p>
              <button
                onClick={fetchCandleData}
                className="mt-4 px-3 py-1 bg-bolt-elements-button-secondary-background text-bolt-elements-button-secondary-text rounded hover:bg-bolt-elements-button-secondary-backgroundHover"
              >
                Try Again
              </button>
            </div>
          </div>
        ) : loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="i-svg-spinners:90-ring-with-bg animate-spin text-4xl" />
          </div>
        ) : chartData.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-bolt-elements-textSecondary">
            No chart data available
          </div>
        ) : (
          <ReactECharts
            ref={chartRef}
            option={getChartOptions()}
            style={{ height: '100%', width: '100%' }}
            opts={{ renderer: 'canvas' }}
            notMerge={true}
            lazyUpdate={true}
          />
        )}
      </div>
    </div>
  );
};

export default CandlestickChart;