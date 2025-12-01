interface KlineParams {
  symbol: string;
  interval: string;
  startTime?: number;
  endTime?: number;
  limit?: number;
}

export class BinanceClient {
  private readonly BASE_URL = 'https://fapi.binance.com';

  public async getKlines(params: KlineParams): Promise<any[]> {
    try {
      const queryParams = new URLSearchParams({
        symbol: params.symbol,
        interval: params.interval,
        limit: (params.limit || 1000).toString(),
      });

      if (params.startTime) {
        queryParams.append('startTime', params.startTime.toString());
      }
      if (params.endTime) {
        queryParams.append('endTime', params.endTime.toString());
      }

      const response = await fetch(`${this.BASE_URL}/fapi/v1/klines?${queryParams}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching klines:', error);
      throw error;
    }
  }
}