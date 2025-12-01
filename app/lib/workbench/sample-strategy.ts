export const SAMPLE_STRATEGY = `import backtrader as bt

class HighFreqMACrossoverStrategy(bt.Strategy):
    params = (("period", 5),)

    def __init__(self):
        self.close_price = self.datas[0].close
        self.sma = bt.indicators.SimpleMovingAverage(self.datas[0], period=self.params.period)
        self.ema = bt.indicators.ExponentialMovingAverage(self.datas[0], period=self.params.period)
        self.order = None

    def next(self):
        # Determine the cash available to invest each candle
        cash_to_invest = self.broker.getValue() * 0.10  # 10% of account balance
        qty_to_buy = cash_to_invest / self.close_price[0]
        qty_to_sell = self.position.size

        self.log(f"qty_to_buy: {qty_to_buy}")
        self.log(f"cash_to_invest: {cash_to_invest}")
        self.log(f"self.broker.get_cash(): {self.broker.get_cash()}")

        # Always log positions:
        if self.close_price[0] > self.sma[0]:
            self.log(f"Creating BUY order @ {self.close_price[0]}, (qty_to_buy={qty_to_buy})")
            self.order = self.buy(size=qty_to_buy)
        else:
            qty_to_sell = self.position.size
            if self.close_price[0] <= self.sma[0]:
                self.log(f"Creating SELL order @ {self.close_price[0]}, (qty_to_sell={qty_to_sell})")
                self.order = self.sell(size=qty_to_sell)
            else:
                print(f"{self.close_price[0]}, {self.sma[0]} -- close price is NOT greater than sma")
        else:
            qty_to_sell = self.position.size
            self.log(f"Creating SELL order @ {self.close_price[0]}, (qty_to_sell={qty_to_sell})")
            self.order = self.sell(size=qty_to_sell)

    def notify_order(self, order: bt.Order) -> None:
        if order.status == order.Completed:
            self.order = None

    def log(self, txt: str) -> None:
        dt = self.datas[0].datetime.date(0)
        t = self.datas[0].datetime.time(0)
        print(f"{dt} {t} {txt}")
`;

export const SAMPLE_STRATEGY_NAME = 'HighFreqMACrossoverStrategy';
